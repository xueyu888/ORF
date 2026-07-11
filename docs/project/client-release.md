# ORF 客户端发布

## 目标

ORF 客户端只提供安装入口，不复制业务逻辑。Win11 PC 端和 Android 移动端都打开同一个 ORF Web 入口，聊天、权限、附件、登录态、用户资料和系统数据仍由 ORF 服务端、PostgreSQL 和对象存储统一负责。

## 客户端结构

- `clients/desktop/main.cjs`: Win11 Electron 客户端入口。
- `clients/desktop/package.json`: Electron 安装包的最小 app 元数据，由根 `package.json` 同步版本。
- `scripts/build-desktop-client.mjs`: 在临时目录中构建桌面客户端，避免把根项目依赖打进安装包。
- `capacitor.config.ts`: Android Capacitor 客户端配置。
- `android/`: Capacitor 生成的 Android 原生工程。
- `scripts/sync-client-versions.mjs`: 以根 `package.json` 为唯一版本事实源，同步桌面客户端和 Android 版本。
- `.github/workflows/release-clients.yml`: 标签触发的客户端打包和 GitHub Release 镜像流程。

默认客户端地址是 `https://orf-xueyu.duckdns.org:8443/`。构建时可以通过 `ORF_CLIENT_URL` 覆盖，例如：

```bash
ORF_CLIENT_URL=https://example.com/ npm run client:desktop:dist:win
```

Win11 主窗口默认以 `1360x900` 打开，最小窗口尺寸由 `clients/desktop/main.cjs` 的 `DESKTOP_MAIN_WINDOW_SIZE` 统一维护。主窗口最小宽度保持在 `820` Electron DIP，低于 Web 端 `900px` 窄屏断点，使高 DPI 竖屏设备可以缩到同一套移动/窄屏布局；这只是客户端壳层展示约束，不定义 ORF 业务数据或页面事实源。

Win11 客户端可以保存登录账号。保存职责属于客户端壳层：Electron 主进程通过系统 `safeStorage` 加密密码并写入本机 `userData/credentials`，渲染进程只能通过受限 IPC 读取账号列表、保存、删除或在用户选择/提交登录时临时读取密码。浏览器和 Android 不共享这份本机 vault；浏览器入口只依赖浏览器自己的密码管理能力。

Win11 客户端必须在 Electron `ready` 前把 `userData` 和 `sessionData` 固定到同一个稳定的 `ORF` 数据目录。登录态事实仍由 Ory session 和 ORF Cookie 决定，桌面端只负责让 Chromium Cookie、缓存、已保存账号和本机设置在安装包升级后继续落在同一个 profile，不能因为包名、构建目录或 Electron 默认路径变化读到旧 profile 的会话。

Win11 客户端支持开机自启。开机自启的唯一事实源是 Windows 登录项，Electron 主进程通过系统登录项接口读写，渲染进程、个人设置页和托盘菜单只通过受限 IPC 查询或切换状态。首次打开已安装的 Win11 客户端时，如果尚未开启且本机未处理过提示，客户端弹出一次选择提示；选择开启后，后续 Windows 登录时 ORF 使用 `--orf-start-hidden` 在后台启动并驻留托盘，不直接弹出主窗口。首次提示是否看过只保存在本机 Electron `userData`，不写入 ORF 服务端个人偏好、系统设置或业务数据。

## 本地构建

Web 基础构建：

```bash
npm run build
```

Web 发布构建只保留当前与上一构建的 hash 资源。Android 不复用常驻 `dist`：`client:android:*` 会把一次性干净 Web 构建写入 `.artifacts/android-web`，Capacitor 同步前会整体替换原生工程内的 Web assets，防止历史 Web 文件或运行时设置进入 APK。

Win11 安装器：

```bash
npm run client:desktop:dist:win
```

Android 本地调试 APK：

```bash
npm run client:android:assemble:debug
```

Android 发布 APK 需要固定 release keystore，通过环境变量注入：

```bash
export ORF_ANDROID_KEYSTORE_PATH=/path/to/orf-release.keystore
export ORF_ANDROID_KEYSTORE_PASSWORD=...
export ORF_ANDROID_KEY_ALIAS=...
export ORF_ANDROID_KEY_PASSWORD=...
npm run client:android:assemble:release
```

本机如果缺少 Java、Android SDK 或 Windows 打包工具，可以继续使用 GitHub Actions 打包；工作流会生成 GitHub Release 镜像，本机发布脚本在镜像资产核对后把同一版本同步到 ORF 主更新源。

## ORF 主更新源与 GitHub 镜像

推送 `v*` 标签会触发客户端发布流程：

```bash
npm run release:clients -- --tag v0.0.1 --notes "说明本版本面向用户更新了什么"
```

需要等待 GitHub Actions 完成、核对 ORF 主更新源和 GitHub 镜像资产时运行：

```bash
npm run release:clients -- --tag v0.0.1 --notes-file release-notes/v0.0.1.md --watch
```

客户端发布有两个必须分开的事实源：

- 版本号事实源：根 `package.json`，由 `scripts/sync-client-versions.mjs` 同步到 Win11 和 Android 客户端工程。
- 发布说明事实源：本次发布输入的 `--notes` 或 `--notes-file`。`scripts/release-clients.mjs` 会把说明写入 annotated tag 的 `更新说明：` 段落；`.github/workflows/release-clients.yml` 只从该段落或手动触发输入读取用户可见更新说明。没有更新说明的 tag 不能继续生成客户端 Release。

GitHub Release 标题必须包含 `ORF vX.Y.Z`，正文必须包含 `主要更新：`。正文会继续附带提交记录、客户端包、安装后提示、数据和权限来源、已知边界；其中“主要更新”说明本版本面向用户更新了什么，提交记录只作为代码证据，不能替代用户可读版本说明。

ORF 客户端运行时默认使用 ORF 主更新源：

- 版本清单存储在 `ORF_CLIENT_UPDATE_ASSET_DIR/releases.json`。
- 安装包存储在 `ORF_CLIENT_UPDATE_ASSET_DIR/<version>/<assetName>`。
- 客户端收到的默认下载地址是 `https://orf-xueyu.duckdns.org:8443/api/client-updates/assets/<version>/<assetName>`。
- GitHub Release 只作为外部镜像页面和 ORF 资产缺失时的兜底下载来源。
- 已安装旧版 Win11 或 Android 原生壳如果尚未信任 ORF 主更新源，会在拒绝安装参数后由 Web 运行时自动改用 GitHub 镜像地址重试；这只用于旧壳兼容，不改变新客户端默认走 ORF 主更新源的规则。
- 如果旧客户端已经打开且仍运行旧 Web 代码，当前版本的客户端清单可以临时把可信 GitHub 镜像设为主下载地址、把 ORF 资产地址保留为镜像；发布脚本后续默认仍写 ORF 主源。

GitHub Actions 在两个平台产物都生成后，只上传 GitHub Release 镜像。发布脚本的 `--watch` 会等待工作流完成、核对镜像资产，再由本机把安装包同步到 ORF 主更新源，并把 ORF 发布清单作为最后一步写入，让客户端只在主源资产和镜像地址都准备好后看到新版本。自动化不会把管理员登录态写进发布流程；服务端和发布环境必须配置同一个 `ORF_CLIENT_UPDATE_PUBLISH_SECRET` 才能同步主更新源，必须配置同一个 `ORF_CLIENT_UPDATE_BROADCAST_SECRET` 才会广播在线客户端。

本地发布脚本目标默认取 `ORF_APP_URL`，也可以通过 `ORF_CLIENT_UPDATE_PUBLISH_URL` 或 `--publish-url` 覆盖；在 ORF 服务和发布脚本运行在同一台机器时，建议把 `ORF_CLIENT_UPDATE_PUBLISH_URL` 指向本机 API 地址以避免公网回环上传大包。广播目标默认取 `ORF_APP_URL`，也可以通过 `ORF_CLIENT_UPDATE_BROADCAST_URL` 或 `--broadcast-url` 覆盖。本地脚本未配置对应 secret 或目标地址时会明确提示已跳过主更新源同步或在线广播；需要刻意跳过时分别使用 `--no-publish-assets` 或 `--no-broadcast`。

Win11 应用内更新由 Electron 主进程拥有完整生命周期：渲染层只提交一次可信安装资产；主进程下载完成后以 `/S --updated --force-run --keep-shortcuts` 启动 NSIS，随后退出当前 ORF。`--updated` 让安装器按升级路径自动处理正在运行的旧进程，`/S` 不展示安装向导或关闭确认，`--force-run` 在覆盖完成后自动重新打开 ORF，`--keep-shortcuts` 保留用户已有快捷方式选择。安装器启动失败时不能退出当前客户端；同一时间只能存在一个更新安装请求。Android 仍必须进入系统安装界面，系统级安装确认和签名校验不能由 ORF 绕过。

发布资产：

- `ORF-0.0.1-win11-x64-setup.exe`
- `ORF-v0.0.1-android.apk`

## 签名边界

客户端发布必须区分安装包签名和业务数据来源：

- Windows 安装器未做代码签名，首次安装可能提示发布者未知。
- Android Release APK 必须使用同一把固定 release keystore 签名，才能被系统允许覆盖安装。
- GitHub Actions 从 `ORF_ANDROID_KEYSTORE_BASE64`、`ORF_ANDROID_KEYSTORE_PASSWORD`、`ORF_ANDROID_KEY_ALIAS`、`ORF_ANDROID_KEY_PASSWORD` 四个 GitHub Secrets 读取签名材料。
- 仓库不能提交 keystore、私钥、keystore 密码或证书密码。

如果手机上已经安装过不同签名的同包名 APK，Android 不允许直接覆盖安装。ORF 内置安装器会在打开系统安装界面前先校验包名和签名；签名不一致时会直接提示用户先卸载旧包，或者继续使用旧包对应的原始签名重新打包。这是系统安全规则，不是 ORF 下载逻辑可以绕过的行为。

## Android 后台 Push 条件

Android 不运行时收到聊天消息或客户端更新通知，依赖系统 Push 通道。ORF 当前把 FCM 作为唯一系统 Push 通道：Android 客户端用 `google-services.json` 注册 FCM token，服务端用 Firebase Admin service account 给 `push_devices` 中的 token 发消息。客户端收到 FCM 但系统没有自动展示时，会在页面不可见或失焦状态下用同一通知渠道补发本地通知；这个兜底只负责展示，不改变服务端消息事实源。厂商 Push 不参与聊天消息和客户端更新投递。

- Android 包名 `org.duckdns.orfxueyu.orf` 已加入 Firebase Android app。
- 需要 FCM 通道时，`android/app/google-services.json` 只在本机或 GitHub Actions 临时注入，仓库必须忽略它；本地也可以把 `google-services.json` 临时放在仓库根目录，构建脚本会复制到 Android 工程。
- 需要 FCM 通道时，配置 `ORF_ANDROID_GOOGLE_SERVICES_JSON_BASE64` 可在构建时还原 `google-services.json`；缺失时 Android 包仍可发布，但构建脚本会从 Capacitor 生成工程中移除 FCM 原生模块，避免缺 Firebase 配置的 APK 参与启动链。
- ORF 服务端配置 `ORF_PUSH_ENABLED=true`，并通过 `ORF_FIREBASE_SERVICE_ACCOUNT_PATH`、`ORF_FIREBASE_SERVICE_ACCOUNT_JSON` 或 `GOOGLE_APPLICATION_CREDENTIALS` 提供 Firebase service account。
- 服务端已执行 `npm run db:migrate`，保证 `push_devices` 表存在。
- 用户至少打开过包含 Push 注册逻辑的新版本客户端并授权通知；旧版本未注册 FCM token 时，服务端不能向它补发后台 Push。

远程 Push 默认使用 `ORF_PUSH_CONTENT_MODE=private`，通知栏只显示通用聊天提示，消息正文和私有频道内容仍回到 ORF 内查看。

上线后用诊断命令确认链路，不要手工查看或打印 token：

```bash
npm run push:diagnose
npm run push:diagnose -- --send-test --user-email <email>
```

诊断结果必须同时满足：

- `ORF_PUSH_ENABLED=true`。
- Firebase 服务端凭据已配置，且 Firebase Admin 可初始化条件满足。
- 发布 APK 使用的 `google-services.json` 包名匹配 `org.duckdns.orfxueyu.orf`。
- `push_registration_statuses` 中目标用户最近状态是 `token_registered`。
- `push_devices` 里已经有目标用户的启用 Android 设备。
- 测试发送返回投递成功数大于 0，且真机在后台或锁屏状态能看到通知。

如果 FCM 诊断中的注册状态显示 `registration_error`、`permission_denied`，或设备样本显示 `gms=unavailable`，说明这台安卓机当前没有形成可用 FCM token；需要先修复 Google Play services、通知授权或 Firebase 配置。`push_vendor_devices` 和 `push_vendor_registration_statuses` 只保留历史兼容数据，当前不参与投递判断。

## Win11 在线更新广播

Win11 客户端没有后台系统 Push 通道。运行中的 Win11 客户端通过 `/api/events` SSE 接收在线实时事件。发布脚本在 `--watch` 确认 ORF 主更新源已同步后，会用 `ORF_CLIENT_UPDATE_BROADCAST_SECRET` 调用 `POST /api/client-updates/broadcast-release`，按本次发布版本向在线作用域广播一次 `client.update.available`；新版客户端收到后立即触发已有更新检查，并由 `ClientUpdateNotice` 以应用内持久通知卡展示，直到用户处理或关闭本版本提醒。旧客户端不认识该专用事件，因此服务端同时发送兼容的 `system.broadcast` 横幅，提醒用户打开“版本与更新”检查；新版客户端会忽略这个兼容横幅，不再把客户端更新展示成 18 秒横幅。

- 客户端更新的运行时事实源是 ORF 主更新源；GitHub Release 是外部镜像和兜底来源。实时事件只负责唤醒检查或兼容旧客户端横幅，不写入 `notifications` 表。
- 发布后广播按 tag 精确读取对应 ORF 发布清单，不依赖 `/api/client-updates/latest` 的短缓存，避免刚发布时误发旧版本。
- 发布脚本广播和服务端定时发现共用同一套自动广播去重；同一 team 同一版本只自动广播一次，避免发布后下一轮定时器重复刷屏。
- 服务端运行期间仍会定时发现带 Win11 安装包的新客户端版本，作为发布脚本未配置或广播失败后的在线兜底。
- 已发布版本需要补发在线横幅时，管理员可调用 `POST /api/client-updates/broadcast-latest`。该接口会校验当前 latest release 存在 Win11 安装包后，再向当前默认作用域在线用户广播一次。

## 版本事实源

根 `package.json` 仍是发布版本的唯一维护入口，`scripts/sync-client-versions.mjs` 会同步桌面客户端和 Android 原生工程。运行中的客户端版本展示以原生容器返回的已安装版本为准：

- Win11 由 Electron 主进程读取客户端 `package.json`。
- Android 由 Capacitor 插件读取系统安装包的 `versionName`。
- 旧客户端如果没有原生版本接口，Web 不能反推出真实安装版本，会按“当前版本未知”处理并继续提示可用更新。
- 普通浏览器没有原生容器，只能显示 Web 构建版本，并会在界面标注为 Web 版本。
