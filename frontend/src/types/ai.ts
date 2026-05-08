export type ExecutionMode = 'autonomous' | 'confirm'

export interface AIConfig {
  apiKey: string
  baseURL: string
  model: string
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface ToolResult {
  tool_call_id: string
  role: 'tool'
  content: string
}

export interface PendingTool {
  id: string
  name: string
  arguments: Record<string, unknown>
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  pendingTool?: PendingTool
}
