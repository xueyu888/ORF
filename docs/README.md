# 文档目录

## 接口访问约定

前端数据统一通过同源 `/api` 请求后端接口，例如 `/api/tasks-page`。
前端不直接写死后端域名或端口，开发和生产环境由代理或网关转发到实际后端服务。

## 目录结构

```text
docs/
├─ frontend/     前端页面说明、UI 状态、可见交互
├─ backend/      后端接口、字段契约、权限、业务计算
├─ rules/        跨页面业务规则
├─ design/       设计原则和 UI 参考
├─ project/      工程环境和代码规范
├─ legacy/       旧入口或历史说明
└─ AI考试/       AI 考核资料
```

## 常用入口

| 文档 | 说明 |
| --- | --- |
| [AppShell - 前端.md](./frontend/AppShell%20-%20前端.md) | 全局侧边栏、顶部栏、全局搜索、新建入口和全局浮层 |
| [AppShell - 后端.md](./backend/AppShell%20-%20后端.md) | AppShell 依赖的认证、权限和接口边界 |
| [ORF 任务管理页面 - 前端.md](./frontend/ORF%20任务管理页面%20-%20前端.md) | 任务管理页内容区 UI、字段展示和可见交互 |
| [ORF 悬赏流程 - 前端.md](./frontend/ORF%20悬赏流程%20-%20前端.md) | 悬赏大厅、流程阶段和悬赏操作入口 UI |
| [评论组件 - 前端.md](./frontend/评论组件%20-%20前端.md) | 当前代码中的评论浮窗 UI 和交互 |
| [ORF 任务管理页面 - 后端.md](./backend/ORF%20任务管理页面%20-%20后端.md) | 任务管理页后端集合、对象关系、字段契约和交互业务约束 |
| [目标进度条计算规则.md](./backend/目标进度条计算规则.md) | 目标进度后端计算规则 |
| [自动化计算规则.md](./backend/自动化计算规则.md) | 目标冻结阶段自动完成计算规则 |
| [前端页面说明模板 v1.md](./frontend/前端页面说明模板%20v1.md) | 前端页面说明模板 |
| [用户管理 - 前端.md](./frontend/用户管理%20-%20前端.md) | 用户管理页面 UI |
| [用户管理 - 后端.md](./backend/用户管理%20-%20后端.md) | 用户管理认证、用户模型和接口口径 |
| [权限管理 - 前端.md](./frontend/权限管理%20-%20前端.md) | 权限管理页面 UI |
| [权限管理 - 后端.md](./backend/权限管理%20-%20后端.md) | 权限管理 RBAC 模型和接口口径 |
| [GitHub 推送同步 - 后端.md](./backend/GitHub%20推送同步%20-%20后端.md) | GitHub push webhook 转发到 Mattermost ORF 频道 |
| [Codex 活动播报 - 后端.md](./backend/Codex%20活动播报%20-%20后端.md) | Codex 工作完成后的 Mattermost 活动小报 |
| [ORF 游戏化流程设计.md](./rules/ORF%20游戏化流程设计.md) | 指标作为悬赏流转的产品术语、核心原则和主支线流程 |
| [ORF 思路记录.md](./rules/ORF%20思路记录.md) | ORF 产品方法中待沉淀的原则和思路 |
| [积分自动计算规则.md](./rules/积分自动计算规则.md) | 积分自动计算后端规则口径 |
| [积分自动计算规则 - 前端.md](./frontend/积分自动计算规则%20-%20前端.md) | 积分自动计算前端展示和交互 |
| [设计原则.md](./design/设计原则.md) | ORF 业务原则、基础流程和积分规则 |
| [environment.md](./project/environment.md) | uv 和 npm 环境说明 |
| [code-standards.md](./project/code-standards.md) | 代码原则 |
