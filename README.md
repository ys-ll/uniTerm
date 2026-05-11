<div align="center">
  <img src="appicon.png" alt="uniTerm" width="128" height="128" />
  <h1>uniTerm</h1>
  <p>A modern cross-platform terminal emulator with built-in AI assistant.</p>
</div>

## Features

- **SSH Client** — Connect to remote servers via SSH. Supports password and private key authentication.
- **AI Assistant** — Built-in AI sidebar powered by Anthropic-compatible LLMs (DeepSeek, Claude, etc.). The AI executes shell commands in the active terminal — with configurable execution modes.
- **Three Execution Modes** — Confirm All (approve every command), Confirm Dangerous (auto-run safe commands, prompt for destructive ones), and Bypass (fully autonomous).
- **AI Session Management** — Persistent chat sessions with automatic compression, rename, switch, and delete.
- **AI Debug Mode** — Toggle to inspect raw API request/response bodies in the chat.
- **Tabs & Splits** — Flexible tab system with split-pane layouts for parallel sessions.
- **Connection Manager** — Save, search, edit, duplicate, and organize server connections.
- **Terminal Customization** — Configurable color scheme, font family, font size, selection behavior, right-click action, and scrollback history.
- **Three Themes** — Dark, Deep Blue, and Light with CSS variable theming, plus system auto-detect.
- **i18n** — Chinese (简体中文) and English language support.
- **Cross-Platform** — Windows, macOS, and Linux via Wails.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | [Wails v2](https://wails.io) |
| Backend | Go |
| Frontend | Vue 3 + Pinia + Element Plus |
| Terminal | xterm.js |
| AI Protocol | Anthropic Messages API |

## Prerequisites

- [Go](https://go.dev/dl/) 1.23+
- [Node.js](https://nodejs.org/) 20+
- [Wails CLI](https://wails.io/docs/gettingstarted/installation) v2

### Platform-specific

- **Windows**: WebView2 runtime (included in Windows 10+)
- **macOS**: Xcode Command Line Tools
- **Linux**: `libgtk-3-dev` and `libwebkit2gtk-4.1-dev`

## Getting Started

```bash
# Clone the repo
git clone https://github.com/ys-ll/uniTerm.git
cd uniTerm

# Install frontend dependencies
cd frontend && npm install && cd ..

# Run in development mode
wails dev

# Build for production
wails build
```

## Project Structure

```
uniTerm/
├── app.go                        # Wails app bindings & LLM API proxy
├── main.go                       # Entry point
├── backend/
│   ├── session/                  # SSH session management
│   ├── store/                    # Persistent config (settings, AI config)
│   └── log/                      # File-based logging
├── frontend/
│   └── src/
│       ├── components/           # Vue components (13 components)
│       ├── stores/               # Pinia stores (ai, connection, settings, tab)
│       ├── services/             # AI agent loop, LLM client, terminal agent
│       ├── i18n/                 # Chinese & English translations
│       └── types/                # TypeScript type definitions
└── wails.json                    # Wails project config
```

## License

Apache 2.0
