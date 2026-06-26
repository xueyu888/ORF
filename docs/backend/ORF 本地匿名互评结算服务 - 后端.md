# ORF 本地匿名互评结算服务 - 后端

匿名互评原始数据不进入 ORF 数据库。前端只提交当前用户填写的整数百分比矩阵或弃权说明；ORF 后端只做认证、目标权限、状态校验和代理，并按服务端目标指标、挑战者快照补齐矩阵元数据，不保存原始互评。共享私有服务是匿名互评草稿、提交历史、逐指标原始行、目标级汇总的唯一事实源；挑战者读模型只暴露本人草稿和本人最新提交，指挥官汇总读模型只投影每个 reviewer 的最新提交。

## 服务归属

本地匿名互评服务已经迁出 ORF 仓库，归属同级私有仓库：

```text
/home/xue/code/orf-local-private-service
```

该服务同时承载：

- 匿名互评原始数据收集、保存和贡献比例汇总。
- 本机聊天归档同步和查看器。

ORF 仓库只保留 ORF 后端代理契约和前端提交页，不再提供本地服务进程、聊天归档页面、聊天归档 API、归档同步任务或归档数据库表。

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

本机 `ORF_LOCAL_SETTLEMENT_SERVICE_URL` 指向 `127.0.0.1`、`localhost` 或 `::1` 时，`orf up` 会把该服务纳入启动前健康检查；不健康时会执行 `systemctl --user start orf-local-private-service.service`。如果服务部署在局域网共享主机，`orf up` 只检查健康状态，不在本机启动替代服务。匿名互评服务不健康时只打印警告并继续启动 ORF Backend / Frontend；受影响的是匿名互评草稿、提交、汇总和结算比例读取。

## 接口契约

ORF 前端依赖以下 ORF 同源代理接口；ORF 后端再转发到共享私有服务：

| 前端同源 API | 私有服务路径 | 说明 |
| --- | --- | --- |
| `GET /api/local-settlement/health` | `GET /health` | 共享服务健康检查 |
| `GET /api/local-settlement/objectives/:objectiveId/reviews/me` | `POST /objectives/:objectiveId/reviews/me` | 当前目标挑战者读取本人服务器草稿和本人最新一版提交；私有服务要求 ORF 后端内部 token |
| `PUT /api/local-settlement/objectives/:objectiveId/reviews/draft` | `PUT /objectives/:objectiveId/reviews/draft` | 当前目标挑战者自动保存一个覆盖式草稿；提交成功后清空 |
| `DELETE /api/local-settlement/objectives/:objectiveId/reviews/draft` | `DELETE /objectives/:objectiveId/reviews/draft` | 清空当前目标挑战者的服务器草稿 |
| `POST /api/local-settlement/objectives/:objectiveId/reviews/submit` | `POST /objectives/:objectiveId/reviews/submit` | 当前目标挑战者追加一条提交历史，并由私有服务从矩阵计算目标级贡献比例 |
| `POST /api/local-settlement/objectives/:objectiveId/summary` | `POST /objectives/:objectiveId/summary` | 指挥官验收时读取提交状态、原始评分、均值、偏离提醒和默认贡献比例；私有服务要求 ORF 后端内部 token |

`/objectives/:objectiveId/summary` 返回：

- `submissions`：每个已提交成员的最新评分或弃权说明；评分包含逐指标 `metricRows`、服务端派生的目标级 `allocations` 和逐指标 `metricScores`。
- `missingReviewers` / `reviewers` / `abstainedReviewers`：提交状态分组。
- `averages`：按当前已评分记录计算的成员均值、默认结算比例和相对均分偏离；服务内部使用 `basisPoints=10000` 表达 `100.00%`，避免两位小数汇总丢失。
- `ratios`：验收页默认填入的贡献比例。
- `status`：`ready`、`missing`、`conflict` 只表示提示状态，不是验收阻塞条件。

## 历史身份一致性

匿名互评历史文件里的 `reviewerUserId` 和 `memberUserId` 必须和 ORF 数据库里的 `Objective.challengerUserIds` / `users.id` 对齐；`reviewer`、`member`、`challengers` 只是当次提交和当前目标的展示文本。成员改名后，历史记录仍按稳定用户 ID 归属，汇总读模型用当前 `users.name` 生成展示名。

普通成员重新打开匿名互评页时，ORF 后端通过 `/reviews/me` 读取本人服务器草稿和本人最新一版提交；草稿优先回填，提交成功后私有服务立即清空草稿。ORF 后端代理读取 `/objectives/:objectiveId/summary` 产出的默认贡献比例和提示明细；目标进入已验收后，结算时只把指挥官确认后的公开比例写入 `pointLedger`，并按 `pointUnits=100` 表示 `1.00` 积分，用最大余数法保证个人积分合计等于目标结算积分。旧 `POST /api/objectives/:objectiveId/contribution-reviews` 后端接口返回 `410`，不能再写入原始匿名互评。
