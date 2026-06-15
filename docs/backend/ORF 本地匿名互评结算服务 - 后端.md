# ORF 本地匿名互评结算服务 - 后端

匿名互评原始数据不进入 ORF 数据库。前端在浏览器内用共享私有服务公钥加密互评 payload，然后提交到 ORF 同源代理；ORF 后端只做认证、权限校验和转发，不解密、不保存原始互评。

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
ORF_LOCAL_SETTLEMENT_TIMEOUT_MS=5000
```

如果共享私有服务不是和 ORF 后端同宿主运行，而是绑定在局域网共享主机上，生产环境可改为：

```env
ORF_LOCAL_SETTLEMENT_SERVICE_URL=http://199.199.199.8:8799
```

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
| `POST /api/local-settlement/objectives/:objectiveId/reviews` | `POST /reviews` | 目标挑战者提交加密匿名互评 envelope |
| `POST /api/local-settlement/objectives/:objectiveId/summary` | `POST /objectives/:objectiveId/summary` | 指挥官验收时读取贡献比例汇总 |

ORF 后端代理读取 `/objectives/:objectiveId/summary` 产出的最终贡献比例，并在验收结算时把公开比例写入 `pointLedger`。旧 `POST /api/objectives/:objectiveId/contribution-reviews` 后端接口返回 `410`，不能再写入原始匿名互评。
