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
- `.github/workflows/release-clients.yml`: 标签触发的客户端打包和 GitHub Release 发布流程。

默认客户端地址是 `https://orf-xueyu.duckdns.org:8443/`。构建时可以通过 `ORF_CLIENT_URL` 覆盖，例如：

```bash
ORF_CLIENT_URL=https://example.com/ npm run client:desktop:dist:win
```

## 本地构建

Web 基础构建：

```bash
npm run build
```

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

本机如果缺少 Java、Android SDK 或 Windows 打包工具，可以直接使用 GitHub Actions 发布流程。

## GitHub Release

推送 `v*` 标签会触发客户端发布流程：

```bash
npm run release:clients -- --tag v0.0.1
```

需要等待 GitHub Actions 完成并核对 Release 资产时运行：

```bash
npm run release:clients -- --tag v0.0.1 --watch
```

发布资产：

- `ORF-0.0.1-win11-x64-setup.exe`
- `ORF-v0.0.1-android.apk`

## 签名边界

客户端发布必须区分安装包签名和业务数据来源：

- Windows 安装器未做代码签名，首次安装可能提示发布者未知。
- Android Release APK 必须使用同一把固定 release keystore 签名，才能被系统允许覆盖安装。
- GitHub Actions 从 `ORF_ANDROID_KEYSTORE_BASE64`、`ORF_ANDROID_KEYSTORE_PASSWORD`、`ORF_ANDROID_KEY_ALIAS`、`ORF_ANDROID_KEY_PASSWORD` 四个 GitHub Secrets 读取签名材料。
- 仓库不能提交 keystore、私钥、keystore 密码或证书密码。

如果手机上已经安装过不同签名的同包名 APK，Android 不允许直接覆盖安装。必须先卸载旧包，或者继续使用旧包对应的原始签名重新打包；这是系统安全规则，不是 ORF 下载逻辑可以绕过的行为。

## Android 后台 Push 条件

Android 不运行时收到聊天消息或客户端更新通知，依赖系统 Push 通道。它不是 WebView 本地通知能力，必须至少打通 FCM 或 vivo 系统 Push 中的一条；vivo 手机优先使用 vivo 系统 Push，其他有 Google Play services 的设备使用 FCM。

- Android 包名 `org.duckdns.orfxueyu.orf` 已加入 Firebase Android app。
- `android/app/google-services.json` 只在本机或 GitHub Actions 临时注入，仓库必须忽略它。
- GitHub Actions 配置 `ORF_ANDROID_GOOGLE_SERVICES_JSON_BASE64`，用于发布时还原 `google-services.json`。
- ORF 服务端配置 `ORF_PUSH_ENABLED=true`，并通过 `ORF_FIREBASE_SERVICE_ACCOUNT_PATH`、`ORF_FIREBASE_SERVICE_ACCOUNT_JSON` 或 `GOOGLE_APPLICATION_CREDENTIALS` 提供 Firebase service account。
- 服务端已执行 `npm run db:migrate`，保证 `push_devices` 表存在。
- 用户至少打开过包含 Push 注册逻辑的新版本客户端并授权通知；旧版本未注册 FCM token 时，服务端不能向它补发后台 Push。

vivo 系统 Push 只接入 vivo 一家，发布包和服务端还需要：

- vivo 开放平台已创建包名为 `org.duckdns.orfxueyu.orf` 的应用，并启用消息推送。
- GitHub Actions 配置 `ORF_ANDROID_VIVO_PUSH_AAR_BASE64`，用于发布时把 vivo Push SDK AAR 临时写入 `android/app/libs/orf-vivo-push.aar`。
- GitHub Actions 配置 `ORF_ANDROID_VIVO_PUSH_APP_ID` 和 `ORF_ANDROID_VIVO_PUSH_APP_KEY`，用于写入 Android Manifest 的 vivo SDK 元数据。
- ORF 服务端配置 `ORF_VIVO_PUSH_ENABLED=true`、`ORF_VIVO_PUSH_APP_ID`、`ORF_VIVO_PUSH_APP_KEY`、`ORF_VIVO_PUSH_APP_SECRET`。
- 服务端已执行 `npm run db:migrate`，保证 `push_vendor_devices`、`push_vendor_registration_statuses` 表存在。
- vivo 用户至少打开过包含 vivo Push 注册逻辑的新版本客户端并授权通知；客户端拿到 vivo RegID 后才会写入 `push_vendor_devices`。

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
- vivo 设备如果要走系统级厂商通道，`vivo Push 开关` 和 `vivo 服务端可发送条件` 都必须满足。
- vivo 设备的 `push_vendor_registration_statuses` 最近状态必须是 `token_registered`，不能是 `unavailable` 或 `registration_error`。
- vivo 设备的 `push_vendor_devices` 里必须有目标用户的启用 vivo/android 设备。
- 测试发送返回投递成功数大于 0，且真机在后台或锁屏状态能看到通知。

如果 FCM 诊断中的注册状态显示 `registration_error`、`permission_denied` 或设备样本显示 `gms=unavailable`，这类安卓机不能只依赖 FCM 达到微信式后台通知。ORF 当前只补 vivo 一家：vivo 设备必须继续看厂商注册状态；如果显示 `vivo_sdk_missing`、`reg_id_unavailable` 或 vivo 服务端凭据缺失，就说明发布包或服务端配置还没有真正满足 vivo 系统 Push 条件。FCM 仍保留给有 Google Play services 的设备使用。

## 版本事实源

根 `package.json` 仍是发布版本的唯一维护入口，`scripts/sync-client-versions.mjs` 会同步桌面客户端和 Android 原生工程。运行中的客户端版本展示以原生容器返回的已安装版本为准：

- Win11 由 Electron 主进程读取客户端 `package.json`。
- Android 由 Capacitor 插件读取系统安装包的 `versionName`。
- 旧客户端如果没有原生版本接口，Web 不能反推出真实安装版本，会按“当前版本未知”处理并继续提示可用更新。
- 普通浏览器没有原生容器，只能显示 Web 构建版本，并会在界面标注为 Web 版本。
