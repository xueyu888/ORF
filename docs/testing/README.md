# Playwright 测试配置与启动

本文只记录当前仓库仍保留的 Playwright 数据化测试入口。

## 事实源

| 事实源 | 作用 |
| --- | --- |
| `package.json` | npm 脚本名称和命令 |
| `playwright.config.ts` | npm Playwright 脚本默认配置，`testDir` 为 `./testd` |
| `testd/testd.config.ts` | 数据化测试用例启用状态和 disabled spec 过滤 |

## 测试入口

| 类型 | 当前入口 | 配置 | 说明 |
| --- | --- | --- | --- |
| 数据化 Playwright 测试 | `npm run testd` | `playwright.config.ts` | 运行 `testd` 中已启用的用例 |

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

默认配置来自仓库根目录 [playwright.config.ts](../../playwright.config.ts)，输出目录是：

```text
.artifacts/playwright-test-results/
```

没有设置 `PLAYWRIGHT_BASE_URL` 时，Playwright 会自动启动前端。普通模式默认端口是 `5173`，真实系统模式默认端口是 `5174`。

```bash
ORF_REAL_E2E=1 npm run testd
```

## 指定被测地址

如果已经手动启动了前端，使用 `PLAYWRIGHT_BASE_URL` 指向现有地址：

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5173 npm run testd
```

设置后 Playwright 不会再自动启动前端。

## 输出结果

| 入口 | 输出目录 |
| --- | --- |
| `npm run testd` | `.artifacts/playwright-test-results/` |

## 常见问题

### 端口被占用

先手动启动前端，再用 `PLAYWRIGHT_BASE_URL` 指向它：

```bash
npm run dev:web -- --host 127.0.0.1 --port 5180
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5180 npm run testd
```
