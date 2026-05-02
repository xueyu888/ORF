# Fantasy Task UI · Button Family Pro Plus

这是一个 React + TypeScript 的高保真按钮家族组件集，目标是为任务管理系统提供一套原创的奇幻 RPG 风格 UI。它不是把整张按钮图片塞进 `<img>`，而是用真实组件、SVG 美术层和 CSS 状态层组合实现。

## 本轮 Pro Plus 重点

这一版针对“图标太线条画、美术感不足”的问题做了专门强化：

- 新增 `IllustratedIcons.tsx`，提供更接近游戏 UI 徽章质感的多层 SVG 图标
- 图标从简单 stroke 线框升级为：金属外框、宝石内芯、浮雕高光、暗部压边、小花纹和微装饰
- `Button / IconButton / ToolbarButton / SegmentedButton / SplitButton / FAB / ToggleButton / TabButton` 都可以直接使用这些高细节图标
- 仍然保留真实文本、真实按钮交互、hover / active / disabled / loading / focus-visible 等状态

## 已交付组件

- `Button`
- `IconButton`
- `ToolbarButton`
- `SegmentedButton`
- `SplitButton`
- `FloatingActionButton`
- `ToggleButton`
- `TabButton`
- 预设按钮：`PrimaryButton / SecondaryButton / GhostButton / DangerButton / SuccessButton / SubtleButton`
- 高细节图标：`OrnateCompassIcon / OrnateFilterIcon / OrnateCheckIcon / OrnateTrashIcon / OrnateSaveIcon / OrnateCloseIcon / OrnateChevronRightIcon / OrnateCalendarIcon`

## 本地预览

```bash
npm install
npm run dev
```

## 打包

```bash
npm run build
```

## 示例

```tsx
import {
  Button,
  IconButton,
  SplitButton,
  FloatingActionButton,
  ToggleButton,
  TabButton,
  OrnateCompassIcon,
  OrnateTrashIcon,
  OrnateFilterIcon,
} from './src';

<Button variant="primary" leadingIcon={<OrnateCompassIcon />}>新建任务</Button>
<SplitButton variant="danger" leadingIcon={<OrnateTrashIcon />}>危险操作</SplitButton>
<IconButton variant="ghost" icon={<OrnateFilterIcon />} label="筛选" />
<FloatingActionButton variant="primary" icon={<OrnateCompassIcon />} label="快速新建" />
<ToggleButton pressed leadingIcon={<OrnateFilterIcon />}>筛选器</ToggleButton>
<TabButton active icon={<OrnateCompassIcon />}>今日任务</TabButton>
```

## 说明

这套实现是原创的奇幻风 UI，不包含官方游戏素材、Logo 或角色。视觉上参考了奇幻 RPG 菜单常见的金属、宝石、浮雕、纹样语言，但所有组件和图标均为可复用的前端实现。
