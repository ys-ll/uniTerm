export type ExecutionMode = 'confirm_all' | 'confirm_dangerous' | 'bypass'

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
  dangerous: boolean
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  _rawApiMsg?: Record<string, unknown>  // exact message from API, passed back verbatim
  tool_calls?: ToolCall[]
  tool_call_id?: string
  pendingTools?: PendingTool[]
}

export interface AISession {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  messages: AIMessage[]
}
