# MarkdownHub 技术设计文档 (TDD)

---

## 1. 文档概述

### 1.1 文档信息

| 字段 | 内容 |
|------|------|
| 文档名称 | MarkdownHub 技术设计文档 |
| 版本号 | v1.0 |
| 创建日期 | 2026-03-20 |
| 作者 | 技术团队 |
| 状态 | ☐ 草稿 ☐ 评审中 ☑ 已发布 |
| 关联需求 | PRD.md v1.10 |

### 1.2 背景与目的

MarkdownHub 是一个面向研发团队、技术写作者和知识管理者的**实时同步协作 Markdown 编辑平台**。本技术设计文档旨在将产品需求转化为具体的技术实现方案，为开发团队提供明确的技术指导和开发标准。

**核心设计目标：**
- 支持多人实时协作编辑，毫秒级内容同步
- 实现精细的标题级权限控制体系
- 提供完整的版本快照和历史回溯能力
- 支持私有化部署，单二进制交付

### 1.3 适用范围

本 TDD 适用于 MarkdownHub 平台的后端 Go 服务、前端 React 应用、数据库设计及部署方案的规划和实现。

### 1.4 定义与缩写

| 术语 | 全称 | 定义 |
|------|------|------|
| Workspace | 工作空间 | 组织文档的顶层容器，类似文件夹概念 |
| Document | 文档 | Markdown 格式的编辑单元，支持无限层级子文档 |
| Heading Anchor | 标题锚点 | Markdown 标题的唯一标识符，用于标题级权限和评论定位 |
| Snapshot | 快照 | 文档在某个时间点的完整副本，用于版本历史 |
| Permission Level | 权限级别 | read/edit/manage 三种权限级别 |
| WebSocket | WebSocket | 浏览器与服务端双向通信协议，用于实时协作 |

---

## 2. 系统架构设计

### 2.1 架构概述

```mermaid
graph TB
    Client[Client Browser] --> |HTTP\/WebSocket| Server[MarkdownHub Server<br/>Go Binary]

    subgraph Server[MarkdownHub Server - Go]
        subgraph API[API Layer - Gin]
            REST[REST API Handlers]
            WS[WebSocket Handler]
            MW[Middleware Auth\/CSRF\/Log]
        end

        subgraph Service[Service Layer]
            Auth[AuthService]
            Doc[DocumentService]
            WS_[WorkspaceService]
            Perm[PermissionService]
            Snap[SnapshotService]
            Import[ImporterService]
            Attach[AttachmentService]
            Comment[CommentService]
            Export[ExportService]
            I18n[I18nService]
            AI[AIService]
            Role[RoleService]
            Dept[DepartmentService]
        end

        subgraph Data[Data Layer]
            SQLC[sqlc]
        end
    end

    SQLC --> DB[(PostgreSQL<br/>+ pgvector)]

    API --> Service
    Service --> Data
```

### 2.2 技术栈

| 层级 | 技术选型 | 版本 | 说明 |
|------|---------|------|------|
| 后端 | Go + Gin | 1.21+ | 高性能 HTTP 框架 |
| 前端 | React 18 + TypeScript | 18.x | 响应式协作编辑界面 |
| 构建工具 | Vite | 5.x | 快速前端构建 |
| 数据库 | PostgreSQL + pgvector | 15+ | 关系数据 + 向量检索(AI) |
| WebSocket | gorilla/websocket | 1.5+ | 实时协作通信 |
| ORM/查询 | sqlc | 1.25+ | 类型安全 SQL 代码生成 |
| 文件存储 | 本地文件系统 / S3 兼容 | - | 附件存储 |
| 部署 | 单二进制 + go:embed | - | 简化部署 |
| AI 接口 | OpenAI 兼容 API | - | AI 辅助功能 |

### 2.3 系统组件

| 组件名称 | 职责描述 | 部署方式 | 依赖组件 |
|---------|---------|---------|---------|
| MarkdownHub Server | 后端 API 服务，处理全部业务逻辑 | 单二进制 | PostgreSQL |
| PostgreSQL | 主数据库，存储所有业务数据 | Docker/云服务 | - |
| 前端静态资源 | React SPA 应用 | 嵌入二进制 | MarkdownHub Server |
| WebSocket Hub | 管理实时协作会话 | 内置于 Server | - |

### 2.4 架构决策

| 决策 ID | 问题描述 | 决策方案 | 备选方案 | 决策理由 |
|---------|---------|---------|---------|---------|
| AD-001 | 前后端分离 vs 单体交付 | 单二进制 + 前端嵌入 | 前后端分离部署 | 简化私有化部署流程，用户一键启动 |
| AD-002 | 实时协作同步策略 | WebSocket + OT 算法 | CRDT | Go 语言 OT 实现更成熟，冷启动性能优 |
| AD-003 | 数据库选型 | PostgreSQL + pgvector | MySQL + 插件 | pgvector 支持 AI 向量检索，JSON 支持完善 |
| AD-004 | 权限模型 | RBAC + 层级继承 | 单纯 ABAC | 配合组织架构同步，RBAC 更直观易管理 |
| AD-005 | Markdown 渲染 | 前端渲染 | 后端渲染 | 减轻服务端压力，支持离线预览 |

---

## 3. 数据库设计

### 3.1 数据库选型

**PostgreSQL 15+ with pgvector**

- 关系型数据存储，支持复杂查询
- pgvector 扩展支持 AI 向量检索
- JSON/JSONB 类型支持灵活配置
- 成熟的事务和并发控制

### 3.2 ER 图

```mermaid
erDiagram
    users ||--o{ workspaces : "owner"
    users ||--o{ workspace_members : ""
    workspaces ||--o{ workspace_members : ""
    workspaces ||--o{ documents : ""
    documents }o--|| document_permissions : ""
    documents ||--o{ document_permissions : ""
    documents ||--o{ heading_permissions : ""
    documents ||--o{ snapshots : ""
    documents ||--o{ attachments : ""
    documents ||--o{ comments : ""
    documents ||--o{ ai_conversations : ""
    ai_conversations ||--o{ ai_messages : ""

    users {
        bigint id PK
        string username UK
        string email
        string password
        boolean is_admin
        string avatar_url
        string lang
        bigint department_id FK
        timestamp created_at
        timestamp updated_at
    }

    departments {
        bigint id PK
        string name
        bigint parent_id FK
        string external_id
        timestamp created_at
    }

    roles {
        bigint id PK
        string name
        string description
        bigint workspace_id FK
        timestamp created_at
    }

    user_roles {
        bigint id PK
        bigint user_id FK
        bigint role_id FK
    }

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_ur_user | user_id | BTREE | 用户角色查询 |
| idx_ur_role | role_id | BTREE | 角色成员查询 |
| uk_ur_user_role | user_id, role_id | BTREE | 唯一约束 |

    social_accounts {
        bigint id PK
        bigint user_id FK
        string provider
        string external_user_id
        string external_nickname
        string access_token
        timestamp bound_at
    }

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_sa_user | user_id | BTREE | 用户查询 |
| idx_sa_provider | provider | BTREE | 第三方提供商查询 |
| idx_sa_external | external_user_id, provider | BTREE | 第三方用户查询 |
| uk_sa_user_provider | user_id, provider | BTREE | 用户+提供商唯一约束 |

    workspaces {
        bigint id PK
        bigint owner_id FK
        string name
        boolean is_public
        int sort_order
        timestamp created_at
        timestamp updated_at
    }

    workspace_members {
        bigint id PK
        bigint workspace_id FK
        bigint user_id FK
        string level
    }

    documents {
        bigint id PK
        bigint owner_id FK
        bigint workspace_id FK
        bigint parent_id FK
        string title
        text content
        string visibility
        boolean inherit_visibility
        int sort_order
        timestamp created_at
        timestamp updated_at
    }

    document_permissions {
        bigint id PK
        bigint document_id FK
        bigint user_id FK
        bigint role_id FK
        bigint department_id FK
        string level
        boolean inherit_to_children
        timestamp created_at
    }

    heading_permissions {
        bigint id PK
        bigint document_id FK
        bigint user_id FK
        string heading_anchor
        string level
    }

    snapshots {
        bigint id PK
        bigint document_id FK
        bigint author_id FK
        text content
        string message
        timestamp created_at
    }

    attachments {
        bigint id PK
        bigint workspace_id FK
        bigint upload_by FK
        string filename
        string file_type
        int file_size
        string file_path
        timestamp created_at
    }

    attachment_references {
        bigint id PK
        bigint attachment_id FK
        bigint document_id FK
        string markdown_position
        timestamp created_at
    }

    comments {
        bigint id PK
        bigint document_id FK
        bigint user_id FK
        string heading_anchor
        text content
        timestamp created_at
        timestamp updated_at
    }

    ai_conversations {
        bigint id PK
        bigint user_id FK
        bigint document_id FK
        timestamp created_at
    }

    ai_messages {
        bigint id PK
        bigint conversation_id FK
        string role
        text content
        timestamp created_at
    }

    operation_logs {
        bigint id PK
        bigint user_id FK
        string action
        string target_type
        bigint target_id FK
        jsonb details
        timestamp created_at
    }
```

### 3.3 表结构设计

#### 3.3.1 用户表 (users)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| username | VARCHAR(20) | UNIQUE, NOT NULL | 用户名，3-20字符 |
| email | VARCHAR(255) | UNIQUE | 邮箱，可选 |
| password | VARCHAR(255) | NOT NULL | bcrypt 哈希密码 |
| is_admin | BOOLEAN | DEFAULT false | 是否管理员 |
| avatar_url | VARCHAR(500) | | 头像 URL |
| lang | VARCHAR(10) | DEFAULT 'zh-CN' | 界面语言 |
| department_id | BIGINT | FK departments(id) | 所属部门 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_users_username | username | BTREE | 用户名查询 |
| idx_users_email | email | BTREE | 邮箱查询 |
| idx_users_department | department_id | BTREE | 部门查询 |
| idx_users_is_admin | is_admin | BTREE | 管理员查询 |

#### 3.3.2 部门表 (departments)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| name | VARCHAR(100) | NOT NULL | 部门名称 |
| parent_id | BIGINT | FK departments(id) | 上级部门，支持无限层级 |
| external_id | VARCHAR(100) | | 第三方组织架构ID |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_departments_parent | parent_id | BTREE | 层级查询 |
| idx_departments_external | external_id | BTREE | 第三方同步 |

#### 3.3.4 角色表 (roles)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| name | VARCHAR(50) | NOT NULL | 角色名称 |
| description | VARCHAR(255) | | 角色描述 |
| workspace_id | BIGINT | FK workspaces(id), NULL | 所属工作空间，NULL为系统内置角色 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_roles_workspace | workspace_id | BTREE | 工作空间角色查询 |
| uk_roles_workspace_name | workspace_id, name | BTREE | 工作空间内角色名唯一 |

#### 3.3.3 工作空间表 (workspaces)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| owner_id | BIGINT | FK users(id) | 所有者 |
| name | VARCHAR(100) | NOT NULL | 名称 |
| is_public | BOOLEAN | DEFAULT false | 是否公开 |
| sort_order | INT | DEFAULT 0 | 排序顺序 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_workspaces_owner | owner_id | BTREE | 所有者查询 |
| idx_workspaces_public | is_public | BTREE | 公开查询 |

#### 3.3.4 工作空间成员表 (workspace_members)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| workspace_id | BIGINT | FK workspaces(id) | 工作空间 |
| user_id | BIGINT | FK users(id) | 用户 |
| level | VARCHAR(20) | NOT NULL | read/edit/manage |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_wm_workspace | workspace_id | BTREE | 工作空间成员查询 |
| idx_wm_user | user_id | BTREE | 用户参与的工作空间 |
| uk_wm_workspace_user | workspace_id, user_id | BTREE | 唯一约束 |

#### 3.3.5 文档表 (documents)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| owner_id | BIGINT | FK users(id) | 所有者 |
| workspace_id | BIGINT | FK workspaces(id) | 所属工作空间 |
| parent_id | BIGINT | FK documents(id) | 父文档，支持无限层级 |
| title | VARCHAR(255) | NOT NULL | 标题 |
| content | TEXT | | Markdown 内容 |
| visibility | VARCHAR(20) | DEFAULT 'internal' | public/internal |
| inherit_visibility | BOOLEAN | DEFAULT true | 是否继承父节点可见性 |
| sort_order | INT | DEFAULT 0 | 排序顺序 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_docs_workspace | workspace_id | BTREE | 工作空间文档查询 |
| idx_docs_parent | parent_id | BTREE | 子文档查询 |
| idx_docs_owner | owner_id | BTREE | 所有者查询 |
| idx_docs_visibility | visibility | BTREE | 可见性查询 |
| idx_docs_workspace_parent | workspace_id, parent_id | BTREE | 树形结构查询 |
| idx_docs_deleted | is_deleted | BTREE | 软删除查询 |
| idx_docs_updated | updated_at | BTREE | 更新时间排序 |

#### 3.3.6 文档权限表 (document_permissions)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| document_id | BIGINT | FK documents(id) | 文档 |
| user_id | BIGINT | FK users(id), NULL | 用户授权 |
| role_id | BIGINT | FK roles(id), NULL | 角色授权 |
| department_id | BIGINT | FK departments(id), NULL | 部门授权 |
| level | VARCHAR(20) | NOT NULL | read/edit/manage |
| inherit_to_children | BOOLEAN | DEFAULT true | 是否继承给子节点 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_dp_document | document_id | BTREE | 文档权限查询 |
| idx_dp_user | user_id | BTREE | 用户权限查询 |

#### 3.3.7 标题权限表 (heading_permissions)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| document_id | BIGINT | FK documents(id) | 文档 |
| user_id | BIGINT | FK users(id) | 用户 |
| heading_anchor | VARCHAR(100) | NOT NULL | 标题锚点 |
| level | VARCHAR(20) | NOT NULL | read/edit |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_hp_document | document_id | BTREE | 文档标题权限 |
| idx_hp_user_document | user_id, document_id | BTREE | 用户文档权限查询 |

#### 3.3.8 快照表 (snapshots)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| document_id | BIGINT | FK documents(id) | 文档 |
| author_id | BIGINT | FK users(id) | 作者 |
| content | TEXT | NOT NULL | 快照内容 |
| message | VARCHAR(255) | | 快照描述 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_snapshots_document | document_id | BTREE | 文档快照查询 |
| idx_snapshots_author | author_id | BTREE | 作者快照查询 |
| idx_snapshots_created | created_at | BTREE | 时间排序 |

#### 3.3.9 附件表 (attachments)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| workspace_id | BIGINT | FK workspaces(id) | 工作空间 |
| upload_by | BIGINT | FK users(id) | 上传者 |
| filename | VARCHAR(255) | NOT NULL | 文件名 |
| file_type | VARCHAR(100) | NOT NULL | 文件类型 |
| file_size | INT | NOT NULL | 文件大小(字节) |
| file_path | VARCHAR(500) | NOT NULL | 存储路径 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_attachments_workspace | workspace_id | BTREE | 工作空间附件查询 |

#### 3.3.10 附件引用表 (attachment_references)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| attachment_id | BIGINT | FK attachments(id) | 附件 |
| document_id | BIGINT | FK documents(id) | 引用文档 |
| markdown_position | VARCHAR(50) | | Markdown 位置标记 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_ar_attachment | attachment_id | BTREE | 附件引用查询 |
| idx_ar_document | document_id | BTREE | 文档引用查询 |

#### 3.3.11 评论表 (comments)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| document_id | BIGINT | FK documents(id) | 文档 |
| user_id | BIGINT | FK users(id) | 用户 |
| heading_anchor | VARCHAR(100) | | 关联标题，空表示文档级评论 |
| content | TEXT | NOT NULL | 评论内容 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |
| updated_at | TIMESTAMP | DEFAULT NOW() | 更新时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_comments_document | document_id | BTREE | 文档评论查询 |
| idx_comments_heading | document_id, heading_anchor | BTREE | 标题评论查询 |

#### 3.3.12 AI 对话会话表 (ai_conversations)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| user_id | BIGINT | FK users(id) | 用户 |
| document_id | BIGINT | FK documents(id) | 关联文档 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_ai_conv_user | user_id | BTREE | 用户对话查询 |
| idx_ai_conv_document | document_id | BTREE | 文档对话查询 |

#### 3.3.13 AI 消息表 (ai_messages)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| conversation_id | BIGINT | FK ai_conversations(id) | 会话 |
| role | VARCHAR(20) | NOT NULL | user/assistant |
| content | TEXT | NOT NULL | 消息内容 |
| created_at | TIMESTAMP | DEFAULT NOW() | 创建时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_ai_msg_conversation | conversation_id | BTREE | 会话消息查询 |

#### 3.3.14 操作日志表 (operation_logs)

| 字段名 | 类型 | 约束 | 说明 |
|-------|------|------|------|
| id | BIGSERIAL | PK | 主键 |
| user_id | BIGINT | FK users(id) | 操作用户 |
| action | VARCHAR(50) | NOT NULL | 操作类型 |
| target_type | VARCHAR(50) | | 目标类型 |
| target_id | BIGINT | | 目标 ID |
| details | JSONB | | 详细信息 |
| created_at | TIMESTAMP | DEFAULT NOW() | 操作时间 |

**索引设计:**

| 索引名 | 字段 | 类型 | 说明 |
|-------|------|------|------|
| idx_logs_user | user_id | BTREE | 用户操作查询 |
| idx_logs_created | created_at | BTREE | 时间范围查询 |
| idx_logs_action | action | BTREE | 操作类型查询 |

### 3.4 数据库迁移策略

**迁移工具**: golang-migrate

**迁移文件命名规范**: `{version}_{description}.up.sql` / `{version}_{description}.down.sql`

**版本管理**:
- 所有表创建使用 `CREATE TABLE IF NOT EXISTS`
- 敏感字段修改使用 `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
- 回滚脚本必须完整还原数据结构

**备份策略**:
- 每日凌晨 3:00 自动全量备份
- 保留最近 30 天备份
- 重要操作前手动备份

---

## 4. API 接口设计

### 4.1 API 规范

- **协议**: RESTful HTTP/HTTPS
- **数据格式**: JSON
- **认证方式**: JWT Bearer Token
- **版本策略**: URL 路径版本 (`/api/v1/`)
- **错误格式**: 统一错误响应

**统一响应格式**:

```json
{
  "code": 200,
  "message": "success",
  "data": {}
}
```

**错误响应格式**:

```json
{
  "code": 400,
  "message": "参数错误",
  "error": "详细错误信息"
}
```

### 4.2 接口列表

#### 4.2.1 认证模块 (Auth)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 用户注册 | POST | /api/v1/auth/register | 用户名密码注册 |
| 用户登录 | POST | /api/v1/auth/login | 用户名密码登录 |
| 获取当前用户 | GET | /api/v1/auth/me | 获取登录用户信息 |
| 获取钉钉二维码 | GET | /api/v1/auth/social/dingtalk/qr | 获取钉钉登录二维码 |
| 获取企微二维码 | GET | /api/v1/auth/social/wecom/qr | 获取企业微信登录二维码 |
| 获取飞书二维码 | GET | /api/v1/auth/social/feishu/qr | 获取飞书登录二维码 |
| 第三方回调 | GET | /api/v1/auth/social/callback/:provider | 第三方登录回调 |
| 绑定第三方账号 | POST | /api/v1/auth/social/bind | 绑定第三方账号 |
| 解绑第三方账号 | DELETE | /api/v1/auth/social/bind/:provider | 解除绑定 |
| 获取已绑定账号 | GET | /api/v1/auth/social/accounts | 获取绑定列表 |
| 检查完善状态 | GET | /api/v1/auth/me/complete-status | 检查是否需完善信息 |
| 完善账号信息 | POST | /api/v1/auth/complete-profile | 首次第三方登录完善信息 |

**API 请求/响应示例**:

**POST /api/v1/auth/register**
```json
// 请求
{
  "username": "alice",
  "password": "password123",
  "email": "alice@example.com"
}

// 成功响应 (201)
{
  "code": 201,
  "message": "注册成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "alice",
      "email": "alice@example.com",
      "is_admin": false,
      "lang": "zh-CN"
    }
  }
}

// 错误响应 (409 - 用户名已存在)
{
  "code": 409,
  "message": "用户名已存在",
  "error": "ErrUserExists"
}
```

**POST /api/v1/auth/login**
```json
// 请求
{
  "username": "alice",
  "password": "password123"
}

// 成功响应 (200)
{
  "code": 200,
  "message": "登录成功",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "id": 1,
      "username": "alice",
      "email": "alice@example.com",
      "is_admin": false,
      "lang": "zh-CN"
    }
  }
}

// 错误响应 (401 - 用户名或密码错误)
{
  "code": 401,
  "message": "用户名或密码错误",
  "error": "ErrInvalidCredentials"
}
```

**GET /api/v1/auth/me/complete-status**
```json
// 成功响应 (200) - 需要完善信息
{
  "code": 200,
  "message": "success",
  "data": {
    "need_complete": true,
    "missing_fields": ["username", "password"]
  }
}

// 成功响应 (200) - 已完善
{
  "code": 200,
  "message": "success",
  "data": {
    "need_complete": false,
    "missing_fields": []
  }
}
```

#### 4.2.2 工作空间模块 (Workspace)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 列出工作空间 | GET | /api/v1/workspaces | 获取用户工作空间列表 |
| 创建工作空间 | POST | /api/v1/workspaces | 创建新工作空间 |
| 获取工作空间 | GET | /api/v1/workspaces/:id | 获取工作空间详情 |
| 更新工作空间 | PUT | /api/v1/workspaces/:id | 更新工作空间信息 |
| 删除工作空间 | DELETE | /api/v1/workspaces/:id | 删除工作空间 |
| 设置公开状态 | PUT | /api/v1/workspaces/:id/public | 设置是否公开 |
| 调整排序 | PUT | /api/v1/workspaces/:id/reorder | 调整显示顺序 |
| 获取成员列表 | GET | /api/v1/workspaces/:id/members | 获取成员列表 |
| 获取文档树 | GET | /api/v1/workspaces/:id/tree | 获取文档树形结构 |
| 添加成员 | PUT | /api/v1/workspaces/:id/members | 添加工作空间成员 |
| 移除成员 | DELETE | /api/v1/workspaces/:id/members/:user_id | 移除成员 |

#### 4.2.3 文档模块 (Document)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 列出文档 | GET | /api/v1/documents | 获取文档列表 |
| 创建文档 | POST | /api/v1/documents | 创建新文档 |
| 获取文档 | GET | /api/v1/documents/:id | 获取文档详情 |
| 获取原文 | GET | /api/v1/documents/:id/raw | 获取原始 Markdown |
| 更新内容 | PUT | /api/v1/documents/:id/content | 更新文档内容 |
| 更新标题 | PUT | /api/v1/documents/:id/title | 更新文档标题 |
| 设置可见性 | PUT | /api/v1/documents/:id/visibility | 设置公开/内部 |
| 获取可见性 | GET | /api/v1/documents/:id/visibility | 获取可见性配置 |
| 删除文档 | DELETE | /api/v1/documents/:id | 删除文档 |
| 调整顺序 | PUT | /api/v1/documents/:id/reorder | 调整排序 |
| 获取标题列表 | GET | /api/v1/documents/:id/headings | 获取文档标题 |
| 获取子文档 | GET | /api/v1/documents/:id/children | 获取子文档列表 |
| 获取子树 | GET | /api/v1/documents/:id/tree | 获取完整子树 |
| 移动文档 | PUT | /api/v1/documents/:id/move | 移动文档位置 |
| 公开文档列表 | GET | /api/v1/documents/public | 获取公开文档 |
| 搜索文档 | GET | /api/v1/search | 全文搜索 |

**API 请求/响应示例**:

**POST /api/v1/documents**
```json
// 请求
{
  "workspace_id": 1,
  "title": "新文档",
  "content": "# 新文档\n\n这是文档内容",
  "parent_id": null
}

// 成功响应 (201)
{
  "code": 201,
  "message": "创建成功",
  "data": {
    "id": 10,
    "workspace_id": 1,
    "title": "新文档",
    "content": "# 新文档\n\n这是文档内容",
    "parent_id": null,
    "visibility": "internal",
    "inherit_visibility": true,
    "sort_order": 0,
    "owner_id": 1,
    "created_at": "2026-03-23T10:00:00Z",
    "updated_at": "2026-03-23T10:00:00Z"
  }
}
```

**PUT /api/v1/documents/:id/visibility**
```json
// 请求
{
  "visibility": "public",
  "inherit_visibility": false
}

// 成功响应 (200)
{
  "code": 200,
  "message": "设置成功",
  "data": {
    "visibility": "public",
    "inherit_visibility": false
  }
}
```

**GET /api/v1/documents/:id/visibility**
```json
// 成功响应 (200)
{
  "code": 200,
  "message": "success",
  "data": {
    "visibility": "public",
    "inherit_visibility": false,
    "effective_visibility": "public",
    "inherited_from": null
  }
}
```

**GET /api/v1/search?q=关键词**
```json
// 成功响应 (200)
{
  "code": 200,
  "message": "success",
  "data": {
    "results": [
      {
        "id": 1,
        "title": "Markdown使用指南",
        "excerpt": "...匹配的<em>关键词</em>内容...",
        "workspace_id": 1,
        "workspace_name": "技术文档",
        "score": 0.95
      }
    ],
    "total": 1
  }
}
```

#### 4.2.4 权限模块 (Permission)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 获取文档权限 | GET | /api/v1/documents/:id/permissions | 获取权限列表 |
| 添加权限 | POST | /api/v1/documents/:id/permissions | 添加权限规则 |
| 更新权限 | PUT | /api/v1/documents/:id/permissions/:permission_id | 更新权限 |
| 删除权限 | DELETE | /api/v1/documents/:id/permissions/:permission_id | 删除权限规则 |
| 清除所有权限 | DELETE | /api/v1/documents/:id/permissions | 一键清除所有权限 |
| 获取继承权限 | GET | /api/v1/documents/:id/permissions/inherited | 获取继承的权限 |
| 设置标题权限 | PUT | /api/v1/documents/:id/permissions/:user_id/headings/:anchor | 设置标题级权限 |

**API 请求/响应示例**:

**POST /api/v1/documents/:id/permissions**
```json
// 请求 - 用户授权
{
  "type": "user",
  "grantee_id": 5,
  "level": "edit",
  "inherit_to_children": true
}

// 请求 - 角色授权
{
  "type": "role",
  "grantee_id": 2,
  "level": "read",
  "inherit_to_children": false
}

// 请求 - 部门授权
{
  "type": "department",
  "grantee_id": 3,
  "level": "read",
  "inherit_to_children": true
}

// 成功响应 (201)
{
  "code": 201,
  "message": "权限设置成功",
  "data": {
    "id": 15,
    "document_id": 10,
    "type": "user",
    "grantee_id": 5,
    "level": "edit",
    "inherit_to_children": true,
    "created_at": "2026-03-23T10:00:00Z"
  }
}
```

**DELETE /api/v1/documents/:id/permissions**
```json
// 成功响应 (200)
{
  "code": 200,
  "message": "所有权限已清除",
  "data": {
    "success": true,
    "inherited_from": 5
  }
}
```

**GET /api/v1/documents/:id/permissions/inherited**
```json
// 成功响应 (200)
{
  "code": 200,
  "message": "success",
  "data": {
    "inherited_permissions": [
      {
        "document_id": 5,
        "document_title": "父文档",
        "level": "edit",
        "source": "direct"
      },
      {
        "document_id": 1,
        "document_title": "根文档",
        "level": "read",
        "source": "inherited"
      }
    ]
  }
}
```

#### 4.2.5 快照模块 (Snapshot)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 列出快照 | GET | /api/v1/snapshots | 获取快照列表 |
| 创建快照 | POST | /api/v1/snapshots | 手动创建快照 |
| 恢复快照 | POST | /api/v1/snapshots/:id/restore | 恢复到指定快照 |
| 对比差异 | GET | /api/v1/snapshots/:id/diff | 对比两个快照 |

**API 请求/响应示例**:

**GET /api/v1/snapshots?document_id=10**
```json
// 成功响应 (200)
{
  "code": 200,
  "message": "success",
  "data": {
    "snapshots": [
      {
        "id": 25,
        "document_id": 10,
        "author_id": 1,
        "author_name": "alice",
        "message": "手动快照",
        "created_at": "2026-03-23T12:00:00Z"
      },
      {
        "id": 24,
        "document_id": 10,
        "author_id": 1,
        "author_name": "alice",
        "message": "自动快照",
        "created_at": "2026-03-23T11:55:00Z"
      }
    ],
    "total": 2
  }
}
```

**GET /api/v1/snapshots/:id/diff?compare_id=24**
```json
// 成功响应 (200)
{
  "code": 200,
  "message": "success",
  "data": {
    "snapshot_id": 25,
    "compare_id": 24,
    "diff": [
      {
        "type": "delete",
        "line": 5,
        "content": "删除的内容"
      },
      {
        "type": "insert",
        "line": 5,
        "content": "新增的内容"
      }
    ]
  }
}
```

#### 4.2.6 附件模块 (Attachment)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 上传附件 | POST | /api/v1/attachments | 上传文件 |
| 列出附件 | GET | /api/v1/attachments | 获取附件列表 |
| 获取附件 | GET | /api/v1/attachments/:id | 获取附件详情 |
| 添加引用 | POST | /api/v1/attachments/:id/references | 引用到文档 |
| 移除引用 | DELETE | /api/v1/attachments/:id/references/:document_id | 移除引用 |
| 获取引用列表 | GET | /api/v1/attachments/:id/references | 获取引用文档 |
| 删除附件 | DELETE | /api/v1/attachments/:id | 删除附件 |
| 下载附件 | GET | /api/v1/attachments/:id/download | 下载附件 |

#### 4.2.7 导入模块 (Import)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| URL 导入 | POST | /api/v1/import/url | 从 URL 导入 |
| 内容导入 | POST | /api/v1/import/content | 从 HTML 内容导入 |

#### 4.2.8 角色模块 (Role)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 列出角色 | GET | /api/v1/workspaces/:id/roles | 获取角色列表 |
| 创建角色 | POST | /api/v1/workspaces/:id/roles | 创建角色 |
| 更新角色 | PUT | /api/v1/workspaces/:id/roles/:role_id | 更新角色 |
| 删除角色 | DELETE | /api/v1/workspaces/:id/roles/:role_id | 删除角色 |
| 角色成员 | GET | /api/v1/workspaces/:id/roles/:role_id/members | 获取角色成员 |
| 添加成员 | POST | /api/v1/workspaces/:id/roles/:role_id/members | 添加角色成员 |
| 移除成员 | DELETE | /api/v1/workspaces/:id/roles/:role_id/members/:user_id | 移除角色成员 |

#### 4.2.9 部门模块 (Department)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 列出部门 | GET | /api/v1/departments | 获取部门列表 |
| 部门树 | GET | /api/v1/departments/tree | 获取完整部门树 |
| 同步部门 | POST | /api/v1/departments/sync | 同步第三方部门 |
| 部门成员 | GET | /api/v1/departments/:id/members | 获取部门成员 |

#### 4.2.10 评论模块 (Comment)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 获取评论 | GET | /api/v1/documents/:id/comments | 获取文档评论 |
| 添加评论 | POST | /api/v1/documents/:id/comments | 添加评论 |
| 更新评论 | PUT | /api/v1/comments/:id | 更新评论 |
| 删除评论 | DELETE | /api/v1/comments/:id | 删除评论 |

#### 4.2.11 导出模块 (Export)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 导出 PDF | POST | /api/v1/documents/:id/export/pdf | 导出 PDF |
| 批量导出 | POST | /api/v1/documents/:id/export/zip | 导出 ZIP |

#### 4.2.12 多语言模块 (i18n)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 获取翻译 | GET | /api/v1/i18n/:lang | 获取语言包 |
| 设置语言 | PUT | /api/v1/me/lang | 设置界面语言 |

#### 4.2.13 AI 模块 (AI)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 智能问答 | POST | /api/v1/ai/ask | Ask AI 问答 |
| 内容总结 | POST | /api/v1/ai/summarize | 生成摘要 |
| 内容扩写 | POST | /api/v1/ai/expand | 扩展内容 |
| 文档补全 | POST | /api/v1/ai/complete | 补全写作 |
| 对话历史 | GET | /api/v1/ai/conversations | 获取对话列表 |
| 对话详情 | GET | /api/v1/ai/conversations/:id | 获取对话详情 |

#### 4.2.14 管理员模块 (Admin)

| 接口名称 | 请求方法 | 路径 | 描述 |
|---------|---------|------|------|
| 用户列表 | GET | /api/v1/admin/users | 分页用户列表 |
| 设置管理员 | PUT | /api/v1/admin/users/:id/admin | 提升/撤销管理员 |
| 删除用户 | DELETE | /api/v1/admin/users/:id | 删除用户 |
| 重置密码 | PUT | /api/v1/admin/users/:id/password | 重置密码 |
| 更新邮箱 | PUT | /api/v1/admin/users/:id/email | 更新邮箱 |
| 操作日志 | GET | /api/v1/admin/logs | 获取操作日志 |
| 获取站点标题 | GET | /api/v1/admin/site-title | 获取站点标题 |
| 设置站点标题 | PUT | /api/v1/admin/site-title | 设置站点标题 |

### 4.3 WebSocket 接口

**连接地址**: `ws://host/ws?document_id=xxx`

**认证**: HTTP Header `Authorization: Bearer <token>`

**客户端 → 服务端消息**:

```json
// 加入文档协作
{ "type": "join", "document_id": 123 }

// 离开文档协作
{ "type": "leave", "document_id": 123 }

// 编辑内容
{ "type": "edit", "document_id": 123, "line": 5, "content": "new content" }

// 光标位置
{ "type": "cursor", "document_id": 123, "line": 5, "column": 10 }

// 心跳检测（客户端主动发送）
{ "type": "ping" }
```

**服务端 → 客户端消息**:

```json
// 用户加入
{ "type": "user_joined", "user_id": 1, "username": "alice" }

// 用户离开
{ "type": "user_left", "user_id": 1 }

// 内容编辑
{ "type": "edit", "user_id": 1, "line": 5, "content": "new content" }

// 光标更新
{ "type": "cursor", "user_id": 1, "line": 5, "column": 10 }

// 同步全量内容
{ "type": "sync", "content": "full document content" }

// 心跳响应
{ "type": "pong" }

// 错误消息
{
  "type": "error",
  "code": 403,
  "message": "无文档访问权限"
}

// 权限不足错误
{
  "type": "error",
  "code": 403,
  "message": "编辑权限不足"
}

// 文档不存在错误
{
  "type": "error",
  "code": 404,
  "message": "文档不存在"
}
```

**心跳检测机制**:
- 客户端每 54 秒发送一次 `ping` 消息（实际实现：`pongWait * 9 / 10 = 54s`）
- 服务端收到后响应 `pong` 消息
- 若 60 秒内无任何消息，服务器主动断开连接（`pongWait = 60s`）
- WebSocket 连接超时时间为 60 秒
- 消息最大大小限制：512KB

**断线重连策略**:
1. 客户端检测到 WebSocket 连接断开后，等待 1 秒后尝试第一次重连
2. 如果失败，指数退避重试：2秒、4秒、8秒、16秒、32秒
3. 最大重试间隔为 32 秒，最多重试 10 次
4. 重连成功后，服务器发送 `init` 消息包含当前文档完整内容
5. 客户端需要重新同步光标位置和编辑状态

**WebSocket 连接参数**:
```go
const (
    writeWait      = 10 * time.Second  // 写操作超时
    pongWait       = 60 * time.Second  // 等待pong响应超时
    pingPeriod     = 54 * time.Second  // 发送ping间隔
    maxMessageSize = 512 * 1024        // 512KB 最大消息
)
```

### 4.4 错误码设计

#### 4.4.1 HTTP 状态码定义

| 错误码 | HTTP 状态码 | 说明 | 解决方案 |
|-------|------------|------|---------|
| 200 | 200 | 成功 | - |
| 201 | 201 | 创建成功 | - |
| 204 | 204 | 删除成功 | - |
| 400 | 400 | 参数错误 | 检查请求参数格式 |
| 401 | 401 | 未认证 | 登录获取 Token |
| 403 | 403 | 无权限 | 检查文档访问权限 |
| 404 | 404 | 资源不存在 | 检查资源 ID |
| 409 | 409 | 冲突 | 如用户名已存在 |
| 422 | 422 | 验证失败 | 检查字段约束 |
| 429 | 429 | 请求过于频繁 | 降低请求频率 |
| 500 | 500 | 服务器错误 | 联系技术支持 |

#### 4.4.2 业务错误码定义 (errcode + errmsg)

**认证模块 (Auth)**:

| errcode | errmsg | 说明 |
|---------|--------|------|
| AUTH_USER_EXISTS | 用户名已存在 | 注册时用户名冲突 |
| AUTH_INVALID_CREDENTIALS | 用户名或密码错误 | 登录凭证无效 |
| AUTH_USER_NOT_FOUND | 用户不存在 | 查找用户失败 |
| AUTH_EMAIL_ALREADY_BOUND | 邮箱已被其他用户绑定 | 第三方登录绑定冲突 |
| AUTH_INVALID_TOKEN | Token无效或已过期 | Token验证失败 |
| AUTH_SOCIAL_BIND_FAILED | 第三方绑定失败 | 社交账号绑定操作失败 |
| AUTH_USERNAME_TAKEN | 用户名已被占用 | 用户名检查冲突 |
| AUTH_WEAK_PASSWORD | 密码强度不足 | 密码不符合要求 |

**文档模块 (Document)**:

| errcode | errmsg | 说明 |
|---------|--------|------|
| DOC_NOT_FOUND | 文档不存在 | 文档ID不存在 |
| DOC_NO_READ_PERMISSION | 无读取权限 | 用户无文档阅读权限 |
| DOC_NO_WRITE_PERMISSION | 无写入权限 | 用户无文档编辑权限 |
| DOC_NO_MANAGE_PERMISSION | 无管理权限 | 用户无文档管理权限 |
| DOC_INVALID_PARENT | 父文档不存在或形成循环引用 | 父文档ID无效 |
| DOC_MOVE_TO_CHILD | 不能将文档移动到自己的子文档下 | 移动目标无效 |
| DOC_WORKSPACE_NOT_FOUND | 工作空间不存在 | 工作空间ID不存在 |
| DOC_INVALID_VISIBILITY | 无效的可见性设置 | visibility值非法 |

**权限模块 (Permission)**:

| errcode | errmsg | 说明 |
|---------|--------|------|
| PERM_DENIED | 权限不足 | 用户权限级别不够 |
| PERM_NOT_FOUND | 权限规则不存在 | 权限ID不存在 |
| PERM_INVALID_GRANTEE_TYPE | 无效的授权对象类型 | grantee_type非法 |
| PERM_INVALID_LEVEL | 无效的权限级别 | level值非法 |
| PERM_CANNOT_MODIFY_OWNER | 不能修改所有者的权限 | 所有者权限不可修改 |
| PERM_HEADING_NOT_FOUND | 指定的标题不存在 | heading_anchor无效 |

**快照模块 (Snapshot)**:

| errcode | errmsg | 说明 |
|---------|--------|------|
| SNAP_NOT_FOUND | 快照不存在 | 快照ID不存在 |
| SNAP_NO_PERMISSION | 无快照访问权限 | 用户无快照访问权限 |
| SNAP_COMPARE_SAME | 不能对比同一快照 | compare_id与snapshot_id相同 |
| SNAP_NOT_FOUND_FOR_DIFF | 对比的快照不存在 | compare_id无效 |

**附件模块 (Attachment)**:

| errcode | errmsg | 说明 |
|---------|--------|------|
| ATTACH_NOT_FOUND | 附件不存在 | 附件ID不存在 |
| ATTACH_FILE_TOO_LARGE | 文件大小超过限制 | 超出100MB限制 |
| ATTACH_FILE_TYPE_NOT_ALLOWED | 文件类型不允许 | 文件类型不在白名单 |
| ATTACH_NO_UPLOAD_PERMISSION | 无上传权限 | 用户无工作空间上传权限 |
| ATTACH_NOT_OWNER | 不是上传者，无法管理引用 | 操作者不是文件上传者 |
| ATTACH_WORKSPACE_STORAGE_FULL | 工作空间存储已满 | 存储配额超限 |
| ATTACH_REFERENCE_NOT_FOUND | 引用关系不存在 | 引用ID不存在 |

**AI 模块 (AI)**:

| errcode | errmsg | 说明 |
|---------|--------|------|
| AI_NOT_CONFIGURED | AI服务未配置 | 未设置AI API密钥 |
| AI_REQUEST_FAILED | AI请求失败 | AI服务响应错误 |
| AI_QUOTA_EXCEEDED | AI配额超限 | API配额用尽 |
| AI_INVALID_RESPONSE | AI响应格式错误 | AI返回数据解析失败 |
| AI_DOC_NOT_ACCESSIBLE | 文档无权限访问 | 问答时使用无权限文档 |
| AI_CONVERSATION_NOT_FOUND | 对话不存在 | 对话ID不存在 |

**WebSocket 错误码**:

| errcode | 说明 |
|---------|------|
| 1001 | 无效的消息格式 |
| 1002 | 未认证或Token无效 |
| 1003 | 文档不存在 |
| 1004 | 无访问权限 |
| 1005 | 连接数超限 |
| 1006 | 连接超时 |

#### 4.4.3 数据库约束错误映射

| Constraint Name | HTTP状态码 | errcode | errmsg |
|----------------|------------|---------|--------|
| users_username_key | 409 | AUTH_USERNAME_TAKEN | 用户名已存在 |
| users_email_key | 409 | AUTH_EMAIL_ALREADY_BOUND | 邮箱已被其他用户绑定 |
| workspaces_owner_id_name_key | 409 | AUTH_WORKSPACE_NAME_EXISTS | 工作空间名称已存在 |
| workspace_members_workspace_id_user_id_key | 409 | AUTH_WORKSPACE_MEMBER_EXISTS | 用户已在此工作空间中 |
| document_permissions_document_id_user_id_key | 409 | PERM_DOC_PERMISSION_EXISTS | 协作者权限已存在 |
| heading_permissions_document_id_user_id_heading_anchor_key | 409 | PERM_HEADING_PERMISSION_EXISTS | 标题权限已存在 |
| attachments_document_id_file_path_key | 409 | ATTACH_EXISTS | 附件已存在 |

### 4.5 API 限流策略

| 接口类型 | 限流规则 | 窗口 |
|---------|---------|------|
| 登录接口 | 5 次/分钟 | 滑动窗口 |
| 写入接口 | 60 次/分钟 | 滑动窗口 |
| 读取接口 | 120 次/分钟 | 滑动窗口 |
| WebSocket | 100 消息/分钟 | 滑动窗口 |

**限流实现细节**:
- 使用滑动窗口算法实现精确限流
- 限流计数器存储在内存中（单机部署）
- 分布式部署时建议使用 Redis 共享限流状态
- 限流触发时返回 HTTP 429 状态码
- 响应头包含 `X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset`

**各接口具体限流配置**:

| 接口路径 | 限制 | 窗口 |
|---------|------|------|
| POST /api/auth/login | 5次/分钟 | 滑动窗口 |
| POST /api/auth/register | 3次/分钟 | 滑动窗口 |
| PATCH /api/documents/*/content | 60次/分钟 | 滑动窗口 |
| POST /api/documents | 30次/分钟 | 滑动窗口 |
| DELETE /api/documents/* | 20次/分钟 | 滑动窗口 |
| GET /api/* | 120次/分钟 | 滑动窗口 |
| WebSocket /ws | 100消息/分钟 | 滑动窗口 |

---

## 5. 模块设计

### 5.1 模块架构

```mermaid
graph LR
    subgraph API_Layer[Gin API Layer]
        AuthHandler
        WorkspaceHandler
        DocumentHandler
        PermissionHandler
        SnapshotHandler
        AttachmentHandler
        CommentHandler
        ExportHandler
        AIHandler
        AdminHandler
    end

    subgraph Service_Layer[Service Layer]
        AuthService
        WorkspaceService
        DocumentService
        PermissionService
        SnapshotService
        AttachmentService
        CommentService
        ExportService
        AIService
        AdminService
        I18nService
        RoleService
        DepartmentService
    end

    subgraph Data_Layer[Data Layer]
        sqlc
        PostgreSQL
        FileStorage
    end

    API_Layer --> Service_Layer
    Service_Layer --> Data_Layer
```

### 5.2 核心模块

#### 5.2.1 AuthService - 认证服务

**职责**: 用户认证、第三方登录、JWT Token 管理

**对外接口**:

| 接口 | 说明 | 调用方 |
|-----|------|-------|
| Register(username, password, email) | 用户注册 | AuthHandler |
| Login(username, password) | 用户登录 | AuthHandler |
| ValidateToken(token) | 验证 Token | Middleware |
| SocialLogin(provider, code) | 第三方登录 | AuthHandler |
| BindSocial(userID, provider, code) | 绑定第三方账号 | AuthHandler |
| CompleteProfile(userID, username, password) | 完善账号信息 | AuthHandler |

**异常处理**:

| 异常类型 | HTTP状态码 | 错误码 | 说明 |
|---------|-----------|--------|------|
| ErrUserExists | 409 | USER_EXISTS | 用户名已存在 |
| ErrInvalidCredentials | 401 | INVALID_CREDENTIALS | 用户名或密码错误 |
| ErrUserNotFound | 404 | USER_NOT_FOUND | 用户不存在 |
| ErrEmailAlreadyBound | 409 | EMAIL_ALREADY_BOUND | 邮箱已被其他用户绑定 |
| ErrInvalidToken | 401 | INVALID_TOKEN | Token无效或已过期 |
| ErrSocialBindFailed | 400 | SOCIAL_BIND_FAILED | 第三方绑定失败 |
| ErrUsernameTaken | 409 | USERNAME_TAKEN | 用户名已被占用 |
| ErrWeakPassword | 422 | WEAK_PASSWORD | 密码强度不足 |

**输入验证规则**:
- `username`: 长度 3-20 字符，仅允许字母、数字、下划线
- `password`: 长度 >= 6 字符
- `email`: 有效的邮箱格式，可选

**内部逻辑**:
- 密码使用 bcrypt 加密，cost=12
- JWT Token 有效期 7 天，包含 user_id 和 exp
- 第三方登录回调验证 state 参数防止 CSRF
- 首次第三方登录返回临时 token，引导完善信息

#### 5.2.2 DocumentService - 文档服务

**职责**: 文档 CRUD、树形结构管理、内容版本控制

**对外接口**:

| 接口 | 说明 | 调用方 |
|-----|------|-------|
| Create(workspaceID, title, content, parentID) | 创建文档 | DocumentHandler |
| GetByID(id, userID) | 获取文档 | DocumentHandler |
| UpdateContent(id, content, userID) | 更新内容 | DocumentHandler |
| UpdateTitle(id, title, userID) | 更新标题 | DocumentHandler |
| Delete(id, userID) | 删除文档 | DocumentHandler |
| Move(id, parentID, sortOrder, userID) | 移动文档 | DocumentHandler |
| GetTree(workspaceID) | 获取文档树 | DocumentHandler |
| Search(query, userID) | 搜索文档 | DocumentHandler |

**异常处理**:

| 异常类型 | HTTP状态码 | 错误码 | 说明 |
|---------|-----------|--------|------|
| ErrDocumentNotFound | 404 | DOCUMENT_NOT_FOUND | 文档不存在 |
| ErrNoReadPermission | 403 | NO_READ_PERMISSION | 无读取权限 |
| ErrNoWritePermission | 403 | NO_WRITE_PERMISSION | 无写入权限 |
| ErrNoManagePermission | 403 | NO_MANAGE_PERMISSION | 无管理权限 |
| ErrInvalidParent | 400 | INVALID_PARENT | 父文档不存在或形成循环引用 |
| ErrMoveToChild | 400 | MOVE_TO_CHILD | 不能将文档移动到自己的子文档下 |
| ErrWorkspaceNotFound | 404 | WORKSPACE_NOT_FOUND | 工作空间不存在 |
| ErrInvalidVisibility | 400 | INVALID_VISIBILITY | 无效的可见性设置 |

**输入验证规则**:
- `title`: 长度 1-255 字符
- `content`: Markdown 文本，最大 10MB
- `parentID`: 必须是存在的文档ID或null
- `workspaceID`: 必须是存在的工作空间ID
- `visibility`: 仅允许 "public" 或 "internal"
- `sortOrder`: 整数，>= 0

**内部逻辑**:
- 文档内容变更时检查快照触发条件（行数变化>20、字节变化>2048、时间间隔>5分钟）
- 树形结构使用 parent_id 自关联，支持无限层级
- 软删除文档（is_deleted 字段），保留 30 天
- 搜索支持全文检索和标题匹配

#### 5.2.3 PermissionService - 权限服务

**职责**: 权限检查、继承计算、标题级权限

**对外接口**:

| 接口 | 说明 | 调用方 |
|-----|------|-------|
| CheckDocumentAccess(userID, docID, requiredLevel) | 检查文档权限 | DocumentHandler |
| CheckHeadingAccess(userID, docID, headingAnchor) | 检查标题权限 | DocumentHandler |
| SetPermission(docID, granteeType, granteeID, level, inherit) | 设置权限 | PermissionHandler |
| ClearAllPermissions(docID) | 清除所有权限 | PermissionHandler |
| GetEffectivePermissions(docID) | 获取有效权限 | PermissionHandler |
| InheritPermissions(docID, parentID) | 继承父节点权限 | DocumentService |

**异常处理**:

| 异常类型 | HTTP状态码 | 错误码 | 说明 |
|---------|-----------|--------|------|
| ErrPermissionDenied | 403 | PERMISSION_DENIED | 权限不足 |
| ErrPermissionNotFound | 404 | PERMISSION_NOT_FOUND | 权限规则不存在 |
| ErrInvalidGranteeType | 400 | INVALID_GRANTEE_TYPE | 无效的授权对象类型 |
| ErrInvalidPermissionLevel | 400 | INVALID_PERMISSION_LEVEL | 无效的权限级别 |
| ErrCannotModifyOwnerPermission | 400 | CANNOT_MODIFY_OWNER | 不能修改所有者的权限 |
| ErrHeadingAnchorNotFound | 404 | HEADING_NOT_FOUND | 指定的标题不存在 |

**输入验证规则**:
- `granteeType`: 仅允许 "user"、"role"、"department"
- `level`: 仅允许 "read"、"edit"、"manage"
- `inherit`: 布尔值
- `headingAnchor`: 有效的标题锚点格式（字母、数字、连字符）

**内部逻辑**:
- 权限检查优先级：Admin > 所有者 > 工作空间成员 > 文档直接授权 > 标题级权限
- 继承控制：子节点 inherit_to_children=true 时自动继承父节点权限
- 可见性计算：inherit_visibility=true 时取父节点 visibility，否则取自身
- 权限叠加：用户有多个级别权限时取最高

#### 5.2.4 SnapshotService - 快照服务

**职责**: 快照创建、恢复、对比

**对外接口**:

| 接口 | 说明 | 调用方 |
|-----|------|-------|
| CreateAutoSnapshot(docID, authorID) | 自动创建快照 | DocumentService |
| CreateManualSnapshot(docID, authorID, message) | 手动创建快照 | SnapshotHandler |
| Restore(snapshotID, userID) | 恢复到快照 | SnapshotHandler |
| Diff(snapshotID1, snapshotID2) | 对比差异 | SnapshotHandler |
| List(documentID) | 列出快照 | SnapshotHandler |

**异常处理**:

| 异常类型 | HTTP状态码 | 错误码 | 说明 |
|---------|-----------|--------|------|
| ErrSnapshotNotFound | 404 | SNAPSHOT_NOT_FOUND | 快照不存在 |
| ErrNoSnapshotPermission | 403 | NO_SNAPSHOT_PERMISSION | 无快照访问权限 |
| ErrCompareSameSnapshot | 400 | COMPARE_SAME_SNAPSHOT | 不能对比同一快照 |
| ErrSnapshotNotFoundForDiff | 404 | SNAPSHOT_NOT_FOUND_FOR_DIFF | 对比的快照不存在 |

**输入验证规则**:
- `message`: 长度 0-255 字符，可选
- `snapshotID`: 必须是存在的快照ID
- `compareID`: 必须是存在的快照ID

**内部逻辑**:
- 自动快照触发条件：行数变化>20 OR 字节变化>2048 OR 时间间隔>5分钟
- 使用 diff 算法生成快照差异
- 恢复操作创建新快照记录回滚点

#### 5.2.5 WebSocket Hub - 协作服务

**职责**: 实时协作会话管理、内容同步

**对外接口**:

| 接口 | 说明 | 调用方 |
|-----|------|-------|
| HandleConnection(ws, userID) | 处理连接 | WSHandler |
| HandleMessage(ws, userID, message) | 处理消息 | WSHandler |
| BroadcastEdit(docID, userID, line, content) | 广播编辑 | WSHandler |
| BroadcastCursor(docID, userID, line, column) | 广播光标 | WSHandler |

**异常处理**:

| 异常类型 | 错误码 | 说明 |
|---------|--------|------|
| ErrWSInvalidMessage | 1001 | 无效的消息格式 |
| ErrWSUnauthorized | 1002 | 未认证或Token无效 |
| ErrWSDocumentNotFound | 1003 | 文档不存在 |
| ErrWSPermissionDenied | 1004 | 无访问权限 |
| ErrWSConnectionLimit | 1005 | 连接数超限 |
| ErrWSTimeout | 1006 | 连接超时 |

**输入验证规则**:
- `document_id`: 必须为存在的文档ID
- `line`: 整数，>= 1
- `column`: 整数，>= 0
- `content`: 字符串，最大 10KB

**内部逻辑**:
- 每个文档一个协作房间（Room）
- 用户加入/离开房间时广播通知
- 编辑消息使用 OT (Operational Transform) 算法处理并发冲突
- 服务端作为权威版本，按时间戳合并冲突
- 心跳检测：30 秒无消息断开连接

#### 5.2.6 AttachmentService - 附件服务

**职责**: 文件上传、引用管理、跨文档共享

**对外接口**:

| 接口 | 说明 | 调用方 |
|-----|------|-------|
| Upload(workspaceID, userID, file) | 上传附件 | AttachmentHandler |
| AddReference(attachmentID, documentID) | 添加引用 | AttachmentHandler |
| RemoveReference(attachmentID, documentID) | 移除引用 | AttachmentHandler |
| GetReferences(attachmentID) | 获取引用列表 | AttachmentHandler |
| Delete(attachmentID, userID) | 删除附件 | AttachmentHandler |

**异常处理**:

| 异常类型 | HTTP状态码 | 错误码 | 说明 |
|---------|-----------|--------|------|
| ErrAttachmentNotFound | 404 | ATTACHMENT_NOT_FOUND | 附件不存在 |
| ErrFileTooLarge | 413 | FILE_TOO_LARGE | 文件大小超过限制 |
| ErrFileTypeNotAllowed | 415 | FILE_TYPE_NOT_ALLOWED | 文件类型不允许 |
| ErrNoUploadPermission | 403 | NO_UPLOAD_PERMISSION | 无上传权限 |
| ErrNotAttachmentOwner | 403 | NOT_ATTACHMENT_OWNER | 不是上传者，无法管理引用 |
| ErrWorkspaceStorageFull | 507 | WORKSPACE_STORAGE_FULL | 工作空间存储已满 |
| ErrReferenceNotFound | 404 | REFERENCE_NOT_FOUND | 引用关系不存在 |

**输入验证规则**:
- `file`: 二进制文件，最大 100MB
- `filename`: 长度 1-255 字符
- `file_type`: 必须是允许的类型（图片/文档/压缩包等）
- `workspace_id`: 必须是存在的工作空间ID
- 允许的文件类型：jpg, jpeg, png, gif, webp, pdf, doc, docx, xls, xlsx, zip, rar, 7z, txt, md

**内部逻辑**:
- 文件存储：本地文件系统 `data/attachments/{workspace_id}/{filename}`
- 支持文件大小限制：单文件 100MB，总存储无限制
- 引用计数：附件可被多个文档引用，删除时检查引用
- 生成 Markdown 引用语法：`![filename](/api/attachments/{id}/download)`

#### 5.2.7 AIService - AI 服务

**职责**: AI 接口对接、智能问答、内容处理

**对外接口**:

| 接口 | 说明 | 调用方 |
|-----|------|-------|
| Ask(userID, question, documentIDs) | 智能问答 | AIHandler |
| Summarize(documentID) | 内容总结 | AIHandler |
| Expand(documentID, paragraph) | 内容扩写 | AIHandler |
| Complete(documentID, cursorPosition) | 文档补全 | AIHandler |

**异常处理**:

| 异常类型 | HTTP状态码 | 错误码 | 说明 |
|---------|-----------|--------|------|
| ErrAINotConfigured | 503 | AI_NOT_CONFIGURED | AI服务未配置 |
| ErrAIRequestFailed | 502 | AI_REQUEST_FAILED | AI请求失败 |
| ErrAIQuotaExceeded | 429 | AI_QUOTA_EXCEEDED | AI配额超限 |
| ErrAIInvalidResponse | 502 | AI_INVALID_RESPONSE | AI响应格式错误 |
| ErrDocumentNotAccessible | 403 | DOCUMENT_NOT_ACCESSIBLE | 文档无权限访问 |
| ErrConversationNotFound | 404 | CONVERSATION_NOT_FOUND | 对话不存在 |

**输入验证规则**:
- `question`: 长度 1-1000 字符
- `document_ids`: 数组，每个元素为存在的文档ID
- `paragraph`: 有效的 Markdown 段落文本
- `cursor_position`: 整数，表示光标位置
- 单次请求最大 token 数：8000

**内部逻辑**:
- 对接 OpenAI 兼容 API (GPT-4)
- 问答时只使用用户有阅读权限的文档
- 返回答案标注参考来源文档
- 对话历史存储，支持多轮上下文
- 使用 pgvector 存储文档向量，支持语义检索

---

## 6. 安全设计

### 6.1 安全策略

| 安全措施 | 实现方案 | 优先级 |
|---------|---------|-------|
| 认证 | JWT Token (RS256)，7 天有效期 | P0 |
| 授权 | RBAC + 层级权限继承 | P0 |
| 密码存储 | bcrypt，cost=12 | P0 |
| 传输安全 | HTTPS 全站加密 | P0 |
| CSRF 防护 | CSRF Token (Double Submit Cookie) | P0 |
| XSS 防护 | Content-Type 校验，输出转义 | P0 |
| SQL 注入 | sqlc 参数化查询 | P0 |
| 敏感信息 | 环境变量配置，禁止日志记录 | P1 |
| 附件安全 | 文件类型白名单，内容扫描 | P1 |
| 速率限制 | 滑动窗口限流 | P1 |
| 审计日志 | 记录所有管理操作 | P1 |

### 6.4 安全头配置

**HTTP 安全响应头**:

| 头部名称 | 值 | 说明 |
|---------|-----|------|
| X-Content-Type-Options | nosniff | 防止 MIME 类型嗅探 |
| X-Frame-Options | DENY | 防止点击劫持 |
| X-XSS-Protection | 1; mode=block | XSS 过滤（传统浏览器） |
| Referrer-Policy | strict-origin-when-cross-origin | 引用来源控制 |
| Permissions-Policy | camera=(), microphone=(), geolocation=() | 禁用浏览器特性 |
| Content-Security-Policy | default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' wss: https:; frame-ancestors 'none' | CSP 策略 |
| Strict-Transport-Security | max-age=31536000; includeSubDomains | 强制 HTTPS |

**CORS 跨域配置**:

| 配置项 | 开发环境 | 生产环境 |
|-------|---------|---------|
| Allow-Origin | * (允许所有) | 通过 ALLOWED_ORIGINS 环境变量配置 |
| Allow-Methods | GET, POST, PUT, PATCH, DELETE, OPTIONS | 同左 |
| Allow-Headers | Content-Type, Authorization, X-CSRF-Token | 同左 |
| Allow-Credentials | true | true |
| Max-Age | 86400 | 86400 |

**Cookie 安全属性**:

| 属性 | 值 | 说明 |
|-----|-----|------|
| Secure | true | 仅 HTTPS 传输 |
| HttpOnly | true | 禁止 JavaScript 访问 |
| SameSite | Strict | 严格同源策略 |
| Path | / | 作用于全路径 |

**文件上传安全**:
- 文件类型白名单：jpg, jpeg, png, gif, webp, pdf, doc, docx, xls, xlsx, zip, rar, 7z, txt, md
- 文件大小限制：单文件最大 100MB
- 路径遍历防护：使用 `filepath.Clean` 清理路径
- 文件名处理：保留原始文件名但存储到随机命名的路径

### 6.2 权限模型

**权限级别**:
- `read`: 只读访问，可查看内容
- `edit`: 可编辑内容
- `manage`: 可编辑 + 设置权限 + 删除 + 修改公开状态

**权限检查优先级**:
1. 管理员 (is_admin=true) → 所有权限
2. 文档所有者 → 所有权限
3. 工作空间成员权限 (workspace_members.level)
4. 文档直接授权 (document_permissions)
5. 标题级权限 (heading_permissions)

**继承规则**:
- 子节点 inherit_to_children=true 时自动继承父节点权限
- 子节点可单独设置权限覆盖继承的权限
- 可见性同样支持继承 (inherit_visibility)

### 6.3 审计日志

**记录范围**:
- 用户登录/登出
- 文档创建/修改/删除/导出
- 权限变更
- 工作空间设置变更
- 管理员操作

**日志字段**:
```json
{
  "id": 1,
  "user_id": 123,
  "action": "document.delete",
  "target_type": "document",
  "target_id": 456,
  "details": { "title": "旧标题" },
  "created_at": "2026-03-20T10:00:00Z"
}
```

**保留策略**: 保留 180 天，之后自动清理

---

## 7. 性能设计

### 7.1 性能指标

| 指标名称 | 目标值 | 说明 |
|---------|-------|------|
| 页面加载时间 | < 2 秒 | 首次加载 |
| WebSocket 延迟 | < 100ms | 同一地区 |
| 文档保存延迟 | < 500ms | 自动保存 |
| 搜索响应时间 | < 1 秒 | 全文搜索 |
| API 响应时间 P99 | < 200ms | 主要接口 |
| 并发用户 | > 500 | 同时在线 |
| 系统可用性 | 99.5% | 全年运行 |

### 7.2 缓存策略

**注意**: 当前实现中缓存功能尚未完全实现，以下为设计文档中的规划。

| 缓存层级 | 缓存内容 | TTL | 更新策略 |
|---------|---------|-----|---------|
| 内存缓存 | 用户 Session、权限计算结果 | 5 分钟 | LRU 淘汰 |
| Redis (可选) | 文档内容、搜索结果 | 10 分钟 | 写入时失效 |
| 浏览器缓存 | 静态资源、翻译包 | 1 天 | 版本号控制 |

**缓存失效策略**:
- 文档更新时删除相关缓存
- 用户权限变更时删除权限缓存
- WebSocket 编辑立即更新缓存

**待实现的缓存功能**:
- [ ] 文档内容缓存（Redis）
- [ ] 用户权限计算结果缓存（内存 LRU）
- [ ] 搜索结果缓存（Redis）
- [ ] 缓存预热机制

### 7.3 异步处理

| 场景 | 方案 | 说明 |
|-----|------|------|
| 快照创建 | 同步 | 保证一致性 |
| 文件上传 | 同步 → 异步 | 大文件异步处理 |
| AI 生成 | 异步 | 长文本处理 |
| 第三方同步 | 定时任务 | 组织架构同步 |
| 邮件通知 | 消息队列 | 解耦发送 |

### 7.4 数据库优化

- 读写分离：主库写入，从库读取 (PostgreSQL 物理复制)
- 连接池：最大 100 连接，超时 30 秒
- 查询优化：避免 N+1，使用预加载
- 批量操作：附件上传、批量更新使用事务

---

## 8. 部署方案

### 8.1 部署架构

```mermaid
graph TB
    subgraph Client[Client]
        Browser[Browser]
    end

    subgraph Server[MarkdownHub Server]
        Binary[Go Binary]
        Frontend[Embedded Frontend]
    end

    subgraph Storage[Storage]
        DB[(PostgreSQL)]
        Files[data/attachments]
    end

    Browser --> |HTTPS| Server
    Server --> DB
    Server --> Files
```

### 8.2 环境配置

| 环境 | 配置 | 特点 |
|-----|------|------|
| 开发环境 | 单机部署，SQLite | 快速启动 |
| 测试环境 | Docker Compose | 与生产一致 |
| 预发布环境 | Docker 部署 | 完整功能验证 |
| 生产环境 | K8s / Docker | 高可用配置 |

**环境变量配置**:

| 变量名 | 说明 | 示例 | 必填 |
|-------|------|------|------|
| DATABASE_URL | PostgreSQL 连接串 | postgres://user:pass@host:5432/markdownhub | 是 |
| JWT_SECRET | JWT 签名密钥，最小32字符 | (生成随机字符串) | 是 |
| SITE_TITLE | 站点标题 | MarkdownHub | 否 |
| SITE_BASE_URL | 站点基础URL，用于生成链接 | https://docs.example.com | 否 |
| UPLOAD_DIR | 附件存储目录 | ./data/attachments | 否 |
| UPLOAD_MAX_SIZE | 单文件最大大小（字节） | 104857600 | 否 |
| ALLOWED_FILE_TYPES | 允许的文件类型（逗号分隔） | jpg,png,pdf,doc,zip | 否 |
| AI_API_KEY | OpenAI API Key | sk-xxx | 否 |
| AI_API_BASE | AI API 地址 | https://api.openai.com/v1 | 否 |
| AI_MODEL | AI 模型名称 | gpt-4 | 否 |
| REDIS_URL | Redis 连接串（可选，用于缓存） | redis://localhost:6379 | 否 |
| LOG_LEVEL | 日志级别 | debug/info/warn/error | 否 |
| CORS_ALLOWED_ORIGINS | CORS 允许的源（逗号分隔） | https://example.com | 否 |
| SESSION_SECRET | Session 加密密钥 | (生成随机字符串) | 是 |
| DingTalk_AppKey | 钉钉应用 Key | dingxxx | 否 |
| DingTalk_AppSecret | 钉钉应用 Secret | xxx | 否 |
| WeCom_CorpID | 企业微信 CorpID | wwxxx | 否 |
| WeCom_AgentID | 企业微信 AgentID | 1000001 | 否 |
| WeCom_AgentSecret | 企业微信 AgentSecret | xxx | 否 |
| Feishu_AppID | 飞书 AppID | cli_xxx | 否 |
| Feishu_AppSecret | 飞书 AppSecret | xxx | 否 |

**配置文件示例 (config.yaml)**:
```yaml
server:
  port: 8080
  read_timeout: 30s
  write_timeout: 30s

database:
  url: postgres://user:pass@localhost:5432/markdownhub
  max_open_conns: 100
  max_idle_conns: 10
  conn_max_lifetime: 3600s

jwt:
  secret: your-jwt-secret-key-min-32-chars
  expiration: 168h  # 7 days

site:
  title: MarkdownHub
  base_url: http://localhost:8080

upload:
  dir: ./data/attachments
  max_size: 104857600  # 100MB
  allowed_types:
    - jpg
    - png
    - pdf
    - doc
    - zip

ai:
  api_key: sk-xxx
  api_base: https://api.openai.com/v1
  model: gpt-4
  max_tokens: 8000

social:
  dingtalk:
    app_key: dingxxx
    app_secret: xxx
  wecom:
    corp_id: wwxxx
    agent_id: "1000001"
    agent_secret: xxx
  feishu:
    app_id: cli_xxx
    app_secret: xxx

log:
  level: info
  format: json
```

**健康检查接口**:

| 接口 | 方法 | 描述 | 响应内容 |
|------|------|------|---------|
| /health | GET | 服务健康状态 | `{"status": "healthy", "uptime": "xxx"}` |
| /ready | GET | 就绪检查（含数据库连接） | `{"status": "ready"}` |
| /metrics | GET | 应用指标 | 内存、协程数等运行时指标 |

**健康检查响应示例**:

**GET /health**
```json
// 正常 (200)
{
  "status": "healthy",
  "uptime": "2h30m15s"
}

// 数据库连接失败 (503)
{
  "status": "unhealthy",
  "error": "database connection failed"
}
```

**GET /ready**
```json
// 服务正常 (200)
{
  "status": "ok",
  "database": "connected",
  "timestamp": "2026-03-23T10:00:00Z"
}

// 数据库连接失败 (503)
{
  "status": "unhealthy",
  "database": "disconnected",
  "error": "connection refused",
  "timestamp": "2026-03-23T10:00:00Z"
}
```

### 8.3 容器化部署

**Dockerfile**:
```dockerfile
FROM golang:1.21-alpine AS builder
WORKDIR /app
COPY . .
RUN go build -ldflags="-w -s" -o markdownhub

FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=builder /app/markdownhub .
COPY --from=builder /app/frontend/dist ./frontend
EXPOSE 8080
CMD ["./markdownhub"]
```

**docker-compose.yml**:
```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "8080:8080"
    environment:
      - DATABASE_URL=postgres://user:pass@db:5432/markdownhub
      - JWT_SECRET=${JWT_SECRET}
    volumes:
      - ./data:/app/data
    depends_on:
      - db

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
      - POSTGRES_DB=markdownhub
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
```

### 8.4 运维监控

| 监控项 | 告警阈值 | 处理方案 |
|-------|---------|---------|
| CPU 使用率 | > 80% | 扩容/优化 |
| 内存使用率 | > 85% | 排查内存泄漏 |
| 磁盘使用率 | > 80% | 清理附件/快照 |
| 错误率 | > 1% | 排查错误日志 |
| 响应时间 P99 | > 500ms | 性能分析 |
| 数据库连接 | > 80% | 优化连接池 |

**健康检查**:
- `/health` - 服务健康状态
- `/health/ready` - 就绪检查 (含数据库连接)

---

## 9. 技术风险与应对

| 风险描述 | 概率 | 影响 | 应对策略 |
|---------|-----|------|---------|
| WebSocket 并发冲突 | 中 | 高 | OT 算法优化，服务端权威版本 |
| 大文档性能问题 | 中 | 中 | 分页加载，懒加载预览 |
| AI API 延迟/失败 | 中 | 中 | 异步处理，超时重试，降级返回 |
| 数据库单点故障 | 低 | 高 | Docker 高可用，物理复制 |
| 附件存储满 | 低 | 中 | 分布式存储，定期清理 |
| 第三方登录不可用 | 低 | 中 | 保留密码登录备选 |
| 数据丢失 | 极低 | 极高 | 每日备份，异地容灾 |

---

## 10. 附录

### 10.1 项目结构

```
markdown-hub/
├── cmd/
│   └── server/
│       └── main.go
├── internal/
│   ├── api/
│   │   ├── handlers/        # HTTP handlers
│   │   ├── middleware/       # 中间件
│   │   └── router.go
│   ├── service/             # 业务逻辑
│   ├── repository/          # 数据访问
│   ├── model/              # 数据模型
│   ├── ws/                 # WebSocket
│   └── pkg/
│       ├── auth/
│       ├── i18n/
│       └── ai/
├── migrations/             # 数据库迁移
├── frontend/               # React 前端
├── sqlc.yaml               # sqlc 配置
├── Dockerfile
├── docker-compose.yml
└── TDD.md
```

### 10.2 参考资料

- [PRD.md](./PRD.md) - 产品需求文档
- [Go Gin 框架文档](https://gin-gonic.com/)
- [PostgreSQL 文档](https://www.postgresql.org/docs/)
- [pgvector 扩展](https://github.com/pgvector/pgvector)
- [sqlc 文档](https://docs.sqlc.dev/)

### 10.4 实现与设计差异记录

本文档记录代码实现与设计文档之间的差异，供后续维护参考。

#### 10.4.1 API 路由差异

| TDD 设计路径 | 实际实现路径 | 差异说明 |
|-------------|-------------|---------|
| `/api/v1/*` | `/api/*` | 未使用 v1 版本前缀 |
| `/api/auth/social/*` | 未实现 | 第三方登录功能未开发 |
| `/api/documents/:id/visibility` | `PATCH /api/documents/:id/public` | 使用 is_public 布尔字段替代 visibility 字符串 |
| `/api/documents/:id/children` | 未实现 | 子文档查询功能未开发 |
| `/api/documents/:id/tree` | 未实现 | 文档树形结构 API 未开发 |
| `/api/documents/:id/move` | 未实现 | 文档移动功能未开发 |
| `/api/documents/public` | `GET /api/search?q=xxx` | 使用搜索 API 替代独立公开文档列表 |
| `/api/snapshots` (独立) | `POST/GET /api/documents/:id/snapshots` | 快照挂载在文档路由下 |
| `/api/comments/*` | 未实现 | 评论模块完全未开发 |
| `/api/ai/*` | 未实现 | AI 模块完全未开发 |
| `/api/export/*` | 未实现 | 导出模块完全未开发 |
| `/api/roles/*` | 未实现 | 角色模块完全未开发 |
| `/api/departments/*` | 未实现 | 部门模块完全未开发 |
| `/api/i18n/*` | 未实现 | 多语言模块完全未开发 |

#### 10.4.2 数据库 Schema 差异

| TDD 设计 | 实际实现 | 差异说明 |
|---------|---------|---------|
| `documents.visibility` (VARCHAR) | `documents.is_public` (BOOLEAN) | 使用布尔字段替代 visibility 字符串 |
| `documents.parent_id` | 不存在 | 文档树形结构通过 workspace_id 组织，无父子关系 |
| `documents.inherit_visibility` | 不存在 | 未实现可见性继承 |
| `documents.is_deleted` | 不存在 | 未实现软删除 |
| `users.avatar_url` | 不存在 | 用户头像功能未实现 |
| `users.department_id` | 不存在 | 部门关联未实现 |
| `departments` 表 | 不存在 | 部门模块未开发 |
| `roles` 表 | 不存在 | 角色模块未开发 |
| `user_roles` 表 | 不存在 | 用户角色关联未实现 |
| `social_accounts` 表 | 不存在 | 第三方账号绑定未实现 |
| `comments` 表 | 不存在 | 评论功能未实现 |
| `ai_conversations` 表 | 不存在 | AI 对话功能未实现 |
| `ai_messages` 表 | 不存在 | AI 消息存储未实现 |
| `settings` 表 | 存在但仅用于 SITE_TITLE | 其他设置项未实现 |

#### 10.4.3 JWT 配置差异

| 配置项 | TDD 设计 | 实际实现 |
|-------|---------|---------|
| 签名算法 | RS256 | HS256 |
| Token 有效期 | 7 天 | 24 小时 |
| Token 位置 | Authorization Header | Header 或 Cookie |

#### 10.4.4 WebSocket 差异

| 配置项 | TDD 设计 | 实际实现 |
|-------|---------|---------|
| 认证方式 | `Authorization: Bearer <token>` Header | `token` 查询参数 |
| 心跳间隔 | 25 秒 | 54 秒 |
| 连接超时 | 30 秒 | 60 秒 |
| 消息类型 | `join`, `leave`, `edit`, `cursor`, `ping` | `update`, `patch`, `init`, `error` |

#### 10.4.5 统一响应格式差异

| 项目 | TDD 设计 | 实际实现 |
|-----|---------|---------|
| 成功格式 | `{code, message, data}` | 直接返回数据对象 |
| 错误格式 | `{code, message, error}` | `{error}` |
| 错误码位置 | 顶级 `code` 字段 | 无 `code` 字段，仅 HTTP 状态码 |

#### 10.4.6 未实现的安全功能

| 功能 | TDD 设计 | 实际实现 |
|-----|---------|---------|
| API 限流中间件 | 滑动窗口限流 | 未实现（代码中有注释待添加） |
| CSP 响应头 | 配置完整 CSP 策略 | 未配置 |
| 速率限制 | 登录 5 次/分钟等 | 未实现 |

#### 10.4.7 缺失的环境变量

| TDD 设计 | 说明 | 实际实现 |
|---------|------|---------|
| CORS_ALLOWED_ORIGINS | CORS 配置 | ALLOWED_ORIGINS (WS 专用) |
| SESSION_SECRET | Session 加密 | 未使用 Session |
| AI_* | AI 配置 | 未实现 AI 功能 |

---

| 术语 | 定义 |
|------|------|
| OT (Operational Transform) | 操作转换算法，用于解决协作编辑冲突 |
| JWT (JSON Web Token) | JSON 格式的令牌，用于身份认证 |
| RBAC (Role-Based Access Control) | 基于角色的访问控制 |
| Workspace | 工作空间，组织文档的顶层容器 |
| Heading Anchor | 标题锚点，Markdown 标题的唯一标识符 |
| Snapshot | 快照，文档在某个时间点的完整副本 |

---

## TDD 撰写检查清单

- [x] 系统架构清晰，分层合理
- [x] 数据库设计符合范式要求
- [x] API 设计符合 RESTful 规范
- [x] 安全设计覆盖主要威胁
- [x] 性能指标可量化
- [x] 部署方案可行
- [x] 风险识别完整
