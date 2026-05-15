import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { EventsOn } from '../../wailsjs/runtime'
import type { SessionStatus } from '../types/session'

interface SessionData {
  id: string
  status: SessionStatus
  data: string[]
}

// Module-level reactive state (shared across all store instances)
const sessionState = reactive<{
  sessions: Map<string, SessionData>
}>({
  sessions: new Map()
})

// Register event listeners once at module level
EventsOn('session:status', (payload: { id: string; status: SessionStatus }) => {
  let s = sessionState.sessions.get(payload.id)
  if (!s) {
    s = { id: payload.id, status: 'connecting', data: [] }
    sessionState.sessions.set(payload.id, s)
  }
  s.status = payload.status
})

EventsOn('session:data', (payload: { id: string; data: string }) => {
  let s = sessionState.sessions.get(payload.id)
  if (!s) {
    s = { id: payload.id, status: 'connecting', data: [] }
    sessionState.sessions.set(payload.id, s)
  }
  s.data.push(payload.data)
  if (s.data.length > 2000) {
    s.data.splice(0, s.data.length - 1000)
  }
})

export const useSessionStore = defineStore('session', () => {
  function initSession(id: string) {
    const existing = sessionState.sessions.get(id)
    if (existing) {
      existing.status = 'connecting'
    } else {
      sessionState.sessions.set(id, { id, status: 'connecting', data: [] })
    }
  }

  function updateStatus(id: string, status: SessionStatus) {
    const s = sessionState.sessions.get(id)
    if (s) {
      s.status = status
    }
  }

  function appendData(id: string, chunk: string) {
    const s = sessionState.sessions.get(id)
    if (s) {
      s.data.push(chunk)
      if (s.data.length > 2000) {
        s.data.splice(0, s.data.length - 1000)
      }
    }
  }

  function getData(id: string): string {
    const s = sessionState.sessions.get(id)
    return s ? s.data.join('') : ''
  }

  function removeSession(id: string) {
    sessionState.sessions.delete(id)
  }

  return {
    sessions: sessionState.sessions,
    initSession,
    updateStatus,
    appendData,
    getData,
    removeSession
  }
})
