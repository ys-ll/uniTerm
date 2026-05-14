# Custom Titlebar Design Spec

**Goal:** Replace the native OS titlebar with a fully custom one, giving uniTerm a consistent cross-platform visual identity while preserving platform-native window control conventions.

**Architecture:** Frameless window in Wails. The existing `AppHeader.vue` is extended with platform-aware window controls. The header bar itself becomes the draggable region. Wails frontend runtime provides window state APIs (minimise, maximise, close).

---

## 1. Platform Behavior

| Platform | Titlebar Style | Controls Position | Notes |
|----------|---------------|-------------------|-------|
| Windows | Fully custom | Top-right | Standard close/maximise/minimise icons |
| macOS | Fully custom | Top-left | Circular traffic-light style buttons (close/minimise/maximise) |
| Linux | Fully custom | Top-right | Same as Windows |

The app uses `runtime.Environment()` to detect `platform` (`windows`, `darwin`, `linux`) and renders controls accordingly.

On all platforms, the native titlebar is completely hidden (`Frameless: true`).

---

## 2. Window Controls

### 2.1 Button Layout

The header uses a 3-column CSS Grid (`1fr auto 1fr`). The brand is always centered regardless of left/right content width.

**macOS:**
```
┌────────────────────────┬──────────┬────────────────────────┐
│ [○○○] [connections][+] │  uniTerm │ [settings] [AI]        │
└────────────────────────┴──────────┴────────────────────────┘
         ↑ left col              ↑ center        ↑ right col
```
- Left column: traffic-light controls + left action buttons
- Center column: brand title
- Right column: right action buttons only

**Windows/Linux:**
```
┌────────────────────────┬──────────┬────────────────────────┐
│ [connections][+]       │  uniTerm │ [settings] [AI] [_ □ ✕]│
└────────────────────────┴──────────┴────────────────────────┘
         ↑ left col              ↑ center        ↑ right col
```
- Left column: left action buttons only
- Center column: brand title
- Right column: right action buttons + window controls

### 2.2 Button States

| Button | Normal | Hover | Active |
|--------|--------|-------|--------|
| Close (macOS) | `#ff5f56` | `#ff5f56` + scale 1.1 | darker shade |
| Close (Win) | `var(--text-secondary)` | `#e81123` bg + white icon | darker red |
| Minimise (macOS) | `#ffbd2e` | `#ffbd2e` + scale 1.1 | darker shade |
| Minimise (Win) | `var(--text-secondary)` | `var(--bg-hover)` | `var(--bg-active)` |
| Maximise (macOS) | `#27c93f` | `#27c93f` + scale 1.1 | darker shade |
| Maximise/Restore (Win) | `var(--text-secondary)` | `var(--bg-hover)` | `var(--bg-active)` |

### 2.3 Maximise State

The maximise button shows a **restore** icon when the window is already maximised. This requires tracking the maximised state:

- On click: call `WindowToggleMaximise()`
- On mount: query `WindowIsMaximised()` to set initial icon
- Listen for window state changes via `runtime` events (or re-query on window resize)

For simplicity, re-query `WindowIsMaximised()` after each toggle and on `window.resize` event.

---

## 3. Draggable Region

The entire `AppHeader` bar is draggable **except** for interactive elements (buttons, icons).

Implementation via Wails CSS drag property:

```css
.app-header {
  --wails-draggable: drag;
}

.app-header button,
.app-header .header-btn,
.app-header .window-control {
  --wails-draggable: no-drag;
}
```

This allows the user to drag the window by grabbing any non-interactive area of the header.

### Edge Cases

- Double-click on the draggable area toggles maximise/restore (platform convention on Windows and Linux)
- The brand/title area in the center is also draggable (it's empty space)

---

## 4. Double-Click to Maximise

On Windows and Linux, double-clicking the draggable titlebar area toggles maximise/restore. This is standard OS behavior that users expect.

macOS does not have this convention, so it's disabled there.

Implementation: add `@dblclick` listener on the header container (not on buttons).

---

## 5. Components

### AppHeader.vue (modified)

The existing header is enhanced with a `WindowControls` sub-component. Layout uses CSS Grid (`1fr auto 1fr`) to keep the brand truly centered regardless of left/right content width.

```
┌─────────────────────────────────────────────────────────────────┐
│ [macOS controls] [left actions]  │  brand  │  [right actions] [win controls] │
└─────────────────────────────────────────────────────────────────┘
```

Structure:
- `.header-left`: macOS controls (when on macOS) + left action buttons
- `.header-title`: brand centered via grid auto column
- `.header-right`: right action buttons + Windows/Linux controls (when on Win/Linux)

Props / state changes:
- `platform`: `'windows' | 'darwin' | 'linux'` from `Environment()`
- `isMaximised`: boolean, tracked reactively

Emits remain unchanged: `new-connection`, `toggle-ai`, `toggle-sidebar`, `open-settings`

**Layout CSS:**
```css
.app-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  --wails-draggable: drag;
}
.header-left  { display: flex; align-items: center; gap: 12px; }
.header-right { display: flex; align-items: center; justify-content: flex-end; gap: 12px; }
```

### WindowControls.vue (new)

Platform-specific window control buttons.

**macOS variant:** Three circular buttons (12px diameter) with traffic-light colors. Arranged horizontally with 8px gap.

**Windows/Linux variant:** Three square buttons (46px wide, 32px tall on Windows; slightly smaller on Linux). Close button gets red background on hover. Icons follow native Windows style:
- Minimise: horizontal line
- Maximise: hollow square outline (single stroke)
- Restore: two overlapping hollow squares (offset)

The parent (`AppHeader`) handles these by calling the corresponding `runtime` functions.

---

## 6. Go-Side Changes

### main.go

Add `Frameless: true` to the `options.App` configuration:

```go
err := wails.Run(&options.App{
    Title:  "uniTerm",
    Width:  1200,
    Height: 800,
    Frameless: true,   // ← NEW
    AssetServer: &assetserver.Options{
        Assets: assets,
    },
    // ... rest unchanged
})
```

No other Go changes are needed because all window control APIs are already exposed via Wails frontend runtime.

---

## 7. Data Flow

### Window control flow
```
User clicks minimise button
  → WindowControls emits 'minimise'
  → AppHeader calls runtime.WindowMinimise()
  → Wails minimises the native window

User clicks maximise/restore button
  → WindowControls emits 'maximise'
  → AppHeader calls runtime.WindowToggleMaximise()
  → Wait briefly, then call runtime.WindowIsMaximised()
  → Update isMaximised state → button icon changes

User clicks close button
  → WindowControls emits 'close'
  → AppHeader calls runtime.Quit()
  → App exits

User drags the header bar
  → Wails CSS drag property handles it natively
  → Window moves with mouse

User double-clicks header (Win/Linux)
  → AppHeader calls runtime.WindowToggleMaximise()
  → Window maximises or restores
```

---

## 8. Edge Cases

- **Initial maximise state**: Query `WindowIsMaximised()` on mount to show the correct icon
- **External maximise trigger**: If the user maximises via OS shortcut (Win+Up), the icon might be out of sync. Re-query on `window.resize` to stay in sync.
- **macOS fullscreen**: When entering native fullscreen (green button), the custom titlebar is hidden by the OS. Exiting fullscreen restores it.
- **Window min size**: The frameless window should still respect `WindowSetMinSize` so the controls don't get clipped. Current min size is implicit via the header's fixed height + content.
- **Right-click on titlebar**: On Windows, users might expect a system menu. Since we're fully custom, this is not provided. If needed later, a custom context menu can be added.
- **Accessibility**: Window controls should have `aria-label` attributes for screen readers.
