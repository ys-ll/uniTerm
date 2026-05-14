export type PanelType = 'ssh' | 'settings' | 'other'
export type PanelStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

export interface ConnectionConfig {
  id: string
  name: string
  type: string
  host: string
  port: number
  user: string
  authType: string
  password?: string
  keyPath?: string
}

export interface Panel {
  id: string
  workspaceId: string
  type: PanelType
  sessionId: string | null
  title: string
  status: PanelStatus
  config: ConnectionConfig | null
}

export interface Workspace {
  id: string
  name: string
  panelIds: string[]
  layout: PanelLayout
  activePanelId: string | null
  createdAt: number
}

export interface PanelLayout {
  root: LayoutNode
}

export type LayoutNode =
  | { type: 'leaf'; panelId: string }
  | { type: 'split'; direction: 'horizontal' | 'vertical'; children: LayoutNode[]; sizes: number[] }
