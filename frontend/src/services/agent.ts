import { chat, AVAILABLE_TOOLS } from './llm'
import { executeCommand } from './terminalAgent'
import { useAIStore } from '../stores/aiStore'
import type { AIMessage, ToolCall } from '../types/ai'

export async function runAgent(userInput: string) {
  const store = useAIStore()
  store.isRunning = true

  if (userInput) {
    const userMsg: AIMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: userInput
    }
    store.addMessage(userMsg)
  }

  let turnCount = 0
  const maxTurns = 10

  while (turnCount < maxTurns) {
    turnCount++

    const assistantMsg: AIMessage = {
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: ''
    }
    store.addMessage(assistantMsg)

    const toolCalls: ToolCall[] = []

    try {
      await chat({
        messages: store.conversation,
        tools: AVAILABLE_TOOLS,
        onChunk: (chunk) => {
          assistantMsg.content += chunk
        },
        onToolCall: (tc) => {
          toolCalls.push({
            id: tc.id,
            type: 'function',
            function: { name: tc.function.name, arguments: tc.function.arguments }
          })
        }
      })
    } catch (e: any) {
      assistantMsg.content += `\n\n[Error: ${e.message ?? e}]`
      store.isRunning = false
      return
    }

    assistantMsg.tool_calls = toolCalls.length > 0 ? toolCalls : undefined

    if (toolCalls.length === 0) {
      store.isRunning = false
      return
    }

    for (const tc of toolCalls) {
      if (tc.function.name === 'execute_command') {
        const args = JSON.parse(tc.function.arguments)
        const command: string = args.command

        if (store.mode === 'confirm') {
          assistantMsg.pendingTool = {
            id: tc.id,
            name: 'execute_command',
            arguments: args
          }
          store.isRunning = false
          return
        }

        const result = await executeCommand(command)

        const toolResult: AIMessage = {
          id: `msg-${Date.now()}`,
          role: 'tool',
          content: result.output,
          tool_call_id: tc.id
        }
        store.addMessage(toolResult)
      }
    }
  }

  store.isRunning = false
}

export async function approveTool(messageId: string) {
  const store = useAIStore()
  const msg = store.messages.find(m => m.id === messageId)
  if (!msg?.pendingTool) return

  store.isRunning = true

  const { id, arguments: args } = msg.pendingTool
  const command = args.command as string

  delete msg.pendingTool

  const result = await executeCommand(command)

  const toolResult: AIMessage = {
    id: `msg-${Date.now()}`,
    role: 'tool',
    content: result.output,
    tool_call_id: id
  }
  store.addMessage(toolResult)

  await runAgent('')
}

export function rejectTool(messageId: string) {
  const store = useAIStore()
  const msg = store.messages.find(m => m.id === messageId)
  if (!msg?.pendingTool) return

  const toolCallId = msg.pendingTool.id
  delete msg.pendingTool

  const toolResult: AIMessage = {
    id: `msg-${Date.now()}`,
    role: 'tool',
    content: 'User rejected this command.',
    tool_call_id: toolCallId
  }
  store.addMessage(toolResult)
}
