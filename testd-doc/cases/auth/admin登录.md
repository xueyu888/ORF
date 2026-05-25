## 1. 测试目标

验证：已存在的 ORF 管理员，在 Ory/Kratos 中存在可用密码凭据时，可以使用正确邮箱和密码，从当前浏览器未登录状态进入 ORF 管理员已登录状态。

边界：

- 本用例只验证管理员成功登录，不验证注册、错误密码、普通成员登录、权限变更或管理员创建。
- 本用例使用预置管理员账号 `zrx831@gmail.com`，密码为 `123123123`，角色为 `admin`，状态为 `active`。
- 本用例的 Action 只包含管理员登录动作，不包含创建管理员、修改角色、写 cookie 或清理 session。

## 2. 状态模型

- B：测试开始前和 Clean 后都必须满足的基准状态，用于确认基础环境可用、预置管理员账号可用，且当前浏览器未登录。
  - [api] 前端和后端服务已正常启动，健康检查或等价探测通过。
  - [prisma] ORF 数据库连接正常，schema 已迁移到当前测试版本。
  - [api] Ory/Kratos 服务可访问，Admin/Public API 对测试环境可用。
  - [api] Ory/Kratos 中已存在管理员测试身份 `zrx831@gmail.com`，并具备可用密码凭据。
  - [prisma] ORF 中已存在管理员用户和 `team_members` 记录，角色为 `admin`，状态为 `active`。
  - [api] `/api/auth/session` 返回 `authenticated: false`。
  - [playwright] 当前浏览器上下文不存在 `orf_ory_session` cookie。
  - [playwright] localStorage/sessionStorage 不包含登录态。
  - [playwright] 访问受保护入口 `/tasks` 会回到 `/auth`。

- Setup：如何从 B 构造 S0？
  - [api] 记录管理员登录前的 `last_online_at`，用于 Clean 恢复。
  - [api] 撤销管理员测试身份可能残留的 Ory session。
  - [playwright] 创建全新的浏览器上下文，或清空当前上下文的 cookies/localStorage/sessionStorage。
  - [playwright] 打开 `/auth`。

- S0：Action 前必须满足什么条件？用于确认 Setup 成功。
  - [playwright] `page` URL 为 `/auth`。
  - [playwright] `page.getByRole("heading", { name: "Sign in" })` 可见。
  - [playwright] `page.getByLabel("Email")` 可见且值为空。
  - [playwright] `page.getByLabel("Password", { exact: true })` 可见且值为空。
  - [playwright] `page.getByRole("button", { name: "Sign In" })` 可见且可点击。
  - [api] `/api/auth/session` 返回 `authenticated: false`。
  - [playwright] 浏览器上下文 cookies 中不存在 `orf_ory_session`。
  - [api] Ory/Kratos 管理员测试身份存在。
  - [prisma] ORF 管理员用户和 `admin` 成员关系存在。

- Action：本次测试唯一要验证的业务动作是什么？
  - [playwright] 按业务语义定位 `Email` 输入框，输入管理员邮箱。
  - [playwright] 按业务语义精确定位 `Password` 输入框，输入管理员密码。
  - [playwright] 在点击 `Sign In` 前注册 `POST /api/auth/login` 响应捕获。
  - [playwright] 点击 `Sign In` 按钮提交登录表单。

- S1：Action 后系统应该变成什么状态？用于确认业务动作正确。
  - [api] `POST /api/auth/login` 响应成功。
  - [playwright] `page` URL 为 `/bounties`。
  - [playwright] 浏览器上下文 cookies 中存在 `orf_ory_session`。
  - [api] `/api/auth/session` 返回 `authenticated: true`，用户邮箱为 `zrx831@gmail.com`，角色为 `admin`，状态为 `active`。
  - [playwright] `page.getByLabel("主导航")` 可见。
  - [playwright] `page.getByLabel("当前用户")` 可见。
  - [playwright] `page.getByRole("button", { name: "退出登录" })` 可见。
  - [playwright] 管理员入口 `成员管理` 可见。
  - [playwright] 管理员入口 `权限管理` 可见。
  - [playwright] `page.getByRole("button", { name: "Sign In" })` 不再作为当前页面主要操作出现。
  - [prisma] ORF 管理员用户和 `admin` 成员关系仍然存在。

- Clean：如何清理并恢复到 B？
  - [api] 在当前浏览器上下文中调用 `/api/auth/logout`，撤销本次登录产生的 Ory session。
  - [playwright] 清空当前浏览器上下文的 cookies/localStorage/sessionStorage。
  - [prisma] 恢复管理员登录前记录的 `last_online_at`。
  - [api] 撤销管理员测试身份可能残留的 Ory session。
  - [api] 确认管理员 Ory 身份仍然存在。
  - [prisma] 确认管理员 ORF 用户和 `admin` 成员关系仍然存在。
