# ORF 本地匿名互评结算服务 - 后端

匿名互评原始数据不进入 ORF 数据库。前端在浏览器内用共享私有服务公钥加密互评 payload，然后提交到 ORF 同源代理；ORF 后端只做认证、权限校验和转发，不解密、不保存原始互评。共享私有服务追加保存同一 reviewer 对同一目标的历史提交；挑战者读模型和指挥官汇总读模型只投影每个 reviewer 的最新一条记录。指挥官验收页可通过 ORF 代理读取共享服务返回的最新原始提交明细，但这些明细不进入 ORF 业务数据库或普通读模型。

## 服务归属

本地匿名互评服务已经迁出 ORF 仓库，归属同级私有仓库：

```text
/home/xue/code/orf-local-private-service
```

该服务同时承载：

- 匿名互评原始数据收集、解密、保存和贡献比例汇总。
- 本机聊天归档同步和查看器。

ORF 仓库只保留浏览器侧加密和 ORF 后端代理契约，不再提供本地服务进程、聊天归档页面、聊天归档 API、归档同步任务或归档数据库表。

## 后端配置

ORF 后端通过 `ORF_LOCAL_SETTLEMENT_SERVICE_URL` 找到共享私有服务：

```env
ORF_LOCAL_SETTLEMENT_SERVICE_URL=http://127.0.0.1:8799
ORF_LOCAL_SETTLEMENT_SERVICE_TOKEN=
ORF_LOCAL_SETTLEMENT_TIMEOUT_MS=5000
```

如果共享私有服务不是和 ORF 后端同宿主运行，而是绑定在局域网共享主机上，生产环境必须同时配置服务间 token：

```env
ORF_LOCAL_SETTLEMENT_SERVICE_URL=http://199.199.199.8:8799
ORF_LOCAL_SETTLEMENT_SERVICE_TOKEN=至少十六位的共享内部密钥
```

共享私有服务侧使用同一个值配置 `LOCAL_SERVICE_API_TOKEN`。当私有服务绑定到非 `127.0.0.1` / `localhost` 地址时，缺少 `LOCAL_SERVICE_API_TOKEN` 会拒绝启动，避免挑战者绕过 ORF 代理直接读取其他人的匿名互评明细。

浏览器端不再配置结算服务地址。正式页面、Win11 客户端和 Android 客户端统一访问 ORF 同源 API，避免 HTTPS 页面直连 HTTP 私有服务导致混合内容或 CORS 问题。

## 健康检查

共享服务启动后，ORF 后端所在机器应能访问：

```bash
curl "$ORF_LOCAL_SETTLEMENT_SERVICE_URL/health"
```

如果前端提示“匿名互评结算服务不可用”，说明 ORF 后端代理访问不到 `ORF_LOCAL_SETTLEMENT_SERVICE_URL` 指向的服务；先检查 `orf-local-private-service` 的 systemd 用户服务是否启动、监听地址是否正确，以及 ORF 后端所在机器是否能访问该地址。

## 接口契约

ORF 前端依赖以下 ORF 同源代理接口；ORF 后端再转发到共享私有服务：

| 前端同源 API | 私有服务路径 | 说明 |
| --- | --- | --- |
| `GET /api/local-settlement/health` | `GET /health` | 共享服务健康检查 |
| `GET /api/local-settlement/public-key` | `GET /public-key` | 返回前端加密用公钥 |
| `POST /api/local-settlement/objectives/:objectiveId/reviews` | `POST /reviews` | 目标挑战者提交加密匿名互评 envelope；私有服务要求 ORF 后端内部 token |
| `POST /api/local-settlement/objectives/:objectiveId/reviews/current` | `POST /objectives/:objectiveId/reviews/latest` | 当前目标挑战者读取自己最新一版匿名互评，用于重新评价时回填；私有服务要求 ORF 后端内部 token |
| `POST /api/local-settlement/objectives/:objectiveId/summary` | `POST /objectives/:objectiveId/summary` | 指挥官验收时读取提交状态、原始评分、均值、偏离提醒和默认贡献比例；私有服务要求 ORF 后端内部 token |

`/objectives/:objectiveId/summary` 返回：

- `submissions`：每个已提交成员的最新评分或弃权说明；新评分包含目标级 `allocations` 和逐指标 `metricScores`，历史旧评分可能只有目标级 `allocations`。
- `missingReviewers` / `reviewers` / `abstainedReviewers`：提交状态分组。
- `averages`：按当前已评分记录计算的成员均值、默认结算比例和相对均分偏离。
- `ratios`：验收页默认填入的贡献比例。
- `status`：`ready`、`missing`、`conflict` 只表示提示状态，不是验收阻塞条件。

普通成员重新打开匿名互评页时，ORF 后端通过 `/reviews/current` 读取本人最新一版提交；如果该提交包含 `metricScores`，前端回填每个指标行；如果是旧提交且只有目标级 `allocations`，前端只能展示最新比例提示，不能伪造指标行，也不能用本机旧草稿覆盖服务器最新提交。ORF 后端代理读取 `/objectives/:objectiveId/summary` 产出的默认贡献比例和提示明细；目标进入已验收后，结算时只把指挥官确认后的公开比例写入 `pointLedger`。旧 `POST /api/objectives/:objectiveId/contribution-reviews` 后端接口返回 `410`，不能再写入原始匿名互评。
