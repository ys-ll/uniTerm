<template>
  <div class="settings-tab" :key="settingsStore.settings.language">
    <div class="settings-sidebar">
      <div
        v-for="cat in categories"
        :key="cat.key"
        class="settings-category"
        :class="{ active: activeCategory === cat.key }"
        @click="activeCategory = cat.key"
      >
        <el-icon class="category-icon"><component :is="cat.icon" /></el-icon>
        <span class="category-label">{{ cat.label }}</span>
      </div>
    </div>

    <div class="settings-panel">
      <!-- 基础设置 -->
      <div v-if="activeCategory === 'basic'" class="settings-section">
        <h2 class="section-title">{{ t('settings.basic') }}</h2>

        <div class="settings-group">
          <div class="setting-card">
            <div class="setting-info">
              <div class="setting-title">{{ t('settings.theme') }}</div>
              <div class="setting-desc">{{ t('settings.themeDesc') }}</div>
            </div>
            <div class="setting-control">
              <el-select v-model="settingsStore.settings.theme" size="small" @change="settingsStore.save()">
                <el-option :label="t('settings.themeDark')" value="dark" />
                <el-option :label="t('settings.themeDeepBlue')" value="deep-blue" />
                <el-option :label="t('settings.themeLight')" value="light" />
                <el-option :label="t('settings.themeSystem')" value="system" />
              </el-select>
            </div>
          </div>

          <div class="setting-card">
            <div class="setting-info">
              <div class="setting-title">{{ t('settings.language') }}</div>
              <div class="setting-desc">{{ t('settings.languageDesc') }}</div>
            </div>
            <div class="setting-control">
              <el-select v-model="settingsStore.settings.language" size="small" @change="settingsStore.save()">
                <el-option :label="t('settings.langZhCN')" value="zh-CN" />
                <el-option :label="t('settings.langEn')" value="en" />
                <el-option :label="t('settings.langSystem')" value="system" />
              </el-select>
            </div>
          </div>
        </div>
      </div>

      <!-- 终端配置 -->
      <div v-if="activeCategory === 'terminal'" class="settings-section">
        <h2 class="section-title">{{ t('settings.terminal') }}</h2>

        <div class="settings-group">
          <div class="setting-card">
            <div class="setting-info">
              <div class="setting-title">{{ t('settings.colorScheme') }}</div>
              <div class="setting-desc">{{ t('settings.colorSchemeDesc') }}</div>
            </div>
            <div class="setting-control">
              <el-select v-model="settingsStore.settings.terminal.theme" size="small" @change="settingsStore.save()">
                <el-option
                  v-for="th in TERMINAL_THEMES"
                  :key="th.value"
                  :label="th.label"
                  :value="th.value"
                />
              </el-select>
            </div>
          </div>

          <div class="setting-card">
            <div class="setting-info">
              <div class="setting-title">{{ t('settings.font') }}</div>
              <div class="setting-desc">{{ t('settings.fontDesc') }}</div>
            </div>
            <div class="setting-control">
              <el-select v-model="settingsStore.settings.terminal.fontFamily" size="small" @change="settingsStore.save()">
                <el-option
                  v-for="f in FONT_OPTIONS"
                  :key="f.value"
                  :label="f.label"
                  :value="f.value"
                />
              </el-select>
            </div>
          </div>

          <div class="setting-card">
            <div class="setting-info">
              <div class="setting-title">{{ t('settings.fontSize') }}</div>
              <div class="setting-desc">{{ t('settings.fontSizeDesc') }}</div>
            </div>
            <div class="setting-control">
              <el-input-number
                v-model="settingsStore.settings.terminal.fontSize"
                :min="8"
                :max="32"
                size="small"
                @change="settingsStore.save()"
              />
            </div>
          </div>

          <div class="setting-card">
            <div class="setting-info">
              <div class="setting-title">{{ t('settings.selectionAction') }}</div>
              <div class="setting-desc">{{ t('settings.selectionActionDesc') }}</div>
            </div>
            <div class="setting-control">
              <el-select v-model="settingsStore.settings.terminal.selectionAction" size="small" @change="settingsStore.save()">
                <el-option :label="t('settings.selectionNone')" value="none" />
                <el-option :label="t('settings.selectionCopy')" value="copy" />
              </el-select>
            </div>
          </div>

          <div class="setting-card">
            <div class="setting-info">
              <div class="setting-title">{{ t('settings.rightClick') }}</div>
              <div class="setting-desc">{{ t('settings.rightClickDesc') }}</div>
            </div>
            <div class="setting-control">
              <el-select v-model="settingsStore.settings.terminal.rightClickAction" size="small" @change="settingsStore.save()">
                <el-option :label="t('settings.rightClickMenu')" value="menu" />
                <el-option :label="t('settings.rightClickPaste')" value="paste" />
              </el-select>
            </div>
          </div>

          <div class="setting-card">
            <div class="setting-info">
              <div class="setting-title">{{ t('settings.maxHistory') }}</div>
              <div class="setting-desc">{{ t('settings.maxHistoryDesc') }}</div>
            </div>
            <div class="setting-control">
              <el-input-number
                v-model="settingsStore.settings.terminal.maxHistoryLines"
                :min="100"
                :max="50000"
                :step="100"
                size="small"
                @change="settingsStore.save()"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- AI助理设置 -->
      <div v-if="activeCategory === 'ai'" class="settings-section">
        <h2 class="section-title">{{ t('settings.ai') }}</h2>

        <div class="settings-group">
          <div class="setting-card">
            <div class="setting-info">
              <div class="setting-title">{{ t('settings.modelList') }}</div>
              <div class="setting-desc">{{ t('settings.modelListDesc') }}</div>
            </div>
            <div class="setting-control">
              <el-button size="small" @click="showModelForm = true">+ {{ t('settings.addModel') }}</el-button>
            </div>
          </div>

          <div
            v-for="model in settingsStore.settings.ai.models"
            :key="model.id"
            class="model-card"
            :class="{ active: model.id === settingsStore.settings.ai.activeModelId }"
          >
            <div class="model-main">
              <el-radio
                :model-value="settingsStore.settings.ai.activeModelId"
                :label="model.id"
                @change="settingsStore.setActiveModel(model.id)"
              >
                <span class="model-name">{{ model.name }}</span>
              </el-radio>
              <span class="model-detail">{{ model.model }} @ {{ model.baseURL }}</span>
            </div>
            <div class="model-actions">
              <el-button link size="small" @click="editModel(model)">
                <el-icon><Edit /></el-icon>
              </el-button>
              <el-button link size="small" type="danger" @click="settingsStore.removeModel(model.id)">
                <el-icon><Delete /></el-icon>
              </el-button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Model Form Dialog -->
    <el-dialog v-model="showModelForm" :title="editingModel ? t('settings.editModel') : t('settings.newModel')" width="400px">
      <el-form label-width="80px">
        <el-form-item :label="t('settings.modelName')">
          <el-input v-model="modelForm.name" />
        </el-form-item>
        <el-form-item :label="t('settings.modelBaseURL')">
          <el-input v-model="modelForm.baseURL" />
        </el-form-item>
        <el-form-item :label="t('settings.modelModel')">
          <el-input v-model="modelForm.model" />
        </el-form-item>
        <el-form-item :label="t('settings.modelApiKey')">
          <el-input v-model="modelForm.apiKey" type="password" show-password />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="showModelForm = false">{{ t('settings.cancel') }}</el-button>
        <el-button type="primary" @click="saveModel">{{ t('settings.save') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'
import { Setting, Monitor, ChatDotRound, Edit, Delete } from '@element-plus/icons-vue'
import { useSettingsStore } from '../stores/settingsStore'
import { useI18n } from '../i18n'
import { TERMINAL_THEMES, FONT_OPTIONS } from '../types/settings'
import type { AIModelConfig } from '../types/settings'

const settingsStore = useSettingsStore()
const { t } = useI18n()

const activeCategory = ref('basic')

watch(() => settingsStore.openCategory, (cat) => {
  if (cat && (cat === 'basic' || cat === 'terminal' || cat === 'ai')) {
    activeCategory.value = cat
    settingsStore.openCategory = null
  }
}, { immediate: true })

const categories = computed(() => {
  // Explicitly read language to ensure reactivity tracking
  void settingsStore.settings.language
  return [
    { key: 'basic', label: t('settings.basic'), icon: Setting },
    { key: 'terminal', label: t('settings.terminal'), icon: Monitor },
    { key: 'ai', label: t('settings.ai'), icon: ChatDotRound },
  ]
})

const showModelForm = ref(false)
const editingModel = ref<AIModelConfig | null>(null)
const modelForm = reactive({
  id: '',
  name: '',
  baseURL: '',
  model: '',
  apiKey: '',
})

function editModel(model: AIModelConfig) {
  editingModel.value = model
  Object.assign(modelForm, { ...model })
  showModelForm.value = true
}

function saveModel() {
  if (editingModel.value) {
    settingsStore.updateModel(editingModel.value.id, { ...modelForm })
  } else {
    settingsStore.addModel({
      id: `model-${Date.now()}`,
      name: modelForm.name || 'Unnamed',
      baseURL: modelForm.baseURL,
      model: modelForm.model,
      apiKey: modelForm.apiKey
    })
  }
  showModelForm.value = false
  editingModel.value = null
  resetModelForm()
}

function resetModelForm() {
  modelForm.id = ''
  modelForm.name = ''
  modelForm.baseURL = ''
  modelForm.model = ''
  modelForm.apiKey = ''
}
</script>

<style scoped>
.settings-tab {
  display: flex;
  width: 100%;
  max-width: 960px;
  height: 100%;
  margin: 0 auto;
  background: var(--bg-base);
  color: var(--text-primary);
}

.settings-sidebar {
  width: 180px;
  flex-shrink: 0;
  padding: 16px 0;
  border-right: 1px solid var(--border-hover);
}

.settings-category {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  margin: 0 8px;
  font-size: 13px;
  font-family: var(--font-ui);
  cursor: pointer;
  user-select: none;
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  transition: all 0.12s ease;
  border-left: 3px solid transparent;
}

.settings-category:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.settings-category.active {
  background: var(--accent-subtle);
  color: var(--accent);
  border-left-color: var(--accent);
}

.category-icon {
  font-size: 16px;
}

.category-label {
  line-height: 1;
}

.settings-panel {
  flex: 1;
  padding: 24px 32px;
  overflow-y: auto;
  min-width: 0;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  font-family: var(--font-ui);
  margin: 0 0 20px 0;
  color: var(--text-primary);
}

.settings-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.setting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 18px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: all 0.12s ease;
}

.setting-card:hover {
  border-color: var(--border-hover);
}

.setting-info {
  flex: 1;
  min-width: 0;
}

.setting-title {
  font-size: 13px;
  font-weight: 500;
  font-family: var(--font-ui);
  color: var(--text-primary);
  margin-bottom: 2px;
}

.setting-desc {
  font-size: 11px;
  font-family: var(--font-ui);
  color: var(--text-muted);
  line-height: 1.4;
}

.setting-control {
  flex-shrink: 0;
  min-width: 210px;
}

.setting-control .el-select,
.setting-control .el-input-number {
  width: 100%;
}

/* Model cards */
.model-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 18px;
  background: var(--bg-surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  transition: all 0.12s ease;
}

.model-card:hover {
  border-color: var(--border-hover);
}

.model-card.active {
  border-color: var(--accent);
  background: var(--accent-subtle);
}

.model-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.model-detail {
  font-size: 11px;
  font-family: var(--font-mono);
  color: var(--text-muted);
  margin-left: 24px;
}

.model-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
</style>
