import { useState } from 'react';
import { Button } from '../components/Button';
import { IconButton } from '../components/IconButton';
import { SegmentedButton } from '../components/SegmentedButton';
import { ToolbarButton } from '../components/ToolbarButton';
import {
  CheckCircleIcon,
  ChevronRightIcon,
  CloseIcon,
  CompassIcon,
  FilterIcon,
  SaveSparkIcon,
  TrashIcon,
} from '../icons/Icons';

export function DemoApp() {
  const [segment, setSegment] = useState('today');

  return (
    <main style={{ minHeight: '100vh', padding: '46px 28px 80px' }}>
      <div
        style={{
          maxWidth: 1380,
          margin: '0 auto',
          padding: '34px 36px 46px',
          borderRadius: 28,
          background: 'linear-gradient(180deg, rgba(255,250,240,0.84), rgba(245,236,220,0.88))',
          border: '1px solid rgba(164,132,79,0.28)',
          boxShadow: '0 22px 60px rgba(101,78,40,0.18), inset 0 1px 0 rgba(255,255,255,0.52)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 34, fontFamily: 'var(--ft-font-family)', color: '#49341f' }}>
          Fantasy Task UI · Button Family Pro
        </h1>
        <p style={{ marginTop: 12, marginBottom: 0, color: '#6C5944', lineHeight: 1.85, fontSize: 15 }}>
          这一轮把按钮从单组件扩成按钮家族：主按钮、语义按钮、图标按钮、工具栏按钮、分段切换按钮都统一到了同一套奇幻风商业级语言里。
        </p>

        <div style={{ display: 'grid', gap: 34, marginTop: 34 }}>
          <section>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>Hero Buttons</h2>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="primary" leadingIcon={<CompassIcon />}>新建任务</Button>
              <Button variant="primary" trailingIcon={<ChevronRightIcon />}>批量操作</Button>
              <Button variant="danger" leadingIcon={<TrashIcon />}>删除</Button>
              <Button variant="success" leadingIcon={<CheckCircleIcon />}>完成</Button>
              <Button variant="secondary" leadingIcon={<SaveSparkIcon />}>保存</Button>
              <Button variant="ghost" leadingIcon={<FilterIcon />}>筛选</Button>
            </div>
          </section>

          <section>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>Toolbar Buttons</h2>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <ToolbarButton variant="secondary" leadingIcon={<SaveSparkIcon />}>保存视图</ToolbarButton>
              <ToolbarButton variant="ghost" leadingIcon={<FilterIcon />} active>筛选器</ToolbarButton>
              <ToolbarButton variant="subtle" leadingIcon={<CheckCircleIcon />} trailingIcon={<ChevronRightIcon />}>状态</ToolbarButton>
              <ToolbarButton variant="secondary" leadingIcon={<CloseIcon />}>关闭面板</ToolbarButton>
            </div>
          </section>

          <section>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>Icon Buttons</h2>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              <IconButton variant="primary" icon={<CompassIcon />} label="探索" />
              <IconButton variant="secondary" icon={<SaveSparkIcon />} label="保存" />
              <IconButton variant="ghost" icon={<FilterIcon />} label="筛选" active />
              <IconButton variant="danger" icon={<TrashIcon />} label="删除" />
              <IconButton variant="success" icon={<CheckCircleIcon />} label="完成" />
            </div>
          </section>

          <section>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>Segmented Buttons</h2>
            <SegmentedButton
              value={segment}
              onChange={setSegment}
              items={[
                { key: 'today', label: '今日', icon: <CompassIcon /> },
                { key: 'week', label: '本周', icon: <CheckCircleIcon /> },
                { key: 'archive', label: '归档', icon: <SaveSparkIcon /> },
              ]}
            />
          </section>

          <section>
            <h2 style={{ margin: '0 0 10px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>States & Sizes</h2>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
              <Button variant="primary" size="sm" leadingIcon={<CompassIcon />}>小按钮</Button>
              <Button variant="primary" size="md" leadingIcon={<CompassIcon />}>中按钮</Button>
              <Button variant="primary" size="lg" leadingIcon={<CompassIcon />}>大按钮</Button>
              <Button variant="primary" disabled>不可用</Button>
              <Button variant="primary" loading>提交中</Button>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
