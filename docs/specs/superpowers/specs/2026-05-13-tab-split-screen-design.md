# Tab Split Screen Design Spec

**Goal:** Implement VSCode-style drag-to-split for terminal tabs, replacing the current split logic entirely.

**Architecture:** Recursive `SplitNode` binary tree with ratio-based sizing. All split operations (create, move, resize, close) go through `tabStore`. A `SplitOverlay` component handles four-direction edge snapping with green translucent preview.

---

## 1. Data Structures

### SplitNode (redefined)

```typescript
export interface SplitNode {
  id: string
  direction: 'horizontal' | 'vertical' | null   // null = leaf (tab group)
  children: SplitNode[]                          // exactly 2 when non-leaf
  tabGroupId?: string                            // present only on leaf nodes
  ratio: number                                  // proportion in parent (0-1), default 0.5
}
```

Each non-leaf node has exactly 2 children. `ratio` of siblings sum to 1.

### Tab

Tab already has `groupId` linking to a `SplitNode.tabGroupId`. One field added:

```typescript
export interface Tab {
  // ... existing fields
  aiLocked?: boolean   // When true, AI sends commands to this tab's terminal regardless of activeTab
}
```

---

## 2. Interactions

### 2.1 Create split via edge drag

When a tab is being dragged (`dragstart` fires), the `SplitOverlay` component activates globally.

Four edge zones (50px from each edge of the active terminal display area):

| Zone | Action | Result |
|------|--------|--------|
| Top 50px | Vertical split | New pane above, current pane below |
| Bottom 50px | Vertical split | New pane below, current pane above |
| Left 50px | Horizontal split | New pane left, current pane right |
| Right 50px | Horizontal split | New pane right, current pane left |

A green translucent overlay appears in the target zone on `dragover`. On `drop`:
1. Find the leaf node containing the current tab group
2. Replace it with a split node (direction determined by edge), children = [existing leaf, new leaf]
3. Move the dragged tab to the new leaf's tab group
4. Remove overlay

On `dragend` (tab dropped outside or cancelled), overlay is removed.

### 2.2 Move tab between panes

Dragging a tab onto:
- **Another tab bar area** → tab moves to that group
- **Center area of another pane** → tab moves to that pane's group

If the source group becomes empty after the move, the empty leaf is removed from the tree and the sibling expands to fill.

### 2.3 Resize panes

A 4px resize handle rendered between adjacent panes (children of a split node). Dragging the handle adjusts the `ratio` of the two children in real-time. Minimum pane size: 200px.

Handle orientation matches split direction:
- Horizontal split → vertical handle (drag left/right)
- Vertical split → horizontal handle (drag up/down)

### 2.4 AI lock to tab

By default, AI executes commands in the currently active tab's terminal (`tabStore.activeTab?.sessionId`).

Each tab has a small lock button (visible on hover, similar to the close button):
- **Click lock** → sets `tab.aiLocked = true`. If any other tab was locked, it gets unlocked first. The AI will now always send commands to this tab's terminal, regardless of which tab is active.
- **Click unlock** → sets `tab.aiLocked = false`. AI returns to using the active tab.
- **Locked tab styling** → the tab gets a distinctive highlight:
  - A glowing accent border on the left side (or top accent bar in a different color, e.g., golden/lime)
  - The lock icon is always visible (not just on hover)
  - This makes it immediately obvious which tab the AI is bound to

Only one tab can be locked at a time. Locking applies only to SSH/terminal tabs; settings tabs do not show the lock button.

When `terminalAgent.executeCommand()` is called:
1. Check if any tab has `aiLocked = true`
2. If yes, use that tab's `sessionId`
3. If no, use `tabStore.activeTab?.sessionId`

### 2.5 Close pane (last tab closed)

When the last tab in a tab group is closed:
1. Find the leaf node for that tab group
2. If it's the root's only child, keep it (don't collapse root)
3. Otherwise, replace the parent split node with the sibling leaf node
4. The sibling expands to fill the space

---

## 3. Components

### SplitContainer.vue (rewritten)

Recursive renderer for the split tree.

```
Props: node: SplitNode

If node is a leaf:
  → render TabGroup
If node is a split:
  → render two children (SplitContainer with child node)
  → render resize handle between them
  → render SplitOverlay for edge-drop detection
```

Children are sized by `flex: <ratio>`.

### SplitOverlay.vue (new)

Four absolute-positioned drop zones inside each SplitContainer:

```
┌─────────────────────────────────┐
│          top zone (50px)         │
│                                   │
│     ┌─────────────────────┐      │
│     │                     │      │
│ left│    center area       │right │
│     │   (drops to group)   │      │
│     │                     │      │
│     └─────────────────────┘      │
│                                   │
│         bottom zone (50px)      │
└─────────────────────────────────┘
```

Only visible when a tab is being dragged (`draggingTabId` is non-null in store).
Green translucent preview appears on hover over a zone.

### TabBar.vue (enhanced)

- Existing: same-group reordering via drag-and-drop
- New: accept external tab drops — when a tab from another group is dropped, call `tabStore.moveTab(tabId, groupId)`

### TabItem.vue (enhanced)

- Existing: `draggable="true"`, `dragstart`/`dragend` events
- New: `dragstart` also updates `tabStore.draggingTabId` so overlay knows a drag is active
- New: AI lock button — a small lock/unlock icon next to the close button
  - Visible on hover (same behavior as close button)
  - When locked: shows a filled/closed lock icon, tab gets a highlighted border/accent color
  - When unlocked: shows an open lock icon, tab uses normal styling
  - Click toggles `tab.aiLocked`. If another tab was locked, it gets unlocked first (only one tab locked at a time)

### TabContent.vue

- Pass the `aiLocked` state up to the parent for the lock toggle
- When rendering TerminalTab, pass a prop indicating whether AI is locked to this tab vs currently active

### TabGroup.vue

No structural changes needed.

---

## 4. Store Operations

### tabStore

| Operation | Description |
|-----------|-------------|
| `createSplit(tabId, direction, edge)` | Replace leaf with split, create new group, move tab to correct child based on edge |
| `moveTab(tabId, targetGroupId)` | Change tab's groupId, prune empty source leaf |
| `removeEmptyGroup(groupId)` | Walk tree, remove leaf, collapse parent into sibling |
| `resizePane(parentId, ratios)` | Update children[i].ratio |
| `toggleAILock(tabId)` | Toggle `aiLocked` on tab; if locking, unlock any other locked tab |
| `draggingTabId` | Ref tracking which tab is currently being dragged (null when not dragging) |

### createSplit detail

Edge determines which child of the new split gets the existing group vs the new group:
- `top` / `left`: new group is first child, existing group is second child
- `bottom` / `right`: existing group is first child, new group is second child

### removeEmptyGroup detail

```
function removeEmptyGroup(node, targetGroupId):
  if node is leaf and node.tabGroupId == targetGroupId:
    return false (signal removal)
  if node is split:
    filter children through removeEmptyGroup
    if 1 child left:
      replace this node with that child (collapse)
    if 0 children left:
      return false
  return true
```

---

## 5. Data Flow

### Split drag flow
```
User drags tab
  → TabItem.dragstart → store.draggingTabId = tabId
  → SplitOverlay activates (v-if="store.draggingTabId")
  → User drags over edge zone → overlay shows green preview
  → User drops on edge zone
    → store.createSplit(tabId, direction, edge)
    → overlay hides, tree re-renders
  → User drops on tab bar → store.moveTab(tabId, targetGroupId)
  → User drops on center area → store.moveTab(tabId, targetGroupId)
  → dragend → store.draggingTabId = null
```

### AI lock flow
```
User clicks lock on TabItem
  → tabStore.toggleAILock(tabId)
  → tab.aiLocked = true (previous locked tab unlocked if any)
  → TabItem re-renders with lock highlight

terminalAgent.executeCommand(command)
  → lockedTab = tabStore.tabs.find(t => t.aiLocked)
  → sessionId = lockedTab?.sessionId || tabStore.activeTab?.sessionId
  → SessionWrite(sessionId, command)
```

---

## 6. Edge Cases

- **Root with single leaf**: collapsing the only pane is a no-op
- **Settings tab**: not draggable to create splits (settings tabs stay put); no AI lock button shown
- **Empty groups**: auto-pruned after last tab removed
- **Minimum pane size**: 200px enforced during resize
- **Multiple splits**: recursive tree supports arbitrary nesting
- **Ratio persistence**: ratios are stored in the SplitNode, not separately
- **AI lock + tab close**: closing a locked tab unlocks it (AI reverts to active tab)
- **AI lock + cross-pane move**: moving a locked tab to another pane keeps it locked
- **AI lock + no active session**: if locked tab's session is disconnected, AI commands will fail with an error
