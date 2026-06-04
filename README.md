# ORF

## 接口访问约定

前端数据统一通过同源 `/api` 请求后端接口；任务管理集合读取入口是 `/api/tasks-page`，写入接口以 `docs/backend/` 中的对应模块文档为准。
前端不直接写死后端域名或端口，开发和生产环境由代理或网关转发到实际后端服务。

## Objective

ORF 是一个基于 ORF 思想设计的项目管理工具。它在产品理念和项目管理流程上以 Objective、Results、Feedback 为核心，帮助项目从目标出发，形成可执行、可验证、可反馈的管理闭环。

## Results

- 产品理念、功能设计和业务流程必须遵循 `ORF.md`。
- 仓库协作、执行边界和系统性修改规则以 `AGENTS.md` 为唯一事实源；小写 `agents.md` 只保留兼容入口。
- 文档入口以 `docs/README.md` 为准，具体接口和页面契约以对应模块文档为准。
- 项目使用 `uv` 管理 Python 环境。
- 项目使用 `npm` 管理 Node.js 环境。
- 具体模块、函数和实现细节不需要机械套用 Objective、Results、Feedback。

## 目录

- `docs/`: 仓库文档。
- `docs/README.md`: 文档目录入口。
- `docs/frontend/ORF 悬赏目标流程 - 前端.md`: 悬赏大厅和悬赏目标申请流程的前端说明。
- `docs/frontend/ORF 我的挑战页面 - 前端.md`: 我的挑战页面的前端说明。
- `docs/backend/ORF 任务管理页面 - 后端.md`: 我的挑战和悬赏大厅的后端说明。
- `docs/rules/设置边界规则.md`: 个人设置和系统设置的作用域、权限和背景分层。
- `docs/design/设计原则.md`: ORF 业务原则、基础流程和积分规则。
- `src/`: 前端应用代码、状态管理、领域模型和共享组件。
- `server/`: 后端服务、路由、数据库访问和系统集成。
- `testd/`: 数据化 Playwright 测试入口。

## 启动方式

### 1) 安装依赖与 `orf` 启动指令

```bash
npm install
npm run cli:link
```

安装完成后，先验证命令是否可用：

```bash
orf --help
```


首次运行 Playwright E2E 测试前，需要安装 Chromium 测试浏览器：

```bash
npx playwright install chromium
```

如果在 Linux/WSL 环境中运行，首次安装还需要补齐 Chromium 系统依赖：

```bash
sudo npx playwright install-deps chromium
```

`cli:link` 会把当前仓库的 `orf` 命令链接到用户级 `~/.local/bin/orf`。

### 2) 安装 Git Hooks

仓库提供了 `.githooks/pre-push` 钩子，用于在 `git push` 前自动运行：

```bash
npm run testd
```

如果测试失败，推送会被阻止。Git 不会在 clone 仓库后自动启用仓库内的 hooks，因此首次克隆后需要手动安装一次：

```bash
git config core.hooksPath .githooks
```

安装后，每次执行 `git push` 都会自动触发该检查。

### 3) 配置并验证数据库

```bash
cp .env.example .env
# 如果你接入共享 Ory/MinIO，再运行共享接入包里的 install-env.mjs，
# 把 ORY_PUBLIC_URL、OBJECT_STORAGE_* 和 ORF_PUBLIC_CA_CERT 统一切到公共服务。
node scripts/verify-db.mjs
npm run db:migrate
```

如需排查正式排行榜是否混入演示、E2E 或手工测试流水，先运行只读审计：

```bash
npm run db:audit:leaderboard
```

### 4) 一键启动

后台启动会先检查 PostgreSQL；当 `.env` 指向共享 Ory/MinIO 时，只启动后端和前端：

```bash
orf up
```

查看状态和日志：

```bash
orf status
orf logs backend
orf logs frontend
```

停止后台服务：

```bash
orf down
```

前端地址：`http://127.0.0.1:5173`；后端地址：`http://127.0.0.1:8787`。
`orf status` 会同时检查 PostgreSQL、Ory、MinIO、后端和前端。缺少 `DATABASE_URL` / `REMOTE_DATABASE_URL` 或数据库不可连接时，`orf up` 会在启动前失败并给出错误。

如果不想后台运行，可以用前台开发模式：

```bash
orf dev
```

也可以单独运行：

```bash
orf backend
orf frontend
```

说明：当前 `.env` 中已启用 GitHub 提交和 Issues 同步到 Mattermost（`GITHUB_SYNC_ENABLED=true`，`GITHUB_ISSUES_SYNC_ENABLED=true`），提交同步监听所有分支。

## Feedback

- 使用 `npm run check` 检查基础工具链是否可用。
- 使用 `npm test` 运行快速业务不变量测试。
- 使用 `npm run testd` 或 `npm run test:e2e` 运行当前数据化 Playwright 测试。
- 使用 `npm run verify` 执行完整验证：构建、快速测试和端到端测试。
- 涉及产品需求、功能设计或业务代码的改动，必须说明目标、预期结果、反馈方式、来源文档和验证方式。
- 如果产品方向违背 ORF 思想，或业务代码缺少文档来源，必须拒绝修改。
