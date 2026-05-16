import { ref, onMounted, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'

export interface UseTerminalMenuOptions {
  getSelection: () => string
  onPaste: (text: string) => Promise<void> | void
  onAskAI?: (text: string) => void
}

export interface UseTerminalMenuReturn {
  menuVisible: Ref<boolean>
  menuStyle: Ref<{ left: string; top: string }>
  hasSelection: Ref<boolean>
  onContextMenu: (e: MouseEvent) => void
  closeMenu: () => void
  copySelection: () => void
  copyAndPaste: () => Promise<void>
  pasteFromClipboard: () => Promise<void>
  askAI: () => void
}

export function useTerminalMenu(options: UseTerminalMenuOptions): UseTerminalMenuReturn {
  const settingsStore = useSettingsStore()

  const menuVisible = ref(false)
  const menuStyle = ref({ left: '0px', top: '0px' })
  const hasSelection = ref(false)

  function closeMenu() {
    menuVisible.value = false
  }

  function onContextMenu(e: MouseEvent) {
    const rightClickAction = settingsStore.settings.terminal.rightClickAction
    if (rightClickAction === 'paste') {
      e.preventDefault()
      e.stopPropagation()
      pasteFromClipboard()
      return
    }
    e.preventDefault()
    e.stopPropagation()
    window.dispatchEvent(new CustomEvent('global:close-context-menus'))
    hasSelection.value = !!options.getSelection()
    menuStyle.value = fitMenuPosition(e.clientX, e.clientY, 120, 140)
    menuVisible.value = true
  }

  function fitMenuPosition(x: number, y: number, menuW: number, menuH: number) {
    let left = x
    let top = y
    if (x + menuW > window.innerWidth) left = x - menuW
    if (y + menuH > window.innerHeight) top = y - menuH
    return { left: left + 'px', top: top + 'px' }
  }

  function copySelection() {
    const text = options.getSelection()
    if (text) {
      navigator.clipboard.writeText(text)
    }
    closeMenu()
  }

  async function copyAndPaste() {
    const text = options.getSelection()
    if (text) {
      await navigator.clipboard.writeText(text)
      await options.onPaste(text)
    }
    closeMenu()
  }

  function askAI() {
    const text = options.getSelection()
    if (text && options.onAskAI) {
      options.onAskAI(text)
    }
    closeMenu()
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText()
      if (text) {
        await options.onPaste(text)
      }
    } catch {
      // clipboard read failed
    }
    closeMenu()
  }

  onMounted(() => {
    window.addEventListener('global:close-context-menus', closeMenu)
    document.addEventListener('click', closeMenu)
  })

  onUnmounted(() => {
    window.removeEventListener('global:close-context-menus', closeMenu)
    document.removeEventListener('click', closeMenu)
  })

  return {
    menuVisible,
    menuStyle,
    hasSelection,
    onContextMenu,
    closeMenu,
    copySelection,
    copyAndPaste,
    pasteFromClipboard,
    askAI,
  }
}
