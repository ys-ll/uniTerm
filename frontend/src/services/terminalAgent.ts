import { EventsOn } from '../../wailsjs/runtime'
import { SessionWrite } from '../../wailsjs/go/main/App'
import { useTabStore } from '../stores/tabStore'
import { useAIStore } from '../stores/aiStore'

export interface ExecuteResult {
  output: string
  exitCode: number
}

function addDebugLog(text: string) {
  const store = useAIStore()
  if (!store.debug) return
  store.addMessage({
    id: `dbg-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    role: 'tool',
    content: `[Debug] ${text}`
  })
}

export async function executeCommand(command: string): Promise<ExecuteResult> {
  const tabStore = useTabStore()
  const sessionId = tabStore.activeTab?.sessionId
  if (!sessionId) throw new Error('No active terminal session')

  const marker = `__AI_DONE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}__`
  const fullCommand = ` _u='${marker}';${command};echo "$_u"`

  await SessionWrite(sessionId, fullCommand + '\n')

  return new Promise((resolve) => {
    let output = ''
    let timeoutId: ReturnType<typeof setTimeout>
    let eventCount = 0
    let markerSeen = false
    let lastScanPos = 0

    const unsubscribe = EventsOn('session:data', (payload: { id: string; data: string }) => {
      eventCount++
      if (payload.id !== sessionId) return

      output += payload.data
      const clean = stripAnsi(output)

      const scanStart = Math.max(0, lastScanPos - marker.length)
      lastScanPos = clean.length
      let searchIdx = scanStart
      while ((searchIdx = clean.indexOf(marker, searchIdx)) !== -1) {
        searchIdx += marker.length
        if (!markerSeen) {
          markerSeen = true
          continue
        }
        clearTimeout(timeoutId)
        unsubscribe()
        const result = clean.slice(0, searchIdx - marker.length).trim()
        resolve({ output: result, exitCode: 0 })
        return
      }
    })

    // 60-second timeout for long-running commands
    timeoutId = setTimeout(() => {
      const cleanOutput = stripAnsi(output).trim()
      unsubscribe()
      const result = cleanOutput + '\n\n[Command timed out after 60s. The command may still be running. You can wait for it to complete or cancel it.]'
      resolve({ output: result, exitCode: -1 })
    }, 60000)
  })
}

// Simple ANSI stripper for extracting readable text from terminal output
function stripAnsi(str: string): string {
  return str
    .replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1B][0-9;]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[()[\]#\^%@>=]/g, '')
    .replace(/\x1B[/!_]./g, '')
    .replace(/\x1B./g, '')
}
