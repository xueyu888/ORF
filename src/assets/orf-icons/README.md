# ORF Icon Assets

Canonical icons and visual assets for ORF hierarchy rows and app surfaces. Runtime code should reference registered assets through `src/config/assetLibrary.ts` instead of hard-coding file paths in components or CSS.

| Asset | Meaning |
| --- | --- |
| `objective-flag.svg` | Objective object icon. |
| `metric-square.svg` | Result / metric object icon. Use color to express metric status. |
| `completion-circle-empty.svg` | Task / subtask incomplete checkbox. |
| `completion-circle-done.svg` | Task / subtask complete checkbox. |
| `sidebar-energy-bg.png` | Sidebar atmospheric background. |
| `sidebar-character-guide-bg.png` | Sidebar character guide background. |

Use these assets as the source shape for future page icons. Status rules live in `docs/ORF 任务管理页面.md`.
