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
    stream: true
  }

  addDebugLog(store, `Request body:\n${JSON.stringify(requestBody, null, 2)}`)

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(requestBody)
  })

  if (!res.ok) {
    const text = await res.text()
    addDebugLog(store, `HTTP Error ${res.status}:\n${text}`)
    throw new Error(`LLM API error ${res.status}: ${text}`)
  }

  addDebugLog(store, `HTTP ${res.status}, Content-Type: ${res.headers.get('content-type') || 'unknown'}`)

  const contentType = res.headers.get('content-type') || ''
  const isSSE = contentType.includes('text/event-stream') || contentType.includes('application/octet-stream')

  // Non-streaming response fallback
  if (!isSSE) {
    const text = await res.text()
    addDebugLog(store, `Non-SSE response body:\n${text.slice(0, 4000)}`)
    try {
      const json = JSON.parse(text)
      const content = json.choices?.[0]?.message?.content || ''
      const toolCalls = json.choices?.[0]?.message?.tool_calls || []
      for (const tc of toolCalls) {
        if (tc.function?.name) {
          options.onToolCall?.({ id: tc.id, function: tc.function })
        }
      }
      if (content) {
        options.onChunk?.(content)
      }
      addDebugLog(store, `Parsed content: ${content.slice(0, 500)}`)
      return content
    } catch (e: any) {
      throw new Error(`Failed to parse non-SSE response: ${e.message}`)
    }
  }

  // SSE streaming response
  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''
  let chunkCount = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed === 'data: [DONE]') continue
      if (!trimmed.startsWith('data: ')) continue

      try {
        const json = JSON.parse(trimmed.slice(6))
        chunkCount++
        if (store.debug && chunkCount <= 3) {
          addDebugLog(store, `SSE chunk #${chunkCount}:\n${JSON.stringify(json, null, 2)}`)
        }
        const delta = json.choices?.[0]?.delta
        if (!delta) continue

        if (delta.content) {
          fullContent += delta.content
          options.onChunk?.(delta.content)
        }

        if (delta.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.function?.name) {
              options.onToolCall?.({ id: tc.id, function: tc.function })
            }
          }
        }
      } catch (e: any) {
        addDebugLog(store, `Parse error: ${e.message}\nLine: ${trimmed.slice(0, 200)}`)
      }
    }
  }

  addDebugLog(store, `Stream complete. Total chunks: ${chunkCount}. Content length: ${fullContent.length}`)

  return fullContent
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
