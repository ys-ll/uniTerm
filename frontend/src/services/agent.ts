import { chat, AVAILABLE_TOOLS } from './llm'
import { executeCommand } from './terminalAgent'
import { useAIStore } from '../stores/aiStore'
import { useTabStore } from '../stores/tabStore'
import { usePanelStore } from '../stores/panelStore'

function getActivePanel() {
  const tabStore = useTabStore()
  const panelStore = usePanelStore()

  // Check for AI-locked panel first
  const lockedPanelId = tabStore.getAILockedPanel()
  if (lockedPanelId) {
    return panelStore.getPanel(lockedPanelId)
  }

  // Fall back to active panel based on tab type
  const activeTab = tabStore.activeTab
  if (!activeTab) return undefined

  if (activeTab.type === 'terminal' || activeTab.type === 'settings') {
    return panelStore.getPanel(activeTab.panelId)
  }

  if (activeTab.type === 'workspace' && activeTab.activePanelId) {
    return panelStore.getPanel(activeTab.activePanelId)
  }

  return undefined
}

function hasActiveSession(): boolean {
  const panel = getActivePanel()
  return !!panel?.sessionId
}

function isDangerousCommand(command: string): boolean {
  const dangerousPatterns = [
    /\brm\s+-[rf]*\s+\//i,
    /\brm\s+-[rf]*\s+~/i,
    /\brm\s+/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bpoweroff\b/i,
    /\bhalt\b/i,
    /\binit\s+0\b/i,
    /\bmkfs\b/i,
    /\bfdisk\b/i,
    /\bdd\s+if=[^|]*of=\/dev\//i,
    /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:\s*\(/,
    /\bchmod\s+.*\s+\//i,
    />\s*\/dev\/[sh]d[a-z]/i,
    /\bmkfs\./i,
    /\bparted\b/i,
    /\bwipefs\b/i,
    /\bsysctl\b/i,
    /\becho\s+.*>\s*\/sys\//i,
    /\becho\s+.*>\s*\/proc\/sys\//i,
    /\buserdel\b/i,
    /\bgroupdel\b/i,
    /\bkillall\b/i,
    /\bpkill\b/i,
    /\bsystemctl\s+(poweroff|reboot|halt|suspend|hibernate)/i,
  ]
  return dangerousPatterns.some(p => p.test(command))
}

function shouldConfirm(dangerous: boolean): boolean {
  const store = useAIStore()
  switch (store.mode) {
    case 'confirm_all': return true
    case 'confirm_dangerous': return dangerous
    case 'bypass': return false
    default: return true
  }
}

function buildSystemPrompt(): string {
  const store = useAIStore()
  const activePanel = getActivePanel()

  let base = store.systemPrompt
  if (!activePanel) return base

  const parts: string[] = []
  parts.push(`Current active terminal panel: "${activePanel.title}" (id: ${activePanel.id}, type: ${activePanel.type})`)
  if (activePanel.type === 'ssh' && activePanel.config) {
    parts.push(`Connected to: ${activePanel.config.user}@${activePanel.config.host}:${activePanel.config.port}`)
  }

  return base + '\n\n--- Current Context ---\n' + parts.join('\n') + '\n---'
}

export async function runAgent(userInput: string) {
  const store = useAIStore()

  if (!hasActiveSession()) {
    if (userInput) {
      store.addMessage({
        id: `msg-${Date.now()}`,
        role: 'user',
        content: userInput
      })
    }
    store.addMessage({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: '请先在主窗口中打开一个终端会话，这样我才能执行命令。'
    })
    return
  }

  // Auto-reject any pending tools from previous turn
  if (userInput) {
    const pendingMsg = store.messages.find(m => m.pendingTools?.length)
    if (pendingMsg) {
      for (const pt of [...pendingMsg.pendingTools!]) {
        store.addMessage({
          id: `msg-${Date.now()}`,
          role: 'tool',
          content: 'User started a new conversation. Previous command was cancelled.',
          tool_call_id: pt.id
        })
      }
      delete pendingMsg.pendingTools
    }
  }

  store.resetStop()
  store.isRunning = true

  if (userInput) {
    store.addMessage({
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userInput
    })
  }

  let turnCount = 0
  const maxTurns = 20

  while (turnCount < maxTurns) {
    turnCount++

    if (store.stopRequested) {
      store.isRunning = false
      return
    }

    const assistantMsg = store.addMessage({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: ''
    })

    const toolUses: Array<{ id: string; name: string; input: Record<string, unknown> }> = []

    const chatOptions: any = {
      system: buildSystemPrompt(),
      messages: store.conversation,
      tools: AVAILABLE_TOOLS,
      onChunk: (chunk: string) => {
        if (store.stopRequested) return
        assistantMsg.content += chunk
      },
      onToolUse: (tu: { id: string; name: string; input: Record<string, unknown> }) => {
        if (store.stopRequested) return
        toolUses.push(tu)
      }
    }
    try {
      await chat(chatOptions)
      // Preserve raw API message blocks for conversation history
      if (chatOptions._rawApiMsg) {
        assistantMsg._rawApiMsg = chatOptions._rawApiMsg
      }
    } catch (e: any) {
      const errMsg = e.message ?? String(e)
      // Convert the failed assistant placeholder to a display-only tool message.
      // This keeps the error visible in the UI without polluting the API conversation.
      assistantMsg.role = 'tool'
      assistantMsg.content = `[Error: ${errMsg}]`
      delete assistantMsg._rawApiMsg
      delete assistantMsg.tool_calls
      store.setDebugInfo(store.conversation, errMsg)
      store.isRunning = false
      return
    }

    if (store.stopRequested) {
      // Cancel any tool calls that were received but not executed
      const cancelledIds = new Set<string>()
      const rawContent = assistantMsg._rawApiMsg?.content
      if (Array.isArray(rawContent)) {
        for (const block of rawContent) {
          if (block.type === 'tool_use' && !cancelledIds.has(block.id)) {
            store.addMessage({
              id: `msg-${Date.now()}`,
              role: 'tool',
              content: 'Command was cancelled by user (Stop).',
              tool_call_id: block.id
            })
            cancelledIds.add(block.id)
          }
        }
      }
      store.isRunning = false
      return
    }

    // Enforce single tool call
    if (toolUses.length > 1) {
      toolUses.splice(1)
    }

    // Store tool calls in the message for UI confirmation
    if (toolUses.length > 0) {
      assistantMsg.tool_calls = toolUses.map(tu => ({
        id: tu.id,
        type: 'function' as const,
        function: {
          name: tu.name,
          arguments: JSON.stringify(tu.input)
        }
      }))
    }

    if (!assistantMsg.content && toolUses.length === 0) {
      assistantMsg.content = '[No response received from the model. Check your API settings and network connection.]'
      store.isRunning = false
      return
    }

    if (toolUses.length === 0) {
      store.isRunning = false
      return
    }

    // Process exactly one tool call
    const tu = toolUses[0]
    if (tu.name === 'execute_command') {
      const command = tu.input.command as string
      const dangerous = isDangerousCommand(command)

      if (shouldConfirm(dangerous)) {
        assistantMsg.pendingTools = [{
          id: tu.id,
          name: 'execute_command',
          arguments: tu.input,
          dangerous
        }]
        store.isRunning = false
        return
      }

      // Auto-execute
      try {
        const result = await executeCommand(command)
        store.addMessage({
          id: `msg-${Date.now()}`,
          role: 'tool',
          content: result.output,
          tool_call_id: tu.id
        })
      } catch (e: any) {
        store.addMessage({
          id: `msg-${Date.now()}`,
          role: 'tool',
          content: `[Error executing command: ${e.message ?? e}]`,
          tool_call_id: tu.id
        })
      }
    }
  }

  // Max turns reached - prompt user to continue
  if (turnCount >= maxTurns) {
    store.addMessage({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `已达到最大对话轮次限制（${maxTurns}轮）。点击"继续"或发送任意消息以继续。`,
      needsContinue: true
    })
  }

  store.isRunning = false
}

export async function continueAgent() {
  const store = useAIStore()
  const lastMsg = store.messages[store.messages.length - 1]
  if (lastMsg?.needsContinue) {
    store.messages.pop()
  }
  await runAgent('')
}

export async function approveTool(messageId: string) {
  const store = useAIStore()
  const msg = store.messages.find(m => m.id === messageId)
  if (!msg?.pendingTools?.length) return

  const pendingTool = msg.pendingTools[0]

  if (!hasActiveSession()) {
    store.addMessage({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: '请先打开一个终端会话，再执行此命令。'
    })
    return
  }

  store.isRunning = true

  const { id, arguments: args } = pendingTool
  const command = args.command as string

  try {
    const result = await executeCommand(command)
    store.addMessage({
      id: `msg-${Date.now()}`,
      role: 'tool',
      content: result.output,
      tool_call_id: id
    })
  } catch (e: any) {
    store.addMessage({
      id: `msg-${Date.now()}`,
      role: 'tool',
      content: `[Error executing command: ${e.message ?? e}]`,
      tool_call_id: id
    })
  }

  msg.pendingTools.shift()

  if (msg.pendingTools.length > 0) {
    store.isRunning = false
    return
  }

  await runAgent('')
}

export function rejectTool(messageId: string) {
  const store = useAIStore()
  const msg = store.messages.find(m => m.id === messageId)
  if (!msg?.pendingTools?.length) return

  const pendingTool = msg.pendingTools[0]

  store.addMessage({
    id: `msg-${Date.now()}`,
    role: 'tool',
    content: 'User rejected this command.',
    tool_call_id: pendingTool.id
  })

  msg.pendingTools.shift()

  if (msg.pendingTools.length > 0) {
    return
  }

  setTimeout(() => runAgent(''), 0)
}
