# MarkdownHub 浏览器导入插件

## 简介

MarkdownHub Importer 是一个 Chrome/Edge 浏览器扩展,可以将任何网页的文章内容导入到 MarkdownHub 平台。

## 功能特性

- ✅ 智能提取网页主要内容(自动识别 article、main 等标签)
- ✅ 自动过滤广告、导航栏、侧边栏等无关内容
- ✅ 将远程图片转换为 base64 编码并上传
- ✅ HTML 自动转换为 Markdown 格式
- ✅ 支持自定义文章标题
- ✅ 直接导入到指定工作空间

## 安装方法

### 开发模式安装

1. 打开 Chrome 浏览器,访问 `chrome://extensions/`
2. 开启右上角的"开发者模式"
3. 点击"加载已解压的扩展程序"
4. 选择 `extensions/importer` 目录
5. 插件安装完成

### 发布版安装

(待发布到 Chrome Web Store)

## 使用方法

### 首次使用

1. 点击浏览器工具栏的 MarkdownHub 图标
2. 输入你的 MarkdownHub 实例 URL(例如 `http://localhost:8080`)
3. 输入用户名和密码
4. 点击"Login"登录

### 导入文章

1. 访问你想导入的网页
2. 点击浏览器工具栏的 MarkdownHub 图标
3. 选择目标工作空间
4. (可选)自定义文章标题,留空则使用网页标题
5. 点击"Import Article"
6. 等待导入完成,会自动打开新创建的文档

## 技术架构

### 核心组件

- **manifest.json**: 扩展清单文件,定义权限和组件
- **popup.html/js**: 弹出窗口界面,处理用户交互
- **content.js**: 内容脚本,提取网页内容
- **background.js**: 后台服务,处理 API 请求

### 工作流程

```
1. 用户点击导入按钮
   ↓
2. popup.js 向 content.js 请求页面内容
   ↓
3. content.js 提取主要内容
   ├─ 查找 article/main 标签
   ├─ 移除广告、导航等无关元素
   └─ 将图片转换为 base64
   ↓
4. popup.js 发送到 background.js
   ↓
5. background.js 调用后端 API
   └─ POST /api/import/content
   ↓
6. 后端处理
   ├─ HTML 转 Markdown
   ├─ 解码 base64 图片
   ├─ 保存图片到磁盘
   └─ 创建文档记录
   ↓
7. 返回文档 ID,打开新文档
```

### 图片处理

插件使用两种方式处理图片:

1. **base64 编码** (content.js)
   - 使用 Canvas API 将远程图片转为 base64
   - 适用于支持 CORS 的图片
   - 失败时保留原始 URL

2. **后端下载** (importer.go)
   - 检测 `data:image/` 格式的 base64 数据
   - 解码并保存到服务器磁盘
   - 或直接下载 HTTP/HTTPS 图片

## 已修复的问题

### v1.0.1 (2024-03-09)

**问题 1: 异步图片处理不完整**
- ❌ 旧代码:使用 `forEach` + `async`,不等待图片转换完成
- ✅ 修复:改用 `Promise.all` 等待所有异步操作

**问题 2: 后端不支持 base64 图片**
- ❌ 旧代码:只处理 HTTP URL
- ✅ 修复:检测 `data:image/` 前缀,使用 `DecodeBase64Image` 解码

**问题 3: 文件上传失败**
- ❌ 旧代码:调用不存在的 `SaveFile` 方法
- ✅ 修复:使用 `os.MkdirAll` + `os.WriteFile` 直接保存

**问题 4: 正则捕获组错误**
- ❌ 旧代码:`match[2]:match[3]` (错误的索引)
- ✅ 修复:`match[4]:match[5]` (正确提取 URL 部分)

## 权限说明

插件需要以下权限:

- `activeTab`: 访问当前标签页内容
- `storage`: 保存实例 URL 和登录信息
- `tabs`: 打开新标签页显示导入的文档
- `cookies`: 管理 CSRF token
- `<all_urls>`: 访问所有网站(用于内容提取)

## 隐私声明

- 插件只在用户主动点击导入时提取内容
- 提取的内容仅发送到用户配置的 MarkdownHub 实例
- 不收集、存储或传输任何个人信息
- 登录凭证仅保存在本地浏览器存储

## 已知限制

1. **CORS 限制**: 某些网站的图片可能无法转为 base64(跨域限制)
2. **内容提取准确性**: 依赖 HTML 结构,部分网站可能提取不准确
3. **文件大小限制**: 后端限制单个文件 10MB
4. **登录状态**: 需要每次打开插件时登录(未来会改进)

## 故障排除

### 导入失败:"Failed to get page content"
- 检查是否刷新了页面(content script 需要重新注入)
- 尝试重新加载扩展

### 导入失败:"Login failed"
- 检查实例 URL 是否正确
- 检查用户名密码是否正确
- 查看浏览器控制台(F12)的错误信息

### 图片丢失
- 某些图片可能受 CORS 保护,无法转换
- 检查后端 `uploads/` 目录是否有写入权限
- 查看后端日志查找错误

## 开发调试

### 查看日志

- **Popup 日志**: 右键点击扩展图标 → 检查弹出式窗口
- **Background 日志**: chrome://extensions → 服务工作线程 → 检查视图
- **Content 日志**: F12 → Console (在目标网页上)

### 修改代码后

1. 修改代码
2. 访问 `chrome://extensions/`
3. 点击刷新图标
4. 重新打开 popup 或刷新测试页面

## 贡献指南

欢迎提交 Issue 和 Pull Request!

### 报告 Bug

请包含:
- 浏览器版本
- 插件版本
- 复现步骤
- 错误信息截图
- 浏览器控制台日志

### 功能建议

请描述:
- 功能场景
- 预期行为
- 可选的实现方案

## 许可证

与 MarkdownHub 主项目相同

## 更新日志

### v1.0.1 (2024-03-09)
- 修复异步图片处理问题
- 支持 base64 图片上传
- 修复文件保存逻辑

### v1.0.0 (2024-03-08)
- 初始版本
- 基础导入功能
- HTML 转 Markdown
- 图片处理
