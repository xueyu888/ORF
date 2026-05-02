import { useState } from 'react';
import { Button } from '../components/Button';
import { FloatingActionButton } from '../components/FloatingActionButton';
import { IconButton } from '../components/IconButton';
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
          Fantasy Task UI · Button Family Pro Plus · Art Icon Pass
        </h1>
        <p style={{ marginTop: 12, marginBottom: 0, color: '#6C5944', lineHeight: 1.85, fontSize: 15 }}>
          这一版重点不再走“线条图标”，而是把图标改成多层 SVG 美术件：金属外框、宝石内芯、浮雕高光、暗部压边、局部花纹和微装饰都直接进入组件体系。
        </p>

        <div style={{ display: 'grid', gap: 28, marginTop: 34 }}>
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
              <TabButton active icon={<OrnateSaveIcon />}>已保存视图</TabButton>
              <TabButton icon={<OrnateCalendarIcon />}>日历视图</TabButton>
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
