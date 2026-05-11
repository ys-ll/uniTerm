<template>
  <div class="tab-content">
    <template v-for="tab in groupTabs" :key="tab.id">
      <div
        class="tab-panel"
        :class="{ hidden: tab.id !== tabStore.activeTabId }"
      >
        <TerminalTab v-if="tab.type === 'ssh'" :tab="tab" />
        <SettingsTab v-else-if="tab.type === 'settings'" />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useTabStore } from '../stores/tabStore'
import TerminalTab from './TerminalTab.vue'
import SettingsTab from './SettingsTab.vue'

const props = defineProps<{
  groupId: string
}>()

const tabStore = useTabStore()

const groupTabs = computed(() =>
  tabStore.tabs.filter(t => t.groupId === props.groupId)
)
</script>

<style scoped>
.tab-content {
  flex: 1;
  overflow: hidden;
  background: var(--bg-base);
  display: grid;
  grid-template-areas: "stack";
}

.tab-panel {
  grid-area: stack;
  width: 100%;
  height: 100%;
}

.tab-panel.hidden {
  opacity: 0;
  pointer-events: none;
}
</style>
