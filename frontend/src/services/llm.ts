import { ChatCompletion } from '../../wailsjs/go/main/App'
import { useAIStore } from '../stores/aiStore'
import { useSettingsStore } from '../stores/settingsStore'
import type { AIMessage } from '../types/ai'

export interface ChatOptions {
  system: string
  messages: Array<Record<string, unknown>>
  tools?: Array<{
    name: string
    description: string
    input_schema: object
  }>
  onChunk?: (chunk: string) => void
  onToolUse?: (tool: { id: string; name: string; input: Record<string, unknown> }) => void
}

export function addDebugLog(store: ReturnType<typeof useAIStore>, text: string) {
  const msg: AIMessage = {
    id: `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    role: 'tool',
    content: `[Debug] ${text}`
  }
  store.addMessage(msg)
}

export async function chat(options: ChatOptions): Promise<void> {
  const store = useAIStore()
  const settingsStore = useSettingsStore()
  const activeModel = settingsStore.activeModel

  const apiKey = activeModel?.apiKey || ''
  const baseURL = activeModel?.baseURL || ''
  const model = activeModel?.model || ''

  if (!apiKey) throw new Error('API key not configured')

  const requestBody: Record<string, unknown> = {
    model,
    max_tokens: 4096,
    system: options.system,
    messages: options.messages,
    tools: options.tools
  }

  const requestJSON = JSON.stringify(requestBody)

  // Debug: log request (truncate content)
  const debugMsgs = (requestBody.messages as Array<Record<string, unknown>>).map((m: any) => ({
    ...m,
    content: typeof m.content === 'string'
      ? m.content.slice(0, 200) + (m.content.length > 200 ? '...[truncated]' : '')
      : m.content
  }))
  addDebugLog(store, `REQ → ${JSON.stringify({ ...requestBody, messages: debugMsgs }, null, 2)}`)

  let responseText: string
  try {
    responseText = await ChatCompletion(apiKey, baseURL, model, requestJSON, 'anthropic')
  } catch (e: any) {
    addDebugLog(store, `Request failed: ${e}`)
    throw new Error(`LLM API request failed: ${e}`)
  }

  // Debug: log raw response (truncated)
  addDebugLog(store, `RES ← ${responseText.length > 500 ? responseText.slice(0, 500) + '...[truncated]' : responseText}`)

  let json: any
  try {
    json = JSON.parse(responseText)
  } catch (e: any) {
    addDebugLog(store, `JSON parse error: ${e.message}`)
    throw new Error(`Failed to parse LLM response: ${e.message}`)
  }

  if (json.error) {
    const errMsg = json.error.message || JSON.stringify(json.error)
    addDebugLog(store, `API error: ${errMsg}`)
    throw new Error(`LLM API error: ${errMsg}`)
  }

  // Anthropic response: { id, type, role, content: [...], model, stop_reason, usage }
  const rawContent = json.content
  if (!Array.isArray(rawContent)) {
    addDebugLog(store, 'Response content is not an array')
    throw new Error('Unexpected Anthropic response: content is not an array')
  }

  // Store raw message for history preservation
  ;(options as any)._rawApiMsg = {
    role: json.role,
    content: rawContent
  }

  addDebugLog(store, `Raw content blocks: ${rawContent.map((b: any) => b.type).join(', ')} | stop_reason: ${json.stop_reason}`)

  // Dispatch text and tool_use blocks
  for (const block of rawContent) {
    switch (block.type) {
      case 'text':
        options.onChunk?.(block.text || '')
        break
      case 'tool_use':
        options.onToolUse?.({
          id: block.id,
          name: block.name,
          input: block.input || {}
        })
        break
    }
  }
}

export const AVAILABLE_TOOLS = [
  {
    name: 'execute_command',
    description: 'Execute a shell command in the active terminal session and return its output.',
    input_schema: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'The shell command to execute. Use standard Unix syntax.'
        }
      },
      required: ['command']
    }
  }
]
