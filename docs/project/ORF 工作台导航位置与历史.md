# ORF 工作台导航位置与历史

## 目标

ORF 工作台必须记住当前用户在当前设备/浏览器里的工作位置，并支持类似 VSCode 的后退和前进。这里的“位置”是导航和展示状态，不是业务事实。

## 事实源边界

- `workbench-navigation` 是工作位置、后退栈、前进栈和最后位置的唯一前端事实源。
- 工作位置只保存在当前设备/浏览器：当前 tab 的后退/前进栈使用 `sessionStorage`，最后位置使用 `localStorage`。
- 不做跨设备同步，不写个人设置 API，不写服务端，不进入数据库，也不通过 realtime 广播。
- 业务事实仍归各业务模块：聊天已读、通知已读、任务状态、反馈状态、工作日志数据、资源节点和权限判断不得从工作位置派生。
- URL 是可分享入口和路由事实，滚动位置、聚焦锚点和面板状态是本地展示状态。二者由工作台导航模块组合，但不能互相替代。

## 状态链

用户显式导航、命令菜单、搜索结果、通知打开或深链进入时，先得到一个 `WorkbenchLocation`，再进入工作台导航栈。React Router 只负责 URL 切换；页面加载完成后按该位置恢复滚动、聚焦对象或子面板。

后台刷新、实时对账、权限重定向、旧路由纠偏和页面内部规范化只能 `replace` 当前工作位置，不能新增历史。

页面滚动和聚焦对象变化只更新当前栈顶位置，不能每次滚动都 push 新历史。用户显式打开另一个业务对象时才新增历史。

## 模块职责

### `workbenchNavigationModel`

- 原则：拥有纯粹的工作位置结构、栈状态机、push/replace/pop/sync 规则。
- 边界：不读写浏览器存储，不调用 React Router，不访问 DOM，不知道业务数据。
- 接口：`createWorkbenchLocation`、`pushWorkbenchLocation`、`replaceWorkbenchLocation`、`goBackInWorkbenchStack`、`goForwardInWorkbenchStack`、`syncWorkbenchStackWithRouter`。
- 失败行为：非法 href、未知路由、外部 URL 返回 `null`，调用方不得把它们写入栈。

### `workbenchNavigationStore`

- 原则：拥有本地持久化格式和版本兼容。
- 边界：只用当前浏览器存储；不调用服务端、不跨设备同步、不写个人偏好。
- 接口：读写当前用户的栈和最后位置。
- 失败行为：浏览器存储不可用时退化为内存状态，不阻塞业务页面。

### `WorkbenchNavigationProvider`

- 原则：组合 React Router、工作台导航模型和本地存储，向 UI 暴露统一导航能力。
- 边界：不拥有任何业务事实，不决定页面内部对象是否可见；页面无效对象由页面 adapter 或原路由权限处理。
- 接口：`open`、`replace`、`goBack`、`goForward`、`updateCurrentViewport`、`canGoBack`、`canGoForward`。
- 失败行为：目标位置无法规范化时忽略；后退/前进栈为空时按钮禁用。

## 旧路径删除规则

- 侧边栏、移动端底栏、命令菜单、顶部按钮和待办入口不得再各自维护“导航意图”或并行跳转状态。
- 页面可以继续使用 React Router 的 URL 契约，但不能再新增页面级全局历史栈。
- 已经存在的页面局部位置逻辑如果只服务该页面内部视口，例如聊天消息列表锚点，可以作为页面 adapter 的内部实现；如果它影响全局进入位置，必须迁入工作台导航模块。

## 第一版范围

- 全局后退/前进按钮和 `Alt+←` / `Alt+→` 快捷键。
- 当前 tab 内的后退/前进栈。
- 当前设备/浏览器内的最后工作位置恢复。
- 全页面的 URL 和窗口滚动位置恢复。
- Chat、WorkLogs、Tasks、Feedback、Drive 的对象级 locator 继续使用现有 URL 契约，后续页面 adapter 只补足更精细的聚焦/滚动恢复，不改变业务事实源。
