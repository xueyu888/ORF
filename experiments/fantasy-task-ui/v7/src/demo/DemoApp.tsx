import { useState } from 'react';
import { Button } from '../components/Button';
import { ExactHeroButton } from '../components/ExactHeroButton';
import { ExactArtButton } from '../components/ExactArtButton';
import { FloatingActionButton } from '../components/FloatingActionButton';
import { ReferenceFantasyButton } from '../components/ReferenceFantasyButton';
import { IconButton } from '../components/IconButton';
import { ReferenceHeroButton } from '../components/ReferenceHeroButton';
import { SegmentedButton } from '../components/SegmentedButton';
import { SplitButton } from '../components/SplitButton';
import { TabButton } from '../components/TabButton';
import { ToggleButton } from '../components/ToggleButton';
import { ToolbarButton } from '../components/ToolbarButton';
import {
  OrnateCalendarIcon,
  OrnateCheckIcon,
  OrnateChevronRightIcon,
  OrnateCloseIcon,
  OrnateCompassIcon,
  OrnateFilterIcon,
  OrnateSaveIcon,
  OrnateTrashIcon,
} from '../icons/IllustratedIcons';

const panelStyle = {
  padding: '22px 22px 24px',
  borderRadius: 22,
  background: 'linear-gradient(180deg, rgba(255,253,248,0.68), rgba(242,231,211,0.72))',
  border: '1px solid rgba(168,132,72,0.22)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.48), 0 10px 28px rgba(87,66,33,0.08)',
};

export function DemoApp() {
  const [segment, setSegment] = useState('today');
  const [pressed, setPressed] = useState(true);

  return (
    <main style={{ minHeight: '100vh', padding: '46px 28px 80px' }}>
      <div
        style={{
          maxWidth: 1420,
          margin: '0 auto',
          padding: '34px 36px 46px',
          borderRadius: 28,
          background: 'linear-gradient(180deg, rgba(255,250,240,0.86), rgba(245,236,220,0.9))',
          border: '1px solid rgba(164,132,79,0.28)',
          boxShadow: '0 22px 60px rgba(101,78,40,0.18), inset 0 1px 0 rgba(255,255,255,0.52)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34, fontFamily: 'var(--ft-font-family)', color: '#49341f' }}>
          Fantasy Task UI · Reference Exact Pass
        </h1>
        <p style={{ marginTop: 12, marginBottom: 0, color: '#6C5944', lineHeight: 1.85, fontSize: 15 }}>
          这一版新增 ReferenceFantasyButton：专门以你给的蓝金长按钮为目标，使用多层 SVG 美术底板、真实文本和真实图标，尽量逼近参考图的视觉效果。
        </p>

        <div style={{ display: 'grid', gap: 28, marginTop: 34 }}>
          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>Pixel Perfect Reference Button · 与用户图片同款</h2>
            <p style={{ margin: '0 0 16px', color: '#78634D', fontSize: 14, lineHeight: 1.7 }}>
              这一枚使用你给的按钮图作为美术皮肤，保留真实 button 语义；第一枚 original 用于严格对照，第二枚 transparent 用于实际页面嵌入。
            </p>
            <div style={{ display: 'grid', gap: 18 }}>
              <ExactArtButton size="lg" skin="original" staticVisual label="新建任务" />
              <ExactArtButton size="lg" skin="transparent" label="新建任务" />
            </div>
          </section>

          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>Reference Exact Button · 参考图拟真</h2>
            <p style={{ margin: '0 0 16px', color: '#78634D', fontSize: 14, lineHeight: 1.7 }}>
              这颗按钮不是整图贴片：底板为多层 SVG，文字与图标为真实前端层，目标是尽量复刻你给的蓝金按钮。
            </p>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <ReferenceFantasyButton size="lg">新建任务</ReferenceFantasyButton>
              <ReferenceFantasyButton size="md">新建任务</ReferenceFantasyButton>
            </div>
          </section>



          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>Reference Exact Match · 参考图同款按钮</h2>
            <p style={{ margin: '0 0 16px', color: '#78634D', fontSize: 14, lineHeight: 1.7 }}>
              asset 模式使用参考图作为视觉层，能做到视觉上一比一；vector 模式是可缩放 SVG 重绘版本，保留真实文字与交互。
            </p>
            <div style={{ display: 'grid', gap: 22 }}>
              <ExactArtButton skin="original" size="xl" staticVisual label="新建任务" />
              <ExactArtButton skin="transparent" size="xl" label="新建任务" />
              <ReferenceHeroButton renderMode="vector" label="新建任务" width="min(100%, 1100px)" />
            </div>
          </section>
          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>Hero Buttons · 图标美术强化</h2>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="primary" leadingIcon={<OrnateCompassIcon />}>新建任务</Button>
              <Button variant="primary" trailingIcon={<OrnateChevronRightIcon />}>批量操作</Button>
              <Button variant="danger" leadingIcon={<OrnateTrashIcon />}>删除</Button>
              <Button variant="success" leadingIcon={<OrnateCheckIcon />}>完成</Button>
              <Button variant="secondary" leadingIcon={<OrnateSaveIcon />}>保存</Button>
              <Button variant="ghost" leadingIcon={<OrnateFilterIcon />}>筛选</Button>
            </div>
          </section>

          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>Icon Buttons · 不再是线框图标</h2>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <IconButton variant="primary" size="lg" icon={<OrnateCompassIcon />} label="探索" />
              <IconButton variant="secondary" size="lg" icon={<OrnateSaveIcon />} label="保存" />
              <IconButton variant="ghost" size="lg" icon={<OrnateFilterIcon />} label="筛选" active />
              <IconButton variant="danger" size="lg" icon={<OrnateTrashIcon />} label="删除" />
              <IconButton variant="success" size="lg" icon={<OrnateCheckIcon />} label="完成" />
            </div>
          </section>

          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>Pro Plus Buttons</h2>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <SplitButton variant="primary" leadingIcon={<OrnateCompassIcon />}>新建任务</SplitButton>
              <SplitButton variant="danger" leadingIcon={<OrnateTrashIcon />}>危险操作</SplitButton>
              <FloatingActionButton variant="primary" icon={<OrnateCompassIcon />} label="快速新建" />
              <FloatingActionButton variant="success" icon={<OrnateCheckIcon />} label="快速完成" />
              <ToggleButton pressed={pressed} leadingIcon={<OrnateFilterIcon />} onClick={() => setPressed(!pressed)}>筛选器</ToggleButton>
              <TabButton active leadingIcon={<OrnateSaveIcon />}>已保存视图</TabButton>
              <TabButton leadingIcon={<OrnateCalendarIcon />}>日历视图</TabButton>
            </div>
          </section>

          <section style={panelStyle}>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>Toolbar / Segmented</h2>
            <div style={{ display: 'grid', gap: 18 }}>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <ToolbarButton variant="secondary" leadingIcon={<OrnateSaveIcon />}>保存视图</ToolbarButton>
                <ToolbarButton variant="ghost" leadingIcon={<OrnateFilterIcon />} active>筛选器</ToolbarButton>
                <ToolbarButton variant="subtle" leadingIcon={<OrnateCheckIcon />} trailingIcon={<OrnateChevronRightIcon />}>状态</ToolbarButton>
                <ToolbarButton variant="secondary" leadingIcon={<OrnateCloseIcon />}>关闭面板</ToolbarButton>
              </div>
              <SegmentedButton
                value={segment}
                onChange={setSegment}
                items={[
                  { key: 'today', label: '今日', icon: <OrnateCompassIcon /> },
                  { key: 'week', label: '本周', icon: <OrnateCheckIcon /> },
                  { key: 'archive', label: '归档', icon: <OrnateSaveIcon /> },
                ]}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
