import { clsx } from "clsx";
import { BellRing, Check, Contrast, Image, Loader2, Moon, Power, RotateCcw, Trash2, Type, Upload } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { ImagePreviewDialog } from "../components/ImagePreviewDialog";
import { PageScaffold } from "../components/PageScaffold";
import { UserAvatar } from "../components/UserAvatar";
import { Button, Card, Field } from "../components/ui";
import { defaultChatTheme, defaultUserDisplayPreferences, displayPreferenceLimits, type ChatTheme, type UserDisplayPreferences } from "../domain/settings/personalPreferences";
import { sendNativeChatNotification } from "../features/chat/chatNativeNotificationDelivery";
import { workbenchZoomScale } from "../features/display/displayPreferences";
import {
  getDesktopLaunchAtLoginState,
  setDesktopLaunchAtLoginEnabled,
  type DesktopLaunchAtLoginState,
  type DesktopShellLaunchAtLoginResult,
} from "../features/desktop/desktopShellRuntime";
import {
  deletePersonalBackground,
  getPersonalBackgrounds,
  saveUserPreferences,
  uploadPersonalBackground,
  type PersonalBackgroundsData,
  type UserPreferences,
  type VisualBackgroundConfig,
} from "../state/apiClient";
import { readModelInvalidationKey } from "../features/realtime/readModelInvalidations";
import { useOrf } from "../state/OrfProvider";
import { dispatchVisualBackgroundChanged } from "../utils/visualBackgrounds";
import { dispatchPersonalPreferencesChanged } from "../utils/personalPreferences";

type RequestStatus = "idle" | "loading" | "success" | "error";
type DesktopLaunchAtLoginStatus = RequestStatus | "unsupported";
type NativeNotificationTestResult = Awaited<ReturnType<typeof sendNativeChatNotification>>;

const defaultPersonalBackgroundConfig: VisualBackgroundConfig = {
  mode: "fixed",
  fixedBackgroundId: null,
  switchTrigger: "on_open",
  switchOrder: "random",
  switchIntervalMinutes: 10,
};

const landingOptions = [
  { label: "悬赏大厅", value: "/bounties" },
  { label: "我的挑战", value: "/tasks" },
  { label: "反馈", value: "/feedback" },
  { label: "统计", value: "/reports" },
  { label: "消息", value: "/notifications" },
];

const chatThemeOptions: Array<{ label: string; value: ChatTheme }> = [
  { label: "舒适暗色", value: "dark" },
  { label: "经典浅色", value: "light" },
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [backgrounds, setBackgrounds] = useState<PersonalBackgroundsData | null>(null);
  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null);
  const [loadStatus, setLoadStatus] = useState<RequestStatus>("idle");
  const [saveStatus, setSaveStatus] = useState<RequestStatus>("idle");
  const [uploadStatus, setUploadStatus] = useState<RequestStatus>("idle");
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

  const loadSettings = async () => {
    setLoadStatus("loading");
    setErrorMessage(null);
    try {
      const data = await getPersonalBackgrounds();
      setPreferences(data.preferences);
      setBackgrounds(data);
      setSelectedBackgroundId(data.config.fixedBackgroundId);
      setLoadStatus("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "个人设置加载失败";
      setLoadStatus("error");
      setErrorMessage(message);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, [settingsInvalidationKey]);

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

  const handleChatThemeChange = async (value: ChatTheme) => {
    await savePreferencePatch({ chatTheme: value }, "聊天主题已更新");
  };

  const handleDisplayPreferenceChange = async (patch: Partial<UserDisplayPreferences>) => {
    const current = preferences?.display ?? defaultUserDisplayPreferences;
    await savePreferencePatch({ display: { ...current, ...patch } }, "界面显示已更新");
  };

  const handleResetDisplayPreferences = async () => {
    await savePreferencePatch({ display: defaultUserDisplayPreferences }, "界面显示已恢复默认");
  };

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || uploadStatus === "loading") {
      return;
    }
    if (!file.type.startsWith("image/")) {
      const message = "仅支持上传图片文件";
      setErrorMessage(message);
      notify(message);
      return;
    }

    setUploadStatus("loading");
    setErrorMessage(null);
    try {
      const uploaded = await uploadPersonalBackground(file);
      const nextConfig = {
        ...(backgrounds?.config ?? defaultPersonalBackgroundConfig),
        mode: "fixed",
        fixedBackgroundId: uploaded.id,
      } satisfies VisualBackgroundConfig;
      const saved = await savePreferencePatch({ appBackground: nextConfig }, "个人背景已上传");
      if (saved) {
        await loadSettings();
        setSelectedBackgroundId(uploaded.id);
        dispatchVisualBackgroundChanged("app_background");
      }
      setUploadStatus("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败";
      setUploadStatus("error");
      setErrorMessage(message);
      notify(message);
    }
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

  const handleUseSelectedBackground = async () => {
    if (!selectedBackgroundId) {
      return;
    }
    const nextConfig = {
      ...(backgrounds?.config ?? defaultPersonalBackgroundConfig),
      mode: "fixed",
      fixedBackgroundId: selectedBackgroundId,
    } satisfies VisualBackgroundConfig;
    const saved = await savePreferencePatch({ appBackground: nextConfig }, "个人背景已更新");
    if (saved) {
      await loadSettings();
      dispatchVisualBackgroundChanged("app_background");
    }
  };

  const handleUseSystemDefault = async () => {
    const saved = await savePreferencePatch({ appBackground: null }, "已使用系统默认背景");
    if (saved) {
      await loadSettings();
      dispatchVisualBackgroundChanged("app_background");
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

  const handleDeleteSelectedBackground = async () => {
    if (!selectedBackgroundId || !isPersonalBackground(selectedBackgroundId)) {
      return;
    }

    setSaveStatus("loading");
    setErrorMessage(null);
    try {
      await deletePersonalBackground(selectedBackgroundId);
      await loadSettings();
      dispatchVisualBackgroundChanged("app_background");
      setSaveStatus("success");
      notify("个人背景已删除");
    } catch (error) {
      const message = error instanceof Error ? error.message : "个人背景删除失败";
      setSaveStatus("error");
      setErrorMessage(message);
      notify(message);
    }
  };

  const sidebarPreference =
    preferences?.sidebarCollapsed === null || preferences?.sidebarCollapsed === undefined
      ? "system"
      : preferences.sidebarCollapsed
        ? "collapsed"
        : "expanded";
  const displayPreferences = preferences?.display ?? defaultUserDisplayPreferences;
  const selectedBackground = backgrounds?.list.find((background) => background.id === selectedBackgroundId) ?? null;
  const canUseSelected = Boolean(selectedBackgroundId && selectedBackgroundId !== preferences?.appBackground?.fixedBackgroundId);
  const busy = saveStatus === "loading" || uploadStatus === "loading" || avatarStatus === "loading";
  const launchAtLoginDisabled = launchAtLoginStatus === "idle" || launchAtLoginStatus === "loading" || launchAtLoginStatus === "unsupported";
  const launchAtLoginDescription = launchAtLoginStatus === "unsupported"
    ? "仅已安装 Win11 客户端可用。"
    : "Windows 登录后自动启动并驻留托盘。";

  return (
    <PageScaffold title="个人设置" subtitle="管理当前登录用户的偏好。">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
        <div className="grid content-start gap-4">
          <Card className="orf-card-padding">
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
                <div className="font-medium orf-text-primary">{currentUser?.status ?? "-"}</div>
              </div>
            </div>
          </Card>

          <Card className="orf-card-padding grid gap-4">
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
            <Field label="聊天界面主题">
              <select
                className="orf-control border px-3 py-2 text-sm"
                value={preferences?.chatTheme ?? defaultChatTheme}
                disabled={!preferences || busy}
                onChange={(event) => void handleChatThemeChange(event.target.value as ChatTheme)}
              >
                {chatThemeOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </Field>
            <div className="grid gap-3 border-t pt-4 orf-border">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2 font-medium orf-text-primary">
                  <Type className="h-4 w-4 shrink-0 orf-text-muted" aria-hidden="true" />
                  <span>界面显示</span>
                </div>
                <Button type="button" variant="ghost" disabled={!preferences || busy} onClick={() => void handleResetDisplayPreferences()}>
                  <RotateCcw className="h-4 w-4" />
                  重置
                </Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
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
              <label className="flex items-center justify-between gap-4 rounded-md border orf-border px-3 py-2">
                <span className="flex min-w-0 items-center gap-2">
                  <Contrast className="h-4 w-4 shrink-0 orf-text-muted" aria-hidden="true" />
                  <span className="font-medium orf-text-primary">高对比度</span>
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
            <div className="flex items-start gap-3 border-t pt-4 orf-border">
              <Moon className="mt-0.5 h-4 w-4 shrink-0 orf-text-muted" aria-hidden="true" />
              <div>
                <div className="font-medium orf-text-primary">聊天独立配色</div>
                <div className="mt-1 text-sm orf-text-secondary">只影响聊天页的侧栏、消息区、输入框和聊天浮层，不改变其他页面皮肤。</div>
              </div>
            </div>
            <label className="flex items-center justify-between gap-4 border-t pt-4 orf-border">
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
            <div className="flex items-center justify-between gap-4 border-t pt-4 orf-border">
              <span>
                <span className="block font-medium orf-text-primary">系统通知</span>
                <span className="block text-sm orf-text-secondary">Windows / Android 客户端</span>
              </span>
              <Button type="button" variant="secondary" disabled={notificationTestStatus === "loading"} onClick={() => void handleNativeNotificationTest()}>
                {notificationTestStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />}
                测试
              </Button>
            </div>
            <label className="flex items-center justify-between gap-4 border-t pt-4 orf-border">
              <span className="flex min-w-0 items-start gap-3">
                <Power className="mt-0.5 h-4 w-4 shrink-0 orf-text-muted" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-medium orf-text-primary">开机自启</span>
                  <span className="block text-sm orf-text-secondary">
                    {launchAtLoginDescription}
                  </span>
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
          </Card>
        </div>

        <Card className="orf-card-padding">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold orf-text-primary">我的 AppShell 皮肤</h2>
              <p className="mt-1 text-sm orf-text-secondary">选择侧边栏和顶部栏使用的系统皮肤或本人上传皮肤。</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => void handleFileSelected(event)} />
            <Button type="button" variant="secondary" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              {uploadStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              上传
            </Button>
          </div>

          {loadStatus === "loading" && <div className="orf-settings-background-state">加载中...</div>}
          {loadStatus === "error" && <div className="orf-settings-background-state">{errorMessage ?? "个人设置加载失败"}</div>}
          {loadStatus === "success" && backgrounds && (
            <>
              <div className="orf-settings-background-gallery" data-loading="false">
                {backgrounds.list.map((background) => {
                  const selected = selectedBackgroundId === background.id;
                  return (
                    <button
                      key={background.id}
                      type="button"
                      className={clsx("orf-settings-background-card", selected && "orf-settings-background-card-selected")}
                      onClick={() => setSelectedBackgroundId(background.id)}
                    >
                      <img src={background.url} alt={background.fileName} draggable={false} />
                      {background.isDefault && (
                        <span className="orf-settings-background-default">
                          <Check className="h-3.5 w-3.5" />
                          当前
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="orf-settings-background-actions">
                <div className="orf-settings-selected-text">
                  {errorMessage && <span>{errorMessage}</span>}
                  {!errorMessage && selectedBackground && (
                    <span>{isPersonalBackground(selectedBackground.id) ? "个人上传" : "系统背景"}：{selectedBackground.fileName}</span>
                  )}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="ghost" disabled={!preferences || busy || preferences.appBackground === null} onClick={() => void handleUseSystemDefault()}>
                    使用系统默认
                  </Button>
                  <Button type="button" variant="secondary" disabled={busy || !isPersonalBackground(selectedBackgroundId)} onClick={() => void handleDeleteSelectedBackground()}>
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                  <Button type="button" disabled={busy || !canUseSelected} onClick={() => void handleUseSelectedBackground()}>
                    {saveStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Image className="h-4 w-4" />}
                    设为我的背景
                  </Button>
                </div>
              </div>
            </>
          )}
        </Card>
      </div>
      {avatarPreviewOpen && avatarPreview && <ImagePreviewDialog preview={avatarPreview} onClose={() => setAvatarPreviewOpen(false)} />}
    </PageScaffold>
  );
}

function isPersonalBackground(id: string | null | undefined) {
  return Boolean(id?.includes("/personal/"));
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
