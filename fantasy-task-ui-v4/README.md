# Fantasy Task UI · Commercial-Grade Refined Buttons

这是一个 React + TypeScript 的高保真按钮组件集示例，目标是尽量靠近商业游戏 UI 的质感，同时仍保持真正的前端组件实现方式。

它不是把整张按钮图片塞进 `<img>`，而是：

- 用真实的 `<button>` 元素承载交互
- 用 SVG 渲染高保真底板和装饰
- 用真实文本渲染标签
- 用独立 SVG 图标渲染前导 / 尾随图标
- 用 CSS 管理 hover / active / disabled / loading / focus-visible 状态
- 通过 hover glint、图标徽章、独立变体装饰语言，继续提升成品感

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

## 当前已交付

- Button 组件
- 6 个视觉变体：`primary / secondary / ghost / danger / success / subtle`
- 3 个尺寸：`sm / md / lg`
- `leadingIcon / trailingIcon / loading / disabled / block`
- 商业级精修 Demo 页面

## 使用示例

```tsx
<Button variant="primary" leadingIcon={<CompassIcon />}>新建任务</Button>
<Button variant="secondary" leadingIcon={<SaveSparkIcon />}>保存</Button>
<Button variant="ghost" leadingIcon={<FilterIcon />}>筛选</Button>
<Button variant="danger" leadingIcon={<TrashIcon />}>删除</Button>
<Button variant="success" leadingIcon={<CheckCircleIcon />}>完成</Button>
<Button variant="secondary" leadingIcon={<CloseIcon />}>取消</Button>
<Button variant="primary" trailingIcon={<ChevronRightIcon />}>批量操作</Button>
```

## 下一步可继续扩展

- IconButton
- SegmentedButton
- Tabs
- Input / Select
- Dialog / Drawer
- Sidebar
- Kanban Card

这样可以继续扩展成一套完整的任务管理系统奇幻风 UI 组件库。
