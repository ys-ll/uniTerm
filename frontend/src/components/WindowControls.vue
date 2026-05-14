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
        <svg v-if="isMaximised" viewBox="0 0 12 12" width="10" height="10">
          <defs>
            <mask :id="restoreMaskId">
              <rect width="12" height="12" fill="white"/>
              <rect x="1" y="3.5" width="6.5" height="6.5" fill="black"/>
            </mask>
          </defs>
          <!-- 后方大矩形（右上），被前方遮挡重叠区域 -->
          <rect x="3.5" y="1" width="6.5" height="6.5" fill="none" stroke="currentColor" stroke-width="1" :mask="`url(#${restoreMaskId})`"/>
          <!-- 前方小矩形（左下），完整显示 -->
          <rect x="1" y="3.5" width="6.5" height="6.5" fill="none" stroke="currentColor" stroke-width="1"/>
        </svg>
        <svg v-else viewBox="0 0 12 12" width="10" height="10"><rect x="1.5" y="1.5" width="9" height="9" fill="none" stroke="currentColor" stroke-width="1"/></svg>
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

const restoreMaskId = `rm-${Math.random().toString(36).slice(2, 9)}`
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
