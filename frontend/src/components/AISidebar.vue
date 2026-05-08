<template>
  <div class="ai-sidebar" :class="{ collapsed: !aiStore.visible }">
    <div class="ai-header">
      <span>AI Assistant</span>
      <div class="ai-actions">
        <el-button link size="small" @click="showSettings = true">
          <el-icon><Setting /></el-icon>
        </el-button>
        <el-button link size="small" @click="aiStore.toggle">
          <el-icon><Close /></el-icon>
        </el-button>
      </div>
    </div>

    <div class="ai-mode-toggle">
      <el-segmented v-model="aiStore.mode" :options="[
        { label: 'Auto', value: 'autonomous' },
        { label: 'Confirm', value: 'confirm' }
      ]" size="small" />
      <el-checkbox v-model="aiStore.debug" size="small">Debug</el-checkbox>
    </div>

    <div ref="messagesRef" class="ai-messages">
      <AIMessage
        v-for="msg in aiStore.messages"
        :key="msg.id"
        :message="msg"
        @approve="onApprove"
        @reject="onReject"
      />
      <div v-if="aiStore.isRunning" class="ai-thinking">Thinking...</div>
    </div>

    <div class="ai-input">
      <el-input
        v-model="input"
        type="textarea"
        :rows="2"
        placeholder="Ask the AI to do something..."
        @keydown.enter.prevent="onSend"
      />
      <el-button type="primary" :disabled="!input.trim() || aiStore.isRunning" @click="onSend">
        Send
      </el-button>
    </div>

    <!-- Settings drawer -->
    <el-dialog v-model="showSettings" title="AI Settings" width="400px">
      <el-form label-width="100px">
        <el-form-item label="API Key">
          <el-input v-model="aiStore.config.apiKey" type="password" show-password />
        </el-form-item>
        <el-form-item label="Base URL">
          <el-input v-model="aiStore.config.baseURL" />
        </el-form-item>
        <el-form-item label="Model">
          <el-input v-model="aiStore.config.model" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showSettings = false">Close</el-button>
        <el-button type="primary" @click="saveSettings">Save</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { Setting, Close } from '@element-plus/icons-vue'
import { useAIStore } from '../stores/aiStore'
import { runAgent, approveTool, rejectTool } from '../services/agent'
import AIMessage from './AIMessage.vue'

const aiStore = useAIStore()
const input = ref('')
const messagesRef = ref<HTMLDivElement>()
const showSettings = ref(false)

function scrollToBottom() {
  nextTick(() => {
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  })
}

async function onSend() {
  const text = input.value.trim()
  if (!text || aiStore.isRunning) return
  input.value = ''
  scrollToBottom()
  await runAgent(text)
  scrollToBottom()
}

async function onApprove(messageId: string) {
  await approveTool(messageId)
  scrollToBottom()
}

function onReject(messageId: string) {
  rejectTool(messageId)
  scrollToBottom()
}

function saveSettings() {
  aiStore.saveConfig()
  showSettings.value = false
}
</script>

<style scoped>
.ai-sidebar {
  width: 360px;
  background: #252526;
  border-left: 1px solid #3d3d3d;
  display: flex;
  flex-direction: column;
  transition: width 0.2s;
}
.ai-sidebar.collapsed {
  width: 0;
  overflow: hidden;
}
.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 13px;
  color: #e0e0e0;
  border-bottom: 1px solid #3d3d3d;
}
.ai-actions {
  display: flex;
  gap: 4px;
}
.ai-mode-toggle {
  padding: 8px 12px;
  border-bottom: 1px solid #3d3d3d;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 8px 0;
}
.ai-thinking {
  padding: 8px 12px;
  font-size: 12px;
  color: #858585;
  font-style: italic;
}
.ai-input {
  padding: 8px 12px;
  border-top: 1px solid #3d3d3d;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>