import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { SaveConnections, LoadConnections } from '../../wailsjs/go/main/App'
import { EventsOn } from '../../wailsjs/runtime'
import type { ConnectionConfig, ConnectionGroup } from '../types/session'

export interface GroupedConnections {
  groups: { group: ConnectionGroup; connections: ConnectionConfig[] }[]
  ungrouped: ConnectionConfig[]
}

export const useConnectionStore = defineStore('connection', () => {
  const connections = ref<ConnectionConfig[]>([])
  const groups = ref<ConnectionGroup[]>([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const data = await LoadConnections() as { groups?: ConnectionGroup[]; connections?: ConnectionConfig[] }
      groups.value = data.groups || []
      connections.value = (data.connections || []) as ConnectionConfig[]
    } catch (e) {
      console.error('Failed to load connections:', e)
    } finally {
      loading.value = false
    }
  }

  async function save() {
    try {
      await SaveConnections({
        groups: groups.value,
        connections: connections.value
      } as any)
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

  // ── Group CRUD ──

  function generateGroupId(): string {
    return `grp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
  }

  async function addGroup(name: string): Promise<ConnectionGroup> {
    const group: ConnectionGroup = { id: generateGroupId(), name }
    groups.value.push(group)
    await save()
    return group
  }

  async function renameGroup(id: string, name: string) {
    const g = groups.value.find(g => g.id === id)
    if (g) {
      g.name = name
      await save()
    }
  }

  async function deleteGroup(id: string, action: 'delete-connections' | 'move-out') {
    if (action === 'delete-connections') {
      connections.value = connections.value.filter(c => c.groupId !== id)
    } else {
      for (const c of connections.value) {
        if (c.groupId === id) {
          c.groupId = undefined
        }
      }
    }
    groups.value = groups.value.filter(g => g.id !== id)
    await save()
  }

  async function setConnectionGroup(connectionId: string, groupId: string | undefined) {
    const c = connections.value.find(c => c.id === connectionId)
    if (c) {
      c.groupId = groupId
      await save()
    }
  }

  async function setConnectionsGroup(connectionIds: string[], groupId: string | undefined) {
    for (const id of connectionIds) {
      const c = connections.value.find(c => c.id === id)
      if (c) {
        c.groupId = groupId
      }
    }
    await save()
  }

  // ── Derived ──

  const groupedConnections = computed<GroupedConnections>(() => {
    const groupMap = new Map<string, { group: ConnectionGroup; connections: ConnectionConfig[] }>()
    for (const g of groups.value) {
      groupMap.set(g.id, { group: g, connections: [] })
    }
    const ungrouped: ConnectionConfig[] = []
    for (const c of connections.value) {
      if (c.groupId && groupMap.has(c.groupId)) {
        groupMap.get(c.groupId)!.connections.push(c)
      } else {
        ungrouped.push(c)
      }
    }
    // Sort connections alphabetically within each group
    for (const entry of groupMap.values()) {
      entry.connections.sort((a, b) => a.name.localeCompare(b.name))
    }
    // Sort groups alphabetically by name
    const sortedGroups = [...groupMap.values()].sort((a, b) =>
      a.group.name.localeCompare(b.group.name)
    )
    // Sort ungrouped alphabetically
    ungrouped.sort((a, b) => a.name.localeCompare(b.name))
    return { groups: sortedGroups, ungrouped }
  })

  // Listen for cross-window connection sync
  EventsOn('store:connections:changed', (data: { groups?: ConnectionGroup[]; connections?: ConnectionConfig[] }) => {
    if (data) {
      if (data.groups) groups.value = data.groups
      if (data.connections) connections.value = data.connections
    }
  })

  return {
    connections,
    groups,
    loading,
    load,
    save,
    add,
    update,
    remove,
    addGroup,
    renameGroup,
    deleteGroup,
    setConnectionGroup,
    setConnectionsGroup,
    groupedConnections
  }
})
