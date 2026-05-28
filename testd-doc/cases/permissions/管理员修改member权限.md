## 1. 测试目标

验证：由当前用例独占准备的已登录管理员可以修改 member 角色权限配置；保存后该配置可以再次读取，并在 Clean 中恢复为修改前状态。

边界：

- 覆盖对象：管理员修改 member 角色权限。
- 不覆盖对象：所有权限组合验证、普通成员越权修改权限。
- B 基准：前端、后端、数据库、schema、Ory/Kratos 和当前浏览器可开测；不要求存在任何具体管理员账号。
- Setup 产物：邮箱为 "orf-admin-permission-e2e@orf.local" 的管理员 Ory 身份、ORF 用户和默认团队 admin 成员关系。
- 共享状态恢复：member 角色权限配置属于共享配置，本用例只记录原状态、保存新状态，并在 Clean 中恢复原状态。
- Action 边界：只生成并保存一个明确权限 key，例如 "comment.manage"。

## 2. 状态模型

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
  - [Setup-1] [api] 准备邮箱为 `orf-admin-permission-e2e@orf.local`、使用固定测试密码的管理员登录身份。
  - [Setup-2] [prisma] 准备邮箱为 `orf-admin-permission-e2e@orf.local`、状态为 `active` 的权限测试用户。
  - [Setup-3] [prisma] 准备权限测试用户的默认团队 `admin` 成员关系。
  - [Setup-4] [api] 撤销邮箱为 `orf-admin-permission-e2e@orf.local` 的管理员登录身份可能残留的登录会话。
  - [Setup-5] [playwright] 移除当前浏览器中的残留登录态。
  - [Setup-6] [playwright] 打开 ORF 登录页。
  - [Setup-7] [playwright] 在邮箱输入框输入 `orf-admin-permission-e2e@orf.local`。
  - [Setup-8] [playwright] 在密码输入框输入管理员固定测试密码。
  - [Setup-9] [playwright] 点击 "Sign In" 登录操作。
  - [Setup-10] [api] 当前会话 应为 已登录。
  - [Setup-11] [api] 当前会话用户邮箱 应为 `orf-admin-permission-e2e@orf.local`。
  - [Setup-12] [api] 当前会话用户角色 应为 `admin`。
  - [Setup-13] [api] 当前会话用户状态 应为 `active`。
  - [Setup-14] [api] 记录修改前的 `member` 角色权限配置。
  - [Setup-15] [playwright] 打开 ORF 权限管理页面。

- S0：Action 前状态。
  - [S0-1] [api] 当前会话 应为 已登录。
  - [S0-2] [api] 当前会话用户邮箱 应为 `orf-admin-permission-e2e@orf.local`。
  - [S0-3] [api] 当前会话用户角色 应为 `admin`。
  - [S0-4] [api] 当前会话用户状态 应为 `active`。
  - [S0-5] [playwright] 当前页面 应为 权限管理页面。
  - [S0-6] [playwright] 权限管理页面中 "成员" 角色页签 应可见。
  - [S0-7] [playwright] 权限管理页面中 `comment.manage` 权限开关 应可见。
  - [S0-8] [api] 修改前的 `member` 角色权限配置 应已记录。

- Action：被测业务动作。
  - [Action-1] [api] 基于修改前的 `member` 角色权限配置，生成 `comment.manage` 被切换后的权限配置。
  - [Action-2] [api] 当前管理员 保存 `member` 角色的新权限配置。

- S1：Action 后状态。
  - [S1-1] [api] `member` 角色权限保存结果 应成功。
  - [S1-2] [api] 重新读取的 `member` 角色权限配置 应等于 Action 保存的新权限配置。
  - [S1-3] [api] 当前会话 应仍为 已登录。
  - [S1-4] [api] 当前会话用户邮箱 应仍为 `orf-admin-permission-e2e@orf.local`。
  - [S1-5] [api] 当前会话用户角色 应仍为 `admin`。
  - [S1-6] [api] 当前会话用户状态 应仍为 `active`。
  - [S1-7] [prisma] ORF 业务系统中 应仍存在 邮箱为 `orf-admin-permission-e2e@orf.local` 的权限测试用户。
  - [S1-8] [prisma] 权限测试用户的默认团队成员关系 应仍为 `admin`。

- Clean：恢复 B。
  - [Clean-1] [api] 恢复 `member` 角色权限配置为修改前状态。
  - [Clean-2] [api] 注销当前登录会话。
  - [Clean-3] [playwright] 离开当前 ORF 前端页面。
  - [Clean-4] [playwright] 移除当前浏览器中的残留登录态。
  - [Clean-5] [api] 撤销邮箱为 `orf-admin-permission-e2e@orf.local` 的管理员登录身份的残留登录会话。
  - [Clean-6] [api] 删除邮箱为 `orf-admin-permission-e2e@orf.local` 的管理员登录身份。
  - [Clean-7] [prisma] 删除邮箱为 `orf-admin-permission-e2e@orf.local` 的权限测试用户的默认团队成员关系。
  - [Clean-8] [prisma] 删除邮箱为 `orf-admin-permission-e2e@orf.local` 的权限测试用户。
