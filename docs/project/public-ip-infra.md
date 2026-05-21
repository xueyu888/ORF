# 公网 IP 共享基础设施

本文记录无域名场景下的 ORF 共享 PostgreSQL、Ory、MinIO 部署约定。目标是让局域网成员本地运行前后端，但统一使用同一套后端基础设施。

## 1. 公网端口

当前日常公网映射只允许这些入口：

| 用途 | 公网端口 | 内部端口 | 说明 |
| --- | ---: | ---: | --- |
| Ory Public | `18443` | `18443` | ORF 后端访问 Ory Public API。 |
| MinIO S3 API | `19443` | `19443` | ORF 后端访问 S3-compatible API。 |

`80` 和 `443` 不作为日常入口。只有明确重试公网 CA 证书时，才临时开启路由器映射并运行 `infra:public:cert:*`。

禁止公网映射：

| 端口 | 服务 | 原因 |
| ---: | --- | --- |
| `4434` | Ory Admin | 管理口，只允许本机访问。 |
| `9000` | MinIO 原始 API | 必须经 HTTPS 反向代理。 |
| `9001` | MinIO Console | 管理后台，不常驻公网。 |

## 2. 服务边界

`docker-compose.ory.yml` 和 `docker-compose.minio.yml` 只把原始服务端口绑定到 `127.0.0.1`。公网入口统一由 `docker-compose.public.yml` 的 `public-gateway` 暴露：

```text
public-gateway:18443 -> kratos:4433
public-gateway:19443 -> minio:9000
```

这样 Ory Admin 和 MinIO Console 不会因为路由器端口映射或局域网访问而意外暴露。

`docker-compose.public.yml` 还保留 `acme-http-gateway`。它只在运行证书脚本时临时发布 `80/443`，脚本结束后自动移除。

## 3. 初始化

首次配置公网 IP 和本地密钥：

```bash
npm run infra:public:env -- --public-ip <公网IP>
```

该命令会写入 `.env`：

```text
ORY_PUBLIC_URL=https://<公网IP>:18443
OBJECT_STORAGE_ENDPOINT=https://<公网IP>:19443
ORF_PUBLIC_CA_CERT=/abs/path/to/infra/public-ip/bootstrap-certs/fullchain.pem
MINIO_ROOT_USER=orf-root
OBJECT_STORAGE_ACCESS_KEY=orf-app
```

同时会生成 Ory 和 MinIO 密钥，但不会把密钥打印到终端。

准备反向代理配置：

```bash
npm run infra:public:prepare
```

启动共享基础设施：

```bash
npm run infra:public:up
```

## 4. 证书

无域名且 `80/443` 入站不可用时，默认使用本地 bootstrap IP 证书加 `ORF_PUBLIC_CA_CERT` 信任配置。数据传输仍走 HTTPS；证书信任由 ORF 本机和每个开发机的 `.env` 显式配置。

Let's Encrypt IP 地址证书免费，但 HTTP-01 固定需要公网 `80`，TLS-ALPN-01 固定需要公网 `443`。当前已验证 `18443/19443` 可以从蜂窝网络访问，但 `80/443` 无法被 Let's Encrypt 验证节点连入，因此不作为默认方案。

先跑 staging 验证端口映射和 ACME challenge：

```bash
npm run infra:public:cert:staging
```

staging 成功后再签发正式证书：

```bash
npm run infra:public:cert:issue
```

续期：

```bash
npm run infra:public:cert:renew
```

`public-gateway` 在没有正式证书时会先使用本地 bootstrap 自签证书启动。bootstrap 证书有效期为 397 天；公网 IP 变化或证书剩余有效期不足 30 天时，`npm run infra:public:prepare` 会重新生成。正式证书签发成功后，脚本会重新生成 Nginx 配置并 reload。

如果公网 CA 签发失败，`ORF_PUBLIC_CA_CERT` 会让本机 ORF 命令和 `npm run server:*` 在进程启动时自动信任 bootstrap 证书。其他开发机使用这套共享 Ory/MinIO 时，也需要拿到该证书的公开部分，并在本机 `.env` 中设置自己的 `ORF_PUBLIC_CA_CERT` 路径。

## 5. 健康检查

基础设施启动后检查：

```bash
orf status
```

检查范围：

| 服务 | 检查 |
| --- | --- |
| PostgreSQL | 使用 `.env` 的 `DATABASE_URL` 执行 `select 1`。 |
| Ory | 请求 `ORY_PUBLIC_URL/health/ready`。 |
| MinIO | 请求 `OBJECT_STORAGE_ENDPOINT/minio/health/live`。 |

如果 Ory 或 MinIO 返回 TLS、连接拒绝或超时，优先检查公网端口映射、证书状态和 `public-gateway` 容器日志。

## 6. 安全约束

1. 日常只发布 `18443` 和 `19443`。
2. `80/443` 仅在手工重试公网 CA 证书时临时开放。
3. MinIO bucket 保持私有；浏览器不直接访问对象存储。
4. ORF 使用独立 `orf-app` MinIO 用户，不使用 root 用户。
5. Ory 公网部署不使用 `--dev`。
6. `.env`、`infra/public-ip/letsencrypt/`、bootstrap 证书和运行时 Nginx 配置都不提交。
