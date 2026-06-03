# ORF 本地匿名互评结算服务 - 后端

匿名互评原始数据不进入 ORF 后端。前端在浏览器内用本地结算服务公钥加密互评 payload，然后直接提交到本地服务。

## 启动

单机模式适用于浏览器和本地结算服务运行在同一台机器：

```bash
npm run settlement:local
```

默认地址为 `http://127.0.0.1:8799`，只适合浏览器和结算服务都在同一台机器的测试。若局域网成员从自己的电脑访问 ORF，需要让他们的浏览器连接到结算服务所在机器的局域网地址，并通过环境变量调整监听地址：

```bash
ORF_LOCAL_SETTLEMENT_HOST=0.0.0.0 ORF_LOCAL_SETTLEMENT_PORT=8799 npm run settlement:local
```

也可以在 `.env` 中配置：

```env
VITE_ORF_LOCAL_SETTLEMENT_URL=http://<结算服务机器 IP>:8799
ORF_LOCAL_SETTLEMENT_HOST=0.0.0.0
ORF_LOCAL_SETTLEMENT_PORT=8799
ORF_LOCAL_SETTLEMENT_CORS_ORIGIN=*
```

前端提交地址通过 `VITE_ORF_LOCAL_SETTLEMENT_URL` 配置，默认同为 `http://127.0.0.1:8799`。局域网模式应配置为 `http://<结算服务机器 IP>:8799`；修改 `VITE_` 变量后需要重启 Vite 前端服务。

启动后先检查健康接口：

```bash
curl http://127.0.0.1:8799/health
```

如果前端提示“本地匿名互评结算服务不可用”，说明浏览器访问不到 `VITE_ORF_LOCAL_SETTLEMENT_URL` 指向的服务；先检查服务是否启动、端口是否监听、浏览器所在机器是否能访问该地址。

## 本地文件

服务首次启动会在 `~/.orf/local-settlement/` 生成：

| 文件 | 用途 |
| --- | --- |
| `settlement-key.json` | 本地 RSA 私钥、公钥和 keyId |
| `reviews.json` | 本地收到并解密后的匿名互评记录 |

这些文件不属于仓库，不能提交。私钥只保存在本机用户目录；需要备份时，只能备份该目录的加密压缩包。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/health` | 本地服务健康检查 |
| `GET` | `/public-key` | 返回前端加密用公钥 |
| `POST` | `/reviews` | 接收前端加密后的匿名互评 envelope |
| `POST` | `/objectives/:objectiveId/summary` | 根据本地互评计算贡献比例 |

ORF 后端只接收 `/objectives/:objectiveId/summary` 产出的最终贡献比例，并据此写入公开 `pointLedger`。旧 `POST /api/objectives/:objectiveId/contribution-reviews` 后端接口返回 `410`，不能再写入原始匿名互评。
