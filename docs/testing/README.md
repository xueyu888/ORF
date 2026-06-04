# Playwright 测试配置与启动

本文只记录当前仓库 Playwright 测试脚本、配置入口和 UI 随机探索启动方式。测试思想和代码结构说明见：

- [UI Random Explorer](./ui-random-explorer.md)
- [状态探索与可重复组件](./ui-random-explorer/状态探索与可重复组件.md)
- [代码对照](./ui-random-explorer/代码对照.md)

## 事实源

| 事实源 | 作用 |
| --- | --- |
| `package.json` | npm 脚本名称和命令 |
| `playwright.config.ts` | npm Playwright 脚本默认配置，`testDir` 为 `./testd` |
| `testd/testd.config.ts` | 数据化测试用例启用状态和 disabled spec 过滤 |
| `e2e/playwright.config.ts` | 手工运行 `e2e/**/*.spec.ts` 时使用的独立配置 |
| `e2e/_explorer/safety.ts` | UI 随机探索安全边界和环境变量 |

## 测试入口

| 类型 | 当前入口 | 配置 | 说明 |
| --- | --- | --- | --- |
| 数据化 Playwright 测试 | `npm run testd` 或 `npm run test:e2e` | `playwright.config.ts` | 运行 `testd` 中已启用的用例 |
| 单进程 UI 随机探索 | `npm run test:e2e:explorer` | `playwright.config.ts` + 指定 spec | 运行 `e2e/ui-random-explorer.spec.ts` |
| 并行 UI 随机探索 | `npm run test:e2e:explorer:fast` | `scripts/run-ui-explorer-parallel.ts` | 多 worker 探索并合并报告 |
| 实时 UI 随机探索 | `npm run test:e2e:explorer:live` | `scripts/run-ui-explorer-live.ts` | 运行时持续刷新 `report.html` 和 `live-summary.json` |
| 固定场景 E2E | `node scripts/with-public-ca.mjs playwright test -c e2e/playwright.config.ts` | `e2e/playwright.config.ts` | 手工运行 `e2e/**/*.spec.ts` |

## 前置条件

在仓库根目录执行命令。

```bash
npm install
npx playwright install chromium
```

本项目要求：

```text
Node.js >= 22.12
npm >= 10.8
```

Linux/WSL 环境首次安装可能还需要补齐 Chromium 系统依赖：

```bash
sudo npx playwright install-deps chromium
```

## 启动方式

### 运行当前数据化 Playwright 测试

```bash
npm run testd
```

`npm run test:e2e` 是同一套默认 Playwright 配置的别名。默认配置来自仓库根目录 [playwright.config.ts](../../playwright.config.ts)，输出目录是：

```text
.artifacts/playwright-test-results/
```

`npm run testd` 会先并行运行普通业务用例，再分别串行运行权限管理用例和 settings 用例。单独调试时可以直接使用：

```bash
npm run testd:isolated
npm run testd:permissions
npm run testd:settings
```

`npm run testd` 会为三段套件复用同一个 `TESTD_RUN_ID`；单独运行某个 suite 时，Playwright 配置会为本次运行生成 `TESTD_RUN_ID`。testd 会把邮箱、ID、标题、文件名等测试资源派生为运行内独占值。默认测试连接池为后端 `DATABASE_POOL_MAX=15`、testd 直连 `TESTD_DATABASE_POOL_MAX=2`。

普通业务用例不会修改 `role_permissions`。权限管理用例单独串行运行；`npm run testd` 默认先持有 TestD 全局锁，同一套共享 PG/Ory/MinIO 环境中同一时间只允许一套 TestD 运行，因此全局锁路径不会再额外抢角色权限 advisory 读写锁。只有显式绕过全局锁的调试路径才启用角色权限 advisory 锁：真正写入 member 角色权限的用例持独占锁，其他 testd 用例持共享锁。默认单用例超时为普通业务套件 60000ms、权限/settings 串行套件 180000ms，权限锁等待超时为 `TESTD_ROLE_PERMISSION_LOCK_TIMEOUT_MS=300000`。

没有设置 `PLAYWRIGHT_BASE_URL` 时，Playwright 会自动启动前端。普通模式默认端口是 `5173`，真实系统模式默认端口是 `5174`。

```bash
ORF_REAL_E2E=1 npm run testd
```

### 运行单进程 UI 随机探索

```bash
npm run test:e2e:explorer
```

默认使用 `authenticatedApp` 安全边界，从 `/tasks` 进入登录后的主应用。测试前会安装受控的前端测试场景，所以它关注前端稳定性探索，不依赖真实后端写入数据。

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

实时模式会在启动时创建报告目录，并打印本地报告地址：

```text
http://127.0.0.1:5681/report.html
```

没有设置 `UI_EXPLORER_STEPS` 时，实时模式默认不按步数结束，可以用 `Ctrl+C` 手动停止。停止时会写入最后一次 `result.json` 和完整 `report.html`。

### 手工运行 e2e 固定场景

```bash
node scripts/with-public-ca.mjs playwright test -c e2e/playwright.config.ts
```

该命令使用 [e2e/playwright.config.ts](../../e2e/playwright.config.ts)，测试目录是 `e2e/`，输出目录是：

```text
.artifacts/e2e-test-results/
```

## 指定被测地址

如果已经手动启动了前端，使用 `PLAYWRIGHT_BASE_URL` 指向现有地址：

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npm run test:e2e:explorer
```

设置后 Playwright 不会再自动启动前端。

## UI 随机探索配置

随机探索配置主要由 [e2e/_explorer/safety.ts](../../e2e/_explorer/safety.ts) 读取。

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `UI_EXPLORER_TARGET_PATH` | `/tasks` | 探索入口路径 |
| `UI_EXPLORER_SAFETY_PROFILE` | `authenticatedApp` | 安全边界；当前内置 `authenticatedApp` 和 `auth` |
| `UI_EXPLORER_SEED` | 当前时间 | 随机种子；复现问题时应固定 |
| `UI_EXPLORER_STEPS` | `1000` | 最大探索步数；实时模式未设置时不按步数结束 |
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
| `UI_EXPLORER_LIVE_REPEATABLE_REGION_TESTS` | 未设置 | 设置为 `1` 时，主探索自然结束后执行可重复区域局部测试 |

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

自定义模块负责调用 `registerStateAbstractor()`。这个接口只改变 DOM snapshot 如何抽象成状态指纹，不和事件执行、报告生成、安全边界耦合。

## 输出结果

| 入口 | 输出目录 |
| --- | --- |
| `npm run testd` / `npm run test:e2e` / `npm run test:e2e:explorer` | `.artifacts/playwright-test-results/` |
| `node scripts/with-public-ca.mjs playwright test -c e2e/playwright.config.ts` | `.artifacts/e2e-test-results/` |
| UI 随机探索报告 | `.artifacts/ui-explorer/<run-dir>/` |

UI 随机探索主要文件：

| 文件 | 说明 |
| --- | --- |
| `result.json` | 本次测试的结构化结果 |
| `report.html` | 人看的总报告 |
| `repeatable-regions.json` | 可重复区域局部测试结构化结果 |
| `repeatable-regions.html` | 可重复区域局部测试报告 |
| `screenshots/issues/` | 异常步骤截图 |

## 常见问题

### 端口被占用

先手动启动前端，再用 `PLAYWRIGHT_BASE_URL` 指向它：

```bash
npm run dev:web -- --host 127.0.0.1 --port 5180
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5180 npm run test:e2e:explorer
```

并行版也可以直接换自启动端口：

```bash
UI_EXPLORER_PORT=5680 npm run test:e2e:explorer:fast
```

### 随机探索离开目标范围

收紧安全边界：

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
