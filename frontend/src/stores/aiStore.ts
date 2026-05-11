import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import type { AIMessage, AIConfig, ExecutionMode, AISession } from '../types/ai'
import { SaveAIConfig, LoadAIConfig } from '../../wailsjs/go/main/App'
import { compressToUTF16, decompressFromUTF16 } from 'lz-string'

const SESSIONS_KEY = 'uniterm:ai-sessions'
const CURRENT_SESSION_KEY = 'uniterm:ai-current-session'

const SYSTEM_PROMPT = `You are an AI assistant inside uniTerm, a terminal emulator. You can execute shell commands in the user's active terminal to help them complete tasks.

When you need to run a command, use the execute_command tool. The command will be executed in the active terminal session and you will receive its stdout/stderr output.

CRITICAL RULES:
- You can only send ONE execute_command tool call at a time. Never send multiple tool calls in a single response.
- Always explain what you are about to do before executing commands.
- Prefer using standard Unix tools (ls, cat, grep, find, etc.).
- For file editing, use sed, awk, or echo with redirection.
- If a command might be destructive, warn the user.
- Chain multiple commands with && or ; when appropriate.
- If the output is too long, summarize the key findings.
- Commands have a 60-second timeout. If a command times out, you will see "[Command timed out after 60s...]". In that case, you can either wait (the command may still be running) or suggest canceling it with Ctrl+C.
- Do NOT send a new command if the previous one might still be running, unless you intend to cancel it first.`

const DEFAULT_CONFIG: AIConfig = {
  apiKey: '',
  baseURL: 'https://api.openai.com/v1',
  model: 'gpt-4o'
}

function loadSessions(): AISession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY)
    if (!raw) return []
    const decompressed = decompressFromUTF16(raw)
    if (decompressed) return JSON.parse(decompressed)
    return JSON.parse(raw)
  } catch {
    // ignore
  }
  return []
}

function loadCurrentSessionId(): string | null {
  try {
    return localStorage.getItem(CURRENT_SESSION_KEY)
  } catch {
    return null
  }
}

export const useAIStore = defineStore('ai', () => {
  const visible = ref(true)
  const messages = ref<AIMessage[]>([])
  const mode = ref<ExecutionMode>('confirm_dangerous')
  const config = ref<AIConfig>({ ...DEFAULT_CONFIG })
  const isRunning = ref(false)
  const debug = ref(false)
  const stopRequested = ref(false)
  const sessions = ref<AISession[]>(loadSessions())
  const currentSessionId = ref<string | null>(loadCurrentSessionId())

  function toggle() {
    visible.value = !visible.value
  }

  function addMessage(msg: AIMessage): AIMessage {
    const r = reactive({ ...msg }) as AIMessage
    messages.value.push(r)
    if (msg.id?.startsWith('dbg-')) {
      const dbgCount = messages.value.filter(m => m.id?.startsWith('dbg-')).length
      if (dbgCount > 100) {
        const firstDbgIdx = messages.value.findIndex(m => m.id?.startsWith('dbg-'))
        if (firstDbgIdx >= 0) messages.value.splice(firstDbgIdx, 1)
      }
    }
    if (currentSessionId.value) {
      const s = sessions.value.find(s => s.id === currentSessionId.value)
      if (s) {
        s.messages.push(r)
        s.updatedAt = Date.now()
        if (msg.role === 'user' && s.name === 'New Session') {
          const trimmed = msg.content.trim()
          if (trimmed) {
            s.name = trimmed.length > 20 ? trimmed.slice(0, 20) + '...' : trimmed
          }
        }
        saveSessions()
      }
    }
    return r
  }

  function clearMessages() {
    messages.value = []
    if (currentSessionId.value) {
      const s = sessions.value.find(s => s.id === currentSessionId.value)
      if (s) {
        s.messages = []
        s.updatedAt = Date.now()
        saveSessions()
      }
    }
  }

  async function initConfig() {
    try {
      const loaded = await LoadAIConfig()
      if (loaded.apiKey || loaded.baseURL || loaded.model) {
        config.value = {
          apiKey: loaded.apiKey || DEFAULT_CONFIG.apiKey,
          baseURL: loaded.baseURL || DEFAULT_CONFIG.baseURL,
          model: loaded.model || DEFAULT_CONFIG.model,
        }
      }
    } catch {
      // ignore, use defaults
    }
  }

  async function saveConfig() {
    try {
      await SaveAIConfig({
        apiKey: config.value.apiKey,
        baseURL: config.value.baseURL,
        model: config.value.model,
      })
    } catch {
      // ignore save errors
    }
  }

  function setConfig(updates: Partial<AIConfig>) {
    config.value = { ...config.value, ...updates }
  }

  function saveSessions() {
    const MAX_MSG_PER_SESSION = 200
    const MAX_MSG_CONTENT_LEN = 10000

    const trimmed = sessions.value.map(s => {
      let msgs = s.messages.slice(-MAX_MSG_PER_SESSION)
      msgs = msgs.map(m => {
        if (m.content && m.content.length > MAX_MSG_CONTENT_LEN) {
          return { ...m, content: m.content.slice(0, MAX_MSG_CONTENT_LEN) + '\n...[truncated]' }
        }
        return m
      })
      return { ...s, messages: msgs }
    })

    try {
      const compressed = compressToUTF16(JSON.stringify(trimmed))
      localStorage.setItem(SESSIONS_KEY, compressed)
    } catch (e) {
      const aggressive = sessions.value.map(s => {
        const msgs = s.messages.slice(-50).map(m => ({
          ...m,
          content: m.content?.slice(0, 2000) || ''
        }))
        return { ...s, messages: msgs }
      })
      try {
        const compressed = compressToUTF16(JSON.stringify(aggressive))
        localStorage.setItem(SESSIONS_KEY, compressed)
      } catch {
        localStorage.removeItem(SESSIONS_KEY)
      }
    }
  }

  function saveCurrentSessionId() {
    if (currentSessionId.value) {
      localStorage.setItem(CURRENT_SESSION_KEY, currentSessionId.value)
    } else {
      localStorage.removeItem(CURRENT_SESSION_KEY)
    }
  }

  function createSession(name?: string) {
    const now = Date.now()
    const session: AISession = {
      id: `session-${now}`,
      name: name || 'New Session',
      createdAt: now,
      updatedAt: now,
      messages: []
    }
    sessions.value.unshift(session)
    currentSessionId.value = session.id
    messages.value = []
    saveSessions()
    saveCurrentSessionId()
  }

  function switchSession(sessionId: string) {
    const s = sessions.value.find(s => s.id === sessionId)
    if (!s) return
    currentSessionId.value = sessionId
    messages.value = s.messages.map(m => reactive({ ...m }) as AIMessage)
    saveCurrentSessionId()
  }

  function deleteSession(sessionId: string) {
    const idx = sessions.value.findIndex(s => s.id === sessionId)
    if (idx === -1) return
    sessions.value.splice(idx, 1)
    saveSessions()
    if (currentSessionId.value === sessionId) {
      if (sessions.value.length > 0) {
        switchSession(sessions.value[0].id)
      } else {
        createSession()
      }
    }
  }

  function renameSession(sessionId: string, name: string) {
    const s = sessions.value.find(s => s.id === sessionId)
    if (s) {
      s.name = name
      saveSessions()
    }
  }

  function stop() {
    stopRequested.value = true
    isRunning.value = false
  }

  function resetStop() {
    stopRequested.value = false
  }

  // Build Anthropic-native message array (system is separate top-level field)
  const conversation = computed(() =>
    messages.value
      .filter(m => !m.id.startsWith('dbg-'))
      .filter(m => {
        if (m.role === 'assistant' && !m.content && !m.tool_calls?.length && !m._rawApiMsg && !m.pendingTools?.length) {
          return false
        }
        return true
      })
      .map(m => {
        // Tool results → Anthropic tool_result blocks inside user-role messages
        if (m.role === 'tool' && m.tool_call_id) {
          return {
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: m.tool_call_id,
              content: m.content
            }]
          }
        }

        // Assistant with raw API blocks: pass through verbatim
        if (m._rawApiMsg) {
          return { ...m._rawApiMsg }
        }

        // Assistant with legacy tool_calls: build Anthropic content blocks
        if (m.role === 'assistant' && m.tool_calls?.length) {
          const blocks: Array<Record<string, unknown>> = []
          if (m.content) {
            blocks.push({ type: 'text', text: m.content })
          }
          for (const tc of m.tool_calls) {
            let input: Record<string, unknown> = {}
            try { input = JSON.parse(tc.function.arguments) } catch { /* passthrough */ }
            blocks.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.function.name,
              input
            })
          }
          return { role: 'assistant', content: blocks }
        }

        return { role: m.role, content: m.content }
      })
  )

  const systemPrompt = computed(() => SYSTEM_PROMPT)

  // Init: load current session messages or create new session
  const existingSession = sessions.value.find(s => s.id === currentSessionId.value)
  if (existingSession) {
    messages.value = existingSession.messages.map(m => reactive({ ...m }) as AIMessage)
  } else {
    createSession()
  }

  return {
    visible,
    toggle,
    messages,
    addMessage,
    clearMessages,
    mode,
    config,
    isRunning,
    saveConfig,
    initConfig,
    setConfig,
    conversation,
    systemPrompt,
    debug,
    stopRequested,
    stop,
    resetStop,
    sessions,
    currentSessionId,
    createSession,
    switchSession,
    deleteSession,
    renameSession
  }
})
