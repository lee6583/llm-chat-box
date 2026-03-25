# Netlify 部署指南

本指南将帮助您将这个 Vue 3 项目部署到 Netlify。

## 📋 部署前准备

### 1. 确保项目可以正常构建

在本地测试构建：

```bash
# 安装依赖
pnpm install

# 构建项目
pnpm build

# 预览构建结果
pnpm preview
```

### 2. 提交代码到 Git 仓库

确保您的代码已经提交到 GitHub、GitLab 或 Bitbucket 等 Git 托管平台。

## 🚀 部署方法

### 方法一：通过 Netlify 网站部署（推荐）

1. **登录 Netlify**
   - 访问 [https://www.netlify.com](https://www.netlify.com)
   - 使用 GitHub/GitLab/Bitbucket 账号登录

2. **创建新站点**
   - 点击 "Add new site" → "Import an existing project"
   - 选择您的 Git 仓库

3. **配置构建设置**
   - **Build command**: `pnpm build`
   - **Publish directory**: `dist`
   - Netlify 会自动检测 `netlify.toml` 配置文件，使用其中的设置

4. **环境变量（可选）**
   - 如果项目需要环境变量，在 "Site settings" → "Environment variables" 中添加
   - 如果你希望“打开网页就能直接对话”且不在前端暴露密钥：
   - 设置 `ZROCODE_API_KEY`（服务端代理使用）
   - 可选设置 `ZROCODE_BASE_URL`，例如 `https://zrocode.site/v1`
   - 前端会在用户未填写 API Key 时自动走 `/.netlify/functions/*` 代理
   - 仍可选：`VITE_API_BASE_URL`（前端直连时使用）、`VITE_DEFAULT_API_KEY`（不推荐，会打包进前端公开可见）

5. **部署**
   - 点击 "Deploy site"
   - 等待构建完成

### 方法二：通过 Netlify CLI 部署

1. **安装 Netlify CLI**
   ```bash
   npm install -g netlify-cli
   ```

2. **登录 Netlify**
   ```bash
   netlify login
   ```

3. **初始化项目**
   ```bash
   netlify init
   ```
   按照提示选择：
   - 创建新站点或链接现有站点
   - 构建命令：`pnpm build`
   - 发布目录：`dist`

4. **部署**
   ```bash
   # 部署到生产环境
   netlify deploy --prod
   
   # 或先部署到预览环境
   netlify deploy
   ```

### 方法三：拖拽部署（快速测试）

1. 在本地构建项目：
   ```bash
   pnpm build
   ```

2. 访问 [https://app.netlify.com/drop](https://app.netlify.com/drop)

3. 将 `dist` 文件夹拖拽到页面中

4. 等待部署完成

## ⚙️ 配置文件说明

项目已包含 `netlify.toml` 配置文件，包含以下设置：

- **构建命令**: `pnpm build`
- **发布目录**: `dist`
- **SPA 重定向规则**: 所有路由重定向到 `index.html`（支持 Vue Router history 模式）

## 🔧 常见问题

### 1. 构建失败

- 确保 Node.js 版本兼容（建议使用 Node.js 18+）
- 检查 `package.json` 中的依赖是否正确
- 查看 Netlify 构建日志排查错误

### 2. 路由 404 错误

- 已配置 SPA 重定向规则，应该不会出现此问题
- 如果仍有问题，检查 `netlify.toml` 中的 `[[redirects]]` 配置

### 3. 环境变量未生效

- 确保环境变量以 `VITE_` 开头（Vite 要求）
- 在 Netlify 控制台的 "Environment variables" 中设置
- 重新部署站点

### 4. 构建时间过长

- 考虑使用 `.netlifyignore` 文件排除不必要的文件
- 使用 Netlify 的构建缓存功能

## 📝 后续优化

### 自定义域名

1. 在 Netlify 控制台进入站点设置
2. 选择 "Domain management"
3. 添加自定义域名并配置 DNS

### 持续部署

- 默认情况下，每次推送到主分支都会自动触发部署
- 可以在 "Site settings" → "Build & deploy" 中配置分支部署规则

### 性能优化

- 启用 Netlify 的 CDN 和缓存功能
- 配置 HTTP 头优化缓存策略

## 🔗 相关链接

- [Netlify 官方文档](https://docs.netlify.com/)
- [Vite 部署指南](https://vitejs.dev/guide/static-deploy.html#netlify)
- [Vue Router 部署指南](https://router.vuejs.org/guide/essentials/history-mode.html)
