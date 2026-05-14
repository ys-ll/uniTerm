# Custom Titlebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the native OS titlebar with a fully custom titlebar, unifying the visual identity across platforms while respecting platform-native control button conventions.

**Architecture:** Frameless Wails window (`Frameless: true`). `AppHeader.vue` hosts platform-aware `WindowControls.vue`. Draggable region via Wails CSS property. Window state managed through Wails frontend runtime APIs.

**Tech Stack:** Vue 3 + Wails v2 runtime, no new dependencies.

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `main.go` | Modify | Add `Frameless: true` to window options |
| `frontend/src/components/AppHeader.vue` | Modify | Integrate WindowControls, handle window events, platform detection |
| `frontend/src/components/WindowControls.vue` | Create | Platform-specific minimise/maximise/close buttons |

---

### Task 1: Enable Frameless Window (Go)

**Files:**
- Modify: `main.go`

Add `Frameless: true` to the Wails app options.

- [ ] **Step 1: Add Frameless option**

```go
err := wails.Run(&options.App{
    Title:  "uniTerm",
    Width:  1200,
    Height: 800,
    Frameless: true,   // ← ADD THIS LINE
    AssetServer: &assetserver.Options{
        Assets: assets,
    },
    BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
    OnStartup:        app.startup,
    OnShutdown:       app.shutdown,
    Bind: []interface{}{
        app,
    },
})
```

---

### Task 2: Create WindowControls.vue

**Files:**
- Create: `frontend/src/components/WindowControls.vue`

Platform-specific window control buttons. macOS gets traffic-light circles on the left; Windows/Linux get square buttons on the right.

- [ ] **Step 1: Implement WindowControls component**

```vue
<template>
  <div class="window-controls" :class="platform">
    <!-- macOS: traffic-light circles on the left -->
    <template v-if="platform === 'darwin'">
      <button class="wc-btn mac close" @click="$emit('close')" aria-label="关闭">
        <svg viewBox="0 0 12 12" width="8" height="8"><path d="M6.5 6l2.7 2.7-.7.7L5.8 6.7 3.1 9.4l-.7-.7L5.1 6 2.4 3.3l.7-.7L5.8 5.3 8.5 2.6l.7.7L6.5 6z"/></svg>
      </button>
      <button class="wc-btn mac minimise" @click="$emit('minimise')" aria-label="最小化">
        <svg viewBox="0 0 12 12" width="8" height="8"><path d="M2 5.5h8v1H2z"/></svg>
      </button>
      <button class="wc-btn mac maximise" @click="$emit('maximise')" aria-label="最大化">
        <svg v-if="isMaximised" viewBox="0 0 12 12" width="8" height="8"><path d="M3 5h6v4H3V5zm1-3h5v2H4V2z"/></svg>
        <svg v-else viewBox="0 0 12 12" width="8" height="8"><path d="M3 2h6v8H3V2zm1 1v6h4V3H4z"/></svg>
      </button>
    </template>

    <!-- Windows / Linux: square buttons on the right -->
    <template v-else>
      <button class="wc-btn win minimise" @click="$emit('minimise')" aria-label="最小化">
        <svg viewBox="0 0 12 12" width="10" height="10"><path d="M1 5.5h10v1H1z"/></svg>
      </button>
      <button class="wc-btn win maximise" @click="$emit('maximise')" aria-label="最大化">
        <svg v-if="isMaximised" viewBox="0 0 12 12" width="10" height="10"><path d="M3 3h6v6H3V3zm1 1v4h4V4H4z"/></svg>
        <svg v-else viewBox="0 0 12 12" width="10" height="10"><path d="M2 2h8v8H2V2zm1 1v6h6V3H3z"/></svg>
      </button>
      <button class="wc-btn win close" @click="$emit('close')" aria-label="关闭">
        <svg viewBox="0 0 12 12" width="10" height="10"><path d="M2 2l8 8M10 2L2 10" stroke="currentColor" stroke-width="1.2"/></svg>
      </button>
    </template>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  platform: 'windows' | 'darwin' | 'linux'
  isMaximised: boolean
}>()

defineEmits(['minimise', 'maximise', 'close'])
</script>

<style scoped>
.window-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  --wails-draggable: no-drag;
}

.window-controls.darwin {
  gap: 8px;
}

.window-controls.windows,
.window-controls.linux {
  gap: 0;
}

/* macOS traffic light buttons */
.wc-btn.mac {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: transform 0.1s ease;
  opacity: 0.9;
}

.wc-btn.mac:hover {
  opacity: 1;
  transform: scale(1.15);
}

.wc-btn.mac:active {
  transform: scale(0.95);
}

.wc-btn.mac.close {
  background: #ff5f56;
}

.wc-btn.mac.minimise {
  background: #ffbd2e;
}

.wc-btn.mac.maximise {
  background: #27c93f;
}

.wc-btn.mac svg {
  opacity: 0;
  transition: opacity 0.15s ease;
  fill: currentColor;
}

.window-controls:hover .wc-btn.mac svg {
  opacity: 1;
}

/* Windows/Linux buttons */
.wc-btn.win {
  width: 46px;
  height: 32px;
  border: none;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: transparent;
  color: var(--text-secondary);
  transition: background 0.1s ease, color 0.1s ease;
}

.wc-btn.win:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.wc-btn.win.close:hover {
  background: #e81123;
  color: #fff;
}

.wc-btn.win.close:active {
  background: #f1707a;
}

.wc-btn.win svg {
  fill: currentColor;
}
</style>
```

---

### Task 3: Rewrite AppHeader.vue

**Files:**
- Modify: `frontend/src/components/AppHeader.vue`

Integrate `WindowControls`, detect platform, track maximise state, make header draggable, add double-click to maximise on Win/Linux.

- [ ] **Step 1: Rewrite AppHeader.vue**

```vue
<template>
  <div
    class="app-header"
    @dblclick="onDblClick"
  >
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

    <div class="header-title">
      <span class="brand">uniTerm</span>
    </div>

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
  display: flex;
  align-items: center;
  justify-content: space-between;
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

.left-actions,
.right-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  --wails-draggable: no-drag;
}

.header-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  pointer-events: none;
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
```

---

## Verification

1. **Build check:** Run `cd frontend && npx vite build` — should compile without errors.
2. **Wails dev:** Run `cd frontend && rm -rf dist node_modules/.vite && cd .. && wails dev` — app starts without native titlebar.
3. **UI tests:**
   - Header bar is visible with all action buttons
   - macOS: traffic-light buttons on the left (red/yellow/green circles)
   - Windows/Linux: square buttons on the right
   - Click minimise → window minimises to taskbar/dock
   - Click maximise → window fills screen, icon changes to restore
   - Click restore → window returns to previous size
   - Click close → app exits
   - Drag empty area of header → window moves
   - Double-click header (Win/Linux) → toggles maximise
   - Buttons are not draggable (clicking them triggers action, not drag)
4. **Platform check:** Verify correct layout on the target platform.
