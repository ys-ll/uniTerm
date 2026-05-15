import { defineStore } from 'pinia'
import { reactive } from 'vue'
import type { Panel, PanelStatus, ConnectionConfig } from '../types/workspace'

const panelState = reactive<{
  panels: Map<string, Panel>
}>({
  panels: new Map()
})

export const usePanelStore = defineStore('panel', () => {
  function createPanel(config: ConnectionConfig | null, type: Panel['type'] = 'ssh'): Panel {
    const id = `panel-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const panel: Panel = {
      id,
      tabId: '',
      type,
      sessionId: null,
      title: config ? `${config.host} ${config.user}` : 'New Panel',
      status: 'disconnected',
      config
    }
    panelState.panels.set(id, panel)
    return panel
  }

  function removePanel(id: string) {
    panelState.panels.delete(id)
  }

  function getPanel(id: string): Panel | undefined {
    return panelState.panels.get(id)
  }

  function bindSession(panelId: string, sessionId: string) {
    const p = panelState.panels.get(panelId)
    if (p) p.sessionId = sessionId
  }

  function updateStatus(panelId: string, status: PanelStatus) {
    const p = panelState.panels.get(panelId)
    if (p) p.status = status
  }

  function updateTitle(panelId: string, title: string) {
    const p = panelState.panels.get(panelId)
    if (p) p.title = title
  }

  function movePanelToTab(panelId: string, tabId: string) {
    const p = panelState.panels.get(panelId)
    if (p) p.tabId = tabId
  }

  return {
    panels: panelState.panels,
    createPanel,
    removePanel,
    getPanel,
    bindSession,
    updateStatus,
    updateTitle,
    movePanelToTab
  }
})
