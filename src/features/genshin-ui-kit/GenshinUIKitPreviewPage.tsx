import { useState } from "react";
import {
  Check,
  Clock,
  ExternalLink,
  Filter,
  Search,
  Send,
  ShieldAlert,
  Sparkles,
  Star,
  Target,
  Trophy,
  X,
} from "lucide-react";
import {
  GiBadge,
  GiBountyCard,
  GiButton,
  GiEmptyState,
  GiField,
  GiFilterBar,
  GiIconButton,
  GiInput,
  GiMetric,
  GiModalFrame,
  GiPageShell,
  GiPanel,
  GiProgressRail,
  GiQuestStrip,
  GiRewardChip,
  GiRoot,
  GiSectionTitle,
  GiSelect,
  GiShopButton,
  GiTabs,
} from "./OrfGenshinUI";
import bgImage from "./assets/windblume-event-bg.jpg";

const tabs = [
  { label: "可申请", value: "open" },
  { label: "优先挑战", value: "priority" },
  { label: "我的挑战", value: "mine" },
] as const;

const railItems = [
  { label: "征召", icon: <ShieldAlert className="h-4 w-4" />, locked: true },
  { label: "优先", icon: <Star className="h-4 w-4" />, active: true },
  { label: "大厅", icon: <Target className="h-4 w-4" /> },
  { label: "结算", icon: <Trophy className="h-4 w-4" />, locked: true },
];

const rewardSet = (
  <>
    <GiRewardChip icon={<Sparkles className="h-3.5 w-3.5" />} value="90" />
    <GiRewardChip icon={<Trophy className="h-3.5 w-3.5" />} tone="gold" value="20000" />
    <GiRewardChip icon={<Star className="h-3.5 w-3.5" />} tone="violet" value="4" />
  </>
);

export function GenshinUIKitPreviewPage() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["value"]>("open");

  return (
    <GiRoot>
      <GiPageShell
        actions={
          <>
            <GiButton icon={<Trophy className="h-4 w-4" />} variant="secondary">
              我的挑战
            </GiButton>
            <GiButton icon={<Send className="h-4 w-4" />}>提出指标</GiButton>
          </>
        }
        eyebrow="ORF Game UI Kit"
        hero={<img alt="" src={bgImage} />}
        metrics={
          <>
            <GiMetric icon={Trophy} label="我的积分" tone="gold" value="12,480" />
            <GiMetric icon={Target} label="可申请悬赏目标" value="18" />
            <GiMetric icon={Clock} label="确认中" tone="teal" value="3" />
          </>
        }
        subtitle="面向 ORF 业务页替换的组件库：按钮、筛选、任务条、状态、奖励、弹窗和页面容器。"
        title="悬赏大厅组件体系"
      >
        <div className="gk-kit-preview-grid">
          <GiPanel
            actions={<GiTabs items={tabs} value={activeTab} onChange={setActiveTab} />}
            subtitle="这些控件可以直接替换现有 Button / Card / StatusBadge / Toolbar。"
            title="基础控件"
          >
            <div className="gk-kit-preview-section">
              <GiSectionTitle icon={Sparkles}>资产化按钮</GiSectionTitle>
              <div className="gk-kit-frame-button-showcase">
                <GiShopButton />
              </div>
            </div>

            <div className="gk-kit-preview-section">
              <GiSectionTitle icon={Sparkles}>普通业务按钮</GiSectionTitle>
              <div className="gk-kit-preview-row">
                <GiButton>主操作</GiButton>
                <GiButton variant="secondary">次操作</GiButton>
                <GiButton variant="soft">柔和操作</GiButton>
                <GiButton variant="ghost">文本操作</GiButton>
                <GiButton variant="danger">危险操作</GiButton>
                <GiButton loading>处理中</GiButton>
              </div>
            </div>

            <div className="gk-kit-preview-section">
              <GiSectionTitle icon={Filter}>筛选栏</GiSectionTitle>
              <GiFilterBar>
                <GiField label="搜索">
                  <div className="gk-kit-search-field">
                    <Search className="gk-kit-search-field__icon" />
                    <GiInput placeholder="搜索悬赏目标或指标..." />
                  </div>
                </GiField>
                <GiField label="难度">
                  <GiSelect defaultValue="all">
                    <option value="all">全部难度</option>
                    <option value="entry">入门</option>
                    <option value="advanced">进阶</option>
                    <option value="hard">破局</option>
                  </GiSelect>
                </GiField>
                <GiField label="排序">
                  <GiSelect defaultValue="deadline">
                    <option value="deadline">截止时间</option>
                    <option value="points">不确定性分</option>
                    <option value="created">发布时间</option>
                  </GiSelect>
                </GiField>
                <GiIconButton icon={X} label="清空筛选" />
              </GiFilterBar>
            </div>

            <div className="gk-kit-preview-section">
              <GiSectionTitle icon={Star}>状态和奖励</GiSectionTitle>
              <div className="gk-kit-preview-row">
                <GiBadge tone="neutral">待申请</GiBadge>
                <GiBadge tone="blue">确认中</GiBadge>
                <GiBadge tone="gold">810 分</GiBadge>
                <GiBadge tone="success">已完成</GiBadge>
                <GiBadge tone="danger">已逾期</GiBadge>
                {rewardSet}
              </div>
            </div>
          </GiPanel>

          <GiPanel title="业务条目" subtitle="用于替代悬赏目标卡片、征召令、优先挑战和轻详情里的信息块。">
            <div className="gk-kit-preview-section">
              <GiQuestStrip
                active
                action={<GiButton size="sm">接受挑战</GiButton>}
                icon={<ShieldAlert className="h-5 w-5" />}
                meta={
                  <>
                    <GiBadge tone="gold">飞升</GiBadge>
                    <GiBadge tone="blue">截止 2 天后</GiBadge>
                  </>
                }
                rewards={rewardSet}
                status={<GiBadge tone="danger">征召令</GiBadge>}
                subtitle="AI 评估流水线"
                title="修复模型评估报告延迟生成问题"
              />
              <GiQuestStrip
                action={<GiButton size="sm" variant="secondary">查看口径</GiButton>}
                icon={<Target className="h-5 w-5" />}
                meta={
                  <>
                    <GiBadge>进阶</GiBadge>
                    <GiBadge tone="gold">90 分</GiBadge>
                  </>
                }
                rewards={rewardSet}
                status={<GiBadge tone="blue">可申请</GiBadge>}
                subtitle="RAG 服务稳定性"
                title="降低检索召回波动并补齐失败样例归因"
              />
            </div>
          </GiPanel>

          <GiPanel className="gk-kit-preview-wide" title="悬赏大厅替换样例" subtitle="后面迁移 BountyHallPage 时，业务逻辑只负责传数据。">
            <div className="gk-kit-bounty-demo">
              <aside className="gk-kit-bounty-demo__rail">
                <GiProgressRail items={railItems} />
              </aside>
              <main className="gk-kit-bounty-demo__main">
                <GiSectionTitle
                  action={<GiButton size="sm" variant="ghost">清空筛选</GiButton>}
                  icon={Target}
                >
                  当前可申请 18 条
                </GiSectionTitle>
                <div className="gk-kit-bounty-card-grid">
                  <GiBountyCard
                    action={<GiButton size="sm" icon={<Send className="h-4 w-4" />}>申请挑战</GiButton>}
                    deadline="剩余 1 天 8 小时"
                    difficulty="破局"
                    objective="检索增强稳定性"
                    points="270 分"
                    proposer="提出人：林舟"
                    status={<GiBadge tone="blue">可申请</GiBadge>}
                    title="补齐失败召回样本的自动归因和复盘入口"
                  />
                  <GiBountyCard
                    action={<GiButton size="sm" icon={<Check className="h-4 w-4" />}>接受挑战</GiButton>}
                    deadline="优先确认剩余 3 小时"
                    difficulty="飞升"
                    objective="Agent 运行时"
                    points="810 分"
                    proposer="提出人：当前用户"
                    status={<GiBadge tone="danger">优先挑战</GiBadge>}
                    title="修复工具调用失败后任务状态没有回滚的问题"
                  />
                </div>
              </main>
            </div>
          </GiPanel>

          <GiPanel title="弹窗和空状态">
            <div className="gk-kit-preview-modal-row">
              <GiModalFrame
                footer={
                  <>
                    <GiButton variant="secondary">取消</GiButton>
                    <GiButton>确认申请</GiButton>
                  </>
                }
                title="申请挑战"
              >
                <p>提交后等待指挥官确认。确认后，这条悬赏目标会进入你的挑战页。</p>
                <GiQuestStrip
                  icon={<Target className="h-5 w-5" />}
                  rewards={rewardSet}
                  subtitle="Agent 运行时"
                  title="工具调用失败后任务状态回滚"
                />
              </GiModalFrame>
              <GiEmptyState
                action={<GiButton variant="secondary">重置筛选</GiButton>}
                description="调整搜索或筛选条件后再查看。"
                title="没有符合条件的指标"
              />
            </div>
          </GiPanel>
        </div>
      </GiPageShell>
    </GiRoot>
  );
}
