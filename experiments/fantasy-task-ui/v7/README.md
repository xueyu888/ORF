# Fantasy Task UI · Pixel Perfect Reference Button

这版重点解决一个明确目标：让前端组件在视觉上与用户提供的参考按钮图片保持一致。

## 结论

- **像素级一致版本**：`ExactArtButton`，使用参考图作为按钮皮肤，仍然是真实 `<button>` 组件。
- **可编辑重绘版本**：`ReferenceHeroButton renderMode="vector"`，文字和结构可编辑，但不保证像素级一致。
- **完整按钮家族**：保留 Button / IconButton / ToolbarButton / SegmentedButton / SplitButton 等组件。

> 说明：如果要求“跟参考图完全一样”，唯一可靠方案是把参考图作为视觉皮肤。纯 CSS / SVG 手工重绘可以接近，但无法保证像素级完全一致。

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

## 像素级同款按钮

```tsx
import { ExactArtButton } from './src';

<ExactArtButton
  skin="original"
  size="xl"
  staticVisual
  label="新建任务"
/>
```

`skin="original"` 会使用原始参考图，包含棋盘背景，适合视觉比对。

```tsx
<ExactArtButton
  skin="transparent"
  size="xl"
  label="新建任务"
/>
```

`skin="transparent"` 使用从参考图中抠出的透明按钮皮肤，更适合放进真实业务页面。

## 可编辑重绘版本

```tsx
import { ReferenceHeroButton } from './src';

<ReferenceHeroButton
  renderMode="vector"
  label="新建任务"
  width="1100px"
/>
```

## 已交付组件

- `ExactArtButton`
- `ReferenceHeroButton`
- `Button`
- `IconButton`
- `ToolbarButton`
- `SegmentedButton`
- `SplitButton`
- `FloatingActionButton`
- `ToggleButton`
- `TabButton`
- `Ornate*Icon` 图标组
