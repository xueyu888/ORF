import { clsx } from "clsx";
import { CalendarDays, Check, Database, Image, Loader2, Palette, ShieldCheck, Tags, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  getVisualBackgrounds,
  setDefaultVisualBackground as requestSetDefaultVisualBackground,
  uploadVisualBackground,
  type VisualBackgroundImage,
  type VisualBackgroundScene,
} from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";

type NavigationKey = "visual" | "cycle" | "feedback" | "rules" | "storage";
type RequestStatus = "idle" | "loading" | "success" | "error";

const settingsNavigation: Array<{ key: NavigationKey; label: string; icon: LucideIcon }> = [
  { key: "visual", label: "视觉设置", icon: Palette },
  { key: "cycle", label: "周期与团队", icon: CalendarDays },
  { key: "feedback", label: "反馈分类", icon: Tags },
  { key: "rules", label: "ORF 规则", icon: ShieldCheck },
  { key: "storage", label: "存储", icon: Database },
];

const backgroundSections: Array<{
  scene: VisualBackgroundScene;
  title: string;
  description: string;
}> = [
  {
    scene: "login_background",
    title: "登录页面背景设置",
    description: "自定义登录页面的背景。",
  },
  {
    scene: "sidebar_background",
    title: "侧边栏背景设置",
    description: "自定义系统左侧边栏背景。",
  },
];

export function SettingsPage() {
  const [activeNavigation, setActiveNavigation] = useState<NavigationKey>("visual");

  return (
    <div className="orf-settings-page">
      <nav className="orf-settings-nav" aria-label="设置导航">
        {settingsNavigation.map((item) => (
          <button
            key={item.key}
            type="button"
            className={clsx(activeNavigation === item.key && "orf-settings-nav-active")}
            onClick={() => setActiveNavigation(item.key)}
          >
            <item.icon className="h-5 w-5" />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      <section className="orf-settings-detail" aria-label="设置详情">
        {activeNavigation === "visual" ? (
          <>
            <div className="orf-settings-detail-heading">
              <span>Visual Config</span>
              <h1>视觉设置</h1>
              <p>自定义系统的视觉风格，让界面更贴合你的偏好。</p>
            </div>

            <div className="orf-settings-sections">
              {backgroundSections.map((section) => (
                <BackgroundSettingSection key={section.scene} {...section} />
              ))}
            </div>
          </>
        ) : (
          <div className="orf-settings-placeholder">
            <span>Coming Soon</span>
            <h1>{settingsNavigation.find((item) => item.key === activeNavigation)?.label}</h1>
            <p>该设置项暂不展开具体内容。</p>
          </div>
        )}
      </section>
    </div>
  );
}

function BackgroundSettingSection({
  scene,
  title,
  description,
}: {
  scene: VisualBackgroundScene;
  title: string;
  description: string;
}) {
  const { notify } = useOrf();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [backgroundList, setBackgroundList] = useState<VisualBackgroundImage[]>([]);
  const [defaultBackgroundId, setDefaultBackgroundId] = useState<string | null>(null);
  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null);
  const [listQueryStatus, setListQueryStatus] = useState<RequestStatus>("idle");
  const [listQueryErrorMessage, setListQueryErrorMessage] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<RequestStatus>("idle");
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [setDefaultStatus, setSetDefaultStatus] = useState<RequestStatus>("idle");
  const [setDefaultErrorMessage, setSetDefaultErrorMessage] = useState<string | null>(null);

  const isSetDefaultButtonDisabled = !selectedBackgroundId || selectedBackgroundId === defaultBackgroundId || setDefaultStatus === "loading";
  const isUploading = uploadStatus === "loading";

  useEffect(() => {
    let cancelled = false;

    setListQueryStatus("loading");
    setListQueryErrorMessage(null);

    void getVisualBackgrounds(scene)
      .then((data) => {
        if (cancelled) {
          return;
        }

        setBackgroundList(data.list);
        setDefaultBackgroundId(data.defaultBackgroundId);
        setSelectedBackgroundId((current) => (current && data.list.some((background) => background.id === current) ? current : null));
        setListQueryStatus("success");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setListQueryStatus("error");
        setListQueryErrorMessage(error instanceof Error ? error.message : "背景列表加载失败");
      });

    return () => {
      cancelled = true;
    };
  }, [scene]);

  const handleFileSelected = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";

    if (!file || isUploading) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      const message = "仅支持上传图片文件";
      setUploadStatus("error");
      setUploadErrorMessage(message);
      notify(message);
      return;
    }

    setUploadStatus("loading");
    setUploadErrorMessage(null);
    try {
      const uploaded = await uploadVisualBackground(scene, file);
      setBackgroundList((current) => [...current, uploaded]);
      setSelectedBackgroundId(uploaded.id);
      setUploadStatus("success");
      notify("背景图片已上传");
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败";
      setUploadStatus("error");
      setUploadErrorMessage(message);
      notify(message);
    }
  };

  const handleSetDefault = async () => {
    if (!selectedBackgroundId || isSetDefaultButtonDisabled) {
      return;
    }

    setSetDefaultStatus("loading");
    setSetDefaultErrorMessage(null);
    try {
      const result = await requestSetDefaultVisualBackground(selectedBackgroundId);
      setDefaultBackgroundId(result.id);
      setBackgroundList((current) => current.map((background) => ({ ...background, isDefault: background.id === result.id })));
      setSetDefaultStatus("success");
      notify("默认背景已更新");
    } catch (error) {
      const message = error instanceof Error ? error.message : "设置默认失败";
      setSetDefaultStatus("error");
      setSetDefaultErrorMessage(message);
      notify(message);
    }
  };

  return (
    <section className="orf-settings-background-section">
      <div className="orf-settings-section-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => void handleFileSelected(event)} />
        <button type="button" className="orf-settings-upload-button" disabled={isUploading} onClick={() => fileInputRef.current?.click()}>
          {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {isUploading ? "上传中" : "上传图片"}
        </button>
      </div>

      <div className="orf-settings-background-body">
        <div className="orf-settings-background-label">
          <Image className="h-5 w-5" />
          <span>背景预览</span>
        </div>

        <div className="orf-settings-background-gallery" data-loading={listQueryStatus === "loading" ? "true" : "false"}>
          {listQueryStatus === "loading" && <div className="orf-settings-background-state">加载中...</div>}
          {listQueryStatus === "error" && <div className="orf-settings-background-state">{listQueryErrorMessage ?? "背景列表加载失败"}</div>}
          {listQueryStatus === "success" && backgroundList.length === 0 && <div className="orf-settings-background-state">暂无背景图片，请先上传。</div>}
          {listQueryStatus === "success" &&
            backgroundList.map((background) => {
              const selected = selectedBackgroundId === background.id;
              const isDefault = defaultBackgroundId === background.id;
              return (
                <button
                  key={background.id}
                  type="button"
                  className={clsx("orf-settings-background-card", selected && "orf-settings-background-card-selected")}
                  onClick={() => setSelectedBackgroundId(background.id)}
                >
                  <img src={background.url} alt={background.fileName} draggable={false} />
                  {isDefault && (
                    <span className="orf-settings-background-default">
                      <Check className="h-3.5 w-3.5" />
                      默认
                    </span>
                  )}
                </button>
              );
            })}
        </div>

        <div className="orf-settings-background-actions">
          <div className="orf-settings-selected-text">
            {(uploadErrorMessage || setDefaultErrorMessage) && (
              <span>{uploadErrorMessage ?? setDefaultErrorMessage}</span>
            )}
          </div>
          <button type="button" className="orf-settings-default-button" disabled={isSetDefaultButtonDisabled} onClick={() => void handleSetDefault()}>
            {setDefaultStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            设为默认
          </button>
        </div>
      </div>
    </section>
  );
}
