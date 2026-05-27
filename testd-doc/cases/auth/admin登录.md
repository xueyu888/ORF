## 1. 测试目标

验证：预置 ORF 管理员可以使用正确邮箱和密码，从当前浏览器未登录状态进入 ORF 管理员已登录状态，并看到管理员入口。

边界：

- 覆盖对象：管理员成功登录。
- 不覆盖对象：注册、错误密码、普通成员登录、权限变更、管理员创建。
- B 基础数据：预置管理员账号 "zrx831@gmail.com"，密码为 "123123123"，角色为 admin，状态为 active。
- Action 边界：只提交管理员登录表单。

## 2. 状态模型

- B：基准状态。
  - [api] 前端服务 应可用。
  - [api] 后端服务 应可用。
  - [api] 前端登录页入口 应可访问。
  - [api] 当前会话查询接口 应可访问。
  - [prisma] ORF 数据库 应可连接。
  - [prisma] ORF 数据库 schema 应为 当前测试版本。
  - [api] Ory/Kratos Admin/Public API 应可访问。
  - [api] 应存在 邮箱为 `zrx831@gmail.com` 的管理员测试身份。
  - [api] 管理员测试身份 的密码凭据 应可用。
  - [prisma] 应存在 邮箱为 `zrx831@gmail.com`、角色为 `admin`、状态为 `active` 的管理员用户。
  - [api] 当前会话 应为 未登录。
  - [playwright] 当前浏览器 应不存在 Ory session cookie。
  - [playwright] 当前浏览器 storage 应不包含 登录态。
  - [playwright] 受保护入口 `/tasks` 应重定向到 `/auth`。

- Setup：构造 S0。
  - [api] 记录管理员登录前的 `last_online_at`，用于 Clean 恢复。
  - [api] 撤销管理员测试身份可能残留的 Ory session。
  - [playwright] 创建全新的浏览器上下文，或清空当前上下文的 cookies/localStorage/sessionStorage。
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
  - [api] 应存在 Ory/Kratos 管理员测试身份。
  - [prisma] 应存在 ORF 管理员用户和 `admin` 成员关系。

- Action：被测业务动作。
  - [playwright] 在邮箱输入框输入管理员邮箱。
  - [playwright] 在密码输入框输入管理员密码。
  - [playwright] 在点击 "Sign In" 登录操作前注册登录接口响应捕获。
  - [playwright] 点击 "Sign In" 登录操作。

- S1：Action 后状态。
  - [api] 登录接口响应 应成功。
  - [playwright] 当前页面 应为 悬赏大厅。
  - [playwright] 浏览器上下文 cookies 应包含 `orf_ory_session`。
  - [api] 当前会话 应为 邮箱为 `zrx831@gmail.com`、角色为 `admin`、状态为 `active` 的已登录会话。
  - [playwright] 主导航 应可见。
  - [playwright] 当前用户入口 应可见。
  - [playwright] "退出登录" 操作 应可见。
  - [playwright] 管理员入口 `成员管理` 应可见。
  - [playwright] 管理员入口 `权限管理` 应可见。
  - [playwright] "Sign In" 登录操作 应不再作为当前页面主要操作出现。
  - [prisma] ORF 管理员用户和 `admin` 成员关系 应仍存在。

- Clean：恢复 B。
  - [api] 调用退出登录接口撤销本次登录产生的 Ory session。
  - [playwright] 清空当前浏览器上下文的 cookies/localStorage/sessionStorage。
  - [prisma] 恢复管理员登录前记录的 `last_online_at`。
  - [api] 撤销管理员测试身份可能残留的 Ory session。
  - [api] 管理员 Ory 身份 应仍存在。
  - [prisma] 管理员 ORF 用户和 `admin` 成员关系 应仍存在。
