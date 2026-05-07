export type SessionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface ConnectionConfig {
  id: string
  name: string
  type: 'ssh' | 'sftp' | 'mysql' | 'redis'
  host: string
  port: number
  user: string
  authType: 'password' | 'key' | 'agent'
  password?: string
  keyPath?: string
}

export interface SessionInfo {
  id: string
  type: string
  title: string
  status: SessionStatus
}

export interface Tab {
  id: string
  sessionId: string
  title: string
  type: 'ssh' | 'sftp'
}

export interface SplitNode {
  id: string
  direction: 'horizontal' | 'vertical' | null
  children: SplitNode[]
  tabGroupId?: string
}
