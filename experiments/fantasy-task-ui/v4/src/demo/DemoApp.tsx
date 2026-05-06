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

const sections = [
  {
    title: '商业级精修 · 主操作按钮',
    description: '进一步提高了金属边框层次、表面高光、中心浮雕和悬停扫光，让主操作更有高规格感。',
    nodes: [
      <Button key="new" variant="primary" leadingIcon={<CompassIcon />}>新建任务</Button>,
      <Button key="bulk" variant="primary" trailingIcon={<ChevronRightIcon />}>批量操作</Button>,
      <Button key="create" variant="primary" size="lg" leadingIcon={<CompassIcon />}>创建任务</Button>,
    ],
  },
  {
    title: '商业级精修 · 辅助与轻量操作',
    description: '不再只是统一模板换色，而是给 secondary / ghost / subtle 都做了更清晰的视觉角色分层。',
    nodes: [
      <Button key="save" variant="secondary" leadingIcon={<SaveSparkIcon />}>保存</Button>,
      <Button key="filter" variant="ghost" leadingIcon={<FilterIcon />}>筛选</Button>,
      <Button key="confirm" variant="subtle" leadingIcon={<CheckCircleIcon />}>确认</Button>,
      <Button key="cancel" variant="secondary" leadingIcon={<CloseIcon />}>取消</Button>,
    ],
  },
  {
    title: '商业级精修 · 语义按钮',
    description: '危险按钮更尖锐、成功按钮更圆润，结合图标徽章和专属纹饰，使语义更直接。',
    nodes: [
      <Button key="delete" variant="danger" leadingIcon={<TrashIcon />}>删除</Button>,
      <Button key="done" variant="success" leadingIcon={<CheckCircleIcon />}>完成</Button>,
      <Button key="disabled" variant="primary" disabled>不可用</Button>,
      <Button key="loading" variant="primary" loading>提交中</Button>,
    ],
  },
  {
    title: '商业级精修 · 尺寸体系',
    description: '按钮在小、中、大尺寸下保持一致的品质，适合任务工具栏、列表页和重点操作区。',
    nodes: [
      <Button key="sm" variant="primary" size="sm" leadingIcon={<CompassIcon />}>小按钮</Button>,
      <Button key="md" variant="primary" size="md" leadingIcon={<CompassIcon />}>中按钮</Button>,
      <Button key="lg" variant="primary" size="lg" leadingIcon={<CompassIcon />}>大按钮</Button>,
    ],
  },
];

export function DemoApp() {
  return (
    <main style={{ minHeight: '100vh', padding: '46px 28px 80px' }}>
      <div
        style={{
          maxWidth: 1360,
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
          Fantasy Task UI · 商业级精修按钮组件集
        </h1>
        <p style={{ marginTop: 12, marginBottom: 0, color: '#6C5944', lineHeight: 1.85, fontSize: 15 }}>
          这一版继续向商业游戏 UI 美术稿靠拢：强化了按钮的材质层次、扫光、内凹感、图标徽章和每个变体的专属视觉语言。
          按钮仍然是可交互的真实前端组件，不是静态图片切片。
        </p>

        <div style={{ display: 'grid', gap: 30, marginTop: 34 }}>
          {sections.map((section) => (
            <section key={section.title}>
              <h2 style={{ margin: '0 0 8px', fontSize: 20, fontFamily: 'var(--ft-font-family)', color: '#5A4129' }}>
                {section.title}
              </h2>
              <p style={{ margin: '0 0 16px', color: '#78634D', fontSize: 14, lineHeight: 1.7 }}>{section.description}</p>
              <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>{section.nodes}</div>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
