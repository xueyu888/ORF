import { BellRing, CircleAlert, Contrast, Loader2, Moon, Power, RotateCcw, Sun, Trash2, Type, Upload } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { ImagePreviewDialog } from "../components/ImagePreviewDialog";
import { PageScaffold } from "../components/PageScaffold";
import { UserAvatar } from "../components/UserAvatar";
import { registeredWebModules } from "../config/webModuleRegistry";
import { Button, Card, Field } from "../components/ui";
import { defaultUserDisplayPreferences, displayPreferenceLimits, type UserDisplayPreferences } from "../domain/settings/personalPreferences";
import { userStatusLabel } from "../domain/userPresentation";
import { defaultAppearanceMode, type AppearanceMode } from "../features/appearance/appearanceMode";
import { sendNativeChatNotification } from "../features/chat/chatNativeNotificationDelivery";
import { workbenchZoomScale } from "../features/display/displayPreferences";
import {
  getDesktopLaunchAtLoginState,
  setDesktopLaunchAtLoginEnabled,
  type DesktopLaunchAtLoginState,
  type DesktopShellLaunchAtLoginResult,
} from "../features/desktop/desktopShellRuntime";
import {
  getUserPreferences,
  saveUserPreferences,
  type UserPreferences,
} from "../state/apiClient";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import { useOrf } from "../state/OrfProvider";
import { dispatchPersonalPreferencesChanged } from "../utils/personalPreferences";
import { VisualSkinWorkbench } from "../features/settings/VisualSkinWorkbench";

type RequestStatus = "idle" | "loading" | "success" | "error";
type DesktopLaunchAtLoginStatus = RequestStatus | "unsupported";
type NativeNotificationTestResult = Awaited<ReturnType<typeof sendNativeChatNotification>>;

const landingOptions = [
  { label: "悬赏大厅", value: "/bounties" },
  { label: "我的挑战", value: "/tasks" },
  { label: "聊天", value: "/chat" },
  ...registeredWebModules.map((module) => ({ label: module.navigation.label, value: module.navigation.path })),
  { label: "统计", value: "/reports" },
];

const appearanceModeOptions: Array<{ description: string; icon: typeof Sun; label: string; value: AppearanceMode }> = [
  { description: "清亮冷白界面", icon: Sun, label: "亮色", value: "light" },
  { description: "沉静深蓝界面", icon: Moon, label: "暗色", value: "dark" },
];
const workbenchZoomOptions = range(displayPreferenceLimits.workbenchZoomLevel.min, displayPreferenceLimits.workbenchZoomLevel.max).map((value) => ({
  label: `${Math.round(workbenchZoomScale(value) * 100)}%`,
  value,
}));
const interfaceFontSizeOptions = range(displayPreferenceLimits.interfaceFontSize.min, displayPreferenceLimits.interfaceFontSize.max).map((value) => ({ label: `${value}px`, value }));
const contentFontSizeOptions = range(displayPreferenceLimits.contentFontSize.min, displayPreferenceLimits.contentFontSize.max).map((value) => ({ label: `${value}px`, value }));
const displayDensityOptions: Array<{ label: string; value: UserDisplayPreferences["density"] }> = [
  { label: "紧凑", value: "compact" },
  { label: "默认", value: "default" },
  { label: "舒展", value: "comfortable" },
];

export function PersonalSettingsPage() {
  const { currentUser, deleteCurrentUserAvatar, notify, readModelInvalidations, uploadCurrentUserAvatar } = useOrf();
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [saveStatus, setSaveStatus] = useState<RequestStatus>("idle");
  const [avatarStatus, setAvatarStatus] = useState<RequestStatus>("idle");
  const [notificationTestStatus, setNotificationTestStatus] = useState<RequestStatus>("idle");
  const [launchAtLoginStatus, setLaunchAtLoginStatus] = useState<DesktopLaunchAtLoginStatus>("idle");
  const [launchAtLoginState, setLaunchAtLoginState] = useState<DesktopLaunchAtLoginState | null>(null);
  const [avatarPreviewOpen, setAvatarPreviewOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const settingsInvalidationKey = readModelInvalidationKey(readModelInvalidations, "settings");
  const avatarPreview = currentUser?.avatarUrl
    ? { alt: `${currentUser.name} 头像`, label: `${currentUser.name} 头像`, src: currentUser.avatarUrl }
    : null;

  useEffect(() => {
    let cancelled = false;
    setErrorMessage(null);
    void getUserPreferences({ force: Boolean(settingsInvalidationKey), userId: currentUser?.id })
      .then((data) => {
        if (!cancelled) setPreferences(data);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : "个人设置加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, settingsInvalidationKey]);

  useEffect(() => {
    if (!currentUser?.avatarUrl) {
      setAvatarPreviewOpen(false);
    }
  }, [currentUser?.avatarUrl]);

  useEffect(() => {
    let cancelled = false;
    setLaunchAtLoginStatus("loading");
    void getDesktopLaunchAtLoginState()
      .then((result) => {
        if (cancelled) return;
        applyDesktopLaunchAtLoginResult(result, {
          onError: false,
          onSuccess: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setLaunchAtLoginStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const savePreferencePatch = async (patch: Parameters<typeof saveUserPreferences>[0], message = "个人设置已保存") => {
    setSaveStatus("loading");
    setErrorMessage(null);
    try {
      const saved = await saveUserPreferences(patch);
      setPreferences(saved);
      setSaveStatus("success");
      dispatchPersonalPreferencesChanged();
      notify(message);
      return saved;
    } catch (error) {
      const errorText = error instanceof Error ? error.message : "个人设置保存失败";
      setSaveStatus("error");
      setErrorMessage(errorText);
      notify(errorText);
      return null;
    }
  };

  const handleLandingChange = async (value: string) => {
    await savePreferencePatch({ defaultLandingPath: value || null });
  };

  const handleSidebarPreferenceChange = async (value: string) => {
    await savePreferencePatch({ sidebarCollapsed: value === "system" ? null : value === "collapsed" });
  };

  const handleAppearanceModeChange = async (value: AppearanceMode) => {
    await savePreferencePatch({ chatTheme: value }, "全局外观已更新");
  };

  const handleDisplayPreferenceChange = async (patch: Partial<UserDisplayPreferences>) => {
    const current = preferences?.display ?? defaultUserDisplayPreferences;
    await savePreferencePatch({ display: { ...current, ...patch } }, "界面显示已更新");
  };

  const handleResetDisplayPreferences = async () => {
    await savePreferencePatch({ display: defaultUserDisplayPreferences }, "界面显示已恢复默认");
  };

  const handleAvatarSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || avatarStatus === "loading") {
      return;
    }
    if (!file.type.startsWith("image/")) {
      const message = "仅支持上传图片文件";
      setErrorMessage(message);
      notify(message);
      return;
    }

    setAvatarStatus("loading");
    setErrorMessage(null);
    const ok = await uploadCurrentUserAvatar(file);
    setAvatarStatus(ok ? "success" : "error");
    if (!ok) {
      setErrorMessage("头像上传失败");
    }
  };

  const handleDeleteAvatar = async () => {
    if (!currentUser?.avatarUrl || avatarStatus === "loading") {
      return;
    }

    setAvatarStatus("loading");
    setErrorMessage(null);
    const ok = await deleteCurrentUserAvatar();
    setAvatarStatus(ok ? "success" : "error");
    if (ok) {
      setAvatarPreviewOpen(false);
    }
    if (!ok) {
      setErrorMessage("头像删除失败");
    }
  };

  const handleNativeNotificationTest = async () => {
    if (notificationTestStatus === "loading") {
      return;
    }

    const now = new Date();
    const notificationId = `settings-notification-test-${now.getTime()}`;
    setNotificationTestStatus("loading");
    setErrorMessage(null);
    const result = await sendNativeChatNotification({
      body: "如果你看到这条通知，客户端系统通知通道正常。",
      channelId: "settings",
      createdAt: now.toISOString(),
      id: notificationId,
      messageId: notificationId,
      targetPath: "/chat",
      title: "ORF 系统通知测试",
    });

    if (result.status === "success") {
      setNotificationTestStatus("success");
      notify("系统通知已发出");
      return;
    }

    const message = nativeNotificationTestMessage(result);
    setNotificationTestStatus("error");
    setErrorMessage(message);
    notify(message);
  };

  const applyDesktopLaunchAtLoginResult = (
    result: DesktopShellLaunchAtLoginResult,
    options: { enabled?: boolean; onError: boolean; onSuccess: boolean },
  ) => {
    if (result.status === "success" && result.data) {
      setLaunchAtLoginState(result.data);
      setLaunchAtLoginStatus("success");
      if (options.onSuccess && typeof options.enabled === "boolean") {
        notify(options.enabled ? "已开启开机自启" : "已关闭开机自启");
      }
      return;
    }

    if (result.status === "unsupported") {
      setLaunchAtLoginStatus("unsupported");
      setLaunchAtLoginState(null);
      return;
    }

    const message = desktopLaunchAtLoginMessage(result);
    setLaunchAtLoginStatus("error");
    setErrorMessage(message);
    if (options.onError) {
      notify(message);
    }
  };

  const handleLaunchAtLoginChange = async (enabled: boolean) => {
    if (launchAtLoginStatus === "loading") {
      return;
    }

    setLaunchAtLoginStatus("loading");
    setErrorMessage(null);
    const result = await setDesktopLaunchAtLoginEnabled(enabled);
    applyDesktopLaunchAtLoginResult(result, {
      enabled,
      onError: true,
      onSuccess: true,
    });
  };

  const sidebarPreference =
    preferences?.sidebarCollapsed === null || preferences?.sidebarCollapsed === undefined
      ? "system"
      : preferences.sidebarCollapsed
        ? "collapsed"
        : "expanded";
  const displayPreferences = preferences?.display ?? defaultUserDisplayPreferences;
  const busy = saveStatus === "loading" || avatarStatus === "loading";
  const launchAtLoginDisabled = launchAtLoginStatus === "idle" || launchAtLoginStatus === "loading" || launchAtLoginStatus === "unsupported";
  const launchAtLoginDescription = launchAtLoginStatus === "unsupported"
    ? "仅已安装 Win11 客户端可用。"
    : "Windows 登录后自动启动并驻留托盘。";

  return (
    <PageScaffold title="个人设置">
      <div className="orf-personal-settings-page grid gap-4">
        <div className="orf-personal-settings-overview grid gap-4 xl:grid-cols-[minmax(0,0.72fr)_minmax(0,1.28fr)]">
          <Card className="orf-card-padding orf-personal-settings-profile">
            <div className="orf-personal-settings-card-heading">
              <span>账户</span>
              <small>头像与身份信息</small>
            </div>
            <div className="flex items-start gap-4">
              {avatarPreview ? (
                <button
                  type="button"
                  className="orf-avatar-preview-trigger"
                  aria-label="查看头像原图"
                  title="查看头像"
                  onClick={() => setAvatarPreviewOpen(true)}
                >
                  <UserAvatar avatarUrl={currentUser?.avatarUrl} name={currentUser?.name ?? "User"} size="xl" />
                </button>
              ) : (
                <UserAvatar avatarUrl={currentUser?.avatarUrl} name={currentUser?.name ?? "User"} size="xl" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold orf-text-primary">{currentUser?.name ?? "User"}</div>
                <div className="truncate text-sm orf-text-secondary">{currentUser?.email ?? "未绑定邮箱"}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input ref={avatarInputRef} type="file" accept="image/gif,image/jpeg,image/png,image/webp" hidden onChange={(event) => void handleAvatarSelected(event)} />
                  <Button type="button" variant="secondary" disabled={avatarStatus === "loading"} onClick={() => avatarInputRef.current?.click()}>
                    {avatarStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    上传头像
                  </Button>
                  <Button type="button" variant="ghost" disabled={!currentUser?.avatarUrl || avatarStatus === "loading"} onClick={() => void handleDeleteAvatar()}>
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                </div>
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="orf-text-muted">角色</div>
                <div className="font-medium orf-text-primary">{currentUser?.role === "admin" ? "管理员" : "成员"}</div>
              </div>
              <div>
                <div className="orf-text-muted">状态</div>
                <div className="font-medium orf-text-primary">{currentUser ? userStatusLabel[currentUser.status] : "-"}</div>
              </div>
            </div>
          </Card>

          <Card className="orf-card-padding orf-personal-settings-preferences grid gap-4">
            <div className="orf-personal-settings-card-heading">
              <span>工作台偏好</span>
              <small>入口、外观与本机体验</small>
            </div>
            {errorMessage && (
              <div className="orf-settings-inline-error" role="alert">
                <CircleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            )}
            <section className="orf-personal-settings-section orf-personal-settings-navigation-section">
              <div className="orf-personal-settings-section-heading">
                <span>启动与导航</span>
                <small>只保留每天真正会用到的入口选择。</small>
              </div>
              <div className="orf-personal-settings-field-grid">
                <Field label="默认进入页面">
                  <select
                    className="orf-control border px-3 py-2 text-sm"
                    value={preferences?.defaultLandingPath ?? ""}
                    disabled={!preferences || busy}
                    onChange={(event) => void handleLandingChange(event.target.value)}
                  >
                    <option value="">系统默认</option>
                    {landingOptions.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </Field>
                <Field label="侧边栏默认状态">
                  <select
                    className="orf-control border px-3 py-2 text-sm"
                    value={sidebarPreference}
                    disabled={!preferences || busy}
                    onChange={(event) => void handleSidebarPreferenceChange(event.target.value)}
                  >
                    <option value="system">系统默认</option>
                    <option value="expanded">展开</option>
                    <option value="collapsed">折叠</option>
                  </select>
                </Field>
              </div>
            </section>

            <section className="orf-personal-settings-section orf-personal-settings-appearance-section">
              <div className="orf-personal-settings-section-heading">
                <span>外观与显示</span>
                <small>明暗主题、字号和密度共享同一套内容结构。</small>
              </div>
              <Field label="全局外观">
                <div className="orf-appearance-mode-picker" role="radiogroup" aria-label="全局亮色或暗色外观">
                  {appearanceModeOptions.map((option) => {
                    const Icon = option.icon;
                    const selected = (preferences?.chatTheme ?? defaultAppearanceMode) === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        className="orf-appearance-mode-option"
                        data-selected={selected ? "true" : "false"}
                        role="radio"
                        aria-checked={selected}
                        disabled={!preferences || busy}
                        onClick={() => void handleAppearanceModeChange(option.value)}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Field>
              <div className="orf-personal-settings-display-block">
                <div className="orf-personal-settings-display-heading">
                  <div>
                    <Type className="h-4 w-4 shrink-0 orf-text-muted" aria-hidden="true" />
                    <span>界面显示</span>
                  </div>
                  <Button type="button" variant="ghost" disabled={!preferences || busy} onClick={() => void handleResetDisplayPreferences()}>
                    <RotateCcw className="h-4 w-4" />
                    重置
                  </Button>
                </div>
                <div className="orf-personal-settings-field-grid orf-personal-settings-display-grid">
                  <Field label="工作台缩放">
                    <select
                      className="orf-control border px-3 py-2 text-sm"
                      value={displayPreferences.workbenchZoomLevel}
                      disabled={!preferences || busy}
                      onChange={(event) => void handleDisplayPreferenceChange({ workbenchZoomLevel: Number(event.target.value) })}
                    >
                      {workbenchZoomOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="界面字号">
                    <select
                      className="orf-control border px-3 py-2 text-sm"
                      value={displayPreferences.interfaceFontSize}
                      disabled={!preferences || busy}
                      onChange={(event) => void handleDisplayPreferenceChange({ interfaceFontSize: Number(event.target.value) })}
                    >
                      {interfaceFontSizeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="内容字号">
                    <select
                      className="orf-control border px-3 py-2 text-sm"
                      value={displayPreferences.contentFontSize}
                      disabled={!preferences || busy}
                      onChange={(event) => void handleDisplayPreferenceChange({ contentFontSize: Number(event.target.value) })}
                    >
                      {contentFontSizeOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="界面密度">
                    <select
                      className="orf-control border px-3 py-2 text-sm"
                      value={displayPreferences.density}
                      disabled={!preferences || busy}
                      onChange={(event) => void handleDisplayPreferenceChange({ density: event.target.value as UserDisplayPreferences["density"] })}
                    >
                      {displayDensityOptions.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <label className="orf-personal-settings-toggle-row">
                  <span>
                    <Contrast className="h-4 w-4 shrink-0 orf-text-muted" aria-hidden="true" />
                    <span>高对比度</span>
                  </span>
                  <input
                    className="h-5 w-5 shrink-0 accent-[var(--orf-accent)]"
                    type="checkbox"
                    checked={displayPreferences.contrast === "high"}
                    disabled={!preferences || busy}
                    onChange={(event) => void handleDisplayPreferenceChange({ contrast: event.target.checked ? "high" : "default" })}
                  />
                </label>
              </div>
              <div className="orf-personal-settings-theme-note">
                <Moon className="h-4 w-4 shrink-0 orf-text-muted" aria-hidden="true" />
                <div>
                  <div className="font-medium orf-text-primary">统一前景皮肤</div>
                  <div className="text-sm orf-text-secondary">文字、图标、按钮、状态色和玻璃材质会在所有页面同步切换；背景图片保持独立。</div>
                </div>
              </div>
            </section>

            <section className="orf-personal-settings-section orf-personal-settings-notification-section">
              <div className="orf-personal-settings-section-heading">
                <span>通知与客户端</span>
                <small>只在需要你行动时提高视觉优先级。</small>
              </div>
              <div className="orf-personal-settings-notification-grid">
                <label className="orf-personal-settings-setting-row">
                  <span>
                    <span className="block font-medium orf-text-primary">Toast 通知</span>
                    <span className="block text-sm orf-text-secondary">当前用户的页面提示。</span>
                  </span>
                  <input
                    className="h-5 w-5 accent-[var(--orf-accent)]"
                    type="checkbox"
                    checked={preferences?.notificationDisplay.toastEnabled ?? true}
                    disabled={!preferences || busy}
                    onChange={(event) => void savePreferencePatch({ notificationDisplay: { toastEnabled: event.target.checked } })}
                  />
                </label>
                <div className="orf-personal-settings-setting-row">
                  <span>
                    <span className="block font-medium orf-text-primary">系统通知</span>
                    <span className="block text-sm orf-text-secondary">Windows / Android 客户端</span>
                  </span>
                  <Button type="button" variant="secondary" disabled={notificationTestStatus === "loading"} onClick={() => void handleNativeNotificationTest()}>
                    {notificationTestStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                    测试
                  </Button>
                </div>
                <label className="orf-personal-settings-setting-row">
                  <span className="flex min-w-0 items-start gap-3">
                    <Power className="mt-0.5 h-4 w-4 shrink-0 orf-text-muted" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block font-medium orf-text-primary">开机自启</span>
                      <span className="block text-sm orf-text-secondary">{launchAtLoginDescription}</span>
                    </span>
                  </span>
                  <input
                    className="h-5 w-5 shrink-0 accent-[var(--orf-accent)]"
                    type="checkbox"
                    checked={launchAtLoginState?.enabled ?? false}
                    disabled={launchAtLoginDisabled}
                    onChange={(event) => void handleLaunchAtLoginChange(event.target.checked)}
                  />
                </label>
              </div>
            </section>
          </Card>
        </div>

        <VisualSkinWorkbench scope="personal" />
      </div>
      {avatarPreviewOpen && avatarPreview && <ImagePreviewDialog preview={avatarPreview} onClose={() => setAvatarPreviewOpen(false)} />}
    </PageScaffold>
  );
}

function range(start: number, end: number) {
  return Array.from({ length: end - start + 1 }, (_item, index) => start + index);
}

function nativeNotificationTestMessage(result: NativeNotificationTestResult) {
  if (result.status === "unsupported") {
    return "当前环境没有系统通知通道，请在 Win11 或 Android 客户端中测试";
  }
  if (result.reason === "permission_denied") {
    return "系统通知权限未打开";
  }
  if (result.reason === "invalid_payload") {
    return "系统通知测试参数无效";
  }
  if (result.reason === "notification_not_supported") {
    return "当前系统不支持此客户端通知";
  }
  return "系统通知发送失败";
}

function desktopLaunchAtLoginMessage(result: DesktopShellLaunchAtLoginResult) {
  if (result.reason === "desktop_shell_bridge_unavailable") {
    return "当前环境不是 Win11 桌面客户端";
  }
  if (result.reason === "desktop_client_not_installed") {
    return "请使用已安装的 Win11 客户端设置开机自启";
  }
  if (result.reason === "unsupported_platform") {
    return "当前平台不支持 Win11 开机自启";
  }
  if (result.reason === "login_item_read_failed") {
    return "开机自启状态读取失败";
  }
  if (result.reason === "login_item_write_failed") {
    return "开机自启设置失败";
  }
  return "开机自启设置失败";
}
