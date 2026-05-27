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
  - [api] 前端服务 应可用。
  - [api] 后端服务 应可用。
  - [api] 前端登录页入口 应可访问。
  - [api] 当前会话查询接口 应可访问。
  - [prisma] ORF 数据库 应可连接。
  - [prisma] ORF 数据库 schema 应为 当前测试版本。
  - [api] Ory/Kratos Admin/Public API 应可访问。
  - [api] 当前会话 应为 未登录。
  - [playwright] 当前浏览器 应不存在 Ory session cookie。
  - [playwright] 当前浏览器 storage 应不包含 登录态。
  - [playwright] 受保护入口 `/bounties` 应重定向到 `/auth`。

- Setup：构造 S0。
  - [api] 准备邮箱为 `orf-member-login-e2e@orf.local` 的普通成员登录身份，并设置固定测试密码。
  - [prisma] 准备邮箱为 `orf-member-login-e2e@orf.local`、角色为 `member`、状态为 `active` 的普通成员用户。
  - [api] 撤销普通成员登录身份可能残留的 Ory session。
  - [playwright] 清理浏览器状态。
  - [playwright] 打开 登录页。

- S0：Action 前状态。
  - [playwright] 当前页面 应为 登录页。
  - [playwright] 登录页标题 "Sign in" 应可见。
  - [playwright] 邮箱输入框 应可见。
  - [playwright] 邮箱输入框的值 应为空。
  - [playwright] 密码输入框 应可见。
  - [playwright] 密码输入框的值 应为空。
  - [playwright] "Sign In" 登录操作 应可见。
  - [playwright] "Sign In" 登录操作 应可点击。
  - [api] 当前会话 应为 未登录。
  - [playwright] 浏览器上下文 cookies 应不包含 `orf_ory_session`。
  - [api] 认证系统中 应存在 邮箱为 `orf-member-login-e2e@orf.local` 的普通成员登录身份。
  - [api] 普通成员登录身份 的密码凭据 应可用。
  - [prisma] ORF 业务系统中 应存在 邮箱为 `orf-member-login-e2e@orf.local`、角色为 `member`、状态为 `active` 的普通成员用户。

- Action：被测业务动作。
  - [playwright] 在邮箱输入框输入普通成员测试邮箱。
  - [playwright] 在密码输入框输入普通成员测试密码。
  - [playwright] 在点击 "Sign In" 登录操作前注册登录接口响应捕获。
  - [playwright] 点击 "Sign In" 登录操作。

- S1：Action 后状态。
  - [api] 登录接口响应 应成功。
  - [playwright] 当前页面 应为 悬赏大厅。
  - [playwright] 浏览器上下文 cookies 应包含 `orf_ory_session`。
  - [api] 当前会话 应为 邮箱为 `orf-member-login-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话。
  - [playwright] 主导航 应可见。
  - [playwright] 当前用户入口 应可见。
  - [playwright] "退出登录" 操作 应可见。
  - [playwright] "Sign In" 登录操作 应不再作为当前页面主要操作出现。
  - [prisma] ORF 普通成员用户和 `member` 成员关系 应仍存在。

- Clean：恢复 B。
  - [api] 调用退出登录接口撤销本次登录产生的 Ory session。
  - [playwright] 当前页面离开 ORF 前端应用。
  - [playwright] 清理浏览器状态。
  - [api] 撤销普通成员登录身份的残留 Ory session。
  - [api] 删除邮箱为 `orf-member-login-e2e@orf.local` 的普通成员登录身份。
  - [prisma] 删除普通成员的默认团队成员关系。
  - [prisma] 删除邮箱为 `orf-member-login-e2e@orf.local` 的普通成员用户。
