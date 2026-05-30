# 管理员修改member权限

## 1. 测试目标

验证：管理员可以在权限管理页面修改 member 角色的权限配置；保存后，重新读取的 member 角色权限配置与保存内容一致；Clean 阶段恢复修改前配置。

边界：

- 覆盖对象：管理员修改 member 角色权限。
- 不覆盖对象：所有权限组合验证、admin 角色固定权限、普通成员不可修改权限。
- B 基准：前端、后端、数据库、schema、Ory/Kratos 和当前浏览器可开测；不要求存在任何具体管理员账号。
- Setup 产物：邮箱为 `orf-admin-permission-e2e@orf.local` 的管理员认证身份、用户和 admin 成员关系；修改前的 member 角色权限配置快照。
- Action 产物：管理员在权限管理页面将 `comment.manage` 权限开关切换一次后保存的 member 角色权限配置。
- Clean 产物：恢复 member 角色权限配置为修改前状态；删除本用例创建或覆盖的管理员认证身份、管理员用户和成员关系。
- 原状态恢复：member 角色权限配置属于共享配置，Clean 必须恢复为 Setup 记录的修改前状态。

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
  - [Setup-1] [api] 准备管理员认证身份，邮箱为 `orf-admin-permission-e2e@orf.local`，密码为固定测试密码。
  - [Setup-2] [prisma] 准备管理员用户和默认团队成员关系，邮箱为 `orf-admin-permission-e2e@orf.local`、角色为 `admin`、状态为 `active`。
  - [Setup-3] [api] 撤销管理员认证身份的残留登录会话。
  - [Setup-4] [playwright] 移除当前浏览器中的残留登录态。
  - [Setup-5] [playwright] 打开 ORF 登录页。
  - [Setup-6] [playwright] 在邮箱输入框输入管理员固定测试邮箱。
  - [Setup-7] [playwright] 在密码输入框输入管理员固定测试密码。
  - [Setup-8] [playwright] 点击 "Sign In" 登录操作。
  - [Setup-9] [api] 记录修改前的 `member` 角色权限配置。
  - [Setup-10] [playwright] 打开权限管理页面。

- S0：Action 前状态。
  - [S0-1] [api] 当前会话 应为 邮箱为 `orf-admin-permission-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话。
  - [S0-2] [playwright] 当前页面 应为 权限管理页面。
  - [S0-3] [playwright] 权限管理页面中 "成员" 角色页签 应可见。
  - [S0-4] [playwright] 权限管理页面中 `comment.manage` 权限开关 应可见。
  - [S0-5] [api] 修改前的 `member` 角色权限配置 应已记录。

- Action：被测业务动作。
  - [Action-1] [playwright] 选择 "成员" 角色页签。
  - [Action-2] [playwright] 切换 `comment.manage` 权限开关。
  - [Action-3] [playwright] 点击 "保存角色权限" 操作。

- S1：Action 后状态。
  - [S1-1] [api] `member` 角色权限保存结果 应成功。
  - [S1-2] [api] 重新读取的 `member` 角色权限配置 应等于 Action 保存的新权限配置。
  - [S1-3] [api] 当前会话 应仍为 邮箱为 `orf-admin-permission-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话。
  - [S1-4] [prisma] 管理员用户 应仍存在，邮箱为 `orf-admin-permission-e2e@orf.local`、状态为 `active`。
  - [S1-5] [prisma] 管理员用户的默认团队成员关系 应仍存在，角色为 `admin`。

- Clean：恢复 B。
  - [Clean-1] [api] 恢复 `member` 角色权限配置为修改前状态。
  - [Clean-2] [api] 注销当前登录会话。
  - [Clean-3] [playwright] 离开当前 ORF 前端页面。
  - [Clean-4] [playwright] 移除当前浏览器中的残留登录态。
  - [Clean-5] [api] 撤销管理员认证身份的残留登录会话。
  - [Clean-6] [api] 删除邮箱为 `orf-admin-permission-e2e@orf.local` 的管理员认证身份。
  - [Clean-7] [prisma] 删除管理员用户的默认团队成员关系。
  - [Clean-8] [prisma] 删除邮箱为 `orf-admin-permission-e2e@orf.local` 的管理员用户。
  - [Clean-9] [api] 邮箱为 `orf-admin-permission-e2e@orf.local` 的管理员认证身份 应不存在。
  - [Clean-10] [prisma] 邮箱为 `orf-admin-permission-e2e@orf.local` 的管理员用户 应不存在。
