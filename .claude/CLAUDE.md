# CLAUDE.md

## 约束

- 提交代码必须经过人工确认。不得在用户未明确要求的情况下执行 git commit、git push 或 git tag 操作。

## 开发验证

- 修改前端代码后，必须先清理缓存再启动 `wails dev` 验证，否则修改可能不生效。清理命令：`cd frontend && rm -rf dist node_modules/.vite && cd .. && wails dev`。
