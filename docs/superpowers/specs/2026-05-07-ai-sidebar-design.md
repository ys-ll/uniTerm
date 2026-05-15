# AI Sidebar Design Spec

**Goal:** Provide a Claude Code-style AI assistant panel in the right sidebar that can execute shell commands in the active terminal session, observe output, and continue reasoning autonomously or with user confirmation.

**Architecture:** Vue 3 sidebar component (`AISidebar`) with Pinia store (`aiStore`). LLM communication via Go backend proxy. Terminal command execution via marker-based output capture. Session history persisted in localStorage.

---

## 1. Data Structures

### AIMessage

```typescript
interface AIMessage {
  id: string
  role: 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: ToolCall[]       // assistant initiates tool calls
  tool_call_id?: string         // tool message links back to tool_call
  pendingTool?: PendingTool     // Confirm mode: awaiting user approval
}
```

### ToolCall

```typescript
interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string  // JSON string
  }
}
```

### PendingTool

```typescript
interface PendingTool {
  id: string
  name: string
  arguments: string
}
```

### AISession

```typescript
interface AISession {
  id: string
  name: string
  createdAt: number
  updatedAt: number
  messages: AIMessage[]
}
```

---

## 2. UI Layout

### 2.1 Sidebar Structure

- **Position**: right side, collapsible
- **Default width**: 360px, resizable (240px ~ 800px)
- **Toggle**: header "AI" button or sidebar close button

Internal structure (top to bottom):

| Area | Description |
|------|-------------|
| Title bar | "AI Assistant" + Settings button + Close button |
| Session selector | Dropdown for switching/creating sessions |
| Mode toggle | Auto / Confirm segmented control + Debug checkbox |
| Message list | Scrollable conversation area |
| Input area | Text input + Send / Stop button |

### 2.2 Message Bubbles

| Role | Avatar Text | Alignment |
|------|------------|-----------|
| user | You | left |
| assistant | AI | left |
| tool | Tool | left (debug only) |

### 2.3 IN/OUT Blocks

IN and OUT are rendered **inside the same assistant message bubble**:

- **IN block** (green theme): shows the command to execute. Triggered by `message.tool_calls?.length > 0`. Folded by default.
- **OUT block** (purple theme): shows command stdout/stderr. Triggered by matching `tool_call_id`. Folded by default, max-height 300px scrollable.
- **Pending tool** (Confirm mode): shows command + Run/Skip buttons instead of OUT block.

---

## 3. Interactions

### 3.1 Normal Flow (Auto Mode)

```
User input
  → add user message
  → call LLM (stream response)
  → assistant needs tool call?
    → yes: add assistant msg (with tool_calls)
      → execute command immediately
      → add tool result message
      → call LLM again (loop, max 10 rounds)
    → no: reply complete
```

### 3.2 Confirm Mode

Same flow as Auto, but pauses before executing commands:
- Displays `pendingTool` UI with Run/Skip buttons
- User clicks **Run** → execute → add result → auto-continue LLM call
- User clicks **Skip** → add rejection result → stop (user must send new message to continue)

### 3.3 Prerequisites Check

Before calling LLM:
- Check active terminal session exists (`tabStore.activeTab?.sessionId`)
- If not, reply: "请先在主窗口中打开一个终端会话，这样我才能执行命令。"

### 3.4 Stop Mechanism

- **Stop button** visible only when `isRunning === true`
- Sets `stopRequested = true`
- Interrupts: LLM stream (skip remaining chunks), pending tool execution, next loop iteration

---

## 4. Components

### AISidebar.vue

Main sidebar container. Manages:
- Visibility toggle
- Width resize (drag handle)
- Child component composition

### AIMessage.vue

Renders a single message bubble:
- Markdown rendering (code blocks, bold, italic, lists, links, inline code, tables, hr)
- IN/OUT block rendering (conditional on `tool_calls`)
- Pending tool approval UI (Confirm mode)

### AIInput.vue

Input area:
- Textarea for user input
- **Enter** to send, **Shift+Enter** for newline
- Send/Stop button state toggle

### AISettings.vue

Modal dialog for:
- API Key, Base URL, Model, Protocol (openai/anthropic)
- Persisted to localStorage (`uniterm:ai-config`)

---

## 5. Store Operations (aiStore)

| Operation | Description |
|-----------|-------------|
| `addMessage(msg)` | Append to current session messages, update `updatedAt` |
| `sendMessage(text)` | Full flow: add user msg → call LLM → handle response |
| `executeTool(toolCall)` | Send command to terminal via marker mechanism |
| `approveTool(toolCall)` | User approved in Confirm mode |
| `rejectTool(toolCall)` | User skipped in Confirm mode |
| `createSession()` | Save current if has messages, create new "New Chat" |
| `loadSession(id)` | Replace current messages with session history |
| `deleteSession(id)` | Remove from history; if current, create new session |
| `stop()` | Set `stopRequested = true` |
| `setMode(mode)` | Toggle Auto/Confirm |
| `toggleDebug()` | Toggle debug message visibility |

---

## 6. Data Flow

### Send message flow

```
User types in AIInput
  → aiStore.sendMessage(text)
    → check active terminal session (abort if none)
    → add user message to current session
    → call llmService.chat(messages, tools)
      → stream response chunks
      → accumulate assistant content
      → if tool_calls present:
        → Auto mode: executeTool() → add tool result → loop (max 10)
        → Confirm mode: set pendingTool → pause
      → if stopRequested: abort
    → update session name from first user message (max 20 chars)
```

### Tool execution flow

```
executeTool(toolCall)
  → parse arguments JSON → extract command
  → generate marker: __AI_DONE_${timestamp}_${random}__
  → send: _='${marker}';${command};echo "$_"
  → listen session:data events
  → capture output between first and second marker occurrence
  → timeout 15s
  → add tool result message
  → if Auto mode: continue LLM call
```

---

## 7. Edge Cases

- **No active terminal**: reply with prompt instead of calling LLM
- **No API key**: show "API key not configured" error in assistant message
- **Command timeout (15s)**: return collected output, exitCode = -1
- **Max 10 tool rounds**: prevent infinite loops
- **Stop during stream**: abort cleanly, don't execute pending tools
- **Session without user messages**: keep "New Chat" name
- **Delete current session**: auto-create new empty session
- **Debug mode**: insert debug messages (id prefix `dbg-`), visible in UI but not sent to LLM
