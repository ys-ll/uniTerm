import { ChatCompletion } from '../../wailsjs/go/main/App'
import { useSettingsStore } from '../stores/settingsStore'

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

function formatAPIError(raw: string): string {
  // Parse Go backend error format: "HTTP <code>: <json body>"
  const match = raw.match(/^HTTP\s+(\d+):\s*(.+)/)
  if (!match) return `API Error: ${raw}`

  const code = match[1]
  const bodyStr = match[2]
  try {
    const body = JSON.parse(bodyStr)
    const msg = body?.error?.message || body?.message || bodyStr
    return `API Error: ${code} ${msg}`
  } catch {
    return `API Error: ${code} ${bodyStr}`
  }
}

export async function chat(options: ChatOptions): Promise<void> {
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

  let responseText: string
  try {
    responseText = await ChatCompletion(apiKey, baseURL, model, requestJSON, 'anthropic')
  } catch (e: any) {
    throw new Error(formatAPIError(e?.message || String(e)))
  }

  let json: any
  try {
    json = JSON.parse(responseText)
  } catch (e: any) {
    throw new Error(`Failed to parse LLM response: ${e.message}`)
  }

  if (json.error) {
    const errMsg = json.error.message || JSON.stringify(json.error)
    throw new Error(`LLM API error: ${errMsg}`)
  }

  const rawContent = json.content
  if (!Array.isArray(rawContent)) {
    throw new Error('Unexpected Anthropic response: content is not an array')
  }

  // Store raw message for history preservation
  ;(options as any)._rawApiMsg = {
    role: json.role,
    content: rawContent
  }

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
