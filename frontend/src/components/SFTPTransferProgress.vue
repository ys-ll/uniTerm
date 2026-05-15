<template>
  <div v-if="tasks.length > 0" class="transfer-progress-bar">
    <div v-for="task in tasks" :key="task.id" class="transfer-task">
      <span class="task-name">{{ task.type === 'upload' ? '↑' : '↓' }} {{ task.name }}</span>
      <el-progress
        :percentage="task.percentage"
        :status="task.status === 'error' ? 'exception' : undefined"
        :stroke-width="4"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface TransferTaskUI {
  id: string
  type: 'upload' | 'download'
  name: string
  percentage: number
  status: 'running' | 'done' | 'error'
}

defineProps<{
  tasks: TransferTaskUI[]
}>()
</script>

<style scoped>
.transfer-progress-bar {
  padding: 4px 12px;
  background: var(--bg-elevated);
  border-top: 1px solid var(--border-subtle);
}
.transfer-task {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}
.task-name {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  min-width: 120px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
