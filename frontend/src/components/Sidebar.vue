<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <span>Connections</span>
      <el-button link size="small" @click="showForm = true">
        <el-icon><Plus /></el-icon>
      </el-button>
    </div>
    <div class="connection-list">
      <div
        v-for="conn in connectionStore.connections"
        :key="conn.id"
        class="connection-item"
        @click="$emit('connect', conn)"
      >
        <el-icon><Connection /></el-icon>
        <span class="name">{{ conn.name }}</span>
        <span class="host">{{ conn.host }}:{{ conn.port }}</span>
      </div>
    </div>

    <ConnectionForm v-model="showForm" @save="onSave" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Plus, Connection } from '@element-plus/icons-vue'
import { useConnectionStore } from '../stores/connectionStore'
import ConnectionForm from './ConnectionForm.vue'
import type { ConnectionConfig } from '../types/session'

const connectionStore = useConnectionStore()
const showForm = ref(false)

defineEmits(['connect'])

function onSave(config: ConnectionConfig) {
  connectionStore.add(config)
  showForm.value = false
}
</script>

<style scoped>
.sidebar {
  width: 240px;
  background: #252526;
  border-right: 1px solid #3d3d3d;
  display: flex;
  flex-direction: column;
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 11px;
  text-transform: uppercase;
  color: #bbbbbb;
  border-bottom: 1px solid #3d3d3d;
}

.connection-list {
  flex: 1;
  overflow-y: auto;
}

.connection-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  font-size: 13px;
}

.connection-item:hover {
  background: #2a2d2e;
}

.name {
  flex: 1;
  color: #e0e0e0;
}

.host {
  color: #858585;
  font-size: 11px;
}
</style>
