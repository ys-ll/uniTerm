<template>
  <div
    class="app-header"
    @dblclick="onDblClick"
  >
    <div class="header-left">
      <!-- macOS controls on the left -->
      <WindowControls
        v-if="platform === 'darwin'"
        :platform="platform"
        :is-maximised="isMaximised"
        @minimise="onMinimise"
        @maximise="onMaximise"
        @close="onClose"
      />

      <div class="left-actions">
        <button class="header-btn" @click="$emit('toggle-sidebar')">
          <el-icon><Connection /></el-icon>
          <span>{{ t('header.connections') }}</span>
        </button>
        <button class="header-btn secondary" @click="$emit('new-connection')">
          <el-icon><Plus /></el-icon>
          <span>{{ t('header.newConnection') }}</span>
        </button>
      </div>
    </div>

    <div class="header-title">
      <span class="brand">uniTerm</span>
    </div>

    <div class="header-right">
      <div class="right-actions">
        <button class="header-btn secondary" @click="$emit('open-settings')">
          <el-icon><Setting /></el-icon>
          <span>{{ t('header.settings') }}</span>
        </button>
        <button class="header-btn accent" @click="$emit('toggle-ai')">
          <el-icon><ChatDotRound /></el-icon>
          <span>{{ t('header.ai') }}</span>
        </button>
      </div>

      <!-- Windows/Linux controls on the right -->
      <WindowControls
        v-if="platform !== 'darwin'"
        :platform="platform"
        :is-maximised="isMaximised"
        @minimise="onMinimise"
        @maximise="onMaximise"
        @close="onClose"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Plus, ChatDotRound, Connection, Setting } from '@element-plus/icons-vue'
import { useI18n } from '../i18n'
import WindowControls from './WindowControls.vue'
import {
  Environment,
  WindowMinimise,
  WindowToggleMaximise,
  WindowIsMaximised,
  Quit,
} from '../../wailsjs/runtime'

const { t } = useI18n()

defineEmits(['new-connection', 'toggle-ai', 'toggle-sidebar', 'open-settings'])

const platform = ref<'windows' | 'darwin' | 'linux'>('windows')
const isMaximised = ref(false)

async function updateMaximisedState() {
  try {
    isMaximised.value = await WindowIsMaximised()
  } catch {
    // ignore
  }
}

function onMinimise() {
  WindowMinimise()
}

async function onMaximise() {
  WindowToggleMaximise()
  // Give Wails a tick to update state, then query
  setTimeout(updateMaximisedState, 100)
}

function onClose() {
  Quit()
}

function onDblClick(e: MouseEvent) {
  // Double-click to maximise only on Windows/Linux, and only on non-button areas
  if (platform.value === 'darwin') return
  const target = e.target as HTMLElement
  if (target.closest('button') || target.closest('.window-controls')) return
  onMaximise()
}

function onWindowResize() {
  updateMaximisedState()
}

onMounted(async () => {
  try {
    const env = await Environment()
    const p = env.platform.toLowerCase()
    if (p === 'darwin') platform.value = 'darwin'
    else if (p === 'linux') platform.value = 'linux'
    else platform.value = 'windows'
  } catch {
    platform.value = 'windows'
  }
  updateMaximisedState()
  window.addEventListener('resize', onWindowResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onWindowResize)
})
</script>

<style scoped>
.app-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  height: 44px;
  padding: 0 12px;
  background: var(--bg-elevated);
  flex-shrink: 0;
  position: relative;
  z-index: 10;
  --wails-draggable: drag;
}

/* Subtle bottom glow instead of border */
.app-header::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--accent-subtle) 20%,
    var(--accent-glow) 50%,
    var(--accent-subtle) 80%,
    transparent 100%
  );
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}

.left-actions,
.right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  --wails-draggable: no-drag;
}

.header-title {
  pointer-events: none;
  padding: 0 16px;
}

.brand {
  font-family: var(--font-ui);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--text-primary);
  text-transform: uppercase;
}

.header-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  font-family: var(--font-ui);
  font-size: 12px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
  --wails-draggable: no-drag;
}

.header-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.header-btn.secondary {
  background: var(--bg-surface);
  box-shadow: inset 0 0 0 1px var(--border-subtle);
}

.header-btn.secondary:hover {
  background: var(--bg-hover);
  box-shadow: inset 0 0 0 1px var(--border-hover);
}

.header-btn.accent {
  background: linear-gradient(135deg, var(--accent-dim), var(--accent));
  color: #fff;
  box-shadow: 0 0 0 1px var(--accent-glow), 0 2px 8px var(--accent-glow);
}

.header-btn.accent:hover {
  background: linear-gradient(135deg, var(--accent), var(--accent-dim));
  box-shadow: 0 0 0 1px var(--accent-glow), 0 4px 16px var(--accent-glow);
  transform: translateY(-1px);
}

.header-btn .el-icon {
  font-size: 14px;
}

[data-theme="light"] .app-header::after {
  background: linear-gradient(
    90deg,
    transparent 0%,
    var(--accent-subtle) 20%,
    var(--accent-glow) 50%,
    var(--accent-subtle) 80%,
    transparent 100%
  );
}

/* Ensure WindowControls also has no-drag */
.app-header :deep(.window-controls) {
  --wails-draggable: no-drag;
}
</style>
