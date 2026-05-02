# Fantasy Task UI · Button Family Pro

这是一个 React + TypeScript 的高保真按钮家族组件集，目标是把任务管理系统里的按钮体系提升到更接近商业游戏 UI 的质感，同时保持真正的前端组件实现方式。

它不是把整张按钮图片塞进 `<img>`，而是：

- 用真实的 `<button>` 元素承载交互
- 用 SVG 渲染高保真底板和装饰
- 用真实文本渲染标签
- 用独立 SVG 图标渲染前导 / 尾随图标
- 用 CSS 管理 hover / active / disabled / loading / focus-visible 状态
- 把按钮扩展成完整家族，而不是只有一种主按钮

## Button Family Pro 已交付内容

- `Button`
- `IconButton`
- `ToolbarButton`
- `SegmentedButton`
- 预设封装：`PrimaryButton / SecondaryButton / GhostButton / DangerButton / SuccessButton / SubtleButton`

## 安装依赖

```bash
npm install
```

## 本地预览

```bash
npm run dev
```

## 打包

```bash
npm run build
```

## 使用示例

```tsx
import {
  Button,
  IconButton,
  ToolbarButton,
  SegmentedButton,
  CompassIcon,
  FilterIcon,
  TrashIcon,
} from './src';

<Button variant="primary" leadingIcon={<CompassIcon />}>新建任务</Button>
<IconButton variant="ghost" icon={<FilterIcon />} label="筛选" />
<ToolbarButton variant="secondary" leadingIcon={<FilterIcon />}>筛选器</ToolbarButton>
<SegmentedButton
  value="today"
  items={[
    { key: 'today', label: '今日' },
    { key: 'week', label: '本周' },
    { key: 'archive', label: '归档' },
  ]}
/>
```

## 下一步可继续扩展

- SplitButton
- FloatingActionButton
- Tabs
- Input / Select
- Dialog / Drawer
- Sidebar
- Kanban Card

这样可以继续扩展成一套完整的奇幻风任务管理系统 UI 组件库。
