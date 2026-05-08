<template>
  <div class="ai-message" :class="message.role">
    <div class="avatar">{{ avatar }}</div>
    <div class="content">
      <div class="text" v-html="renderedContent" />
      <div v-if="message.pendingTool" class="pending-tool">
        <div class="tool-name">{{ message.pendingTool.name }}</div>
        <code class="tool-args">{{ JSON.stringify(message.pendingTool.arguments, null, 2) }}</code>
        <div class="tool-actions">
          <el-button size="small" type="primary" @click="$emit('approve', message.id)">Run</el-button>
          <el-button size="small" @click="$emit('reject', message.id)">Skip</el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { AIMessage } from '../types/ai'

const props = defineProps<{ message: AIMessage }>()
defineEmits(['approve', 'reject'])

const avatar = computed(() => {
  if (props.message.role === 'user') return 'You'
  if (props.message.role === 'tool') return 'Tool'
  return 'AI'
})

const renderedContent = computed(() => {
  let text = props.message.content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
  text = text.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>')
  return text
})
</script>

<style scoped>
.ai-message {
  display: flex;
  gap: 8px;
  padding: 8px 12px;
}
.ai-message.user {
  flex-direction: row-reverse;
}
.avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #007acc;
  color: #fff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.ai-message.user .avatar {
  background: #4a4a4a;
}
.content {
  flex: 1;
  min-width: 0;
}
.text {
  font-size: 13px;
  line-height: 1.5;
  color: #e0e0e0;
  white-space: pre-wrap;
  word-break: break-word;
}
.text :deep(pre) {
  background: #1e1e1e;
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 4px 0;
}
.text :deep(code) {
  background: #1e1e1e;
  padding: 2px 4px;
  border-radius: 3px;
  font-family: Consolas, monospace;
  font-size: 12px;
}
.pending-tool {
  margin-top: 8px;
  padding: 8px;
  background: #2d2d2d;
  border: 1px solid #3d3d3d;
  border-radius: 4px;
}
.tool-name {
  font-size: 11px;
  color: #858585;
  text-transform: uppercase;
}
.tool-args {
  display: block;
  margin: 4px 0;
  font-size: 12px;
  color: #e0e0e0;
  white-space: pre-wrap;
}
.tool-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
