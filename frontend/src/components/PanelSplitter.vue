<template>
  <div
    class="panel-splitter"
    :class="direction"
    @mousedown="onMouseDown"
  ></div>
</template>

<script setup lang="ts">
const props = defineProps<{
  direction: 'horizontal' | 'vertical'
}>()

const emit = defineEmits<{
  resize: [delta: number]
}>()

function onMouseDown(e: MouseEvent) {
  const startPos = props.direction === 'horizontal' ? e.clientX : e.clientY

  function onMove(ev: MouseEvent) {
    const currentPos = props.direction === 'horizontal' ? ev.clientX : ev.clientY
    emit('resize', currentPos - startPos)
    // Update startPos for continuous delta
    // Actually, emit cumulative delta is simpler
  }

  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
</script>

<style scoped>
.panel-splitter {
  flex-shrink: 0;
  background: var(--border-subtle);
  transition: background 0.15s;
}
.panel-splitter:hover {
  background: var(--accent);
}
.panel-splitter.horizontal {
  width: 4px;
  cursor: col-resize;
}
.panel-splitter.vertical {
  height: 4px;
  cursor: row-resize;
}
</style>
