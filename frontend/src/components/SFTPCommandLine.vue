<template>
  <div class="sftp-command-line">
    <div ref="terminalRef" class="terminal-container" />
  </div>
</template>

<script setup lang="ts">
import { useSFTPCommandLine } from '../composables/useSFTPCommandLine'

const props = defineProps<{
  sessionId: string | null
}>()

const { terminalRef } = useSFTPCommandLine(() => props.sessionId)
</script>

<style scoped>
.sftp-command-line {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--bg-base);
}
.terminal-container {
  flex: 1;
  padding: 4px;
}
</style>
