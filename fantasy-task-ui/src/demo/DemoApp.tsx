import { Button } from '../components/Button';
import {
  CheckCircleIcon,
  ChevronRightIcon,
  CloseIcon,
  CompassIcon,
  FilterIcon,
  SaveSparkIcon,
  TrashIcon,
} from '../icons/Icons';

const variants = [
  {
    title: '高保真主按钮',
    nodes: [
      <Button key="new" variant="primary" leadingIcon={<CompassIcon />}>新建任务</Button>,
      <Button key="bulk" variant="primary" trailingIcon={<ChevronRightIcon />}>批量操作</Button>,
    ],
  },
  {
    title: '辅助与操作按钮',
    nodes: [
      <Button key="save" variant="secondary" leadingIcon={<SaveSparkIcon />}>保存</Button>,
      <Button key="filter" variant="ghost" leadingIcon={<FilterIcon />}>筛选</Button>,
      <Button key="confirm" variant="subtle" leadingIcon={<CheckCircleIcon />}>确认</Button>,
      <Button key="cancel" variant="secondary" leadingIcon={<CloseIcon />}>取消</Button>,
    ],
  },
  {
    title: '语义按钮',
    nodes: [
      <Button key="delete" variant="danger" leadingIcon={<TrashIcon />}>删除</Button>,
      <Button key="done" variant="success" leadingIcon={<CheckCircleIcon />}>完成</Button>,
      <Button key="disabled" variant="primary" disabled>不可用</Button>,
      <Button key="loading" variant="primary" loading>提交中</Button>,
    ],
  },
  {
    title: '尺寸',
    nodes: [
      <Button key="sm" variant="primary" size="sm" leadingIcon={<CompassIcon />}>小按钮</Button>,
      <Button key="md" variant="primary" size="md" leadingIcon={<CompassIcon />}>中按钮</Button>,
      <Button key="lg" variant="primary" size="lg" leadingIcon={<CompassIcon />}>大按钮</Button>,
    ],
  },
];

export function DemoApp() {
  return (
    <main style={{ minHeight: '100vh', padding: '48px 28px 72px' }}>
      <div
        style={{
          maxWidth: 1220,
          margin: '0 auto',
          padding: '32px 32px 44px',
          borderRadius: 24,
          background: 'linear-gradient(180deg, rgba(255,249,238,0.82), rgba(245,235,217,0.86))',
          boxShadow: '0 18px 50px rgba(95,73,36,0.18), inset 0 1px 0 rgba(255,255,255,0.5)',
          border: '1px solid rgba(156,128,78,0.28)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 32, fontFamily: 'var(--ft-font-family)', color: '#49331f' }}>
          Fantasy Task UI · 高保真按钮组件实现
        </h1>
        <p style={{ marginTop: 12, marginBottom: 0, color: '#685645', lineHeight: 1.8, fontSize: 15 }}>
          这不是把整张按钮图塞进页面，而是真实可交互的前端组件：按钮底板由 SVG 渲染，文案和图标为真实 DOM / SVG，支持状态、尺寸与主题扩展。
        </p>

        <div style={{ display: 'grid', gap: 28, marginTop: 34 }}>
          {variants.map((section) => (
            <section key={section.title}>
              <h2
                style={{
                  margin: '0 0 16px',
                  fontSize: 18,
                  fontWeight: 700,
                  fontFamily: 'var(--ft-font-family)',
                  color: '#5A4129',
                }}
              >
                {section.title}
              </h2>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>{section.nodes}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
