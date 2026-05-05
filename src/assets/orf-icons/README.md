# ORF Icon Assets

## 接口访问约定

前端数据统一通过同源 `/api` 请求后端接口，例如 `/api/tasks`。
前端不直接写死后端域名或端口，开发和生产环境由代理或网关转发到实际后端服务。

Canonical icons and visual assets for ORF hierarchy rows and app surfaces. Runtime code should reference registered assets through `src/config/assetLibrary.ts` instead of hard-coding file paths in components or CSS.

| Asset | Meaning |
| --- | --- |
| `objective-flag.svg` | Objective object icon. |
| `metric-square.svg` | Result / metric object icon. Use color to express metric status. |
| `completion-circle-empty.svg` | Task / subtask incomplete checkbox. |
| `completion-circle-done.svg` | Task / subtask complete checkbox. |
| `sidebar-energy-bg.png` | Sidebar atmospheric background. |
| `sidebar-character-guide-bg.png` | Sidebar character guide background. |
| `fantasy-ui-panel-frames.png` | Reference board for panel frames, card frames, popups, section headers, dividers, chips, and corner ornaments. |
| `fantasy-ui-controls.png` | Reference board for buttons, tabs, toggles, checkboxes, radios, search bars, dropdowns, pagination, and badges. |
| `fantasy-ui-navigation.png` | Reference board for sidebars, top navigation, menu item states, user panels, filter panels, collapsible sections, and list rows. |
| `fantasy-ui-task-widgets.png` | Reference board for task cards, kanban headers, date tiles, progress bars, stat cards, timelines, toasts, and task detail panels. |

Use these assets as the source shape for future page icons and UI styling. Runtime components should reference registered image assets through `src/config/assetLibrary.ts`; large reference boards should stay as source/reference material and should not be imported into the app bundle unless a specific screen needs to render them.

Status rules live in `docs/ORF 任务管理页面.md`.
