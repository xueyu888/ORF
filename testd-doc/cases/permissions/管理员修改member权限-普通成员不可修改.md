# 管理员修改member权限-普通成员不可修改

## 1. 测试目标

验证：普通成员不能进入权限管理页面，也不能修改 member 角色权限配置；普通成员可访问页面中不显示系统管理入口，member 角色权限配置保持不变。

边界：

- 覆盖对象：普通成员不可修改 member 角色权限。
- 不覆盖对象：管理员修改 member 角色权限、admin 角色固定权限、所有权限组合验证。
- B 基准：前端、后端、数据库、schema、Ory/Kratos 和当前浏览器可开测；不要求存在任何具体普通成员账号。
- Setup 产物：邮箱为 `orf-member-permission-forbidden-e2e@orf.local` 的普通成员认证身份、用户和 member 成员关系；修改前的 member 角色权限配置快照。
- Action 产物：普通成员打开悬赏大厅后的前端可见入口和权限配置保持结果。
- Clean 产物：删除本用例创建或覆盖的普通成员认证身份、普通成员用户和成员关系。
- 原状态恢复：本用例不修改 member 角色权限配置，Clean 不恢复权限配置；S1 必须证明权限配置与 Setup 记录一致。

## 2. 状态-动作模型

- B：基准状态。
  - [B-1] [api] 前端服务 应可用。
  - [B-2] [api] 后端服务 应可用。
  - [B-3] [api] 前端登录页入口 应可访问。
  - [B-4] [api] 当前会话查询能力 应可用。
  - [B-5] [prisma] ORF 数据库 应可连接。
  - [B-6] [prisma] ORF 数据库 schema 应为 当前测试版本。
  - [B-7] [api] Ory/Kratos 认证服务的管理和公共访问能力 应可用。
  - [B-8] [api] 当前会话 应为 未登录。
  - [B-9] [playwright] 当前浏览器 应不存在 Ory 登录会话 cookie。
  - [B-10] [playwright] 当前浏览器 应不保留本地登录态。

- Setup：构造 S0。
  - [Setup-1] [api] 准备普通成员认证身份，邮箱为 `orf-member-permission-forbidden-e2e@orf.local`，密码为固定测试密码。
  - [Setup-2] [prisma] 准备普通成员用户和默认团队成员关系，邮箱为 `orf-member-permission-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active`。
  - [Setup-3] [prisma] 记录修改前的 `member` 角色权限配置。
  - [Setup-4] [api] 撤销普通成员认证身份的残留登录会话。
  - [Setup-5] [playwright] 移除当前浏览器中的残留登录态。
  - [Setup-6] [playwright] 打开 ORF 登录页。
  - [Setup-7] [playwright] 在邮箱输入框输入普通成员固定测试邮箱。
  - [Setup-8] [playwright] 在密码输入框输入普通成员固定测试密码。
  - [Setup-9] [playwright] 点击 "Sign In" 登录操作。

- S0：Action 前状态。
  - [S0-1] [api] 当前会话 应为 邮箱为 `orf-member-permission-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话。
  - [S0-2] [playwright] "系统管理" 导航入口 应不可见。
  - [S0-3] [prisma] 修改前的 `member` 角色权限配置 应已记录。

- Action：被测业务动作。
  - [Action-1] [playwright] 普通成员打开悬赏大厅页面。

- S1：Action 后状态。
  - [S1-1] [playwright] 当前页面 应为 悬赏大厅。
  - [S1-2] [playwright] "系统管理" 导航入口 应不可见。
  - [S1-3] [playwright] 权限管理表格 应不可见。
  - [S1-4] [playwright] "保存角色权限" 操作 应不可见。
  - [S1-5] [prisma] `member` 角色权限配置 应等于 Setup 记录的修改前配置。
  - [S1-6] [api] 当前会话 应仍为 邮箱为 `orf-member-permission-forbidden-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话。

- Clean：恢复 B。
  - [Clean-1] [api] 注销当前登录会话。
  - [Clean-2] [playwright] 离开当前 ORF 前端页面。
  - [Clean-3] [playwright] 移除当前浏览器中的残留登录态。
  - [Clean-4] [api] 撤销普通成员认证身份的残留登录会话。
  - [Clean-5] [api] 删除邮箱为 `orf-member-permission-forbidden-e2e@orf.local` 的普通成员认证身份。
  - [Clean-6] [prisma] 删除普通成员用户的默认团队成员关系。
  - [Clean-7] [prisma] 删除邮箱为 `orf-member-permission-forbidden-e2e@orf.local` 的普通成员用户。
  - [Clean-8] [api] 邮箱为 `orf-member-permission-forbidden-e2e@orf.local` 的普通成员认证身份 应不存在。
  - [Clean-9] [prisma] 邮箱为 `orf-member-permission-forbidden-e2e@orf.local` 的普通成员用户 应不存在。
