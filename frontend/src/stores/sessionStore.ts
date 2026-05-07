import { defineStore } from 'pinia'
import { ref } from 'vue'
import { EventsOn } from '../../wailsjs/runtime'
import type { SessionStatus } from '../types/session'

interface SessionData {
  id: string
  status: SessionStatus
  data: string[]
}

export const useSessionStore = defineStore('session', () => {
  const sessions = ref<Map<string, SessionData>>(new Map())

  function initSession(id: string) {
    sessions.value.set(id, { id, status: 'connecting', data: [] })
  }

  function updateStatus(id: string, status: SessionStatus) {
    const s = sessions.value.get(id)
    if (s) {
      s.status = status
    }
  }

  function appendData(id: string, chunk: string) {
    const s = sessions.value.get(id)
    if (s) {
      s.data.push(chunk)
      // Keep buffer size reasonable
      if (s.data.length > 1000) {
        s.data = s.data.slice(-500)
      }
    }
  }

  function getData(id: string): string {
    const s = sessions.value.get(id)
    return s ? s.data.join('') : ''
  }

  function removeSession(id: string) {
    sessions.value.delete(id)
  }

  // Listen to backend events
  EventsOn('session:status', (payload: { id: string; status: SessionStatus }) => {
    updateStatus(payload.id, payload.status)
  })

  EventsOn('session:data', (payload: { id: string; data: string }) => {
    appendData(payload.id, payload.data)
  })

  return {
    sessions,
    initSession,
    updateStatus,
    appendData,
    getData,
    removeSession
  }
})
