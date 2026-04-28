# ORF 环境设计

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
