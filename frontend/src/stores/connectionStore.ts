import { defineStore } from 'pinia'
import { ref } from 'vue'
import { SaveConnections, LoadConnections } from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime'
import type { ConnectionConfig } from '../types/session'

export const useConnectionStore = defineStore('connection', () => {
  const connections = ref<ConnectionConfig[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      connections.value = await LoadConnections()
    } catch (e) {
      console.error('Failed to load connections:', e)
    } finally {
      loading.value = false
    }
  }

  async function save() {
    try {
      await SaveConnections(connections.value)
    } catch (e) {
      console.error('Failed to save connections:', e)
    }
  }

  async function add(config: ConnectionConfig) {
    if (!config.id) {
      config.id = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    }
    if (connections.value.some(c => c.id === config.id)) {
      return
    }
    connections.value.push(config)
    await save()
  }

  async function update(id: string, config: Partial<ConnectionConfig>) {
    const idx = connections.value.findIndex(c => c.id === id)
    if (idx >= 0) {
      connections.value[idx] = { ...connections.value[idx], ...config }
      await save()
    }
  }

  async function remove(id: string) {
    connections.value = connections.value.filter(c => c.id !== id)
    await save()
  }

  // Listen for cross-window connection sync
  EventsOn('store:connections:changed', (updatedConnections: ConnectionConfig[]) => {
    connections.value = updatedConnections
  })

  return {
    connections,
    loading,
    load,
    save,
    add,
    update,
    remove
  }
})
