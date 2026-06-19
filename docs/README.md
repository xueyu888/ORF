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
└─ testing/      测试工具和测试策略
```

## 常用入口

| 文档 | 说明 |
| --- | --- |
| [AppShell - 前端.md](./frontend/AppShell%20-%20前端.md) | 全局侧边栏、顶部栏、全局搜索、新建入口和全局浮层 |
| [AppShell - 后端.md](./backend/AppShell%20-%20后端.md) | AppShell 依赖的认证、权限和接口边界 |
| [ORF 我的挑战页面 - 前端.md](./frontend/ORF%20我的挑战页面%20-%20前端.md) | 我的挑战内容区 UI、字段展示和可见交互 |
| [ORF 工作日志页面 - 前端.md](./frontend/ORF%20工作日志页面%20-%20前端.md) | 每日目标日志填写、团队动态和提醒横幅交互 |
| [ORF 反馈收件箱 - 前端.md](./frontend/ORF%20反馈收件箱%20-%20前端.md) | 反馈列表、筛选器和新建反馈入口显隐 |
| [ORF 统计页面 - 前端.md](./frontend/ORF%20统计页面%20-%20前端.md) | 排行榜和积分时间范围计算 |
| [ORF 提交战利品页 - 前端.md](./frontend/ORF%20提交战利品页%20-%20前端.md) | 目标战利品提交子页面 UI 和提交交互 |
| [ORF 挑战交互组件 - 前端.md](./frontend/ORF%20挑战交互组件%20-%20前端.md) | 挑战页行操作、权限拦截、拖拽反馈和删除确认 |
| [ORF 悬赏目标流程 - 前端.md](./frontend/ORF%20悬赏目标流程%20-%20前端.md) | 悬赏大厅、悬赏目标流程阶段和操作入口 UI |
| [评论组件 - 前端.md](./frontend/评论组件%20-%20前端.md) | 评论浮窗 UI 和交互 |
| [ORF 任务管理页面 - 后端.md](./backend/ORF%20任务管理页面%20-%20后端.md) | 我的挑战后端集合、目标挑战关系、字段契约和交互业务约束 |
| [ORF 工作日志 - 后端.md](./backend/ORF%20工作日志%20-%20后端.md) | 个人每日目标日志事实源、API、权限和 17:20 提醒 |
| [ORF 提交战利品 - 后端.md](./backend/ORF%20提交战利品%20-%20后端.md) | 目标战利品提交契约 |
| [ORF 本地匿名互评结算服务 - 后端.md](./backend/ORF%20本地匿名互评结算服务%20-%20后端.md) | ORF 同源代理到共享匿名互评服务的接口契约 |
| [评论组件 - 后端.md](./backend/评论组件%20-%20后端.md) | 评论持久化、返回集合和权限边界 |
| [目标进度条计算规则.md](./backend/目标进度条计算规则.md) | 目标进度后端字段规则 |
| [前端页面说明模板 v1.md](./frontend/前端页面说明模板%20v1.md) | 前端页面说明模板 |
| [用户管理 - 前端.md](./frontend/用户管理%20-%20前端.md) | 用户管理页面 UI |
| [用户管理 - 后端.md](./backend/用户管理%20-%20后端.md) | 用户管理认证、用户模型和接口口径 |
| [权限管理 - 前端.md](./frontend/权限管理%20-%20前端.md) | 权限管理页面 UI |
| [权限管理 - 后端.md](./backend/权限管理%20-%20后端.md) | 权限管理 RBAC 模型和接口口径 |
| [设置边界规则.md](./rules/设置边界规则.md) | 个人设置和系统设置的作用域、权限和背景分层 |
| [ORF 项目归属边界决策草案.md](./rules/ORF%20项目归属边界决策草案.md) | issue #39 的 Project 必要性、替代方案和决策问题 |
| [设置页面 - 前端.md](./设置页面%20-%20前端.md) | 个人设置和系统设置页面、入口和前端状态 |
| [设置页面 - 后端.md](./设置页面%20-%20后端.md) | 个人偏好、系统背景和设置接口边界 |
| [对象存储 - 后端.md](./backend/对象存储%20-%20后端.md) | S3/MinIO 对象存储、上传文件和迁移契约 |
| [GitHub ORF 聊天同步 - 后端.md](./backend/GitHub%20ORF%20聊天同步%20-%20后端.md) | GitHub push/issues 投递到 ORF 原生聊天频道并按投递 key 去重 |
| [GitLab ORF 聊天集成 - 后端.md](./backend/GitLab%20ORF%20聊天集成%20-%20后端.md) | GitLab project 自动映射 ORF 原生聊天频道，并把 webhook 事件按 ledger 去重投递为普通聊天消息 |
| [消息系统开发.md](./project/消息系统开发.md) | 系统内消息模型、投递事件、接口和前端入口 |
| [评论图片附件迁移方案.md](./project/评论图片附件迁移方案.md) | 评论附件从图片阶段扩展到通用文件的 S3/MinIO 分阶段迁移记录 |
| [ORF 悬赏目标流程设计.md](./rules/ORF%20悬赏目标流程设计.md) | 悬赏目标流程的产品术语、核心原则和状态流转 |
| [ORF 思路记录.md](./rules/ORF%20思路记录.md) | ORF 产品方法中待沉淀的原则和思路 |
| [积分结算规则.md](./rules/积分结算规则.md) | 积分结算后端规则口径 |
| [贡献评价与积分分配规则.md](./rules/贡献评价与积分分配规则.md) | 匿名互评、贡献比例和积分分配规则 |
| [积分结算规则 - 前端.md](./frontend/积分结算规则%20-%20前端.md) | 积分结算前端展示和交互 |
| [设计原则.md](./design/设计原则.md) | ORF 业务原则、基础流程和积分规则 |
| [environment.md](./project/environment.md) | uv 和 npm 环境说明 |
| [public-ip-infra.md](./project/public-ip-infra.md) | 无域名公网 IP 共享 PG/Ory/MinIO 的部署约定 |
| [client-release.md](./project/client-release.md) | Win11 和 Android 客户端打包、发布和签名边界 |
| [code-standards.md](./project/code-standards.md) | 代码原则 |
| [testing/README.md](./testing/README.md) | Playwright 测试脚本、配置入口和 UI 随机探索启动方式 |
