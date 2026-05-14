# ORF

## 接口访问约定

前端数据统一通过同源 `/api` 请求后端接口，例如 `/api/tasks`。
前端不直接写死后端域名或端口，开发和生产环境由代理或网关转发到实际后端服务。

## Objective

ORF 是一个基于 ORF 思想设计的项目管理工具。它在产品理念和项目管理流程上以 Objective、Results、Feedback 为核心，帮助项目从目标出发，形成可执行、可验证、可反馈的管理闭环。

## Results

- 产品理念、功能设计和业务流程必须遵循 `ORF.md` 和 `agents.md`。
- 项目使用 `uv` 管理 Python 环境。
- 项目使用 `npm` 管理 Node.js 环境。
- 业务代码只能从对应仓库文档生成或修改，不能直接通过 AI 会话改代码。
- 具体模块、函数和实现细节不需要机械套用 Objective、Results、Feedback。

## 目录

- `docs/`: 仓库文档。
- `docs/README.md`: 文档目录入口。
- `docs/frontend/ORF 挑战页面 - 前端.md`: 当前挑战页的前端说明。
- `docs/backend/ORF 任务管理页面 - 后端.md`: 当前挑战页的后端说明。
- `docs/design/设计原则.md`: ORF 业务原则、基础流程和积分规则。
- `src/`: 未来代码目录。

## 启动方式

### 1) 安装依赖

```bash
npm install
```

### 2) 配置并验证数据库

```bash
cp .env.example .env
node scripts/verify-db.mjs
```

### 3) 启动后端

自动监听变更：

```bash
npm run server:dev
```

不监听变更：

```bash
npm run server:start
```

说明：当前 `.env` 中已启用 GitHub 提交和 Issues 同步到 Mattermost（`GITHUB_SYNC_ENABLED=true`，`GITHUB_ISSUES_SYNC_ENABLED=true`），提交同步监听所有分支。

### 4) 启动前端

```bash
npm run dev
```

前端默认通过同源 `/api` 访问后端，请确保后端已启动。

## Feedback

- 使用 `npm run check` 检查基础工具链是否可用。
- 涉及产品需求、功能设计或业务代码的改动，必须说明目标、预期结果、反馈方式、来源文档和验证方式。
- 如果产品方向违背 ORF 思想，或业务代码缺少文档来源，必须拒绝修改。
