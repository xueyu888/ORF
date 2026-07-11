# ORF 客户端验证环境

## 目标

客户端验证环境只验证安装包壳层能力，不重新定义 ORF 业务规则。聊天、权限、附件、登录态和用户资料仍以 ORF Web 服务端为唯一事实源；Win11 和 Android 客户端只负责打开同一个 ORF 地址、接收通知、检查更新、下载安装包并交给系统安装。

## 快速检查

在仓库根目录运行：

```bash
npm run client:env:check
```

需要让缺失项导致非零退出码时运行：

```bash
npm run client:env:check -- --strict
```

检查项包括：

- 客户端发布相关工具：`git`、`gh`。`gh` 仍用于等待 GitHub Actions 打包和核对镜像资产，客户端默认下载源以 ORF 主更新源为准。
- Android 构建和设备工具：`java`、`adb`、`emulator`、`sdkmanager`、`ANDROID_HOME`。
- WSL Android 虚拟机关键条件：`/dev/kvm` 是否存在、当前用户是否在 `kvm` 组。
- 当前连接的 ADB 设备和已配置的 AVD。

`client:env:check`、`client:android:env:setup` 和 Android Gradle 构建脚本共用同一套环境解析逻辑：优先读取显式 `JAVA_HOME`、`ANDROID_HOME` / `ANDROID_SDK_ROOT`，没有设置时会尝试使用当前 `java` 命令和 `~/Android/Sdk`。

## Win11 验证

Win11 客户端验证优先使用 ORF 主更新源里的安装器；GitHub Release 只作为镜像兜底：

1. 安装 `ORF-<version>-win11-x64-setup.exe`。
2. 打开 ORF，确认窗口加载 `https://orf-xueyu.duckdns.org:8443/`。
3. 用聊天账号发送一条消息，确认右下角系统通知能弹出。
4. 首次打开已安装 Win11 客户端时，确认开机自启提示只出现一次；选择开启后，Windows 启动应用列表或任务管理器启动页能看到 ORF。
5. 在个人设置和托盘菜单分别切换开机自启，确认两个入口显示同一状态。
6. 注销后重新登录 Windows，确认 ORF 自动启动并驻留托盘，不直接弹出主窗口；点击托盘后主窗口正常显示。
7. 发布更高版本后打开旧客户端，确认更新提示展示的是已安装客户端版本，而不是远端 Web 版本。
8. 点击“立即更新”，确认客户端下载完成后不再弹出“ORF 正在运行/需要关闭”的二次确认，当前 ORF 自动退出，NSIS 静默覆盖安装并自动重新打开新版本。
9. 重新打开后确认原有登录态、窗口数据目录、桌面快捷方式和开机自启设置不被更新流程清除。

本地只需要检查打包结构时可以运行：

```bash
npm run client:desktop:pack:linux
```

## Android WSL 虚拟机验证

WSL 里跑 Android Emulator 的最小前提：

1. WSL2 可见 `/dev/kvm`。
2. 当前用户在 `kvm` 组；如果不在，执行 `sudo usermod -aG kvm $USER` 后重启 WSL。
3. 安装 JDK 21、Android command-line tools、platform-tools、emulator 和系统镜像。
4. 设置 `ANDROID_HOME`，并把 `$ANDROID_HOME/platform-tools`、`$ANDROID_HOME/emulator`、`$ANDROID_HOME/cmdline-tools/latest/bin` 加入 PATH。
5. 创建并启动 AVD，再用 `adb devices` 确认设备在线。

ORF 提供了一个用户态环境准备脚本，会复用 `~/Android/Sdk`，安装 emulator、Android 36 平台、系统镜像并创建固定 AVD：

```bash
npm run client:android:env:setup
```

脚本不会写入 keystore，不会修改仓库外的敏感配置，也不会替你执行需要 sudo 的系统组变更。如果检查结果显示当前用户不在 `kvm` 组，需要手动执行：

```bash
sudo usermod -aG kvm $USER
```

执行后重启 WSL，再运行 `npm run client:env:check -- --strict` 复核。

验证 APK：

```bash
adb install -r release/android/ORF-v0.0.5-android.apk
adb shell dumpsys package org.duckdns.orfxueyu.orf | grep -E 'versionName|versionCode'
```

自动更新验证：

1. 先安装低版本 APK。
2. 发布高版本客户端，并确认 ORF 主更新源已同步发布清单和 APK。
3. 打开低版本客户端，确认更新提示读取的是系统已安装版本。
4. 点击下载并安装。
5. 安装完成后再次用 `dumpsys package` 核对版本。

## Android 真机验证

如果 WSL 虚拟机暂时不可用，可以用真机做同一套验证：

1. 手机上开启开发者选项和 USB 调试。
2. 使用 USB 或 ADB over Wi-Fi 连接。
3. 运行 `adb devices` 确认设备状态是 `device`。
4. 用 `adb install -r <apk>` 验证覆盖安装。
5. 用客户端界面验证通知、聊天入口、更新提示和安装权限跳转。

## 签名失败判定

如果 Android 提示“软件包与现有软件包存在冲突”或“开发者签名异常”，说明同包名应用签名不一致。解决路径只有两种：

- 用旧版本的同一把签名重新发布新 APK。
- 卸载旧应用后安装新签名 APK。

ORF 发布流程现在要求 GitHub Secrets 注入固定 release keystore。缺少签名 secrets 时，Release workflow 会失败，不再发布 debug 签名 APK，避免用户下载到无法覆盖安装的包。
