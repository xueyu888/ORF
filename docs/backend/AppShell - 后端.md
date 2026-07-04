# AppShell - 后端

AppShell 没有独立业务模型，也不拥有页面数据计算规则。

## 1. 职责边界

| 模块 | 后端职责 |
| --- | --- |
| 认证会话 | 提供当前登录用户会话 |
| 管理员判断 | 返回当前用户角色，供前端控制管理入口展示 |
| 全局搜索 | 当前由前端基于已加载数据展示，不提供独立搜索接口 |
| 全局动作 | 只负责导航或打开全局浮层；目标创建属于挑战页业务接口 |
| 聊天入口 | 读取普通聊天未读和聊天内系统会话未读；业务事件由消息系统投递 |
| 聊天目标工作区 | AppShell 只保存当前用户 workspace 布局偏好；目标、行动项和子行动项仍由任务管理读模型和任务 mutation 接口负责 |
| Toast | 前端 UI 状态，无后端职责 |

## 2. 接口依赖

| 场景 | 接口 |
| --- | --- |
| 登录态判断 | `/api/auth/session` |
| 登出 | `/api/auth/logout` |
| 任务管理数据 | `/api/tasks-page` |
| 聊天系统会话 | `/api/chat/system-conversations`、`/api/chat/system-conversations/:conversationId/messages` |
| 成员管理数据 | `/api/users` |
| 当前用户权限 | `/api/me/access` |
| 当前用户个人偏好 | `/api/settings/personal/preferences` |

## 3. 说明

AppShell 后端文档只记录全局外壳依赖的接口边界；`新建目标` 只是进入挑战页的入口，不在 AppShell 后端建立独立创建模型。
聊天页的目标/行动项工作区也是 AppShell 布局能力，不在 AppShell 后端复制目标或任务模型；它读取 `/api/tasks-page` 的同一目标读模型，并通过既有任务 mutation 修改行动项完成状态或新增行动项。
具体页面的数据结构、业务计算和权限规则写入对应后端文档。
消息系统模型和投递事件见 [消息系统开发.md](../project/消息系统开发.md)。
