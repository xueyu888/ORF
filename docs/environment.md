# ORF 环境设计

## Objective

为 ORF 项目建立最小、可重复、可检查的 uv 和 npm 基础环境，让后续项目管理软件的文档驱动开发有稳定仓库基础。

## Results

- 根目录提供 `pyproject.toml`，用于声明 ORF 的 Python/uv 项目环境。
- 根目录提供 `package.json`，用于声明 ORF 的 Node.js/npm 项目环境和基础检查命令。
- 根目录提供 `.gitignore`，避免提交本地虚拟环境、依赖目录、构建产物和敏感环境变量。
- 当前阶段不生成任何业务代码，只准备环境和文档驱动规则。

## Feedback

- 通过 `uv --version` 验证 uv 可用。
- 通过 `node --version` 和 `npm --version` 验证 Node.js/npm 可用。
- 通过 `uv lock` 验证 Python 项目配置可被 uv 解析。
- 通过 `npm install --package-lock-only` 验证 npm 项目配置可被 npm 解析。
- 通过 `npm run check` 汇总检查基础工具链状态。

## Acceptance

- `uv lock` 可以成功生成或更新 `uv.lock`。
- `npm install --package-lock-only` 可以成功生成或更新 `package-lock.json`。
- `npm run check` 可以成功执行。
- 仓库中没有新增业务代码文件。

