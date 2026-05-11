<template>
  <div class="ai-message" :class="message.role">
    <div class="avatar">{{ avatar }}</div>
    <div class="content">
      <div class="text" v-html="renderedContent" />

      <!-- Tool call pairs: IN + OUT grouped together -->
      <div v-if="message.tool_calls?.length" class="tool-pairs">
        <div v-for="tc in message.tool_calls" :key="tc.id" class="tool-pair">
          <!-- IN box -->
          <div class="tool-box in-box">
            <div class="tool-box-header" @click="inExpanded = !inExpanded">
              <span class="tool-box-label">{{ t('ai.in') }}</span>
              <span class="tool-box-count"></span>
              <span class="toggle-icon">{{ inExpanded ? '▼' : '▶' }}</span>
            </div>
            <div v-show="inExpanded" class="tool-box-body">
              <pre class="tool-call-args">{{ formatArgs(tc.function.arguments) }}</pre>
            </div>
          </div>

          <!-- OUT box -->
          <div v-if="getToolResult(tc.id)" class="tool-box out-box">
            <div class="tool-box-header" @click="outExpanded = !outExpanded">
              <span class="tool-box-label">{{ t('ai.out') }}</span>
              <span class="tool-box-count"></span>
              <span class="toggle-icon">{{ outExpanded ? '▼' : '▶' }}</span>
            </div>
            <div v-show="outExpanded" class="tool-box-body">
              <pre class="tool-output">{{ getToolResult(tc.id)?.content }}</pre>
            </div>
          </div>
        </div>
      </div>

      <div v-if="message.pendingTools?.length" class="pending-tools">
        <div v-for="(pt, idx) in message.pendingTools" :key="pt.id" class="pending-tool" :class="{ dangerous: pt.dangerous }">
          <div class="tool-name">
            {{ pt.name }}
            <span class="pending-count">({{ idx + 1 }}/{{ message.pendingTools.length }})</span>
            <span v-if="pt.dangerous" class="danger-badge">{{ t('ai.dangerous') }}</span>
          </div>
          <code class="tool-args">{{ formatPendingArgs(pt.arguments) }}</code>
          <div class="tool-actions">
            <el-button size="small" type="primary" @click="$emit('approve', message.id)">{{ t('ai.run') }}</el-button>
            <el-button size="small" @click="$emit('reject', message.id)">{{ t('ai.skip') }}</el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAIStore } from '../stores/aiStore'
import { useI18n } from '../i18n'
import type { AIMessage } from '../types/ai'

const props = defineProps<{ message: AIMessage }>()
defineEmits(['approve', 'reject'])

const aiStore = useAIStore()
const { t } = useI18n()
const inExpanded = ref(false)
const outExpanded = ref(false)

const avatar = computed(() => {
  if (props.message.role === 'user') return t('ai.avatarUser')
  if (props.message.role === 'tool') return t('ai.avatarTool')
  return t('ai.avatarAI')
})

function formatArgs(args: string): string {
  try {
    const parsed = JSON.parse(args)
    if (parsed.command) return parsed.command
    return JSON.stringify(parsed, null, 2)
  } catch {
    return args
  }
}

function formatPendingArgs(args: Record<string, unknown>): string {
  if (args.command) return String(args.command)
  return JSON.stringify(args, null, 2)
}

function getToolResult(toolCallId: string): AIMessage | undefined {
  return aiStore.messages.find(
    m => m.role === 'tool' && m.tool_call_id === toolCallId && !m.id.startsWith('dbg-')
  )
}

function renderMarkdown(text: string): string {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Headings
  html = html.replace(/^###### (.*$)/gim, '<h6>$1</h6>')
  html = html.replace(/^##### (.*$)/gim, '<h5>$1</h5>')
  html = html.replace(/^#### (.*$)/gim, '<h4>$1</h4>')
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')

  // Code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')

  const ulBlocks = html.match(/(?:^- .*\n?)+/gm)
  if (ulBlocks) {
    for (const block of ulBlocks) {
      const items = block.replace(/^- (.*)$/gm, '<li>$1</li>')
      html = html.replace(block, '<ul>' + items + '</ul>')
    }
  }

  const olBlocks = html.match(/(?:^\d+\. .*\n?)+/gm)
  if (olBlocks) {
    for (const block of olBlocks) {
      const items = block.replace(/^\d+\. (.*)$/gm, '<li>$1</li>')
      html = html.replace(block, '<ol>' + items + '</ol>')
    }
  }

  // Tables
  const tableBlocks = html.match(/(?:^\|.*\|.*\n?)+/gm)
  if (tableBlocks) {
    for (const block of tableBlocks) {
      const lines = block.trim().split('\n').filter(line => line.trim())
      if (lines.length < 2) continue
      // Skip separator line (contains only |, -, :, spaces)
      const dataLines = lines.filter((line, idx) => idx !== 1 || !/^\s*[|:\-|\s]+\|\s*$/.test(line))
      let tableHtml = '<table>'
      dataLines.forEach((line, rowIdx) => {
        const cells = line.split('|').map(c => c.trim()).filter(c => c)
        const tag = rowIdx === 0 ? 'th' : 'td'
        tableHtml += '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>'
      })
      tableHtml += '</table>'
      html = html.replace(block, tableHtml)
    }
  }

  html = html.replace(/^---+$/gm, '<hr>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Convert remaining newlines to <br>, but remove <br> after block-level elements
  // to avoid double spacing (block elements already have margins)
  html = html.replace(/\n/g, '<br>')
  html = html.replace(/(<\/(h[1-6]|pre|table|ul|ol|hr|li|div|p)>|<hr\/?>)\s*<br>/gi, '$1')
  html = html.replace(/<br>\s*(<(h[1-6]|pre|table|ul|ol|hr|div|p)>)/gi, '$1')
  // Collapse multiple consecutive <br> into one
  html = html.replace(/(<br>\s*)+/g, '<br>')

  return html
}

const renderedContent = computed(() => {
  // User and debug messages: plain text, no markdown
  if (props.message.role === 'user' || props.message.id?.startsWith('dbg-')) {
    return escapeHtml(props.message.content)
  }
  return renderMarkdown(props.message.content)
})

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
}
</script>

<style scoped>
.ai-message {
  display: flex;
  gap: 10px;
  padding: 10px 14px;
}
.ai-message.user .content {
  display: flex;
  flex-direction: column;
}
.ai-message.user .text {
  background: var(--bg-surface);
  padding: 8px 12px;
  border-radius: var(--radius-md);
  box-shadow: inset 0 0 0 1px var(--border-subtle);
}
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--accent-dim), var(--accent));
  color: #fff;
  font-size: 9px;
  font-family: var(--font-ui);
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  letter-spacing: 0.5px;
}
.ai-message.user .avatar {
  background: var(--bg-active);
  color: var(--text-secondary);
}
.ai-message.tool .avatar {
  background: linear-gradient(135deg, var(--success-dim), var(--success));
}
.content {
  flex: 1;
  min-width: 0;
}
.text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-ui);
}
.text :deep(pre) {
  background: var(--bg-base);
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  overflow-x: auto;
  margin: 6px 0;
  border: 1px solid var(--border-subtle);
}
.text :deep(code) {
  background: var(--bg-base);
  padding: 2px 5px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--accent);
}

/* Headings */
.text :deep(h1) { font-size: 16px; margin: 8px 0 4px; }
.text :deep(h2) { font-size: 15px; margin: 8px 0 4px; }
.text :deep(h3) { font-size: 14px; margin: 6px 0 4px; }
.text :deep(h4) { font-size: 13px; margin: 6px 0 4px; }
.text :deep(h5) { font-size: 12px; margin: 4px 0 2px; }
.text :deep(h6) { font-size: 12px; margin: 4px 0 2px; color: var(--text-muted); }

/* Lists */
.text :deep(ul),
.text :deep(ol) {
  padding-left: 0;
  margin: 4px 0;
  list-style-position: inside;
}
.text :deep(li) {
  margin: 2px 0;
}

/* Tables */
.text :deep(table) {
  border-collapse: collapse;
  margin: 4px 0;
  font-size: 12px;
}
.text :deep(th),
.text :deep(td) {
  border: 1px solid var(--border-hover);
  padding: 4px 8px;
  text-align: left;
}
.text :deep(th) {
  background: var(--bg-overlay);
  font-weight: bold;
}

/* Tool boxes */
.tool-box {
  margin-top: 6px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  font-size: 12px;
}
.tool-box-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 8px;
  cursor: pointer;
  user-select: none;
}
.tool-box-label {
  font-weight: bold;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  text-transform: uppercase;
}
.tool-box-count {
  flex: 1;
  color: var(--text-muted);
}
.toggle-icon {
  color: var(--text-muted);
  font-size: 10px;
}
.tool-box-body {
  padding: 6px 8px;
}

/* IN box - success themed */
.in-box {
  background: rgba(52, 211, 153, 0.04);
  border: 1px solid rgba(52, 211, 153, 0.15);
}
.in-box .tool-box-header {
  background: rgba(52, 211, 153, 0.08);
}
.in-box .tool-box-label {
  background: var(--success);
  color: var(--bg-base);
}
.tool-call-item {
  margin-bottom: 6px;
}
.tool-call-item:last-child {
  margin-bottom: 0;
}
.tool-call-name {
  font-weight: bold;
  color: var(--success);
  margin-bottom: 2px;
}
.tool-call-args {
  margin: 0;
  padding: 4px 6px;
  background: var(--bg-base);
  border-radius: 3px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
}

/* OUT box - accent themed */
.out-box {
  background: var(--accent-subtle);
  border: 1px solid var(--accent-glow);
}
.out-box .tool-box-header {
  background: var(--accent-subtle);
}
.out-box .tool-box-label {
  background: var(--accent-dim);
  color: #fff;
}
.tool-pairs {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.tool-pair {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.tool-output {
  margin: 0;
  padding: 4px 6px;
  background: var(--bg-base);
  border-radius: 3px;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 300px;
  overflow-y: auto;
}

/* Pending tools */
.pending-tools {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}
.pending-tool.dangerous {
  border-color: var(--error);
  background: rgba(248, 113, 113, 0.04);
}
.danger-badge {
  margin-left: 8px;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--error);
  color: #fff;
  text-transform: uppercase;
}
.pending-tool {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-hover);
  border-radius: var(--radius-sm);
}
.tool-name {
  font-size: 11px;
  color: var(--text-muted);
  text-transform: uppercase;
}
.pending-count {
  color: var(--text-secondary);
  font-weight: 500;
}
.tool-args {
  display: block;
  margin: 4px 0;
  font-size: 12px;
  color: var(--text-primary);
  white-space: pre-wrap;
}
.tool-actions {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
</style>
