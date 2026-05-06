import { useState, type ReactNode } from "react";
import { Archive, CheckSquare, Clock3, Home, Inbox, Plus, Search, Settings, ShieldCheck, Sparkles } from "lucide-react";
import {
  FantasyBadge,
  FantasyButton,
  FantasyCard,
  FantasyDivider,
  FantasyExactNewTaskButton,
  FantasyInput,
  FantasyKanbanColumn,
  FantasyModal,
  FantasyPanel,
  FantasySelect,
  FantasySidebar,
  FantasySvgButton,
  FantasyTabs,
  FantasyTaskCard,
} from "./FantasyUI";
import primaryButtonReference from "./assets/buttons/primary-button-reference.png";

const tokens = [
  { label: "Blue", value: "--gi-blue", css: "var(--gi-blue)" },
  { label: "Blue Dark", value: "--gi-blue-dark", css: "var(--gi-blue-dark)" },
  { label: "Teal", value: "--gi-teal", css: "var(--gi-teal)" },
  { label: "Gold", value: "--gi-gold", css: "var(--gi-gold)" },
  { label: "Gold Light", value: "--gi-gold-light", css: "var(--gi-gold-light)" },
  { label: "Success", value: "--gi-success", css: "var(--gi-success)" },
  { label: "Danger", value: "--gi-danger", css: "var(--gi-danger)" },
  { label: "Parchment", value: "--gi-bg-panel", css: "var(--gi-bg-panel)" },
];

const tabs = [
  { label: "今日", value: "daily" },
  { label: "本周", value: "weekly" },
  { label: "归档", value: "archive" },
];

const sidebarItems = [
  { active: true, icon: CheckSquare, label: "计划" },
  { icon: Clock3, label: "周复盘" },
  { icon: Inbox, label: "反馈" },
  { icon: Archive, label: "统计" },
  { icon: Settings, label: "设置" },
];

function PreviewSection({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section className="grid gap-3">
      <div>
        <h2 className="orf-text-primary text-lg font-black">{title}</h2>
        <p className="orf-text-secondary mt-1 text-sm">{description}</p>
      </div>
      {children}
    </section>
  );
}

export function FantasyUiPreviewPage() {
  const [activeTab, setActiveTab] = useState("daily");

  return (
    <div className="grid gap-8">
      <FantasyPanel variant="blue">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-bold text-[#ead7a1]">
              <Sparkles className="h-4 w-4" />
              Design System / UI Kit
            </div>
            <h1 className="mt-2 text-2xl font-black tracking-normal text-[#fff8ec]">ORF Fantasy UI 组件库</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#fff8ec]/75">
              这里展示的是从四张参考板抽象出来的可维护组件：token、装饰原语、基础组件、业务组件。素材图只作为视觉参考，不作为运行时 UI 切片。
            </p>
          </div>
          <FantasyButton size="lg">
            <Plus className="h-4 w-4" />
            新建任务
          </FantasyButton>
        </div>
      </FantasyPanel>

      <PreviewSection
        description="先拿一个组件验证 1:1 路线：你提供的 exact 素材先做成精确新建任务按钮；另保留可换字的 left / center / right 三段 SVG 组件。"
        title="0. SVG 组装试验：主按钮"
      >
        <FantasyPanel title="新建任务按钮复刻">
          <div className="grid gap-6">
            <div className="grid gap-3">
              <div className="text-sm font-black text-[var(--gi-text-heading)]">Exact 素材组件</div>
              <div className="flex flex-wrap items-center gap-4 rounded-[var(--gi-radius-md)] border border-[rgba(200,161,90,0.28)] bg-[rgba(255,248,236,0.58)] p-4">
                <FantasyExactNewTaskButton />
                <FantasyExactNewTaskButton width={300} />
                <FantasyExactNewTaskButton width={300} disabled />
              </div>
              <div className="text-xs leading-6 text-[var(--gi-text-muted)]">
                `FantasyExactNewTaskButton` 使用你提供的 `xinjian_renwu_exact.svg`
                提取出来的透明 cutout 资产。这个素材的“新建任务”文字已经烘焙进图里，所以它是精确按钮，不做动态换字。
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
            <div className="grid content-start gap-3">
              <div className="text-sm font-black text-[var(--gi-text-heading)]">参考裁图</div>
              <div className="inline-flex min-h-[92px] items-center justify-center rounded-[var(--gi-radius-md)] border border-[rgba(200,161,90,0.34)] bg-[#f6efe3] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.74)]">
                <img alt="新建任务按钮参考裁图" className="h-[68px] w-[212px] max-w-full object-contain" src={primaryButtonReference} />
              </div>
            </div>

            <div className="grid gap-4">
              <div className="text-sm font-black text-[var(--gi-text-heading)]">SVG + CSS 组件</div>
              <div className="flex flex-wrap items-center gap-4">
                <FantasySvgButton>新建任务</FantasySvgButton>
                <FantasySvgButton width={260}>批量操作</FantasySvgButton>
                <FantasySvgButton size="sm">保存</FantasySvgButton>
                <FantasySvgButton width={340}>创建一个很长的任务</FantasySvgButton>
                <FantasySvgButton disabled>禁用状态</FantasySvgButton>
              </div>
              <div className="rounded-[var(--gi-radius-sm)] border border-[rgba(200,161,90,0.28)] bg-[rgba(255,248,236,0.58)] p-3 text-xs leading-6 text-[var(--gi-text-muted)]">
                这版用 `primary-button-left.svg`、`primary-button-center.svg`、`primary-button-right.svg`
                做三段组装，SVG 内部是 path、gradient 和 filter，不再嵌入 PNG。固定宽度时最接近参考图；宽度变化时中段拉伸，边角不会被整体压扁。
              </div>
            </div>
            </div>
          </div>
        </FantasyPanel>
      </PreviewSection>

      <PreviewSection description="颜色、圆角、阴影、边框、动效全部进入 CSS 变量，后续换主题只改 token。" title="1. 设计 Token 层">
        <FantasyPanel>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tokens.map((token) => (
              <FantasyCard key={token.value}>
                <div className="mb-3 h-12 rounded-[var(--gi-radius-sm)] border border-white/70" style={{ background: token.css }} />
                <div className="text-sm font-black text-[var(--gi-text-heading)]">{token.label}</div>
                <div className="mt-1 text-xs font-bold text-[var(--gi-text-muted)]">{token.value}</div>
              </FantasyCard>
            ))}
          </div>
        </FantasyPanel>
      </PreviewSection>

      <PreviewSection description="角花、分隔线、纸感面、深蓝面这些装饰是原语，业务组件只组合它们。" title="2. 装饰原语层">
        <div className="grid gap-4 lg:grid-cols-2">
          <FantasyPanel title="暖白羊皮纸面板">
            <p className="text-sm leading-6 text-[var(--gi-text-muted)]">
              面板使用金色细描边、内侧角花、轻阴影和纸感渐变。角花绝对定位，不参与布局，也不挡交互。
            </p>
            <FantasyDivider label="ORNAMENT" />
            <div className="grid gap-3 sm:grid-cols-2">
              <FantasyCard interactive>
                <div className="font-black text-[var(--gi-text-heading)]">可悬浮卡片</div>
                <p className="mt-2 text-sm text-[var(--gi-text-muted)]">只用轻阴影和内描边分层，避免厚重边框。</p>
              </FantasyCard>
              <FantasyCard>
                <div className="font-black text-[var(--gi-text-heading)]">静态信息卡</div>
                <p className="mt-2 text-sm text-[var(--gi-text-muted)]">适合统计、说明、低优先级信息。</p>
              </FantasyCard>
            </div>
          </FantasyPanel>

          <FantasyPanel title="深蓝星纹面板" variant="blue">
            <p className="text-sm leading-6 text-[#fff8ec]/75">
              深色面板用于主导航、弹窗重点区和高优先级操作。保留蓝金幻想感，但文字区仍保持清晰。
            </p>
            <FantasyDivider label="FOCUS" />
            <div className="flex flex-wrap gap-2">
              <FantasyBadge tone="gold">金色重点</FantasyBadge>
              <FantasyBadge tone="blue">水蓝状态</FantasyBadge>
              <FantasyBadge tone="success">完成</FantasyBadge>
              <FantasyBadge tone="danger">风险</FantasyBadge>
            </div>
          </FantasyPanel>
        </div>
      </PreviewSection>

      <PreviewSection description="按钮、输入、下拉、徽章、Tab、侧边栏、弹窗都必须有状态，而不是只有静态截图。" title="3. 基础组件层">
        <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
          <FantasyPanel title="按钮 / 标签 / 表单">
            <div className="grid gap-5">
              <div className="flex flex-wrap items-center gap-3">
                <FantasyButton>主按钮</FantasyButton>
                <FantasyButton variant="secondary">次按钮</FantasyButton>
                <FantasyButton variant="ghost">幽灵按钮</FantasyButton>
                <FantasyButton variant="success">完成</FantasyButton>
                <FantasyButton variant="danger">删除</FantasyButton>
                <FantasyButton loading>加载中</FantasyButton>
                <FantasyButton disabled>禁用</FantasyButton>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <FantasyButton size="sm">小按钮</FantasyButton>
                <FantasyButton size="md">中按钮</FantasyButton>
                <FantasyButton size="lg">大按钮</FantasyButton>
              </div>

              <div className="flex flex-wrap gap-2">
                <FantasyBadge tone="blue">进行中</FantasyBadge>
                <FantasyBadge tone="teal">协作</FantasyBadge>
                <FantasyBadge tone="gold">待确认</FantasyBadge>
                <FantasyBadge tone="success">已完成</FantasyBadge>
                <FantasyBadge tone="danger">已逾期</FantasyBadge>
                <FantasyBadge tone="muted">低优先级</FantasyBadge>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-2 text-sm font-bold text-[var(--gi-text-heading)]">
                  搜索任务
                  <FantasyInput placeholder="输入目标、指标、任务名" />
                </label>
                <label className="grid gap-2 text-sm font-bold text-[var(--gi-text-heading)]">
                  状态筛选
                  <FantasySelect defaultValue="doing">
                    <option value="all">全部状态</option>
                    <option value="doing">进行中</option>
                    <option value="done">已完成</option>
                    <option value="risk">有风险</option>
                  </FantasySelect>
                </label>
              </div>

              <FantasyTabs items={tabs} value={activeTab} onChange={setActiveTab} />
            </div>
          </FantasyPanel>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
            <FantasySidebar items={sidebarItems} />
            <FantasyModal title="确认归档" variant="light">
              <p className="text-sm leading-6 text-[var(--gi-text-muted)]">
                弹窗复用面板原语，底部操作使用统一按钮组件。长文本换行后仍保持内边距和角花位置稳定。
              </p>
            </FantasyModal>
          </div>
        </div>
      </PreviewSection>

      <PreviewSection description="任务卡、看板列这些才绑定 ORF 业务语义，内部继续复用基础组件和 token。" title="4. 业务组件层">
        <div className="grid gap-4 xl:grid-cols-3">
          <FantasyKanbanColumn count={3} title="目标块">
            <FantasyTaskCard description="梳理目标、指标、任务、子任务的视觉层级。" dueDate="05/08" status="doing" tag="UI" title="任务管理页二次元化改造" />
            <FantasyTaskCard description="沉淀 token、装饰原语和可复用基础组件。" dueDate="05/10" status="todo" tag="Design System" title="建立 Fantasy UI Kit" />
          </FantasyKanbanColumn>

          <FantasyKanbanColumn count={2} title="指标行">
            <FantasyTaskCard description="状态标签要一眼识别，但不能压过标题。" dueDate="05/06" status="done" tag="Badge" title="统一状态标签语义" />
            <FantasyTaskCard description="树形线条、缩进和块操作入口需要稳定对齐。" dueDate="05/12" status="doing" tag="Tree" title="优化树形层级结构" />
          </FantasyKanbanColumn>

          <FantasyKanbanColumn count={1} title="风险项">
            <FantasyTaskCard description="示例长标题需要省略号，不允许撑破卡片或覆盖徽章。" dueDate="05/03" status="overdue" tag="Risk" title="这是一个非常长的任务标题用于验证组件在真实业务文本长度下的截断效果" />
          </FantasyKanbanColumn>
        </div>
      </PreviewSection>

      <FantasyPanel>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="flex items-center gap-3">
            <Home className="h-5 w-5 text-[var(--gi-blue)]" />
            <div>
              <div className="text-sm font-black text-[var(--gi-text-heading)]">不切图</div>
              <div className="text-xs text-[var(--gi-text-muted)]">参考板沉淀为 token 和组件。</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-[var(--gi-teal)]" />
            <div>
              <div className="text-sm font-black text-[var(--gi-text-heading)]">可响应</div>
              <div className="text-xs text-[var(--gi-text-muted)]">文字变长、容器变窄都能稳定。</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-[var(--gi-gold-dark)]" />
            <div>
              <div className="text-sm font-black text-[var(--gi-text-heading)]">有状态</div>
              <div className="text-xs text-[var(--gi-text-muted)]">hover、active、focus、disabled 都进入样式系统。</div>
            </div>
          </div>
        </div>
      </FantasyPanel>
    </div>
  );
}
