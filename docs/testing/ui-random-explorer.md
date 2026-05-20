# UI Random Explorer

这套测试是 `U` 层通用 UI 随机探索，不是业务 E2E，也不是完整路径覆盖证明。

```text
U = 通用 UI 底层事件空间
A = 业务测试集合
Event = Operation + Target + Params
```

当前版本只实现 `U`：动态扫描 DOM 中的可交互组件，生成底层事件，随机执行，记录规范化状态图，并输出探索度报告。它不理解登录、注册、悬赏、结算等业务语义。后续如果需要，可以增加 `PatternMatcher`，把随机轨迹后验匹配到业务集合 `A`。

## 运行

默认目标页是登录后的 `/tasks`：

```bash
npm run test:e2e:explorer
```

测试入口会模拟已登录管理员会话，并返回受控的 ORF 初始业务数据、悬赏数据、成员权限数据和一条评论基线数据。随机探索会从任务页进入应用内主界面，而不是停在登录页。

默认安全边界配置在：

```text
e2e/_explorer/safetyBoundaryConfig.ts
```

并行加速版会启动多个独立 explorer worker，最后合并中文总报告：

```bash
UI_EXPLORER_WORKERS=4 UI_EXPLORER_STEPS=1000 npm run test:e2e:explorer:fast
```

并行版中 `UI_EXPLORER_STEPS` 是每个 worker 的步数；上面的命令总预算约为 `4 * 1000` 步。若希望指定总预算并自动平分，可以使用：

```bash
UI_EXPLORER_WORKERS=4 UI_EXPLORER_TOTAL_STEPS=4000 npm run test:e2e:explorer:fast
```

常用配置：

```bash
UI_EXPLORER_TARGET_PATH=/tasks \
UI_EXPLORER_STEPS=200 \
UI_EXPLORER_SEED=20260519 \
npm run test:e2e:explorer
```

报告默认输出到：

```text
.artifacts/ui-explorer/<timestamp>-seed-<seed>/
```

包含：

- `result.json`
- `report.html`

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `UI_EXPLORER_SAFETY_PROFILE` | `authenticatedApp` | 安全边界和测试数据场景名；`authenticatedApp` 测登录后主应用，`auth` 测未登录登录页 |
| `UI_EXPLORER_TARGET_PATH` | `/tasks` | 探索入口路径 |
| `UI_EXPLORER_STEPS` | `200` | 最大探索步数 |
| `UI_EXPLORER_SEED` | `Date.now()` | 随机种子 |
| `UI_EXPLORER_REPORT_DIR` | `.artifacts/ui-explorer` | 报告目录 |
| `UI_EXPLORER_MAX_NO_CHANGE` | `30` | 连续无状态变化后的 reset 阈值 |
| `UI_EXPLORER_BASE_URL` | Playwright `baseURL` | 目标 base URL |
| `UI_EXPLORER_ALLOWED_PATH_PATTERNS` | 登录后主页面集合 | 逗号分隔的允许路径；默认覆盖 `/tasks`、`/bounties`、`/objectives`、`/feedback`、`/members`、`/permissions`、`/settings` 等主应用页面 |
| `UI_EXPLORER_WORKERS` | `min(4, CPU)` | 并行 explorer worker 数，仅加速版使用 |
| `UI_EXPLORER_TOTAL_STEPS` | 未设置 | 并行加速版总步数，设置后会按 worker 平分 |
| `UI_EXPLORER_PORT` | `5673` | 并行加速版自启动 Vite 的端口 |
| `UI_EXPLORER_STOP_ON_ROUTE_ESCAPE` | 未开启 | 设置为 `1` 时，离开安全路径后结束本轮探索 |
| `UI_EXPLORER_BLOCKED_OPERATION_KINDS` | 空 | 逗号分隔的禁用操作，例如 `back` |
| `UI_EXPLORER_BLOCKED_TARGET_TEXT_PATTERNS` | `退出登录,logout,log out,sign out` | 逗号分隔的目标文本过滤，默认避免随机点退出登录后回到 `/auth` |
| `UI_EXPLORER_STATE_ABSTRACTOR` | `normal` | 状态合并策略名；当前内置 `normal` 和 `coarse` |
| `UI_EXPLORER_STATE_ABSTRACTOR_MODULE` | 未设置 | 可选注册模块；模块加载后可调用 `registerStateAbstractor()` 注册自定义策略 |
| `UI_EXPLORER_STATE_MODE` | `normal` | 兼容旧参数；未设置 `UI_EXPLORER_STATE_ABSTRACTOR` 时，`coarse` 会映射到同名抽象器 |

## 事件模型

随机事件统一建模为：

```text
Event = Operation + Target + Params
```

示例：

```text
Click(target)
DoubleClick(target)
Hover(target)
Focus(target)
InsertText(target, payloadKind)
PasteText(target, payloadKind)
Clear(target)
PressKey(key)
ModifiedKey(modifierSet, key)
SelectOption(target, optionBucket)
Wheel(direction, distance)
BackgroundClick(point)
Refresh()
Back()
Wait(duration)
```

事件生成层禁止出现业务动作，例如 `fillUsername`、`clickLogin`、`submitOrder`、`approveTask`。

## 状态规范化

状态不是完整 DOM hash，而是规范化后的页面指纹，包含：

- route pattern
- 可见可交互组件结构
- focus 所在组件签名
- 输入值类别
- error / toast / modal / loading / drawer flags
- enabled / disabled summary
- network pending bucket
- 主文本 hash

会过滤时间戳、随机 ID、图片 URL、背景图 URL、session id、token、精确坐标和随机输入原值。

状态合并策略通过 `stateAbstractorRegistry` 注册。浏览器端只采集 DOM snapshot，Node 端用注册的状态抽象函数把 snapshot 转成状态指纹。内置的 `normal` 是默认策略，`coarse` 会进一步忽略焦点、输入值类别、主文本 hash 和 target signature，只保留路径、组件结构、关键 UI flag 和 enabled/disabled 汇总。

自定义策略示例：

```ts
import { registerStateAbstractor, normalizeRoutePattern } from "./_explorer/stateNormalizer";

registerStateAbstractor("routeOnly", (snapshot) => ({
  routePattern: normalizeRoutePattern(new URL(snapshot.url).pathname),
  visibleTargetSummary: {},
  interactableStructure: [],
  focusedTargetSignature: null,
  inputValueKinds: [],
  flags: { ...snapshot.flags, isWhiteScreen: false },
  disabledSummary: { enabled: 0, disabled: 0 },
  networkPendingSummary: "custom",
  mainVisibleTextHash: "custom",
  targetSignatures: [],
}));
```

运行时加载注册模块并选择策略：

```bash
UI_EXPLORER_STATE_ABSTRACTOR_MODULE=./e2e/custom-state-abstractors.ts \
UI_EXPLORER_STATE_ABSTRACTOR=routeOnly \
npm run test:e2e:explorer
```

自定义策略会直接改变状态合并结果。策略越粗，越容易把实际不同的状态误合并。

## 探索度分数

报告里有两种候选覆盖口径：

- `stateScopedCandidateEventCoverage`：报告字段名仍为 `candidateEventCoverage`，按 `stateId -> eventSignature` 严格统计。同一个组件在不同状态里会重复计入，适合看前沿补洞压力。
- `canonicalCandidateEventCoverage`：按 `operation + 组件结构 + 参数类别` 归一后统计，忽略状态重复、动态 selector 和坐标差异，适合看底层事件族是否被探索过。

`targetCoverage` 按 `routePattern + DOM 目标签名` 统计。两个页面上外观相同的按钮，如果分别位于 `/tasks` 和 `/bounties`，会被视为两个不同目标；这保证路径入口不会因为组件外观相同而被压成一个覆盖点。

报告中的分数叫：

```text
Discovered Space Exploration Score
```

公式：

```text
score = 100 * (
  0.30 * candidateEventCoverage
  + 0.20 * targetCoverage
  + 0.20 * payloadKindCoverage
  + 0.15 * transitionGrowthSaturation
  + 0.15 * stateGrowthSaturation
)
```

This score estimates exploration over the discovered UI state space. It does not prove complete path coverage.

该分数只估算“已发现 UI 状态空间”的探索程度，不证明全系统路径已完整覆盖。

当前默认输入 payload 只保留 `asciiText`，实际文本是 `alpha-test`。这样可以控制状态空间规模，先集中观察登录后主应用页面的状态和事件覆盖。`PayloadKind` 类型仍保留其他类别，后续需要边界输入 fuzzing 时可以再扩展 active payload 列表。

## Replay

每次报告都会输出 seed 和 replay command。相同页面状态、相同候选事件集合、相同 seed 下，随机路径应保持可复现。

## 当前边界

- 当前版本只适合网页 UI。
- 不适合原生 App。
- canvas、WebGL、复杂 iframe、shadow DOM 需要额外适配。
- 默认只探索登录后的主应用页面，不探索登录、支付、删除路径等高风险或脱离当前场景的页面。
- 严重失败会使 spec fail；普通表单错误、4xx、route escape reset 只记录。
