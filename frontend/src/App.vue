<template>
  <div class="app-container">
    <AppHeader
      @new-connection="showConnectionForm = true"
      @toggle-ai="aiStore.toggle"
      @toggle-sidebar="sidebarVisible = !sidebarVisible"
      @open-settings="openSettings"
    />
    <div class="main-content">
      <Sidebar :visible="sidebarVisible" @toggle="sidebarVisible = !sidebarVisible" @connect="onConnect" @connect-sftp="onConnectSftp" />
      <div class="tab-area">
        <TabBar />
        <template v-if="activeTab">
          <TerminalTabContent
            v-if="activeTab.type === 'terminal'"
            :key="activeTab.id"
            :tab="activeTab"
            @close="closeTab"
          />
          <SettingsTabContent
            v-else-if="activeTab.type === 'settings'"
          />
          <WorkspaceContent
            v-else-if="activeTab.type === 'workspace'"
            :tab="activeTab"
          />
          <SFTPTabContent
            v-else-if="activeTab.type === 'sftp'"
            :key="activeTab.id"
            :panel-id="activeTab.panelId"
          />
        </template>
      </div>
      <AISidebar />
    </div>
    <ConnectionForm v-model="showConnectionForm" @save="onSaveOnly" @connect="onConnect" />

    <!-- Input context menu -->
    <div
      v-show="inputMenuVisible"
      class="input-context-menu"
      :style="{ left: inputMenuPos.x + 'px', top: inputMenuPos.y + 'px' }"
      @click.stop
    >
      <div class="input-menu-item" @click="inputMenuCut">{{ t('input.cut') }}</div>
      <div class="input-menu-item" @click="inputMenuCopy">{{ t('input.copy') }}</div>
      <div class="input-menu-item" @click="inputMenuPaste">{{ t('input.paste') }}</div>
      <div class="input-menu-item" @click="inputMenuSelectAll">{{ t('input.selectAll') }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import AppHeader from './components/AppHeader.vue'
import Sidebar from './components/Sidebar.vue'
import TabBar from './components/TabBar.vue'
import TerminalTabContent from './components/TerminalTabContent.vue'
import SettingsTabContent from './components/SettingsTabContent.vue'
import WorkspaceContent from './components/WorkspaceContent.vue'
import SFTPTabContent from './components/SFTPTabContent.vue'
import ConnectionForm from './components/ConnectionForm.vue'
import AISidebar from './components/AISidebar.vue'
import { useConnectionStore } from './stores/connectionStore'
import { useTabStore } from './stores/tabStore'
import { usePanelStore } from './stores/panelStore'
import { useSessionStore } from './stores/sessionStore'
import { useAIStore } from './stores/aiStore'
import { useSettingsStore } from './stores/settingsStore'
import { useI18n } from './i18n'
import { CreateSession } from '../wailsjs/go/main/App'
import type { ConnectionConfig } from './types/session'

const connectionStore = useConnectionStore()
const tabStore = useTabStore()
const activeTab = computed(() => tabStore.activeTab)
const panelStore = usePanelStore()
const sessionStore = useSessionStore()
const aiStore = useAIStore()
const settingsStore = useSettingsStore()
const { t } = useI18n()
const showConnectionForm = ref(false)
const sidebarVisible = ref(true)

// Input context menu state
const inputMenuVisible = ref(false)
const inputMenuPos = ref({ x: 0, y: 0 })
let inputMenuTarget: HTMLInputElement | HTMLTextAreaElement | null = null

function closeInputMenu() {
  inputMenuVisible.value = false
  inputMenuTarget = null
}

function onInputContextMenu(e: Event) {
  const { x, y, target } = (e as CustomEvent).detail as {
    x: number; y: number; target: HTMLInputElement | HTMLTextAreaElement
  }
  window.dispatchEvent(new CustomEvent('global:close-context-menus'))
  inputMenuTarget = target
  const pos = fitMenuPosition(x, y, 120, 140)
  inputMenuPos.value = { x: parseInt(pos.left), y: parseInt(pos.top) }
  inputMenuVisible.value = true
}

function fitMenuPosition(x: number, y: number, menuW: number, menuH: number) {
  let left = x
  let top = y
  if (x + menuW > window.innerWidth) left = x - menuW
  if (y + menuH > window.innerHeight) top = y - menuH
  return { left: left + 'px', top: top + 'px' }
}

function inputMenuCut() {
  if (inputMenuTarget) {
    navigator.clipboard.writeText(getInputSelection(inputMenuTarget))
    setInputSelection(inputMenuTarget, '')
    inputMenuTarget.dispatchEvent(new Event('input', { bubbles: true }))
  }
  closeInputMenu()
}

function inputMenuCopy() {
  if (inputMenuTarget) {
    navigator.clipboard.writeText(getInputSelection(inputMenuTarget))
  }
  closeInputMenu()
}

function inputMenuPaste() {
  if (inputMenuTarget) {
    navigator.clipboard.readText().then(text => {
      setInputSelection(inputMenuTarget, text)
      inputMenuTarget?.dispatchEvent(new Event('input', { bubbles: true }))
    }).catch(() => {})
  }
  closeInputMenu()
}

function inputMenuSelectAll() {
  inputMenuTarget?.select()
  closeInputMenu()
}

function getInputSelection(el: HTMLInputElement | HTMLTextAreaElement): string {
  return el.value.substring(el.selectionStart ?? 0, el.selectionEnd ?? 0)
}

function setInputSelection(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const start = el.selectionStart ?? 0
  const end = el.selectionEnd ?? 0
  el.value = el.value.substring(0, start) + text + el.value.substring(end)
  const pos = start + text.length
  el.setSelectionRange(pos, pos)
  el.focus()
}

function onWheel(e: WheelEvent) {
  if (e.ctrlKey) {
    e.preventDefault()
  }
}

onMounted(() => {
  connectionStore.load()
  aiStore.initConfig()
  settingsStore.init()
  window.addEventListener('input:contextmenu', onInputContextMenu)
  window.addEventListener('global:close-context-menus', closeInputMenu)
  document.addEventListener('click', closeInputMenu)
  document.addEventListener('wheel', onWheel, { passive: false })
})

onUnmounted(() => {
  window.removeEventListener('input:contextmenu', onInputContextMenu)
  window.removeEventListener('global:close-context-menus', closeInputMenu)
  document.removeEventListener('click', closeInputMenu)
  document.removeEventListener('wheel', onWheel)
})

function openSettings() {
  // Check if settings tab already exists
  const existingTab = tabStore.tabs.find(t => t.type === 'settings')
  if (existingTab) {
    tabStore.setActiveTab(existingTab.id)
    return
  }

  const panel = panelStore.createPanel(null, 'settings')
  panel.title = t('settings.title')
  const tab = tabStore.createSettingsTab(t('settings.title'), panel.id)
  panelStore.movePanelToTab(panel.id, tab.id)
}

function closeTab(tabId: string) {
  const panelIds = tabStore.closeTab(tabId)
  panelIds.forEach(pid => panelStore.removePanel(pid))
}

function onSaveOnly(config: ConnectionConfig) {
  connectionStore.add(config)
}

async function onConnect(config: ConnectionConfig) {
  connectionStore.add(config)
  const panel = panelStore.createPanel(config, 'ssh')
  const displayTitle = config.name
    ? `${config.name} (${config.host})`
    : `${config.user}@${config.host}`
  panel.title = displayTitle
  const tab = tabStore.createTerminalTab(displayTitle, panel.id)
  panelStore.movePanelToTab(panel.id, tab.id)

  try {
    const info = await CreateSession(config.type, config)
    panelStore.bindSession(panel.id, info.id)
    sessionStore.initSession(info.id)
  } catch (e) {
    console.error('Failed to create session:', e)
    tabStore.closeTab(tab.id)
    panelStore.removePanel(panel.id)
  }
}

async function onConnectSftp(config: ConnectionConfig) {
  const panel = panelStore.createPanel(config, 'sftp')
  const displayTitle = config.name
    ? `${config.name} (SFTP)`
    : `${config.user}@${config.host} (SFTP)`
  panel.title = displayTitle
  const tab = tabStore.createSFPTab(displayTitle, panel.id)
  panelStore.movePanelToTab(panel.id, tab.id)

  try {
    const info = await CreateSession('sftp', config)
    panelStore.bindSession(panel.id, info.id)
  } catch (e) {
    console.error('Failed to create SFTP session:', e)
    tabStore.closeTab(tab.id)
    panelStore.removePanel(panel.id)
  }
}
</script>

<style scoped>
.app-container {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: var(--bg-base);
}

.main-content {
  display: flex;
  flex: 1;
  overflow: hidden;
  gap: 0;
}

.tab-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}

.input-context-menu {
  position: fixed;
  z-index: 9999;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  min-width: 120px;
  padding: 4px;
  backdrop-filter: blur(8px);
}

.input-menu-item {
  padding: 7px 14px;
  font-size: 12px;
  font-family: var(--font-ui);
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  border-radius: var(--radius-sm);
  transition: all 0.1s ease;
}

.input-menu-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
