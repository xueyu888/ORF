# 公网 IP 共享基础设施

本文记录无域名场景下的 ORF 共享 PostgreSQL、Ory、MinIO 部署约定。目标是让局域网成员本地运行前后端，但统一使用同一套后端基础设施。

## 1. 公网端口

当前日常公网映射只允许这些入口：

| 用途 | 公网端口 | 内部端口 | 说明 |
| --- | ---: | ---: | --- |
| ORF Web | `8443` | `8443` | ORF 前端稳定入口，使用 DuckDNS 域名证书，`/api` 同源转发到本机后端。 |
| Ory Public | `18443` | `18443` | ORF 后端访问 Ory Public API。 |
| MinIO S3 API | `19443` | `19443` | ORF 后端访问 S3-compatible API。 |
| PostgreSQL | `54321` | `5432` | 远程开发机和成员环境直连共享 ORF 数据库；必须使用 TLS、最小权限账号和 PostgreSQL 自身的 `pg_hba.conf` 访问控制。 |

当前路由器公网 IP 是 `125.70.13.137`。远程成员机器的 `DATABASE_URL`、`ORY_PUBLIC_URL` 和 `OBJECT_STORAGE_ENDPOINT` 必须以这个地址为事实源；DuckDNS A 记录也应指向这个地址。

服务器本机位于同一个局域网内，当前路由器不支持稳定 NAT 回环；本机运行 `orf up`、ORF 后端和 Ory 时不要把运行时依赖指向 `125.70.13.137`，应使用 `199.199.199.8:5432`、`127.0.0.1:4433` 和 `127.0.0.1:9000`。

`80` 和 `443` 不作为日常入口。只有明确重试公网 CA 证书时，才临时开放服务端 `acme-http-gateway` 并运行 `infra:public:cert:*`。如果路由器已经保留 `80 -> 199.199.199.8:80`，它也只应作为证书验证入口；日常 ORF Web 仍走 `8443`。

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
public-gateway:8443 -> ORF frontend/backend on host
router:54321 -> Windows PostgreSQL on 199.199.199.8:5432
acme-http-gateway:80/443 -> ACME challenge only
```

这样 Ory Admin 和 MinIO Console 不会因为路由器端口映射或局域网访问而意外暴露。PostgreSQL 允许远程成员直连，但只能暴露数据库服务端口，不能暴露 PostgreSQL 管理工具或 Windows 远程管理入口。

`docker-compose.public.yml` 还保留 `acme-http-gateway`。它只在运行证书脚本时临时发布 `80/443`，脚本结束后自动移除。

## 3. 初始化

首次配置公网 IP 和本地密钥：

```bash
npm run infra:public:env -- --public-ip <公网IP>
```

当前公网 IP 变化后，应重新执行：

```bash
npm run infra:public:env -- --public-ip 125.70.13.137
```

该命令会写入公网 IP、端口、证书和密钥配置。服务器本机运行时的依赖入口应保持本地/LAN：

```text
ORF_PUBLIC_IP=125.70.13.137
DATABASE_URL=postgresql://<user>:<password>@199.199.199.8:5432/orf?sslmode=verify-full&sslrootcert=<root.crt>&options=-csearch_path%3Dorf_current%2Cpublic
ORY_PUBLIC_URL=http://127.0.0.1:4433
OBJECT_STORAGE_ENDPOINT=http://127.0.0.1:9000
ORF_PUBLIC_CA_CERT=/abs/path/to/infra/public-ip/bootstrap-certs/fullchain.pem
MINIO_ROOT_USER=orf-root
OBJECT_STORAGE_ACCESS_KEY=orf-app
```

同时会生成 Ory 和 MinIO 密钥，但不会把密钥打印到终端。

远程成员机器如果需要手工配置共享基础设施，使用公网入口：

```text
DATABASE_URL=postgresql://<user>:<password>@125.70.13.137:54321/orf?sslmode=verify-full&sslrootcert=<root.crt>&options=-csearch_path%3Dorf_current%2Cpublic
ORY_PUBLIC_URL=https://125.70.13.137:18443
OBJECT_STORAGE_ENDPOINT=https://125.70.13.137:19443
```

如果确实要用脚本改写远程成员 `.env`，必须显式指定公网运行时入口和数据库公网端口：

```bash
npm run infra:public:env -- --public-ip 125.70.13.137 --runtime-public --database-port 54321
```

成员侧不需要执行这一步。成员机器应直接使用根目录 `orf-ory-minio-connect-*.tar.gz` 中的安装脚本，把现有 `.env` 切到共享 Ory / MinIO，并安装公共 CA 证书。

准备反向代理配置：

```bash
npm run infra:public:prepare
```

启动共享基础设施：

```bash
npm run infra:public:up
```

## 3.1 ORF Web 域名入口

ORF Web 的公网入口使用：

```text
https://orf-xueyu.duckdns.org:8443
```

路由器映射：

```text
orf-web-public: TCP 125.70.13.137:8443 -> 199.199.199.8:8443
```

本机 `.env` 需要配置：

```text
ORF_WEB_EXTERNAL_PORT=8443
ORF_DUCKDNS_DOMAIN=orf-xueyu.duckdns.org
ORF_DUCKDNS_TOKEN=<DuckDNS token>
ORF_DUCKDNS_PROPAGATION_SECONDS=120
ORF_APP_URL=https://orf-xueyu.duckdns.org:8443
CORS_ORIGIN=http://127.0.0.1:5173,http://localhost:5173,https://orf-xueyu.duckdns.org:8443
```

`ORF_DUCKDNS_TOKEN` 只写入本机 `.env`，不得写入仓库、文档正文或提交信息。

如果当前浏览器经过 VPN，DuckDNS 页面自动识别的 IP 可能不是服务器公网 IP。此时应手动把 DuckDNS `current ip` 改成 `125.70.13.137`，或运行：

```bash
npm run infra:public:duckdns:update
```

签发 DuckDNS 域名证书：

```bash
npm run infra:public:domain-cert:issue
```

续期：

```bash
npm run infra:public:domain-cert:renew
```

安装每日自动续期任务：

```bash
npm run infra:public:domain-cert:install-renewal
```

该路径使用 DNS-01 challenge，通过 DuckDNS TXT API 自动写入和清理 `_acme-challenge` 记录，因此不需要常驻开放公网 `80/443`。

## 4. 证书

无域名且 `80/443` 入站不可用时，默认使用本地 bootstrap IP 证书加 `ORF_PUBLIC_CA_CERT` 信任配置。数据传输仍走 HTTPS；证书信任由 ORF 本机和每个开发机的 `.env` 显式配置。

Let's Encrypt IP 地址证书免费，但 HTTP-01 固定需要公网 `80`，TLS-ALPN-01 固定需要公网 `443`。当前路由器已新增 `125.70.13.137:80 -> 199.199.199.8:80`，但本机 `80` 只有在 `acme-http-gateway` 启动时才应监听；未启动证书验证流程时，`199.199.199.8:80` 拒绝连接是预期状态。`443` 仍不作为日常入口。

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
| PostgreSQL | 远程成员使用 `.env` 的 `DATABASE_URL` 执行 `select 1`；本机运行 Ory/ORF 时可用 `199.199.199.8:5432` 避开路由器 NAT 回环限制。 |
| Ory | 请求 `ORY_PUBLIC_URL/health/ready`。 |
| MinIO | 请求 `OBJECT_STORAGE_ENDPOINT/minio/health/live`。 |
| ORF Web | 请求 `https://orf-xueyu.duckdns.org:8443/health`。 |

如果 Ory 或 MinIO 返回 TLS、连接拒绝或超时，优先检查公网端口映射、证书状态和 `public-gateway` 容器日志。

## 6. 安全约束

1. 日常发布 `8443`、`18443`、`19443` 和 `54321`。
2. `80/443` 仅在手工重试公网 CA 证书时临时开放。
3. PostgreSQL 必须保持 TLS、强密码、最小权限用户和 `pg_hba.conf` 限制；不得暴露超级用户账号。
4. MinIO bucket 保持私有；浏览器不直接访问对象存储。
5. ORF 使用独立 `orf-app` MinIO 用户，不使用 root 用户。
6. Ory 公网部署不使用 `--dev`。
7. `.env`、`infra/public-ip/letsencrypt/`、bootstrap 证书和运行时 Nginx 配置都不提交。
