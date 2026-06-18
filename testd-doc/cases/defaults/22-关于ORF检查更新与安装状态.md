## 1. 测试目标

验证：关于与更新页面中，点击检查更新后系统执行版本检查并展示检查结果；当前版本为最新版本时展示无需安装，存在新版本时展示可安装或更新状态。

## 2. 状态-动作模型

- B：基准状态。
  - [B-1] [api] 前端服务 应可用。
  - [B-2] [api] 后端服务 应可用。
  - [B-3] [api] 前端登录页入口 应可访问。
  - [B-4] [api] 当前会话查询能力 应可用。
  - [B-5] [prisma] ORF 数据库 应可连接。
  - [B-6] [prisma] ORF 数据库 schema 应为 当前测试版本。
  - [B-7] [api] Ory/Kratos 认证服务的管理和公共访问能力 应可用。
  - [B-8] [mock] 客户端更新检查 Mock 能力 应可用。
  - [B-9] [api] 当前会话 应为 未登录。
  - [B-10] [playwright] 当前浏览器 应不存在 Ory 登录会话 cookie。
  - [B-11] [playwright] 当前浏览器 应不保留本地登录态。

- Setup：构造 S0。
  - [Setup-1] [api] 准备邮箱为 `orf-default-page-update-status-e2e@orf.local`、使用固定测试密码的关于 ORF 检查更新测试认证身份。
  - [Setup-2] [prisma] 准备邮箱为 `orf-default-page-update-status-e2e@orf.local`、姓名为 `ORF 检查更新用户`、角色为 `member`、状态为 `active` 的关于 ORF 检查更新测试用户。
  - [Setup-3] [api] 设置关于 ORF 检查更新测试用户默认进入页面为 首页（默认系统页）。
  - [Setup-4] [api] 撤销邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试认证身份的残留登录会话。
  - [Setup-5] [playwright] 移除当前浏览器中的残留登录态。
  - [Setup-6] [mock] 设置客户端当前版本为 `0.0.0`。
  - [Setup-7] [mock] 设置客户端更新检查结果为 当前版本已是最新版本。
  - [Setup-8] [playwright] 打开 ORF 登录页。
  - [Setup-9] [playwright] 在邮箱输入框输入 `orf-default-page-update-status-e2e@orf.local`。
  - [Setup-10] [playwright] 在密码输入框输入关于 ORF 检查更新测试固定密码。
  - [Setup-11] [playwright] 点击 "Sign In" 登录操作。
  - [Setup-12] [api] 当前会话 应为 邮箱为 `orf-default-page-update-status-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话。
  - [Setup-13] [playwright] 打开 首页（默认系统页）。
  - [Setup-14] [playwright] 点击 侧边栏底部的用户菜单入口。
  - [Setup-15] [playwright] 点击 用户菜单中的 "关于与更新" 操作。

- S0：Action 前状态。
  - [S0-1] [api] 当前会话 应为 邮箱为 `orf-default-page-update-status-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话。
  - [S0-2] [playwright] 当前页面 应为 首页（默认系统页）。
  - [S0-3] [playwright] 关于与更新弹窗 应可见。
  - [S0-4] [playwright] 关于与更新弹窗 应显示 `版本与更新` 标题。
  - [S0-5] [playwright] 关于与更新弹窗的检查更新操作 应可见。
  - [S0-6] [playwright] 关于与更新弹窗的检查更新操作 应可点击。
  - [S0-7] [playwright] 关于与更新弹窗的安装操作 应显示 无需安装。

- Action：被测业务动作。
  - [Action-1] [playwright] 点击 关于与更新弹窗的检查更新操作。
  - [Action-2] [mock] 设置客户端更新检查结果为 存在新版本且包含当前客户端可用安装包。
  - [Action-3] [playwright] 点击 关于与更新弹窗的检查更新操作。

- S1：Action 后状态。
  - [S1-1] [playwright] 第一次检查更新后，关于与更新弹窗 应显示 当前已经是最新版本。
  - [S1-2] [playwright] 第一次检查更新后，关于与更新弹窗的安装操作 应显示 无需安装。
  - [S1-3] [playwright] 第一次检查更新后，关于与更新弹窗的最新版本信息 应显示 `0.0.0`。
  - [S1-4] [playwright] 第二次检查更新后，关于与更新弹窗 应显示 发现 ORF 客户端新版本。
  - [S1-5] [playwright] 第二次检查更新后，关于与更新弹窗的最新版本信息 应显示 `0.0.1`。
  - [S1-6] [playwright] 第二次检查更新后，关于与更新弹窗的安装包信息 应显示 可用安装包。
  - [S1-7] [playwright] 第二次检查更新后，关于与更新弹窗的安装操作 应显示 下载并安装。
  - [S1-8] [playwright] 第二次检查更新后，关于与更新弹窗的安装操作 应可点击。
  - [S1-9] [api] 当前会话 应仍为 邮箱为 `orf-default-page-update-status-e2e@orf.local`、角色为 `member`、状态为 `active` 的已登录会话。

- Clean：恢复 B。
  - [Clean-1] [api] 注销当前登录会话。
  - [Clean-2] [playwright] 离开当前 ORF 前端页面。
  - [Clean-3] [playwright] 移除当前浏览器中的残留登录态。
  - [Clean-4] [api] 撤销邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试认证身份的残留登录会话。
  - [Clean-5] [api] 恢复邮箱为 `orf-default-page-update-status-e2e@orf.local` 的默认进入页面为 系统默认。
  - [Clean-6] [api] 删除邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试认证身份。
  - [Clean-7] [prisma] 删除邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试用户的默认团队成员关系。
  - [Clean-8] [prisma] 删除邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试用户。
  - [Clean-9] [api] 邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试认证身份 应不存在。
  - [Clean-10] [prisma] 邮箱为 `orf-default-page-update-status-e2e@orf.local` 的关于 ORF 检查更新测试用户 应不存在。
