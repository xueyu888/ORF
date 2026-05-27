## 1. 测试目标

验证：本用例准备的 ORF 普通成员可以使用正确邮箱和密码，从当前浏览器未登录状态进入 ORF 普通成员已登录状态。

边界：

- 覆盖对象：普通成员成功登录。
- 不覆盖对象：注册、错误密码、账号不存在、权限配置。
- Setup 产物：独占普通成员账号、干净浏览器状态和已打开的登录页。
- Clean 产物：邮箱为 "orf-member-login-e2e@orf.local" 的普通成员测试身份和用户。
- Action 边界：只提交普通成员登录表单。

## 2. 状态模型

- B：基准状态。
  - [B-1] [api] 前端服务 应可用。
  - [B-2] [api] 后端服务 应可用。
  - [B-3] [api] 前端登录页入口 应可访问。
  - [B-4] [api] 当前会话查询接口 应可访问。
  - [B-5] [prisma] ORF 数据库 应可连接。
  - [B-6] [prisma] ORF 数据库 schema 应为 当前测试版本。
  - [B-7] [api] Ory/Kratos Admin/Public API 应可访问。
  - [B-8] [api] 当前会话 应为 未登录。
  - [B-9] [playwright] 当前浏览器 应不存在 Ory session cookie。
  - [B-10] [playwright] 当前浏览器 storage 应不包含 登录态。
  - [B-11] [playwright] 受保护入口 `/bounties` 应重定向到 `/auth`。

- Setup：构造 S0。
  - [Setup-1] [api] 准备邮箱为 `orf-member-login-e2e@orf.local` 的普通成员登录身份，并设置固定测试密码。
  - [Setup-2] [prisma] 准备邮箱为 `orf-member-login-e2e@orf.local`、角色为 `member`、状态为 `active` 的普通成员用户。
  - [Setup-3] [api] 撤销普通成员登录身份可能残留的 Ory session。
  - [Setup-4] [playwright] 清理浏览器状态。
  - [Setup-5] [playwright] 打开 登录页。

- S0：Action 前状态。
  - [S0-1] [playwright] 当前页面 应为 登录页。
  - [S0-2] [playwright] 登录页标题 "Sign in" 应可见。
  - [S0-3] [playwright] 邮箱输入框 应可见。
  - [S0-4] [playwright] 邮箱输入框的值 应为空。
  - [S0-5] [playwright] 密码输入框 应可见。
  - [S0-6] [playwright] 密码输入框的值 应为空。
  - [S0-7] [playwright] "Sign In" 登录操作 应可见。
  - [S0-8] [playwright] "Sign In" 登录操作 应可点击。
  - [S0-9] [api] 当前会话 应为 未登录。
  - [S0-10] [playwright] 浏览器上下文 cookies 应不包含 `orf_ory_session`。
  - [S0-11] [api] 认证系统中 应存在 邮箱为 `orf-member-login-e2e@orf.local` 的普通成员登录身份。
  - [S0-12] [api] 普通成员登录身份 的密码凭据 应可用。
  - [S0-13] [prisma] ORF 业务系统中 应存在 邮箱为 `orf-member-login-e2e@orf.local`、角色为 `member`、状态为 `active` 的普通成员用户。

- Action：被测业务动作。
  - [Action-1] [playwright] 在邮箱输入框输入普通成员测试邮箱。
  - [Action-2] [playwright] 在密码输入框输入普通成员测试密码。
  - [Action-3] [playwright] 在点击 "Sign In" 登录操作前注册登录接口响应捕获。
  - [Action-4] [playwright] 点击 "Sign In" 登录操作。

- S1：Action 后状态。
  - [S1-1] [api] 登录接口响应 应成功。
  - [S1-2] [playwright] 当前页面 应为 悬赏大厅。
  - [S1-3] [playwright] 浏览器上下文 cookies 应包含 `orf_ory_session`。
  - [S1-4] [api] 当前会话 应为 邮箱为 `orf-member-login-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话。
  - [S1-5] [playwright] 主导航 应可见。
  - [S1-6] [playwright] 当前用户入口 应可见。
  - [S1-7] [playwright] "退出登录" 操作 应可见。
  - [S1-8] [playwright] "Sign In" 登录操作 应不再作为当前页面主要操作出现。
  - [S1-9] [prisma] ORF 普通成员用户和 `member` 成员关系 应仍存在。

- Clean：恢复 B。
  - [Clean-1] [api] 调用退出登录接口撤销本次登录产生的 Ory session。
  - [Clean-2] [playwright] 当前页面离开 ORF 前端应用。
  - [Clean-3] [playwright] 清理浏览器状态。
  - [Clean-4] [api] 撤销普通成员登录身份的残留 Ory session。
  - [Clean-5] [api] 删除邮箱为 `orf-member-login-e2e@orf.local` 的普通成员登录身份。
  - [Clean-6] [prisma] 删除普通成员的默认团队成员关系。
  - [Clean-7] [prisma] 删除邮箱为 `orf-member-login-e2e@orf.local` 的普通成员用户。
