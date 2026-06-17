## 1. 测试目标

验证：个人设置页面中，开启 Toast 通知后，点击系统通知测试时页面展示弹窗式提示信息；关闭 Toast 通知后，点击系统通知测试时页面不展示弹窗式提示信息。

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
  - [Setup-1] [api] 准备邮箱为 `orf-default-page-toast-e2e@orf.local`、使用固定测试密码的个人设置 Toast 通知测试认证身份。
  - [Setup-2] [prisma] 准备邮箱为 `orf-default-page-toast-e2e@orf.local`、姓名为 `ORF 默认页Toast通知用户`、角色为 `member`、状态为 `active` 的个人设置 Toast 通知测试用户。
  - [Setup-3] [api] 设置个人设置 Toast 通知测试用户默认进入页面为 首页（默认系统页）。
  - [Setup-4] [api] 设置个人设置 Toast 通知测试用户 Toast 通知偏好为 开启。
  - [Setup-5] [api] 撤销邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试认证身份的残留登录会话。
  - [Setup-6] [playwright] 移除当前浏览器中的残留登录态。
  - [Setup-7] [playwright] 打开 ORF 登录页。
  - [Setup-8] [playwright] 在邮箱输入框输入 `orf-default-page-toast-e2e@orf.local`。
  - [Setup-9] [playwright] 在密码输入框输入个人设置 Toast 通知测试固定密码。
  - [Setup-10] [playwright] 点击 "Sign In" 登录操作。
  - [Setup-11] [api] 当前会话 应为 邮箱为 `orf-default-page-toast-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话。
  - [Setup-12] [playwright] 打开 个人设置页面。

- S0：Action 前状态。
  - [S0-1] [api] 当前会话 应为 邮箱为 `orf-default-page-toast-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话。
  - [S0-2] [playwright] 当前页面 应为 个人设置页面。
  - [S0-3] [playwright] 个人设置页面的 Toast 通知设置项 应可见。
  - [S0-4] [playwright] 个人设置页面的 Toast 通知开关 应为 开启。
  - [S0-5] [playwright] 个人设置页面的 Toast 通知开关 应可点击。
  - [S0-6] [playwright] 个人设置页面的系统通知测试操作 应可见。
  - [S0-7] [playwright] 个人设置页面的系统通知测试操作 应可点击。
  - [S0-8] [api] 个人设置 Toast 通知测试用户的 Toast 通知偏好 应为 开启。

- Action：被测业务动作。
  - [Action-1] [playwright] 点击 个人设置页面的系统通知测试操作。
  - [Action-2] [playwright] 在个人设置页面的 Toast 通知开关选择 关闭。
  - [Action-3] [playwright] 点击 个人设置页面的系统通知测试操作。

- S1：Action 后状态。
  - [S1-1] [playwright] Toast 通知开启时点击系统通知测试后，页面 应显示 弹窗式提示信息。
  - [S1-2] [playwright] Toast 通知开启时点击系统通知测试后，弹窗式提示信息 应包含 `系统通知已发出`。
  - [S1-3] [api] Toast 通知开启时点击系统通知测试后，个人设置 Toast 通知测试用户的 Toast 通知偏好 应为 开启。
  - [S1-4] [playwright] Toast 通知关闭后，个人设置页面的 Toast 通知开关 应为 关闭。
  - [S1-5] [playwright] Toast 通知关闭时点击系统通知测试后，页面 应不显示 弹窗式提示信息。
  - [S1-6] [api] Toast 通知关闭时点击系统通知测试后，个人设置 Toast 通知测试用户的 Toast 通知偏好 应为 关闭。
  - [S1-7] [api] 当前会话 应为 邮箱为 `orf-default-page-toast-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话。

- Clean：恢复 B。
  - [Clean-1] [api] 注销当前登录会话。
  - [Clean-2] [playwright] 离开当前 ORF 前端页面。
  - [Clean-3] [playwright] 移除当前浏览器中的残留登录态。
  - [Clean-4] [api] 撤销邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试认证身份的残留登录会话。
  - [Clean-5] [api] 恢复邮箱为 `orf-default-page-toast-e2e@orf.local` 的默认进入页面为 系统默认。
  - [Clean-6] [api] 恢复邮箱为 `orf-default-page-toast-e2e@orf.local` 的 Toast 通知偏好为 开启。
  - [Clean-7] [api] 删除邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试认证身份。
  - [Clean-8] [prisma] 删除邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试用户的默认团队成员关系。
  - [Clean-9] [prisma] 删除邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试用户。
  - [Clean-10] [api] 邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试认证身份 应不存在。
  - [Clean-11] [prisma] 邮箱为 `orf-default-page-toast-e2e@orf.local` 的个人设置 Toast 通知测试用户 应不存在。
