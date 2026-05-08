import { useAIStore } from '../stores/aiStore'

export interface ChatOptions {
  messages: Array<{ role: string; content: string; tool_calls?: any; tool_call_id?: string }>
  tools?: Array<{
    type: 'function'
    function: { name: string; description: string; parameters: object }
  }>
  onChunk?: (chunk: string) => void
  onToolCall?: (toolCall: { id: string; function: { name: string; arguments: string } }) => void
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

  if (store.debug) {
    console.log('[AI Debug] Request:', JSON.stringify(requestBody, null, 2))
  }

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
    if (store.debug) {
      console.log('[AI Debug] HTTP Error:', res.status, text)
    }
    throw new Error(`LLM API error ${res.status}: ${text}`)
  }

  const reader = res.body!.getReader()
  const decoder = new TextDecoder()
  let fullContent = ''
  let buffer = ''

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
        if (store.debug) {
          console.log('[AI Debug] SSE chunk:', JSON.stringify(json))
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
      } catch (e) {
        if (store.debug) {
          console.log('[AI Debug] Parse error:', e, 'line:', trimmed)
        }
      }
    }
  }

  if (store.debug) {
    console.log('[AI Debug] Full response:', fullContent)
  }

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
