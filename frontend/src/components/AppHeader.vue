<template>
  <div class="app-header">
    <div class="logo">uniTerm</div>
    <div class="actions">
      <el-button size="small" @click="$emit('new-connection')">
        <el-icon><Plus /></el-icon> New Connection
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Plus } from '@element-plus/icons-vue'

defineEmits(['new-connection'])
</script>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 40px;
  padding: 0 16px;
  background: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
}

.logo {
  font-size: 14px;
  font-weight: 600;
  color: #e0e0e0;
}

.actions {
  display: flex;
  gap: 8px;
}
</style>
