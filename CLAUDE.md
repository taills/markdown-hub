# Claude Code 项目配置 - MarkdownHub

## 项目概述

MarkdownHub 是一个面向研发团队、技术写作者和知识管理者的**实时同步协作 Markdown 编辑平台**，支持多人实时编辑、标题级权限控制和私有化部署。

## 技术栈

### 后端
- **Go 1.21+** + **Gin** 框架
- **gorilla/websocket** - WebSocket 实时协作
- **sqlc** - 类型安全 SQL 代码生成
- **golang-migrate** - 数据库迁移

### 前端
- **React 18** + **TypeScript 5**
- **Vite 5** - 构建工具
- **Tailwind CSS 3** - 样式框架
- **Zustand 4** - 状态管理
- **TipTap 2** - 编辑器
- **Yjs 13** - 实时协作

### 数据库
- **PostgreSQL 15+** + **pgvector** - 向量检索

### 部署
- Docker 容器化
- 单二进制交付（go:embed 前端）

## 开发规范

### Go 后端
- 使用 `sqlc` 生成类型安全 SQL 代码
- 服务层负责业务逻辑，Handler 层只做请求处理
- 错误处理使用自定义错误类型（参考 TDD.md 第5章）
- 所有敏感配置通过环境变量注入
- API 路径统一使用 `/api/v1/` 前缀

### React 前端
- 组件遵循设计系统（参考 DESIGN.md）
- 使用 Tailwind CSS 原子化样式
- 状态管理使用 Zustand
- 编辑器使用 TipTap + Yjs 实现协作

### 前端调试
- **使用 Playwright MCP** 进行浏览器动态调试
- 通过 `mcp__playwright__browser_navigate` 打开页面
- 使用 `mcp__playwright__browser_snapshot` 获取页面快照
- 使用 `mcp__playwright__browser_evaluate` 执行 JavaScript 调试
- 使用 `mcp__playwright__browser_click/type` 模拟用户交互
- 截图使用 `mcp__playwright__browser_take_screenshot`

### MCP 工具使用
- **积极使用 context7 MCP** 查询第三方库文档，避免版本与文档不一致
  - 使用 `mcp__context7__resolve-library-id` 解析库
  - 使用 `mcp__context7__query-docs` 查询文档和代码示例
- **积极使用 MiniMax MCP** 进行联网搜索和图像识别
  - 使用 `mcp__MiniMax__web_search` 进行实时信息搜索
  - 使用 `mcp__MiniMax__understand_image` 进行图像内容识别

### 数据库
- 使用 golang-migrate 管理迁移
- 迁移文件命名: `{version}_{description}.up.sql`
- 所有表创建使用 `CREATE TABLE IF NOT EXISTS`

### API 设计
- RESTful 风格，JSON 格式
- 统一响应格式: `{ code, message, data }`
- 认证使用 JWT Bearer Token

## 文档索引

| 文档 | 内容 |
|------|------|
| `PRD.md` | 产品需求文档、用户故事、里程碑 |
| `DESIGN.md` | 设计系统、UI 规范、组件定义 |
| `TDD.md` | 技术架构、API 设计、数据库 schema |

## 代码检查清单

- [ ] Go 代码通过 `go vet` 和 `golangci-lint`
- [ ] TypeScript 代码通过 ESLint 和 TypeScript 检查
- [ ] 组件符合 DESIGN.md 设计规范
- [ ] API 响应格式符合统一规范
- [ ] 数据库迁移脚本可回滚

## Git 提交规范

每次功能改动后，**测试功能完好时立即执行 git commit**，保持提交的原子性和可追溯性。

```
feat: 新功能
fix: 修复问题
docs: 文档更新
style: 代码格式（不影响功能）
refactor: 重构
test: 测试
chore: 构建/工具
```

变更内容写入 `docs/CHANGELOG.md`

### 提交流程
1. 功能开发完成
2. 使用 Playwright MCP 进行前端和后端联动调试验证
3. 功能正常 → 立即 `git commit`
4. 功能异常 → 修复后再次验证，需前端和后端全部验证通过再提交

### 文件清理
- 临时截图、调试文件等**完成任务后必须删除**，避免垃圾文件残留
- 其他不必要的临时文件同样需要清理，保持项目目录整洁
- 定期检查并清理不再使用的资源文件
