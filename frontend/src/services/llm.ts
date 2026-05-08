import { ChatCompletion } from '../../wailsjs/go/main/App'
import { useAIStore } from '../stores/aiStore'
import type { AIMessage } from '../types/ai'

export interface ChatOptions {
  messages: Array<{ role: string; content: string; tool_calls?: any; tool_call_id?: string }>
  tools?: Array<{
    type: 'function'
    function: { name: string; description: string; parameters: object }
  }>
  onChunk?: (chunk: string) => void
  onToolCall?: (toolCall: { id: string; function: { name: string; arguments: string } }) => void
}

function addDebugLog(store: ReturnType<typeof useAIStore>, text: string) {
  if (!store.debug) return
  const msg: AIMessage = {
    id: `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    role: 'tool',
    content: `[Debug] ${text}`
  }
  store.addMessage(msg)
}

export async function chat(options: ChatOptions): Promise<string> {
  const store = useAIStore()
  const { apiKey, baseURL, model } = store.config

  if (!apiKey) throw new Error('API key not configured')

  const requestBody = {
    model,
    messages: options.messages,
    tools: options.tools,
    tool_choice: options.tools ? 'auto' : undefined,
    stream: false
  }

  const requestJSON = JSON.stringify(requestBody)
  addDebugLog(store, `Request body:\n${JSON.stringify(requestBody, null, 2)}`)

  let responseText: string
  try {
    responseText = await ChatCompletion(apiKey, baseURL, model, requestJSON)
  } catch (e: any) {
    addDebugLog(store, `Request failed: ${e}`)
    throw new Error(`LLM API request failed: ${e}`)
  }

  addDebugLog(store, `Response:\n${responseText.slice(0, 4000)}`)

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

  const choice = json.choices?.[0]
  if (!choice) {
    addDebugLog(store, 'No choices in response')
    throw new Error('No choices in LLM response')
  }

  const message = choice.message
  if (!message) {
    addDebugLog(store, 'No message in choice')
    throw new Error('No message in LLM response')
  }

  const content = message.content || ''
  const toolCalls = message.tool_calls || []

  for (const tc of toolCalls) {
    if (tc.function?.name) {
      options.onToolCall?.({ id: tc.id, function: tc.function })
    }
  }

  if (content) {
    options.onChunk?.(content)
  }

  return content
}

export const AVAILABLE_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'execute_command',
      description: 'Execute a shell command in the active terminal session and return its output.',
      parameters: {
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
  }
]
