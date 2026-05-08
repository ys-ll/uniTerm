import { EventsOn } from '../../wailsjs/runtime'
import { SessionWrite } from '../../wailsjs/go/main/App'
import { useTabStore } from '../stores/tabStore'

export interface ExecuteResult {
  output: string
  exitCode: number
}

export async function executeCommand(command: string): Promise<ExecuteResult> {
  const tabStore = useTabStore()
  const sessionId = tabStore.activeTab?.sessionId
  if (!sessionId) throw new Error('No active terminal session')

  const marker = `__AI_DONE_${Date.now()}_${Math.random().toString(36).slice(2, 8)}__`
  const fullCommand = `${command}; echo "${marker}"`

  await SessionWrite(sessionId, fullCommand + '\n')

  return new Promise((resolve) => {
    let output = ''
    let timeoutId: ReturnType<typeof setTimeout>

    const unsubscribe = EventsOn('session:data', (payload: { id: string; data: string }) => {
      if (payload.id !== sessionId) return

      output += payload.data
      const clean = stripAnsi(output)

      if (clean.includes(marker)) {
        clearTimeout(timeoutId)
        unsubscribe()

        const idx = clean.indexOf(marker)
        const result = clean.slice(0, idx).trim()
        resolve({ output: result, exitCode: 0 })
      }
    })

    timeoutId = setTimeout(() => {
      unsubscribe()
      resolve({ output: stripAnsi(output).trim(), exitCode: -1 })
    }, 30000)
  })
}

function stripAnsi(str: string): string {
  return str
    .replace(/\x1B\[[0-9;?]*[A-Za-z]/g, '')
    .replace(/\x1B][0-9;]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B[()[\]#\^%@>=]/g, '')
    .replace(/\x1B[/!_]./g, '')
    .replace(/\x1B./g, '')
}
