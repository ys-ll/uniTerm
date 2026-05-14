# AI Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a Claude Code-style AI assistant sidebar that can execute shell commands in the active terminal, observe output, and complete tasks autonomously or with user confirmation.

**Architecture:** Pinia store (`aiStore`) manages sessions, messages, and LLM flow. `llmService` handles API communication via Go backend proxy. `terminalAgent` executes commands via marker-based output capture. Vue components render the sidebar UI.

**Tech Stack:** Vue 3 + Pinia + TypeScript, no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/types/ai.ts` | Create | AIMessage, ToolCall, AISession, AIConfig types |
| `frontend/src/stores/aiStore.ts` | Create | Session management, message flow, tool execution |
| `frontend/src/services/llmService.ts` | Create | LLM API calls via Go backend, streaming |
| `frontend/src/services/terminalAgent.ts` | Create | Marker-based command execution |
| `frontend/src/components/AISidebar.vue` | Create | Main sidebar container |
| `frontend/src/components/AIMessage.vue` | Create | Message bubble with Markdown + IN/OUT blocks |
| `frontend/src/components/AIInput.vue` | Create | Input area with Send/Stop |
| `frontend/src/components/AISettings.vue` | Create | API config modal |
| `app.go` | Modify | Add ChatCompletion method (already exists) |

---

### Task 1: Define AI Types

**Files:**
- Create: `frontend/src/types/ai.ts`

- [ ] **Step 1: Add AI types**

```typescript
export interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]
  tool_call_id?: string
  pendingTool?: PendingTool
}

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export interface PendingTool {
  id: string
  name: string
  arguments: string
}

export interface AISession {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  messages: AIMessage[]
}

export interface AIConfig {
  apiKey: string
  baseURL: string
  model: string
  protocol: 'openai' | 'anthropic'
}
```

---

### Task 2: Create aiStore

**Files:**
- Create: `frontend/src/stores/aiStore.ts`

- [ ] **Step 1: Implement aiStore**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { AIMessage, AISession, AIConfig, PendingTool } from '../types/ai'
import { useTabStore } from './tabStore'

const AI_CONFIG_KEY = 'uniterm:ai-config'
const AI_SESSIONS_KEY = 'uniterm:ai-sessions'

function loadConfig(): AIConfig {
  try {
    return JSON.parse(localStorage.getItem(AI_CONFIG_KEY) || '{}')
  } catch { return { apiKey: '', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o', protocol: 'anthropic' } }
}

function loadSessions(): AISession[] {
  try {
    return JSON.parse(localStorage.getItem(AI_SESSIONS_KEY) || '[]')
  } catch { return [] }
}

export const useAIStore = defineStore('ai', () => {
  const visible = ref(false)
  const width = ref(360)
  const mode = ref<'auto' | 'confirm'>('auto')
  const debug = ref(false)
  const isRunning = ref(false)
  const stopRequested = ref(false)
  const config = ref<AIConfig>(loadConfig())
  const sessions = ref<AISession[]>(loadSessions())
  const currentSessionId = ref<string>('')
  const messages = ref<AIMessage[]>([])

  const currentSession = computed(() =>
    sessions.value.find(s => s.id === currentSessionId.value)
  )

  function toggle() { visible.value = !visible.value }
  function setWidth(w: number) { width.value = Math.max(240, Math.min(800, w)) }
  function setMode(m: 'auto' | 'confirm') { mode.value = m }
  function toggleDebug() { debug.value = !debug.value }
  function stop() { stopRequested.value = true }

  function saveConfig() {
    localStorage.setItem(AI_CONFIG_KEY, JSON.stringify(config.value))
  }

  function saveSessions() {
    localStorage.setItem(AI_SESSIONS_KEY, JSON.stringify(sessions.value))
  }

  function createSession() {
    if (messages.value.length > 0) {
      const session: AISession = {
        id: currentSessionId.value,
        name: currentSession.value?.name || 'New Chat',
        createdAt: currentSession.value?.createdAt || Date.now(),
        updatedAt: Date.now(),
        messages: [...messages.value]
      }
      const idx = sessions.value.findIndex(s => s.id === session.id)
      if (idx >= 0) sessions.value[idx] = session
      else sessions.value.unshift(session)
      saveSessions()
    }
    const id = `session-${Date.now()}`
    currentSessionId.value = id
    sessions.value.unshift({ id, name: 'New Chat', createdAt: Date.now(), updatedAt: Date.now(), messages: [] })
    messages.value = []
    saveSessions()
  }

  function loadSession(id: string) {
    const s = sessions.value.find(s => s.id === id)
    if (!s) return
    if (messages.value.length > 0 && currentSessionId.value) {
      // save current
      const current = sessions.value.find(s => s.id === currentSessionId.value)
      if (current) {
        current.messages = [...messages.value]
        current.updatedAt = Date.now()
        saveSessions()
      }
    }
    currentSessionId.value = id
    messages.value = [...s.messages]
  }

  function deleteSession(id: string) {
    sessions.value = sessions.value.filter(s => s.id !== id)
    if (currentSessionId.value === id) {
      createSession()
    }
    saveSessions()
  }

  function addMessage(msg: AIMessage) {
    messages.value.push(msg)
    const session = sessions.value.find(s => s.id === currentSessionId.value)
    if (session) {
      session.messages = [...messages.value]
      session.updatedAt = Date.now()
      if (session.name === 'New Chat' && msg.role === 'user') {
        session.name = msg.content.slice(0, 20) + (msg.content.length > 20 ? '...' : '')
      }
      saveSessions()
    }
  }

  // ── LLM Flow ──

  async function sendMessage(text: string) {
    const tabStore = useTabStore()
    if (!tabStore.activeTab?.sessionId) {
      addMessage({ id: `msg-${Date.now()}`, role: 'assistant', content: '请先在主窗口中打开一个终端会话，这样我才能执行命令。' })
      return
    }
    if (!config.value.apiKey) {
      addMessage({ id: `msg-${Date.now()}`, role: 'assistant', content: '[Error: API key not configured]' })
      return
    }

    stopRequested.value = false
    isRunning.value = true

    try {
      addMessage({ id: `msg-${Date.now()}`, role: 'user', content: text })
      await runLLMConversation()
    } finally {
      isRunning.value = false
      stopRequested.value = false
    }
  }

  async function runLLMConversation(round = 0) {
    if (round >= 10 || stopRequested.value) return
    // ... call llmService, handle tool calls, loop
  }

  return {
    visible, width, mode, debug, isRunning, config, sessions, currentSessionId, messages,
    toggle, setWidth, setMode, toggleDebug, stop, saveConfig, createSession, loadSession, deleteSession, addMessage, sendMessage
  }
})
```

---

### Task 3: Create LLM Service

**Files:**
- Create: `frontend/src/services/llmService.ts`

- [ ] **Step 1: Implement LLM API service**

```typescript
import { useAIStore } from '../stores/aiStore'
import { ChatCompletion } from '../../wailsjs/go/main/App'

export async function* chatStream(messages: any[], tools?: any[]): AsyncGenerator<string> {
  const store = useAIStore()
  const { apiKey, baseURL, model, protocol } = store.config

  const body = {
    model,
    messages,
    tools,
    stream: true,
  }

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(body)
  })

  const reader = response.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6)
        if (data === '[DONE]') return
        try {
          const chunk = JSON.parse(data)
          const content = chunk.choices?.[0]?.delta?.content
          if (content) yield content
        } catch { /* ignore parse errors */ }
      }
    }
  }
}
```

---

### Task 4: Create Terminal Agent

**Files:**
- Create: `frontend/src/services/terminalAgent.ts`

- [ ] **Step 1: Implement marker-based command execution**

```typescript
import { EventsOn, SessionWrite } from '../../wailsjs/runtime'
import { useTabStore } from '../stores/tabStore'

export async function executeCommand(command: string): Promise<{ output: string; exitCode: number }> {
  const tabStore = useTabStore()
  const sessionId = tabStore.activeTab?.sessionId
  if (!sessionId) throw new Error('No active session')

  const marker = `__AI_DONE_${Date.now()}_${Math.random().toString(36).slice(2, 6)}__`
  const fullCommand = `_='${marker}';${command};echo "$_"`

  let output = ''
  let markerCount = 0
  let started = false
  const timeout = 15000

  const unsubscribe = EventsOn('session:data', (data: any) => {
    if (data.id !== sessionId) return
    const text = data.data as string
    const idx = text.indexOf(marker)
    if (idx >= 0) {
      markerCount++
      if (markerCount === 1) {
        // first occurrence = echo of command itself, ignore
        started = true
      } else if (markerCount === 2) {
        // second occurrence = command completed
        const endIdx = idx
        // extract between first and second marker
      }
    }
    if (started && markerCount < 2) {
      output += text
    }
  })

  await SessionWrite(sessionId, fullCommand + '\r')

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      unsubscribe()
      resolve({ output, exitCode: -1 })
    }, timeout)

    // poll for completion
    const check = setInterval(() => {
      if (markerCount >= 2) {
        clearTimeout(timer)
        clearInterval(check)
        unsubscribe()
        resolve({ output, exitCode: 0 })
      }
    }, 100)
  })
}
```

---

### Task 5: Create AISidebar.vue

**Files:**
- Create: `frontend/src/components/AISidebar.vue`

- [ ] **Step 1: Implement sidebar container**

```vue
<template>
  <div v-show="store.visible" class="ai-sidebar" :style="{ width: store.width + 'px' }">
    <div class="ai-header">
      <span class="ai-title">AI Assistant</span>
      <div class="ai-header-actions">
        <button class="ai-btn" @click="showSettings = true"><el-icon><Setting /></el-icon></button>
        <button class="ai-btn" @click="store.toggle()"><el-icon><Close /></el-icon></button>
      </div>
    </div>

    <SessionSelector />

    <div class="ai-mode">
      <div class="segmented">
        <button :class="{ active: store.mode === 'auto' }" @click="store.setMode('auto')">Auto</button>
        <button :class="{ active: store.mode === 'confirm' }" @click="store.setMode('confirm')">Confirm</button>
      </div>
      <label><input v-model="store.debug" type="checkbox" /> Debug</label>
    </div>

    <div ref="msgList" class="ai-messages">
      <AIMessage v-for="msg in store.messages" :key="msg.id" :message="msg" />
    </div>

    <AIInput />

    <AISettings v-model="showSettings" />
  </div>
  <div v-show="store.visible" class="ai-resize-handle" @mousedown="onResizeStart" />
</template>

<script setup lang="ts">
import { ref, nextTick, watch } from 'vue'
import { Setting, Close } from '@element-plus/icons-vue'
import { useAIStore } from '../stores/aiStore'
import AIMessage from './AIMessage.vue'
import AIInput from './AIInput.vue'
import AISettings from './AISettings.vue'

const store = useAIStore()
const msgList = ref<HTMLDivElement>()
const showSettings = ref(false)

watch(() => store.messages.length, () => {
  nextTick(() => {
    msgList.value?.scrollTo({ top: msgList.value.scrollHeight, behavior: 'smooth' })
  })
})

function onResizeStart(e: MouseEvent) {
  const startX = e.clientX
  const startW = store.width
  function onMove(ev: MouseEvent) {
    store.setWidth(startW + (startX - ev.clientX))
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>
```

---

### Task 6: Create AIMessage.vue

**Files:**
- Create: `frontend/src/components/AIMessage.vue`

- [ ] **Step 1: Implement message bubble with Markdown and IN/OUT blocks**

Props: `message: AIMessage`

Render logic:
- If `role === 'tool'` and not debug → skip (rendered inside assistant message)
- Render avatar + content
- Content: pass through Markdown renderer
- If `tool_calls?.length` > 0: render IN block(s)
- For each tool_call: find matching tool result via `tool_call_id`, render OUT block
- If `pendingTool`: render Run/Skip buttons

Markdown renderer regex-based (see design spec §15).

---

### Task 7: Create AIInput.vue

**Files:**
- Create: `frontend/src/components/AIInput.vue`

- [ ] **Step 1: Implement input area**

```vue
<template>
  <div class="ai-input-area">
    <textarea
      v-model="text"
      :placeholder="store.isRunning ? 'AI is thinking...' : 'Ask AI to do something...'"
      :disabled="store.isRunning"
      @keydown="onKeydown"
    />
    <button v-if="store.isRunning" class="ai-send-btn" @click="store.stop()">Stop</button>
    <button v-else class="ai-send-btn" :disabled="!text.trim()" @click="send">Send</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAIStore } from '../stores/aiStore'

const store = useAIStore()
const text = ref('')

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

function send() {
  const t = text.value.trim()
  if (!t) return
  text.value = ''
  store.sendMessage(t)
}
</script>
```

---

### Task 8: Create AISettings.vue

**Files:**
- Create: `frontend/src/components/AISettings.vue`

- [ ] **Step 1: Implement settings modal**

Form fields: API Key (password), Base URL, Model, Protocol (select: openai/anthropic)
Save button persists to localStorage via `aiStore.saveConfig()`.

---

## Verification

1. **Build check:** `cd frontend && npx vite build` — compiles without errors.
2. **Wails dev:** `wails dev` — app starts, AI sidebar toggle works.
3. **UI tests:**
   - Click header "AI" button → sidebar slides in from right
   - Type message → Enter sends → AI responds
   - AI suggests command → IN block visible → Auto mode executes automatically
   - Switch to Confirm mode → pending tool shows Run/Skip → click Run executes
   - Click Stop during streaming → stops cleanly
   - Create new session → previous saved to history dropdown
   - Resize sidebar by dragging left edge → width changes
4. **Terminal integration:** With active SSH session, ask AI to run `ls` → command appears in terminal, output captured, AI summarizes.
