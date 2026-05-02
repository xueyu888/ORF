import { useState } from "react";
import { Moon, Sun } from "lucide-react";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card } from "../components/ui";
import { useOrf } from "../state/OrfProvider";

export function SettingsPage() {
  const { state, resetState, notify, theme, setTheme } = useOrf();
  const [categories, setCategories] = useState(state.causeCategories);
  const [newCategory, setNewCategory] = useState("");
  const [rules, setRules] = useState(state.rules);

  return (
    <PageScaffold title="设置" subtitle="配置周期、团队、反馈分类和 ORF 规则。">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="orf-card-padding"><div className="text-sm font-semibold orf-text-primary">周期</div><div className="mt-3 grid gap-2">{["2026 Q2", "2026 Q3 草稿"].map((item) => <div key={item} className="rounded-md orf-surface-muted p-3 text-sm orf-text-secondary">{item}</div>)}</div></Card>
        <Card className="orf-card-padding"><div className="text-sm font-semibold orf-text-primary">团队</div><div className="mt-3 grid gap-2">{["AI 应用团队", "平台工程", "评估团队"].map((item) => <div key={item} className="rounded-md orf-surface-muted p-3 text-sm orf-text-secondary">{item}</div>)}</div></Card>
      </div>
      <Card className="orf-card-padding">
        <div className="text-sm font-semibold orf-text-primary">界面主题</div>
        <div className="mt-1 text-sm orf-text-muted">主题使用 ORF 语义 token，新增页面必须复用这些 token，不直接写品牌色或一次性颜色。</div>
        <div className="mt-4 grid max-w-xl gap-3 sm:grid-cols-2">
          <button type="button" aria-pressed={theme === "dark"} onClick={() => setTheme("dark")} className="orf-theme-option flex items-center gap-3 rounded-lg border p-3 text-left">
            <Moon className="h-4 w-4" />
            <span><span className="block text-sm font-medium">暗色</span><span className="block text-xs orf-text-muted">高密度执行工作台</span></span>
          </button>
          <button type="button" aria-pressed={theme === "light"} onClick={() => setTheme("light")} className="orf-theme-option flex items-center gap-3 rounded-lg border p-3 text-left">
            <Sun className="h-4 w-4" />
            <span><span className="block text-sm font-medium">亮色</span><span className="block text-xs orf-text-muted">清爽复盘和汇报场景</span></span>
          </button>
        </div>
      </Card>
      <Card className="orf-card-padding">
        <div className="text-sm font-semibold orf-text-primary">反馈分类</div>
        <div className="mt-3 flex flex-wrap gap-2">{categories.map((item) => <span key={item} className="orf-status-tag border orf-border orf-surface-muted px-3 py-1 text-sm orf-text-secondary">{item}</span>)}</div>
        <div className="mt-4 flex max-w-md gap-2"><input className="orf-input px-3 py-2 text-sm" value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="新增分类" /><Button variant="secondary" onClick={() => { if (newCategory.trim()) { setCategories((items) => [...items, newCategory.trim()]); setNewCategory(""); notify("反馈分类已添加"); } }}>添加</Button></div>
      </Card>
      <Card className="orf-card-padding">
        <div className="text-sm font-semibold orf-text-primary">ORF 规则</div>
        <div className="mt-3 grid gap-3">
          {Object.entries(rules).map(([key, value]) => <label key={key} className="flex items-center justify-between rounded-md orf-surface-muted p-3 text-sm orf-text-secondary"><span>{key === "requireResultForTask" ? "任务必须关联结果" : key === "requireEvidenceForFeedback" ? "反馈必须有证据" : key === "weeklyFeedbackCadence" ? "启用每周反馈节奏" : "自动生成复盘摘要"}</span><input type="checkbox" checked={value} onChange={(event) => setRules((current) => ({ ...current, [key]: event.target.checked }))} /></label>)}
        </div>
      </Card>
      <Card className="flex items-center justify-between orf-card-padding"><div><div className="text-sm font-semibold orf-text-primary">本地缓存</div><div className="mt-1 text-sm orf-text-muted">清空本机缓存并重新载入初始 ORF Flow 数据。</div></div><Button variant="danger" onClick={resetState}>重置本地缓存</Button></Card>
    </PageScaffold>
  );
}
