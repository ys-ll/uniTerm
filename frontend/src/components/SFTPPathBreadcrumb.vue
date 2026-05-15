<template>
  <div class="sftp-breadcrumb">
    <span
      v-for="(part, index) in pathParts"
      :key="index"
      class="breadcrumb-part"
      @click="onClick(index)"
    >
      {{ part }}
      <span v-if="index < pathParts.length - 1" class="separator">/</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  path: string
}>()

const emit = defineEmits<{
  navigate: [path: string]
}>()

const pathParts = computed(() => {
  const clean = props.path.replace(/\\/g, '/')
  if (!clean || clean === '/') return ['/']
  const parts = clean.split('/').filter(Boolean)
  return ['/', ...parts]
})

function onClick(index: number) {
  const parts = pathParts.value.slice(0, index + 1)
  let target = parts.join('/').replace(/\/+/g, '/')
  if (!target.startsWith('/')) target = '/' + target
  emit('navigate', target)
}
</script>

<style scoped>
.sftp-breadcrumb {
  display: flex;
  align-items: center;
  padding: 6px 12px;
  font-size: 12px;
  font-family: var(--font-mono);
  color: var(--text-secondary);
  background: var(--bg-elevated);
  border-bottom: 1px solid var(--border-subtle);
  overflow-x: auto;
  white-space: nowrap;
}
.breadcrumb-part {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: var(--radius-sm);
  transition: all 0.1s ease;
}
.breadcrumb-part:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.separator {
  color: var(--text-disabled);
  margin: 0 2px;
}
</style>
