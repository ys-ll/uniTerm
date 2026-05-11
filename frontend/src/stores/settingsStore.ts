import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { AppSettings, AIModelConfig } from '../types/settings'
import { DEFAULT_SETTINGS } from '../types/settings'
import { SaveSettings, LoadSettings } from '../../wailsjs/go/main/App'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>({ ...DEFAULT_SETTINGS })
  const loaded = ref(false)

  const theme = computed(() => settings.value.theme)
  const language = computed(() => settings.value.language)
  const terminal = computed(() => settings.value.terminal)
  const ai = computed(() => settings.value.ai)

  const activeModel = computed(() =>
    settings.value.ai.models.find(m => m.id === settings.value.ai.activeModelId) || settings.value.ai.models[0]
  )

  // For navigating to a specific settings category from other components
  const openCategory = ref<string | null>(null)

  function applyTheme() {
    let theme = settings.value.theme
    if (theme === 'system') {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light'
    } else {
      document.documentElement.dataset.theme = theme
    }
  }

  async function init() {
    try {
      const loadedSettings = await LoadSettings()
      if (loadedSettings) {
        settings.value = mergeSettings(loadedSettings)
        loaded.value = true
      }
    } catch {
      // use defaults
    }
    applyTheme()
  }

  async function save() {
    try {
      await SaveSettings(settings.value)
    } catch {
      // ignore save errors
    }
  }

  function updateTheme(value: AppSettings['theme']) {
    settings.value.theme = value
    save()
  }

  function updateLanguage(value: AppSettings['language']) {
    settings.value.language = value
    save()
  }

  function updateTerminal(updates: Partial<AppSettings['terminal']>) {
    settings.value.terminal = { ...settings.value.terminal, ...updates }
    save()
  }

  function addModel(model: AIModelConfig) {
    settings.value.ai.models.push(model)
    save()
  }

  function updateModel(id: string, updates: Partial<AIModelConfig>) {
    const idx = settings.value.ai.models.findIndex(m => m.id === id)
    if (idx >= 0) {
      settings.value.ai.models[idx] = { ...settings.value.ai.models[idx], ...updates }
      save()
    }
  }

  function removeModel(id: string) {
    const idx = settings.value.ai.models.findIndex(m => m.id === id)
    if (idx >= 0) {
      settings.value.ai.models.splice(idx, 1)
      if (settings.value.ai.activeModelId === id && settings.value.ai.models.length > 0) {
        settings.value.ai.activeModelId = settings.value.ai.models[0].id
      }
      save()
    }
  }

  function setActiveModel(id: string) {
    settings.value.ai.activeModelId = id
    save()
  }

  // Auto-save when AI models change
  watch(() => settings.value.ai, save, { deep: true })

  // Apply theme when it changes
  watch(() => settings.value.theme, applyTheme)

  // Listen for system color scheme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (settings.value.theme === 'system') {
      applyTheme()
    }
  })

  return {
    settings,
    loaded,
    theme,
    language,
    terminal,
    ai,
    activeModel,
    openCategory,
    init,
    save,
    applyTheme,
    updateTheme,
    updateLanguage,
    updateTerminal,
    addModel,
    updateModel,
    removeModel,
    setActiveModel
  }
})

function mergeSettings(loaded: AppSettings): AppSettings {
  return {
    theme: loaded.theme || DEFAULT_SETTINGS.theme,
    language: loaded.language || DEFAULT_SETTINGS.language,
    terminal: {
      ...DEFAULT_SETTINGS.terminal,
      ...loaded.terminal
    },
    ai: {
      models: loaded.ai?.models?.length ? loaded.ai.models : DEFAULT_SETTINGS.ai.models,
      activeModelId: loaded.ai?.activeModelId || DEFAULT_SETTINGS.ai.activeModelId
    }
  }
}
