<template>
  <div
    class="tab-item"
    :class="{ active: isActive, error: status === 'error' }"
    @click="$emit('activate')"
  >
    <span class="title">{{ title }}</span>
    <el-icon class="close-btn" @click.stop="$emit('close')"><Close /></el-icon>
  </div>
</template>

<script setup lang="ts">
import { Close } from '@element-plus/icons-vue'
import type { SessionStatus } from '../types/session'

defineProps<{
  title: string
  isActive: boolean
  status: SessionStatus
}>()

defineEmits(['activate', 'close'])
</script>

<style scoped>
.tab-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  height: 32px;
  font-size: 12px;
  background: #2d2d2d;
  border-right: 1px solid #1e1e1e;
  cursor: pointer;
  user-select: none;
  min-width: 120px;
  max-width: 200px;
}

.tab-item:hover {
  background: #3c3c3c;
}

.tab-item.active {
  background: #1e1e1e;
  border-top: 2px solid #007acc;
}

.tab-item.error {
  color: #f14c4c;
}

.title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.close-btn {
  font-size: 10px;
  opacity: 0.6;
}

.close-btn:hover {
  opacity: 1;
  color: #fff;
}
</style>
