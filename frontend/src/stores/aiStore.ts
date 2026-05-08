import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AIMessage, AIConfig, ExecutionMode } from '../types/ai'

const CONFIG_KEY = 'uniterm:ai-config'

const SYSTEM_PROMPT = `You are an AI assistant inside uniTerm, a terminal emulator. You can execute shell commands in the user's active terminal to help them complete tasks.

When you need to run a command, use the execute_command tool. The command will be executed in the active terminal session and you will receive its stdout/stderr output.

Guidelines:
- Always explain what you are about to do before executing commands.
- Prefer using standard Unix tools (ls, cat, grep, find, etc.).
- For file editing, use sed, awk, or echo with redirection.
- If a command might be destructive, warn the user.
- Chain multiple commands with && or ; when appropriate.
- If the output is too long, summarize the key findings.`

function loadConfig(): AIConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { apiKey: '', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o' }
}

export const useAIStore = defineStore('ai', () => {
  const visible = ref(false)
  const messages = ref<AIMessage[]>([])
  const mode = ref<ExecutionMode>('confirm')
  const config = ref<AIConfig>(loadConfig())
  const isRunning = ref(false)
  const debug = ref(false)

  function toggle() {
    visible.value = !visible.value
  }

  function addMessage(msg: AIMessage) {
    messages.value.push(msg)
  }

  function clearMessages() {
    messages.value = []
  }

  function saveConfig() {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config.value))
  }

  const conversation = computed(() => [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.value.map(m => {
      const base: Record<string, unknown> = { role: m.role, content: m.content }
      if (m.tool_calls) base.tool_calls = m.tool_calls
      if (m.tool_call_id) base.tool_call_id = m.tool_call_id
      return base
    })
  ])

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
    conversation,
    debug
  }
})
