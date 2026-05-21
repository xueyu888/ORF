# E2E 测试配置与启动

本文只说明当前仓库 `e2e` 测试程序如何配置、启动和查看结果。测试思想和代码结构说明见：

- [UI Random Explorer](./ui-random-explorer.md)
- [状态探索与可重复组件](./ui-random-explorer/状态探索与可重复组件.md)
- [代码对照](./ui-random-explorer/代码对照.md)

## 测试入口

当前 `e2e` 目录里有两类测试：

| 类型 | 入口 | 作用 |
| --- | --- | --- |
| 业务 E2E | `e2e/**/*.spec.ts` | 按固定场景验证登录、任务、悬赏、评论、成员、权限等业务流程 |
| UI 随机探索 | `e2e/ui-random-explorer.spec.ts`、`e2e/_explorer/` | 登录后从指定页面进入应用，随机探索可交互 DOM、合并状态、记录异常、生成 HTML 报告 |

常用脚本定义在 [package.json](../../package.json)：

```bash
npm run test:e2e
npm run test:e2e:explorer
npm run test:e2e:explorer:fast
npm run test:e2e:explorer:live
```

## 前置条件

在仓库根目录执行命令：

```bash
cd /home/wuyz/prj/ORF/ORF
```

本项目要求：

```text
Node.js >= 22.12
npm >= 10.8
```

依赖安装：

```bash
npm install
```

如果本机没有 Playwright 浏览器：

```bash
npx playwright install chromium
```

## 启动方式

### 运行全部业务 E2E

```bash
npm run test:e2e
```

默认配置来自 [e2e/playwright.config.ts](../../e2e/playwright.config.ts)。如果没有设置 `PLAYWRIGHT_BASE_URL`，Playwright 会自动启动前端：

```text
http://127.0.0.1:5173
```

### 运行单进程 UI 随机探索

```bash
npm run test:e2e:explorer
```

默认会使用 `authenticatedApp` 安全边界，从 `/tasks` 进入登录后的主应用。测试前会安装受控的前端测试场景，所以它关注前端稳定性探索，不依赖真实后端写入数据。

### 运行并行 UI 随机探索

```bash
npm run test:e2e:explorer:fast
```

并行版由 [scripts/run-ui-explorer-parallel.ts](../../scripts/run-ui-explorer-parallel.ts) 启动多个独立 worker，最后合并为一份总报告。没有设置 `PLAYWRIGHT_BASE_URL` 时，它会自行启动 Vite，默认端口是：

```text
http://127.0.0.1:5673
```

### 运行实时 UI 随机探索

```bash
npm run test:e2e:explorer:live
```

实时模式会在启动时立即创建报告目录，并打印一个本地报告地址：

```text
http://127.0.0.1:5681/report.html
```

实时报告保持普通报告的完整结构。结果指标、异常情况、覆盖进度、探索曲线和可重复组件信息会实时刷新；状态图、测试环境和复现信息不会自动重绘，避免大图重排拖慢测试和浏览器。页面里的“更新完整报告”按钮会重新加载当前已落盘的完整报告，用于手动查看状态图等非实时区域的最新版本。没有设置 `UI_EXPLORER_STEPS` 时，实时模式默认不按步数结束，可以用 `Ctrl+C` 手动停止，停止时会写入最后一次 `result.json` 和完整 `report.html`。

实时观察测试进展时使用控制台打印的 `http://127.0.0.1:5681/report.html` 地址。测试结束后，报告目录里的 `report.html` 会是最终完整报告，可以直接从文件系统打开查看最终数据。

## 指定被测地址

如果已经手动启动了前端，使用 `PLAYWRIGHT_BASE_URL` 指向现有地址：

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npm run test:e2e:explorer
```

设置后 Playwright 不会再自动启动前端。

如果要跑真实系统模式：

```bash
ORF_REAL_E2E=1 npm run test:e2e
```

真实系统模式会使用 `5174` 作为默认前端端口，并把 Playwright worker 限制为 `1`，避免并发测试互相污染状态。

## UI 随机探索常用配置

随机探索配置主要由 [e2e/_explorer/safety.ts](../../e2e/_explorer/safety.ts) 读取。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `UI_EXPLORER_TARGET_PATH` | `/tasks` | 探索入口路径 |
| `UI_EXPLORER_SAFETY_PROFILE` | `authenticatedApp` | 安全边界；当前内置 `authenticatedApp` 和 `auth` |
| `UI_EXPLORER_SEED` | 当前时间 | 随机种子；复现问题时应固定 |
| `UI_EXPLORER_STEPS` | `1000` | 最大探索步数 |
| `UI_EXPLORER_MAX_DURATION_MS` | `0` | 最大运行时间，毫秒；`0` 表示不按时间结束 |
| `UI_EXPLORER_REPORT_DIR` | `.artifacts/ui-explorer` | 测试报告输出目录 |
| `UI_EXPLORER_ALLOWED_PATH_PATTERNS` | 安全边界默认值 | 允许探索的路径，逗号分隔 |
| `UI_EXPLORER_BLOCKED_PATH_PATTERNS` | 安全边界默认值 | 禁止进入的路径，逗号分隔 |
| `UI_EXPLORER_BLOCKED_TARGET_TEXT_PATTERNS` | `退出登录,logout,log out,sign out` | 禁止点击的目标文本，逗号分隔 |
| `UI_EXPLORER_MAX_STEP_DURATION_MS` | `1500` | 单个事件最大等待时间 |
| `UI_EXPLORER_STATE_ABSTRACTOR` | `stateExploration` | 状态合并策略 |
| `UI_EXPLORER_STATE_ABSTRACTOR_MODULE` | 未设置 | 自定义状态抽象注册模块 |
| `UI_EXPLORER_REPEATABLE_REGION_TESTS` | `1` | 是否在主探索后自动运行可重复区域局部测试 |
| `UI_EXPLORER_REPEATABLE_REGION_MAX_OBJECTS` | `12` | 最多测试多少个可重复区域对象 |
| `UI_EXPLORER_REPEATABLE_REGION_STEPS` | `8` | 每个可重复区域对象最多执行多少步 |
| `UI_EXPLORER_STATE_SCREENSHOT_LIMIT` | `200` | 最多保留多少张状态截图 |
| `UI_EXPLORER_ISSUE_SCREENSHOT_LIMIT` | `80` | 最多保留多少张异常截图 |

并行版额外读取：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `UI_EXPLORER_WORKERS` | 最多 `4` | 并行 worker 数 |
| `UI_EXPLORER_TOTAL_STEPS` | 未设置 | 总探索步数；设置后会按 worker 平分 |
| `UI_EXPLORER_PORT` | `5673` | 并行版自启动 Vite 的端口 |

实时版额外读取：

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `UI_EXPLORER_LIVE_PORT` | `5681` | 实时报告本地服务端口 |
| `UI_EXPLORER_LIVE_FLUSH_INTERVAL_MS` | `1000` | 实时指标刷新间隔 |
| `UI_EXPLORER_LIVE_RESULT_FLUSH_INTERVAL_MS` | `5000` | 完整 `result.json` 和 `report.html` 落盘间隔 |
| `UI_EXPLORER_LIVE_REPEATABLE_REGION_TESTS` | 未设置 | 设置为 `1` 时，主探索自然结束后执行可重复区域局部测试；实时无限探索默认关闭 |

## 示例命令

按时间跑 10 分钟，入口为 `/tasks`：

```bash
UI_EXPLORER_TARGET_PATH=/tasks \
UI_EXPLORER_SEED=tasks-10min \
UI_EXPLORER_STEPS=100000 \
UI_EXPLORER_MAX_DURATION_MS=600000 \
npm run test:e2e:explorer
```

并行跑 10 分钟，并把总步数预算交给 worker 平分：

```bash
UI_EXPLORER_SEED=parallel-10min \
UI_EXPLORER_TOTAL_STEPS=100000 \
UI_EXPLORER_MAX_DURATION_MS=600000 \
npm run test:e2e:explorer:fast
```

只探索登录页：

```bash
UI_EXPLORER_SAFETY_PROFILE=auth \
UI_EXPLORER_TARGET_PATH=/auth \
npm run test:e2e:explorer
```

实时观察，手动停止：

```bash
UI_EXPLORER_TARGET_PATH=/tasks \
UI_EXPLORER_SEED=live-tasks \
npm run test:e2e:explorer:live
```

## 自定义状态合并策略

状态合并策略通过 `stateAbstractorRegistry` 注册。运行时先加载 `UI_EXPLORER_STATE_ABSTRACTOR_MODULE`，再按 `UI_EXPLORER_STATE_ABSTRACTOR` 选择策略。

```bash
UI_EXPLORER_STATE_ABSTRACTOR_MODULE=./e2e/custom-state-abstractors.ts \
UI_EXPLORER_STATE_ABSTRACTOR=routeOnly \
npm run test:e2e:explorer
```

自定义模块负责调用 `registerStateAbstractor()`。这个接口只改变“DOM snapshot 如何抽象成状态指纹”，不应该和事件执行、报告生成、安全边界耦合在一起。

## 输出结果

普通 Playwright 产物：

```text
.artifacts/e2e-test-results/
```

UI 随机探索产物：

```text
.artifacts/ui-explorer/<timestamp>-seed-<seed>/
```

或并行合并产物：

```text
.artifacts/ui-explorer/<timestamp>-parallel-seed-<seed>/
```

主要文件：

| 文件 | 说明 |
| --- | --- |
| `result.json` | 本次测试的结构化结果 |
| `report.html` | 人看的总报告 |
| `repeatable-regions.json` | 可重复区域局部测试结构化结果 |
| `repeatable-regions.html` | 可重复区域局部测试报告 |
| `screenshots/issues/` | 异常步骤截图 |

打开 `report.html` 即可查看本次测试结果：

```bash
xdg-open .artifacts/ui-explorer/<run-dir>/report.html
```

WSL 环境也可以从 Windows 资源管理器打开：

```bash
explorer.exe .artifacts/ui-explorer
```

## 常见问题

### 端口被占用

如果默认端口被占用，可以先手动启动前端，再用 `PLAYWRIGHT_BASE_URL` 指向它：

```bash
npm run dev:web -- --host 127.0.0.1 --port 5180
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5180 npm run test:e2e:explorer
```

并行版也可以直接换自启动端口：

```bash
UI_EXPLORER_PORT=5680 npm run test:e2e:explorer:fast
```

### 随机探索离开了目标范围

优先收紧安全边界：

```bash
UI_EXPLORER_ALLOWED_PATH_PATTERNS=/tasks,/bounties \
UI_EXPLORER_BLOCKED_TARGET_TEXT_PATTERNS=退出登录,删除,logout \
npm run test:e2e:explorer
```

### 报告太大

减少截图和步数：

```bash
UI_EXPLORER_STATE_SCREENSHOT_LIMIT=50 \
UI_EXPLORER_ISSUE_SCREENSHOT_LIMIT=20 \
UI_EXPLORER_STEPS=2000 \
npm run test:e2e:explorer
```

### 需要复现同一次随机轨迹

固定 `SEED`、入口路径、步数、时间预算和安全边界：

```bash
UI_EXPLORER_SEED=case-001 \
UI_EXPLORER_TARGET_PATH=/tasks \
UI_EXPLORER_STEPS=100000 \
UI_EXPLORER_MAX_DURATION_MS=600000 \
UI_EXPLORER_SAFETY_PROFILE=authenticatedApp \
npm run test:e2e:explorer
```
