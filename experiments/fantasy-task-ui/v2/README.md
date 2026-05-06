# Fantasy Task UI

这是一个可直接落地的 React + TypeScript 按钮组件实现示例。它不是把整张按钮图片塞进 `<img>`，而是：

- 用真实的 `<button>` 元素承载交互
- 用 SVG 作为可伸缩视觉底板
- 用真实文本渲染标签
- 用独立 SVG 图标渲染前导/尾随图标
- 用 CSS 管理 hover / active / disabled / loading / focus-visible 状态

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

## 组件导出

```tsx
import { Button } from './src';
```

## 示例

```tsx
<Button variant="primary" leadingIcon={<CompassIcon />}>新建任务</Button>
<Button variant="secondary">保存</Button>
<Button variant="ghost" leadingIcon={<FilterIcon />}>筛选</Button>
<Button variant="danger" leadingIcon={<TrashIcon />}>删除</Button>
<Button variant="success" leadingIcon={<CheckCircleIcon />}>完成</Button>
<Button variant="secondary" leadingIcon={<CloseIcon />}>取消</Button>
<Button variant="primary" trailingIcon={<ChevronRightIcon />}>批量操作</Button>
```

## 说明

目前已经交付了：

- 高保真按钮视觉实现
- 6 个主要变体：primary / secondary / ghost / danger / success / subtle
- 3 个尺寸：sm / md / lg
- loading / disabled / focus-visible / block
- Demo 页面

后续可以在这套基座上继续扩展 Tabs、Input、Dialog、Sidebar、Kanban 等组件。
