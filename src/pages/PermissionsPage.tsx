import { ShieldCheck, UserCog } from "lucide-react";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, StatusBadge } from "../components/ui";
import { useOrf } from "../state/OrfProvider";
import type { OrfStage, PermissionAction, PermissionResource, UserRole } from "../types/orf";

const stages: { value: OrfStage; label: string }[] = [
  { value: "goalSetting", label: "目标设定" },
  { value: "resultClaiming", label: "指标领取" },
  { value: "orfReestimate", label: "ORF 重估" },
  { value: "goalFrozen", label: "目标冻结" },
];

const resources: { value: PermissionResource; label: string }[] = [
  { value: "objective", label: "目标" },
  { value: "result", label: "指标" },
  { value: "task", label: "任务" },
  { value: "subtask", label: "子任务" },
];

const actions: { value: PermissionAction; label: string }[] = [
  { value: "view", label: "查看" },
  { value: "edit", label: "编辑" },
  { value: "create", label: "创建" },
];

const roleLabel: Record<UserRole, string> = {
  admin: "管理员",
  member: "普通成员",
};

export function PermissionsPage() {
  const { state, updateUserRole, updatePermissionRule } = useOrf();
  const currentUser = state.users.find((user) => user.id === state.currentUserId);

  return (
    <PageScaffold title="用户权限" subtitle="角色和阶段权限配置。">
      <div className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <Card className="orf-card-padding">
          <div className="flex items-center gap-2 text-sm font-semibold orf-text-primary">
            <UserCog className="h-4 w-4" />
            用户
          </div>
          <div className="mt-4 grid gap-3">
            {state.users.map((user) => (
              <div key={user.id} className="rounded-lg border orf-border orf-surface-muted p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold orf-text-primary">{user.name}</div>
                    <div className="truncate text-xs orf-text-muted">{user.email}</div>
                  </div>
                  {currentUser?.id === user.id && <span className="orf-status-tag border orf-border px-2 py-1 text-xs orf-text-muted">当前</span>}
                </div>
                <select className="orf-input mt-3 h-9 px-3 text-sm" value={user.role} onChange={(event) => updateUserRole(user.id, event.target.value as UserRole)}>
                  <option value="admin">管理员</option>
                  <option value="member">普通成员</option>
                </select>
              </div>
            ))}
          </div>
        </Card>

        <Card className="orf-card-padding">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold orf-text-primary">
              <ShieldCheck className="h-4 w-4" />
              普通成员权限
            </div>
            <Button variant="secondary" type="button" disabled>
              管理员默认所有权限
            </Button>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="orf-permission-table w-full min-w-[760px] text-sm">
              <thead>
                <tr>
                  <th>阶段</th>
                  <th>资源</th>
                  {actions.map((action) => (
                    <th key={action.value}>{action.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stages.flatMap((stage) =>
                  resources.map((resource, index) => {
                    const rule = state.permissionRules.find((item) => item.role === "member" && item.stage === stage.value && item.resource === resource.value);

                    return (
                      <tr key={`${stage.value}:${resource.value}`}>
                        {index === 0 && <td rowSpan={resources.length}>{stage.label}</td>}
                        <td>{resource.label}</td>
                        {actions.map((action) => (
                          <td key={action.value}>
                            <PermissionToggle
                              checked={rule?.actions.includes(action.value) ?? false}
                              label={`${stage.label} ${resource.label} ${action.label}`}
                              onChange={(allowed) =>
                                updatePermissionRule({
                                  role: "member",
                                  stage: stage.value,
                                  resource: resource.value,
                                  action: action.value,
                                  allowed,
                                })
                              }
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <StatusBadge status="Draft" />
            <span className="text-sm orf-text-muted">配置立即保存到前端状态。</span>
          </div>
        </Card>
      </div>
    </PageScaffold>
  );
}

function PermissionToggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="inline-flex cursor-pointer items-center justify-center" aria-label={label} title={label}>
      <input className="sr-only" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className={checked ? "orf-permission-toggle orf-permission-toggle-on" : "orf-permission-toggle"}>
        {checked ? "允许" : "拒绝"}
      </span>
    </label>
  );
}
