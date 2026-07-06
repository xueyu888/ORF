# ORF 环境设计

## 接口访问约定

前端数据统一通过同源 `/api` 请求后端接口，例如 `/api/tasks`。
前端不直接写死后端域名或端口，开发和生产环境由代理或网关转发到实际后端服务。

## Objective

为 ORF 项目建立最小、可重复、可检查的 uv 和 npm 基础环境，让后续项目管理软件的文档驱动开发有稳定仓库基础。

## Results

- 根目录提供 `pyproject.toml`，用于声明 ORF 的 Python/uv 项目环境。
- 根目录提供 `package.json`，用于声明 ORF 的 Node.js/npm 项目环境和基础检查命令。
- 根目录提供 `.gitignore`，避免提交本地虚拟环境、依赖目录、构建产物和敏感环境变量。
- 当前阶段不生成任何业务代码，只准备环境和文档驱动规则。

## Current Local Environment

当前开发环境在 Windows 11 + WSL2 中运行：

- WSL 发行版：Ubuntu 22.04.5 LTS。
- WSL 内核标识：`microsoft-standard-WSL2`。
- 当前仓库路径：`/home/xue/code/ORF`。
- Windows 侧 Google Chrome 路径：`/mnt/c/Program Files/Google/Chrome/Application/chrome.exe`。
- Node.js：`v22.17.1`。
- npm：`10.9.2`。
- uv：`0.7.21`。

## Database Resilience

开发环境默认连接 `.env` 中的远端 PostgreSQL。远端数据库不可达时，后端必须快速失败，而不是让登录或页面请求长时间悬挂。

数据库连接池由以下环境变量控制：

| 变量 | 默认值 | 用途 |
| --- | --- | --- |
| `DATABASE_POOL_MAX` | `10` | 最大连接数 |
| `DATABASE_CONNECTION_TIMEOUT_MS` | `10000` | 新建数据库连接的等待上限 |
| `DATABASE_QUERY_TIMEOUT_MS` | `10000` | 单条查询和 PostgreSQL `statement_timeout` 上限 |
| `DATABASE_IDLE_TIMEOUT_MS` | `10000` | 空闲连接回收时间 |

连接池启用 `allowExitOnIdle`。短生命周期脚本和测试在数据库连接已空闲时可以正常退出，不会因为远端 PostgreSQL/TLS socket 关闭阶段停留而挂住；长运行 API 进程仍由 HTTP server 保持生命周期。

当数据库连接超时或不可用时，API 返回 `503` 和“数据服务暂时不可用，请稍后重试。”，前端不应把这类故障误判为账号或密码错误。普通业务接口返回 `401` 只是一条需要确认的登录态信号，前端必须再请求 `/api/auth/session`：只有该接口确认 `authenticated: false` 时才清除当前用户并回到登录页；如果确认接口返回 `503` 或网络错误，应保留当前登录态并提示稍后重试。

## Secret Hygiene

`.env.example` 只保留结构化示例和占位符，不提交真实数据库、GitHub、GitLab、SMTP 或其他第三方凭据。真实环境变量写入本地 `.env` 或部署平台的密钥管理系统，`.env` 必须保持未跟踪状态。

成员本机接入共享 Ory / MinIO 时，使用根目录的 `orf-ory-minio-connect-*.tar.gz` 包里提供的安装脚本，把 `ORY_PUBLIC_URL`、`OBJECT_STORAGE_*` 和 `ORF_PUBLIC_CA_CERT` 统一写入 `.env`；不要手工猜 MinIO secret。

维护脚本也不能内置真实密码。`scripts/rebuild-wechatvm.ps1` 需要通过 `-LocalPassword` 参数或 `WECHATVM_PASSWORD` 环境变量传入本地 VM 密码；其他 WeChat VM 维护脚本需要通过 `-Password` 参数或同一个环境变量传入密码。

## Local Object Storage

ORF 用户上传文件使用 S3-compatible 对象存储。本地开发和本地服务器迁移目标先使用 MinIO，应用代码只依赖通用 S3 配置。

启动本地 MinIO：

```bash
npm run storage:dev
```

`orf up` 也会检查 MinIO；如果 MinIO 未启动，会自动运行 `npm run storage:dev`。

默认地址：

```text
S3 API: http://127.0.0.1:9000
Console: http://127.0.0.1:9001
Bucket: orf-comment-attachments
```

`.env` 需要配置 `OBJECT_STORAGE_*`，本地示例见 `.env.example`。MinIO bucket 必须保持私有，ORF 后端负责鉴权后读取文件。开发机接入共享对象存储时，`OBJECT_STORAGE_ENDPOINT` 应指向公共 `19443` 入口，而不是本地 `9000`。

上传大小分两层：`ORF_INFRA_UPLOAD_MAX_BYTES` 是 Web / MinIO 网关和后端 multipart 的基础设施承载上限，默认 10GiB；`OBJECT_STORAGE_UPLOAD_MAX_BYTES` 只管评论附件、头像和背景等小文件链路；聊天附件上限属于系统设置 `chat.attachmentMaxBytes`，默认 2GiB。

无域名公网 IP 部署见 [公网 IP 共享基础设施](./public-ip-infra.md)。日常公网入口只暴露 `8443`、`18443`、`19443` 和 `54321`；`80/443` 只在重试公网 CA 证书时临时开放。Ory Admin 和 MinIO Console 不映射公网。

停止：

```bash
npm run storage:down
```

## Local Service Health

`orf status` 检查本地开发依赖和应用服务：

```bash
orf status
```

检查范围：

| 服务 | 检查方式 |
| --- | --- |
| PostgreSQL | 使用 `DATABASE_URL` 或 `REMOTE_DATABASE_URL` 执行 `select 1`。 |
| Ory | 请求 `ORY_PUBLIC_URL` 的 `/health/ready`。 |
| MinIO | 请求 `OBJECT_STORAGE_ENDPOINT` 的 `/minio/health/live`。 |
| 匿名互评服务 | 请求 `ORF_LOCAL_SETTLEMENT_SERVICE_URL` 的 `/health`。 |
| Backend | 请求 `http://127.0.0.1:8787/health`。 |
| Frontend | 通过 Vite 代理请求 `http://127.0.0.1:5173/health`。 |

`orf up` 会在启动应用前先执行 `npm install` 同步 Node 依赖，再执行同一组依赖检查。PostgreSQL 缺配置或不可连接时直接失败；当 `ORY_PUBLIC_URL` / `OBJECT_STORAGE_ENDPOINT` 指向本地地址时，Ory 和 MinIO 不健康会先运行对应的本地启动脚本；当 `ORF_LOCAL_SETTLEMENT_SERVICE_URL` 指向本地地址时，匿名互评服务不健康会先运行 `systemctl --user start orf-local-private-service.service`；指向共享公共地址时，`orf up` 只会检查，不会尝试拉起这些服务。匿名互评服务是启动期可选依赖，不健康时只影响匿名互评草稿、提交、汇总和结算比例读取，不阻塞 Backend / Frontend 启动。

以后需要打开本地前端页面时，先识别当前是否在 WSL：

```bash
uname -a
```

如果输出包含 `microsoft-standard-WSL2`，直接调用 Windows 11 的 Google Chrome：

```bash
powershell.exe -NoProfile -Command "Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' 'http://localhost:5173/tasks'"
```

不要优先使用 WSL 内的 `xdg-open`、Linux Chrome 或 Linux Firefox 打开人工预览页面。

## Feedback

- 通过 `uv --version` 验证 uv 可用。
- 通过 `node --version` 和 `npm --version` 验证 Node.js/npm 可用。
- 通过 `uv lock` 验证 Python 项目配置可被 uv 解析。
- 通过 `npm install --package-lock-only` 验证 npm 项目配置可被 npm 解析。
- 通过 `npm run check` 汇总检查基础工具链状态。

## Browser Policy

本项目在 WSL 中运行开发服务器，但不要求在 WSL 内安装 Linux 版 Google Chrome。

推荐方式：

- 前端开发服务器运行在 WSL，例如 `http://localhost:5173/`。
- 人工预览使用 Windows 11 已安装的 Google Chrome 打开 WSL 暴露的 localhost 地址。
- 自动截图和界面检查使用 npm 管理的 Playwright Chromium。
- 从 WSL 打开人工预览页面时，优先使用 `powershell.exe -NoProfile -Command "Start-Process 'C:\Program Files\Google\Chrome\Application\chrome.exe' '<url>'"`。

如果 WSL 中已经安装 `google-chrome-stable`，可以删除。删除 WSL 的 Google Chrome 不会影响 Windows 11 里的 Chrome，也不应该删除 Playwright 浏览器缓存。

卸载命令：

```bash
sudo apt purge -y google-chrome-stable
sudo apt autoremove -y
rm -rf ~/.config/google-chrome ~/.cache/google-chrome
```

## Acceptance

- `uv lock` 可以成功生成或更新 `uv.lock`。
- `npm install --package-lock-only` 可以成功生成或更新 `package-lock.json`。
- `npm run check` 可以成功执行。
- 仓库中没有新增业务代码文件。
- WSL 中不依赖 Linux 版 Google Chrome 完成 ORF Flow 的本地预览和截图验证。
