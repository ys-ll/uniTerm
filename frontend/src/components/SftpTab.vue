<template>
  <div class="sftp-tab">
    <el-empty description="SFTP file browser coming soon">
      <template #description>
        <p>Connected to session: {{ tab.sessionId }}</p>
      </template>
    </el-empty>
  </div>
</template>

<script setup lang="ts">
import type { Tab } from '../types/session'

defineProps<{
  tab: Tab
}>()
</script>

<style scoped>
.sftp-tab {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
