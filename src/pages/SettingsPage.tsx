import { clsx } from "clsx";
import { Check, Image, Loader2, MousePointerClick, Shuffle, Timer, ToggleLeft, Upload } from "lucide-react";
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import {
  getVisualBackgrounds,
  saveVisualBackgroundConfig as requestSaveVisualBackgroundConfig,
  setDefaultVisualBackground as requestSetDefaultVisualBackground,
  uploadVisualBackground,
  type VisualBackgroundConfig,
  type VisualBackgroundImage,
  type VisualBackgroundMode,
  type VisualBackgroundScene,
  type VisualBackgroundSwitchOrder,
  type VisualBackgroundSwitchTrigger,
} from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import { dispatchVisualBackgroundChanged } from "../utils/visualBackgrounds";

type RequestStatus = "idle" | "loading" | "success" | "error";

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
    scene: "app_background",
    title: "应用背景设置",
    description: "自定义登录后的系统应用背景。",
  },
];

const defaultVisualBackgroundConfig: VisualBackgroundConfig = {
  mode: "fixed",
  fixedBackgroundId: null,
  switchTrigger: "on_open",
  switchOrder: "random",
  switchIntervalMinutes: 10,
};

export function SystemSettingsPage() {
  return (
    <div className="orf-settings-page orf-settings-page-single">
      <section className="orf-settings-detail" aria-label="设置详情">
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
  const [backgroundConfig, setBackgroundConfig] = useState<VisualBackgroundConfig>(defaultVisualBackgroundConfig);
  const [intervalInputValue, setIntervalInputValue] = useState(String(defaultVisualBackgroundConfig.switchIntervalMinutes));
  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null);
  const [listQueryStatus, setListQueryStatus] = useState<RequestStatus>("idle");
  const [listQueryErrorMessage, setListQueryErrorMessage] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<RequestStatus>("idle");
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null);
  const [configSaveStatus, setConfigSaveStatus] = useState<RequestStatus>("idle");
  const [configErrorMessage, setConfigErrorMessage] = useState<string | null>(null);
  const [setDefaultStatus, setSetDefaultStatus] = useState<RequestStatus>("idle");
  const [setDefaultErrorMessage, setSetDefaultErrorMessage] = useState<string | null>(null);

  const fixedBackgroundId = backgroundConfig.fixedBackgroundId;
  const isConfigSaving = configSaveStatus === "loading";
  const areSwitchSettingsDisabled = backgroundConfig.mode === "fixed" || isConfigSaving;
  const isIntervalSettingDisabled = areSwitchSettingsDisabled || backgroundConfig.switchTrigger === "on_open";
  const isSetDefaultButtonDisabled =
    backgroundConfig.mode !== "fixed" || !selectedBackgroundId || selectedBackgroundId === fixedBackgroundId || setDefaultStatus === "loading" || isConfigSaving;
  const isUploading = uploadStatus === "loading";

  useEffect(() => {
    if (!configErrorMessage) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setConfigErrorMessage(null);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [configErrorMessage]);

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
        setBackgroundConfig(data.config);
        setIntervalInputValue(String(data.config.switchIntervalMinutes));
        setSelectedBackgroundId((current) =>
          current && data.list.some((background) => background.id === current) ? current : data.config.fixedBackgroundId,
        );
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
      dispatchVisualBackgroundChanged(scene);
      notify("背景图片已上传");
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败";
      setUploadStatus("error");
      setUploadErrorMessage(message);
      notify(message);
    }
  };

  const persistBackgroundConfig = async (nextConfig: VisualBackgroundConfig) => {
    const previousConfig = backgroundConfig;
    const fixedId = nextConfig.fixedBackgroundId ?? selectedBackgroundId ?? backgroundList[0]?.id ?? null;
    if (!fixedId) {
      const message = "请先上传或选择背景图片";
      setConfigSaveStatus("error");
      setConfigErrorMessage(message);
      notify(message);
      return;
    }

    const configToSave = {
      ...nextConfig,
      fixedBackgroundId: fixedId,
      switchIntervalMinutes: Math.max(1, Math.min(1440, nextConfig.switchIntervalMinutes)),
    };

    setConfigSaveStatus("loading");
    setConfigErrorMessage(null);
    setBackgroundConfig(configToSave);
    try {
      const result = await requestSaveVisualBackgroundConfig(scene, configToSave);
      setBackgroundConfig(result.config);
      setIntervalInputValue(String(result.config.switchIntervalMinutes));
      setBackgroundList((current) => current.map((background) => ({ ...background, isDefault: background.id === result.config.fixedBackgroundId })));
      setConfigSaveStatus("success");
      dispatchVisualBackgroundChanged(scene);
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存设置失败";
      setBackgroundConfig(previousConfig);
      setIntervalInputValue(String(previousConfig.switchIntervalMinutes));
      setConfigSaveStatus("error");
      setConfigErrorMessage(message);
      notify(message);
    }
  };

  const handleModeChange = (mode: VisualBackgroundMode) => {
    if (mode === backgroundConfig.mode || isConfigSaving) {
      return;
    }

    void persistBackgroundConfig({
      ...backgroundConfig,
      mode,
      fixedBackgroundId: backgroundConfig.fixedBackgroundId ?? selectedBackgroundId ?? backgroundList[0]?.id ?? null,
    });
  };

  const handleTriggerChange = (switchTrigger: VisualBackgroundSwitchTrigger) => {
    if (areSwitchSettingsDisabled || switchTrigger === backgroundConfig.switchTrigger) {
      return;
    }

    void persistBackgroundConfig({ ...backgroundConfig, switchTrigger });
  };

  const handleOrderChange = (switchOrder: VisualBackgroundSwitchOrder) => {
    if (areSwitchSettingsDisabled || switchOrder === backgroundConfig.switchOrder) {
      return;
    }

    void persistBackgroundConfig({ ...backgroundConfig, switchOrder });
  };

  const handleIntervalCommit = () => {
    if (isIntervalSettingDisabled) {
      return;
    }

    const parsedValue = Number.parseInt(intervalInputValue, 10);
    if (!Number.isFinite(parsedValue) || parsedValue < 1) {
      const message = "切换间隔至少 1 分钟";
      setConfigSaveStatus("error");
      setConfigErrorMessage(message);
      notify(message);
      setIntervalInputValue(String(backgroundConfig.switchIntervalMinutes));
      return;
    }

    const clampedValue = Math.min(1440, parsedValue);
    setIntervalInputValue(String(clampedValue));
    if (clampedValue === backgroundConfig.switchIntervalMinutes) {
      return;
    }

    void persistBackgroundConfig({ ...backgroundConfig, switchIntervalMinutes: clampedValue });
  };

  const handleIntervalKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.currentTarget.blur();
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
      setBackgroundConfig(result.config);
      setIntervalInputValue(String(result.config.switchIntervalMinutes));
      setBackgroundList((current) => current.map((background) => ({ ...background, isDefault: background.id === result.id })));
      setSetDefaultStatus("success");
      dispatchVisualBackgroundChanged(scene);
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

      <div className="orf-settings-background-controls" aria-label={`${title}切换设置`}>
        <div className="orf-settings-background-label">
          <ToggleLeft className="h-5 w-5" />
          <span>背景模式</span>
        </div>
        <div className="orf-settings-control-field">
          <SegmentedButtonGroup
            disabled={isConfigSaving}
            value={backgroundConfig.mode}
            options={[
              { value: "fixed", label: "固定背景" },
              { value: "switchable", label: "可切换背景" },
            ]}
            onChange={(value) => handleModeChange(value as VisualBackgroundMode)}
          />
        </div>

        <div className="orf-settings-background-label">
          <MousePointerClick className="h-5 w-5" />
          <span>触发方式</span>
        </div>
        <div className="orf-settings-control-field">
          <SegmentedButtonGroup
            disabled={areSwitchSettingsDisabled}
            value={backgroundConfig.switchTrigger}
            options={[
              { value: "on_open", label: "打开时切换" },
              { value: "interval", label: "定时切换" },
            ]}
            onChange={(value) => handleTriggerChange(value as VisualBackgroundSwitchTrigger)}
          />
        </div>

        <div className="orf-settings-background-label">
          <Shuffle className="h-5 w-5" />
          <span>切换规则</span>
        </div>
        <div className="orf-settings-control-field">
          <SegmentedButtonGroup
            disabled={areSwitchSettingsDisabled}
            value={backgroundConfig.switchOrder}
            options={[
              { value: "sequential", label: "顺序切换" },
              { value: "random", label: "随机切换" },
            ]}
            onChange={(value) => handleOrderChange(value as VisualBackgroundSwitchOrder)}
          />
        </div>

        <div className="orf-settings-background-label">
          <Timer className="h-5 w-5" />
          <span>切换间隔</span>
        </div>
        <div className="orf-settings-control-field orf-settings-interval-field">
          <input
            className="orf-settings-number-input"
            type="number"
            min={1}
            max={1440}
            value={intervalInputValue}
            disabled={isIntervalSettingDisabled}
            onChange={(event) => setIntervalInputValue(event.target.value)}
            onBlur={handleIntervalCommit}
            onKeyDown={handleIntervalKeyDown}
          />
          <select className="orf-settings-unit-select" value="minutes" disabled={isIntervalSettingDisabled} onChange={() => undefined}>
            <option value="minutes">分钟</option>
          </select>
          {configErrorMessage && <span className="orf-settings-inline-error">{configErrorMessage}</span>}
        </div>
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
              const isDefault = fixedBackgroundId === background.id;
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
            {(uploadErrorMessage || setDefaultErrorMessage) && <span>{uploadErrorMessage ?? setDefaultErrorMessage}</span>}
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

function SegmentedButtonGroup({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  value: string;
}) {
  return (
    <div className="orf-settings-segmented" aria-disabled={disabled ? "true" : "false"}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={clsx(value === option.value && "orf-settings-segmented-active")}
          disabled={disabled}
          onClick={() => onChange(option.value)}
        >
          <span>{option.label}</span>
          {value === option.value && <Check className="h-4 w-4" />}
        </button>
      ))}
    </div>
  );
}
