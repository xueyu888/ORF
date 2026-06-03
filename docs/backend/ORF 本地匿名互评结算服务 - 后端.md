# ORF 本地匿名互评结算服务 - 后端

匿名互评原始数据不进入 ORF 后端。前端在浏览器内用本机私有服务公钥加密互评 payload，然后直接提交到本机私有服务。

## 服务归属

本地匿名互评服务已经迁出 ORF 仓库，归属同级私有仓库：

```text
/home/xue/code/orf-local-private-service
```

该服务同时承载：

- 匿名互评原始数据收集、解密、保存和贡献比例汇总。
- 本机聊天归档同步和查看器。

ORF 仓库只保留浏览器侧调用契约，不再提供本地服务进程、聊天归档页面、聊天归档 API、归档同步任务或归档数据库表。

## 前端配置

ORF 前端通过 `VITE_ORF_LOCAL_SETTLEMENT_URL` 找到本机私有服务：

```env
VITE_ORF_LOCAL_SETTLEMENT_URL=http://127.0.0.1:8799
```

修改 `VITE_` 变量后需要重启 Vite 前端服务。

## 健康检查

本机服务启动后应能访问：

```bash
curl http://127.0.0.1:8799/health
```

如果前端提示“本地匿名互评结算服务不可用”，说明浏览器访问不到 `VITE_ORF_LOCAL_SETTLEMENT_URL` 指向的服务；先检查 `orf-local-private-service` 的 systemd 用户服务是否启动，以及当前浏览器所在机器是否能访问该地址。

## 接口契约

ORF 前端依赖以下本机私有服务接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 本机服务健康检查 |
| `GET` | `/public-key` | 返回前端加密用公钥 |
| `POST` | `/reviews` | 接收前端加密后的匿名互评 envelope |
| `POST` | `/objectives/:objectiveId/summary` | 根据本地互评计算贡献比例 |

ORF 后端只接收 `/objectives/:objectiveId/summary` 产出的最终贡献比例，并据此写入公开 `pointLedger`。旧 `POST /api/objectives/:objectiveId/contribution-reviews` 后端接口返回 `410`，不能再写入原始匿名互评。
