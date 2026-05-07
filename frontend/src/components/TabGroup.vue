<template>
  <div class="tab-group">
    <div class="tabs">
      <div class="tab active">Tab 1</div>
    </div>
    <div class="tab-content">
      <p>Terminal content area</p>
    </div>
  </div>
</template>

<style scoped>
.tab-group {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tabs {
  display: flex;
  background: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
}

.tab {
  padding: 8px 16px;
  cursor: pointer;
  color: #858585;
  font-size: 12px;
  border-right: 1px solid #3d3d3d;
}

.tab.active {
  background: #1e1e1e;
  color: #e0e0e0;
}

.tab-content {
  flex: 1;
  padding: 16px;
  color: #e0e0e0;
}
</style>
