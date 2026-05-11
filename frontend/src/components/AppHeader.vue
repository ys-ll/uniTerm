<template>
  <div class="app-header">
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
  </div>
</template>

<script setup lang="ts">
import { Plus, ChatDotRound, Connection, Setting } from '@element-plus/icons-vue'
import { useI18n } from '../i18n'

const { t } = useI18n()
defineEmits(['new-connection', 'toggle-ai', 'toggle-sidebar', 'open-settings'])
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
}

.header-title {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
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
</style>
