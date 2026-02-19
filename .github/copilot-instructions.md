# **MarkdownHub Copilot 使用说明**

你是一位全栈开发专家，正在协助开发 **MarkdownHub**，这是一个协作式、实时、Git 原生的写作环境。

> **MarkdownHub** = **Markdown 版的 GitHub**
> _书写 Markdown。共同编辑。像 Git 一样管理版本。_

---

## 🧠 项目背景与核心原则

### 1. 设计哲学
- **Markdown 原生**：没有块级抽象。原本的纯文本 Markdown 就是事实来源（Source of Truth）。
- **实时协作**：基于 WebSocket 的同步。优先考虑**数据一致性**和**低延迟**。
- **类 Git 版本控制**：基于启发式算法（行数变化、字节变化、时间间隔）自动创建快照。
- **细粒度权限**：权限（读取/编辑/管理）可以细化到文档内的特定**标题（Heading）**级别。

### 2. 技术栈

- **前端**：React, TypeScript, WebSocket 客户端。
- **后端**：Go (Golang), WebSocket 服务端, EventBus。
- **数据库工具**：
  - **sqlc**：用于从 SQL 生成类型安全的 Go 代码。
  - **migrate**：用于数据库结构迁移（Schema Migrations）。
- **数据库**：PostgreSQL (配合 `pgvector` 进行语义搜索)。
- **缓存**：带 TTL 的内存 Go 缓存。
- **构建部署**：前端静态资源通过 Go `embed` 嵌入后端，最终编译为单一可执行文件。
- **基础设施**：Docker

---

## 🛡️ 编码标准与指南

### 后端 (Go)

- **风格**：遵循 "Effective Go" 和标准 Go 习惯用法。
- **静态资源**：
  - 使用 `go:embed` 将前端构建产物（`dist/`）嵌入到 Go 二进制文件中。
  - 配置 HTTP 路由以服务这些静态文件，作为一个单页应用（SPA）入口。
- **数据库开发**：
  - **必须使用 sqlc**：所有数据库操作必须通过 sqlc 生成的代码。避免手动编写 `Rows.Scan` 或执行原始 SQL 语句。
  - **禁止在 Go 文件中写数据库操作逻辑**：严格禁止在任何 `.go` 文件中编写 SQL 查询或数据库操作代码。所有 SQL 必须定义在 `db/queries/*.sql` 文件中。
  - **store 层职责明确**：`internal/store/store.go` 仅用于：
    - 数据库连接管理（`NewDB`, `Close`）
    - 事务支持（`WithTransaction`）
    - 类型转换辅助函数
    - **不得包含任何 SQL 查询或数据库操作代码**
  - **core 层直接使用 sqlc**：业务逻辑层（`internal/core/*.go`）直接调用 `internal/store` 中 sqlc 生成的方法（Queries）。
  - **SQL 定义流程**：
    1. 在 `db/queries/*.sql` 中定义带名称注释的 SQL 语句（如 `-- name: GetUserByID :one`）
    2. 运行 `sqlc generate` 自动生成 Go 代码（`internal/store/xxx.sql.go`）
    3. 在 core 层中导入 `internal/store` 并调用生成的方法
  - **类型转换**：
    - sqlc 生成的方法使用 `uuid.UUID` 和自定义 enum 类型（如 `PermissionLevel`）
    - core 层使用 domain models（`internal/models` 中的 `string` ID 和类型）
    - 在 core 层进行类型转换：`uuid.Parse()` 和手动构造 model 对象
  - **参数结构体使用**：sqlc 生成的方法接受 `Params` 结构体，不要传递多个参数
    - ❌ `s.db.CreateUser(ctx, name, email, hash)`
    - ✅ `s.db.CreateUser(ctx, store.CreateUserParams{Name: name, Email: email, ...})`
  - **使用 migrate 管理数据库 Schema**：所有 Schema 变更必须通过 migration 文件（`db/migrations/`）进行。
- **错误处理**：
  - 使用 `errors.Is` 和 `errors.As`。
  - 包装错误以提供上下文：`fmt.Errorf("failed to process document: %w", err)`。
  - 除非启动失败，否则不要 panic。
- **并发**：
  - 使用 `context` 处理取消和超时。
  - 适当时候优先使用 Channel 进行通信，而不是共享内存；但对于简单的状态保护，使用 `sync.Mutex`。
  - **WebSocket**：确保对 WebSocket 连接的写入是线程安全的。
- **架构**：
  - 保持 Handler "轻薄"。业务逻辑放入 Service 层。
  - 输入验证应在边界（Handler/DTO）进行。
  - **分层原则**：
    - **API 层**（`internal/api/`）：HTTP 请求处理，参数验证，调用 service 层
    - **Core 层**（`internal/core/`）：业务逻辑实现，权限检查，直接调用 store 的 sqlc 方法
    - **Store 层**（`internal/store/`）：数据库连接和事务管理（不包含任何 SQL 操作代码）
    - **Models 层**（`internal/models/`）：Domain model 定义（使用 string ID 和简单类型）

### 前端 (React & TypeScript)

- **组件**：使用带 Hook 的函数式组件。保持组件小巧且可组合。
- **TypeScript**：
  - **严格模式**：启用严格类型检查。
  - 避免 `any`。为所有 props 和 API 响应定义接口。
- **状态管理**：
  - UI 关注点使用本地状态。
  - 全局应用状态（用户、活动文档）使用 Context 或外部存储（如 Zustand/Redux - *请检查 package.json*）。
- **性能**：
  - 最小化重新渲染。对于昂贵的操作或稳定的引用，谨慎使用 `useMemo` 和 `useCallback`。
  - 必要时对长 Markdown 列表进行虚拟化。

---

## 🗄️ 数据库访问与 sqlc 最佳实践

### 1. sqlc 工作流程

```
定义 SQL         运行 sqlc         Core 层调用
db/queries/*.sql ──→ go generate ──→ internal/store/xxx.sql.go ──→ internal/core/*.go
```

**关键步骤**:
1. **定义 SQL 查询**（`db/queries/`）：
   ```sql
   -- name: CreateUser :one
   INSERT INTO users (username, email, password_hash)
   VALUES ($1, $2, $3)
   RETURNING *;
   ```
   
2. **生成代码**：运行 `sqlc generate` 自动生成 `internal/store/xxx.sql.go`

3. **Core 层使用**：
   ```go
   user, err := s.db.CreateUser(ctx, store.CreateUserParams{
       Username:     username,
       Email:        email,
       PasswordHash: hash,
   })
   if err != nil {
       return nil, err
   }
   // 转换为 models.User
   return &models.User{
       ID: user.ID.String(),
       Username: user.Username,
       // ...
   }, nil
   ```

### 2. 严格规则

| 规则 | ✅ 正确 | ❌ 错误 |
|------|--------|--------|
| **SQL 位置** | `db/queries/*.sql` | `internal/core/*.go` |
| **Store 职责** | 连接、事务、类型转换 | SQL 查询、数据操作 |
| **Core 职责** | 调用 sqlc 方法、业务逻辑 | 手写 SQL、直接数据库操作 |
| **参数传递** | `CreateUserParams{...}` | `(ctx, name, email, hash)` |
| **ID 类型** | uuid.UUID (sqlc)，string (models) | 混用或手动类型转换 |

### 3. 常见模式

#### 添加新的数据库操作

```go
// 1. 在 db/queries/users.sql 中添加
-- name: UpdateUserPassword :one
UPDATE users SET password_hash = $2 WHERE id = $1 RETURNING *;

// 2. 运行 sqlc generate
$ sqlc generate

// 3. 在 internal/core/user.go 中使用
func (s *UserService) UpdatePassword(ctx context.Context, userID, newHash string) error {
    id, err := uuid.Parse(userID)
    if err != nil {
        return errors.New("invalid user ID")
    }
    _, err = s.db.UpdateUserPassword(ctx, store.UpdateUserPasswordParams{
        ID:           id,
        PasswordHash: newHash,
    })
    return err
}
```

#### 处理 uuid.UUID 和 string

```go
// sqlc 返回 uuid.UUID，models 使用 string
// 转换示例：
storeUser := s.db.GetUserByID(ctx, uuid.MustParse(userID))
modelUser := &models.User{
    ID:       storeUser.ID.String(),  // uuid.UUID → string
    Username: storeUser.Username,
}

// 反向转换：
userUUID, err := uuid.Parse(userID)  // string → uuid.UUID
if err != nil {
    return nil, fmt.Errorf("invalid user ID: %w", err)
}
```

#### 处理 uuid.NullUUID

```go
// sqlc 使用 uuid.NullUUID 表示可为 null 的 UUID
if doc.DocumentID.Valid {
    docID := doc.DocumentID.UUID.String()
    // 处理非 null 情况
} else {
    // 处理 null 情况
}

// 创建时指定：
store.CreateAttachmentParams{
    DocumentID: uuid.NullUUID{UUID: docUUID, Valid: true},    // 不为空
    // 或
    DocumentID: uuid.NullUUID{Valid: false},                   // 为空
}
```

### 4. 禁止事项

❌ **绝对禁止以下做法**：

1. **在 `internal/core/` 或其他 `.go` 文件中写 SQL**
   ```go
   // 禁止！
   row := db.QueryRow("SELECT * FROM users WHERE id = $1", userID)
   ```

2. **在 `internal/store/store.go` 中添加数据库操作代码**
   ```go
   // 禁止在 store.go 中写！应该在 db/queries/*.sql 中定义
   func (s *DB) GetUserByEmail(email string) (*User, error) {
       // ...
   }
   ```

3. **绕过 sqlc 进行手动类型转换的复杂操作**
   ```go
   // 禁止！应该在 db/queries/*.sql 中定义查询
   rows, _ := db.Query("SELECT * FROM users WHERE...")
   for rows.Next() {
       // 手动 Scan 和转换
   }
   ```

4. **在 core 层直接使用 uuid.UUID 作为参数**
   ```go
   // 禁止！
   func (s *Service) GetDocument(id uuid.UUID) { }
   
   // 应该是：
   func (s *Service) GetDocument(documentID string) { }
   ```

---

## 🧩 功能实现指南

### 1. 实时协作 (WebSocket)
- 实现心跳/ping-pong 以保持连接。
- 优雅地处理重连策略，使用指数退避算法。
- **冲突解决**：当多个用户编辑同一部分时，优先考虑最新时间戳，或者在复杂度要求高时使用操作转换 (OT) / CRDT 逻辑。

### 2. 细粒度权限 ("标题级别"规则)
- 虽然 Markdown 是纯文本，但解析器必须构建一个简单的 AST（抽象语法树）将内容映射到标题。
- **场景**：用户 A 对 "## 第一节" 有编辑权限，但对 "## 第二节" 只有只读权限。
- **实现**：
  - 后端必须根据当前快照中该部分的字节范围验证编辑操作。
  - 前端应直观地锁定/禁用受限部分的编辑功能。

### 3. 版本控制
- **快照**：不要存储每一次击键。
- **触发逻辑**：`if (changes > N_lines || changes > N_bytes || time_since_last_save > N_seconds)` -> 创建快照。
- **差异对比**：使用基于行的差异算法展示历史。

---

## 📂 项目结构详解

```text
/cmd                          # 应用程序入口点
  /main.go                    # 主程序，初始化服务

/internal                     # 私有应用程序和库代码
  /api                        # HTTP/WebSocket 处理程序
    /handlers.go              # API 路由和请求处理
  /core                       # 业务逻辑服务层
    /auth.go                  # 认证服务（直接调用 sqlc）
    /document.go              # 文档服务
    /permission.go            # 权限管理
    /user.go                  # 用户管理
  /store                      # 数据库访问层（sqlc 生成 + 连接管理）
    /store.go                 # DB 初始化、事务支持（禁止 SQL 操作）
    /xxx.sql.go               # sqlc 自动生成的代码（勿手修）
    /querier.go               # sqlc 接口定义（勿手修）
  /models                     # 领域模型定义
    /models.go                # User, Document, Permission 等

/db                           # 数据库配置
  /migrations                 # Schema 迁移
    /001_initial.up.sql       # 创建表结构
    /001_initial.down.sql     # 回滚脚本
  /queries                    # SQL 查询定义（sqlc 入口）
    /users.sql                # 用户相关查询
    /documents.sql            # 文档相关查询
    /permissions.sql          # 权限相关查询
    # 注意：这里定义的 SQL 会被 sqlc 生成为 store/*.go

/web                          # 前端 React 应用
  /src
    /components               # React 组件
    /hooks                    # 自定义 Hook
    /services                 # API 客户端

/sqlc.yaml                    # sqlc 配置文件
```

### 关键说明

- **`/internal/store/xxx.sql.go`**：由 `sqlc generate` 自动生成，**禁止手修**
- **`/db/queries/*.sql`**：所有 SQL 查询的唯一来源
- **`/internal/core/*.go`**：直接导入 `internal/store` 并调用其方法

---

## 📂 项目结构假设

```text
/cmd          # 应用程序入口点
/internal     # 私有应用程序和库代码
  /api        # HTTP/WebSocket 处理程序
  /core       # 业务逻辑 (Services)
  /store      # 数据库访问 (Repositories - sqlc 生成的代码)
  /models     # 领域模型
/db           # 数据库相关
  /migrations # SQL 迁移文件
  /queries    # sqlc 查询文件
/web          # 前端 React 应用程序
  /src
    /components
    /hooks
    /services # API 客户端
```

---

## 📝 语气、响应风格与行为准则

- **简洁**：先给代码，后解释。
- **地道**：编写符合语言最佳实践的代码。
- **安全第一**：始终验证输入，尤其是文件操作和权限部分。
- **sqlc 第一**：遇到数据库功能需求，优先思考 SQL 和 sqlc，而非直接抄代码。
- **保持整洁**：
  - **禁止生成多余文档**：不要生成额外的测试报告、修复报告或说明文档。
  - **清理测试脚本**：如果生成了用于验证的测试脚本，必须在测试完成后自动删除，保持项目结构干净整洁。

### 数据库相关任务的标准流程

当需要实现新的数据库功能时：

1. ✅ **第一步**：在 `db/queries/*.sql` 中定义 SQL 查询（带 `-- name:` 注释）
2. ✅ **第二步**：运行 `sqlc generate` 生成 Go 代码
3. ✅ **第三步**：在 `internal/core/` 中编写 service 逻辑，调用生成的 sqlc 方法
4. ✅ **第四步**：在调用处进行必要的类型转换（string ↔ uuid.UUID）

### 反面案例（禁止）

❌ 直接在 Go 代码中使用 `db.Query()` 或 `db.Exec()`
❌ 在 store.go 中导入 database/sql 并写 SQL 操作
❌ 使用适配器模式替代直接的 sqlc 调用
❌ 在 core 层混合使用 uuid.UUID 和 string ID

### 正面案例（推荐）

✅ SQL 语句定义在 `db/queries/` 中
✅ store.go 只负责连接和事务
✅ core 层直接使用 sqlc 生成的方法
✅ 在 core 或 API 层进行 uuid.UUID ↔ string 转换
