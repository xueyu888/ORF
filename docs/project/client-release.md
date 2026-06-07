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

Android 预览 APK：

```bash
npm run client:android:assemble:debug
```

本机如果缺少 Java、Android SDK 或 Windows 打包工具，可以直接使用 GitHub Actions 发布流程。

## GitHub Release

推送 `v*` 标签会触发客户端发布流程：

```bash
git tag v0.0.1
git push origin xy
git push origin v0.0.1
```

发布资产：

- `ORF-0.0.1-win11-x64-setup.exe`
- `ORF-v0.0.1-android-preview.apk`

## 签名边界

v0.0.1 是内部预览发布：

- Windows 安装器未做代码签名，首次安装可能提示发布者未知。
- Android APK 使用调试签名，适合内部安装验证。

如果后续要支持稳定覆盖升级，Android release keystore 必须由项目所有者单独保管，并通过 GitHub Secrets 注入 CI；仓库不能提交私钥、keystore 密码或证书密码。
