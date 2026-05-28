import { User } from "lucide-react";
import { PageScaffold } from "../components/PageScaffold";
import { Card } from "../components/ui";
import { useOrf } from "../state/OrfProvider";

export function PersonalSettingsPage() {
  const { currentUser, theme, toggleTheme } = useOrf();

  return (
    <PageScaffold title="个人设置" subtitle="管理当前登录用户的本地偏好。">
      <Card className="orf-card-padding">
        <div className="flex items-center gap-3">
          <User className="h-5 w-5 orf-text-muted" />
          <div>
            <div className="font-semibold orf-text-primary">{currentUser?.name ?? "User"}</div>
            <div className="text-sm orf-text-secondary">{currentUser?.email ?? "未绑定邮箱"}</div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-between gap-4 border-t pt-4 orf-border">
          <div>
            <div className="font-medium orf-text-primary">界面主题</div>
            <div className="text-sm orf-text-secondary">当前为 {theme === "dark" ? "深色" : "浅色"}。</div>
          </div>
          <button className="orf-control orf-secondary-action border px-4 py-2 text-sm font-medium" type="button" onClick={toggleTheme}>
            切换主题
          </button>
        </div>
      </Card>
    </PageScaffold>
  );
}
