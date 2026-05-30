# 管理员删除成员-被 ORF 业务记录引用成员不可删除

## 1. 测试目标

验证：管理员不能删除已被 ORF 业务记录引用的成员；删除提交被后端拒绝后，该成员和引用该成员的业务记录保持不变。

边界：

- 覆盖对象：管理员不可删除被 ORF 业务记录引用的成员。
- 不覆盖对象：管理员删除未被引用成员、普通成员不可删除成员、编辑成员、停用成员、删除当前管理员自己。
- B 基准：前端、后端、数据库、schema、Ory/Kratos 和当前浏览器可开测；不要求存在任何具体管理员账号、被引用成员或业务目标。
- Setup 产物：邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local` 的管理员认证身份、用户和 admin 成员关系；邮箱为 `orf-member-delete-referenced-target-e2e@orf.local` 的被引用成员；标题为 `E2E-DELETE-REFERENCED-MEMBER-FORBIDDEN: 引用成员的目标` 且挑战成员包含被引用成员的目标。
- Action 产物：管理员对被引用成员执行删除操作后的删除提交结果。
- Clean 产物：删除本用例创建或覆盖的目标、管理员认证身份、管理员用户、成员关系和被引用成员。
- 原状态恢复：管理员账号、被引用成员和引用目标均为当前用例独占资源，Clean 直接删除，不恢复任何共享成员状态。

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
  - [Setup-1] [prisma] 删除本用例残留的引用目标及其派生数据。
  - [Setup-2] [prisma] 删除本用例残留的被引用成员。
  - [Setup-3] [api] 准备管理员认证身份，邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local`，密码为固定测试密码。
  - [Setup-4] [prisma] 准备管理员用户和默认团队成员关系，邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local`、角色为 `admin`、状态为 `active`。
  - [Setup-5] [prisma] 准备被引用成员，邮箱为 `orf-member-delete-referenced-target-e2e@orf.local`、角色为 `member`、状态为 `active`。
  - [Setup-6] [prisma] 创建标题为 `E2E-DELETE-REFERENCED-MEMBER-FORBIDDEN: 引用成员的目标`、流转状态为 `open`、阶段为 `resultClaiming` 且挑战成员包含被引用成员的目标。
  - [Setup-7] [api] 撤销管理员认证身份的残留登录会话。
  - [Setup-8] [playwright] 移除当前浏览器中的残留登录态。
  - [Setup-9] [playwright] 打开 ORF 登录页。
  - [Setup-10] [playwright] 在邮箱输入框输入管理员固定测试邮箱。
  - [Setup-11] [playwright] 在密码输入框输入管理员固定测试密码。
  - [Setup-12] [playwright] 点击 "Sign In" 登录操作。
  - [Setup-13] [playwright] 打开成员管理页面。

- S0：Action 前状态。
  - [S0-1] [api] 当前会话 应为 邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话。
  - [S0-2] [playwright] 当前页面 应为 成员管理页面。
  - [S0-3] [playwright] 成员管理列表 应显示 被引用成员。
  - [S0-4] [playwright] 被引用成员 的 "删除" 操作 应可见。
  - [S0-5] [prisma] 被引用成员 的默认团队成员关系 应存在，角色为 `member`。
  - [S0-6] [prisma] 本用例引用目标 的挑战成员列表 应包含 被引用成员。

- Action：被测业务动作。
  - [Action-1] [playwright] 点击 被引用成员 的 "删除" 操作并确认删除。

- S1：Action 后状态。
  - [S1-1] [api] 删除成员结果 应被拒绝，HTTP 状态码应为 409。
  - [S1-2] [playwright] 成员管理列表 应仍显示 被引用成员。
  - [S1-3] [prisma] 被引用成员 的默认团队成员关系 应仍存在，角色为 `member`。
  - [S1-4] [prisma] 被引用成员 的状态 应仍为 `active`。
  - [S1-5] [prisma] 本用例引用目标 的挑战成员列表 应仍包含 被引用成员。
  - [S1-6] [api] 当前会话 应仍为 邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local`、角色为 `admin`、状态为 `active` 的已登录会话。

- Clean：恢复 B。
  - [Clean-1] [prisma] 删除本用例引用目标及其派生数据。
  - [Clean-2] [prisma] 删除本用例被引用成员。
  - [Clean-3] [api] 注销当前登录会话。
  - [Clean-4] [playwright] 离开当前 ORF 前端页面。
  - [Clean-5] [playwright] 移除当前浏览器中的残留登录态。
  - [Clean-6] [api] 撤销管理员认证身份的残留登录会话。
  - [Clean-7] [api] 删除邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local` 的管理员认证身份。
  - [Clean-8] [prisma] 删除管理员用户的默认团队成员关系。
  - [Clean-9] [prisma] 删除邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local` 的管理员用户。
  - [Clean-10] [prisma] 本用例引用目标 应不存在。
  - [Clean-11] [prisma] 本用例被引用成员 应不存在。
  - [Clean-12] [api] 邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local` 的管理员认证身份 应不存在。
  - [Clean-13] [prisma] 邮箱为 `orf-admin-delete-referenced-member-e2e@orf.local` 的管理员用户 应不存在。
