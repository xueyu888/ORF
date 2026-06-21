import { clsx } from "clsx";
import {
  Check,
  Image,
  ImagePlus,
  Loader2,
  Monitor,
  Move,
  RotateCcw,
  Save,
  SlidersHorizontal,
  Trash2,
  Upload,
} from "lucide-react";
import { type ChangeEvent, type CSSProperties, type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, IconButton } from "../../components/ui";
import { visualSkinPageSlots, visualSkinSlotByScene, visualSkinSlots, type VisualSkinPreviewShape } from "../../config/visualSkinSlots";
import {
  defaultVisualBackgroundConfig,
  defaultVisualBackgroundCrop,
  normalizeVisualBackgroundCrop,
  normalizeVisualBackgroundOverlayOpacity,
  visualBackgroundCropLimits,
  visualBackgroundOverlayLimits,
  type VisualBackgroundConfig,
  type VisualBackgroundCrop,
  type PageVisualBackgroundScene,
  type VisualBackgroundScene,
} from "../../domain/settings/visualBackgrounds";
import { readModelInvalidationKey } from "../realtime/readModelInvalidations";
import {
  deletePersonalBackground,
  getPersonalBackgrounds,
  getVisualBackgrounds,
  saveUserPreferences,
  saveVisualBackgroundConfig,
  uploadPersonalBackground,
  uploadVisualBackground,
  type PersonalBackgroundsData,
  type VisualBackgroundImage,
  type VisualBackgroundsData,
} from "../../state/apiClient";
import { useOrf } from "../../state/OrfProvider";
import { cacheLoginBackgroundPreview, clearCachedLoginBackgroundPreview } from "../../utils/loginBackgroundCache";
import { cropForVisualBackground, dispatchVisualBackgroundChanged } from "../../utils/visualBackgrounds";

type RequestStatus = "idle" | "loading" | "success" | "error";
type SkinScope = "personal" | "system";
type BackgroundData = VisualBackgroundsData | PersonalBackgroundsData;

const initialScene = "login_background" satisfies VisualBackgroundScene;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cropEquals(first: VisualBackgroundCrop, second: VisualBackgroundCrop) {
  return first.centerX === second.centerX && first.centerY === second.centerY && first.zoom === second.zoom;
}

function isPersonalBackground(id: string | null | undefined) {
  return Boolean(id?.includes("/personal/"));
}

function backgroundSourceInfo(id: string) {
  let decodedId = id;
  try {
    decodedId = decodeURIComponent(id);
  } catch {
    decodedId = id;
  }
  const [sceneRaw, scopeRaw] = decodedId.split("/");
  const slotLabel = sceneRaw === "app_background"
    ? "旧版外壳"
    : visualSkinSlots.find((item) => item.scene === sceneRaw)?.label ?? "未知槽位";
  const scopeLabel = scopeRaw === "personal"
    ? "个人图库"
    : scopeRaw === "default"
      ? "内置图库"
      : scopeRaw === "user"
        ? "旧系统图库"
        : "系统图库";
  const scopeBadge = scopeRaw === "personal"
    ? "个人"
    : scopeRaw === "default"
      ? "内置"
      : scopeRaw === "user"
        ? "旧版"
        : "系统";
  return {
    detailLabel: `${scopeLabel} / ${slotLabel}`,
    scopeBadge,
    slotLabel,
  };
}

function cropFromConfig(config: VisualBackgroundConfig, imageId: string | null | undefined) {
  return imageId ? normalizeVisualBackgroundCrop(config.crops[imageId]) : defaultVisualBackgroundCrop;
}

function configWithCrop(config: VisualBackgroundConfig, imageId: string, crop: VisualBackgroundCrop): VisualBackgroundConfig {
  return {
    ...config,
    version: 2,
    fitMode: "cover-crop",
    fixedBackgroundId: imageId,
    crops: {
      ...config.crops,
      [imageId]: normalizeVisualBackgroundCrop(crop),
    },
  };
}

function configWithOverlayOpacity(config: VisualBackgroundConfig, overlayOpacity: number): VisualBackgroundConfig {
  return {
    ...config,
    overlayOpacity: normalizeVisualBackgroundOverlayOpacity(overlayOpacity),
  };
}

function pageApplyMode(scene: VisualBackgroundScene, scenes: readonly PageVisualBackgroundScene[]) {
  if (scenes.length === visualSkinPageSlots.length) return "all";
  if (scenes.length === 1 && scenes[0] === scene) return "current";
  return "custom";
}

function sameSceneSet(first: readonly VisualBackgroundScene[], second: readonly VisualBackgroundScene[]) {
  if (first.length !== second.length) return false;
  const secondSet = new Set(second);
  return first.every((scene) => secondSet.has(scene));
}

function pageApplyTargets(scene: VisualBackgroundScene, scenes: readonly PageVisualBackgroundScene[]) {
  const selected = scenes.length > 0 ? scenes : [scene as PageVisualBackgroundScene];
  return Array.from(new Set(selected));
}

export function VisualSkinWorkbench({ scope }: { scope: SkinScope }) {
  const { currentUser, notify, readModelInvalidations } = useOrf();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const settingsInvalidationKey = readModelInvalidationKey(readModelInvalidations, "settings");
  const [scene, setScene] = useState<VisualBackgroundScene>(initialScene);
  const [data, setData] = useState<BackgroundData | null>(null);
  const [backgroundList, setBackgroundList] = useState<VisualBackgroundImage[]>([]);
  const [draftConfig, setDraftConfig] = useState<VisualBackgroundConfig>(() => defaultVisualBackgroundConfig());
  const [selectedBackgroundId, setSelectedBackgroundId] = useState<string | null>(null);
  const [draftCrop, setDraftCrop] = useState<VisualBackgroundCrop>(defaultVisualBackgroundCrop);
  const [loadStatus, setLoadStatus] = useState<RequestStatus>("idle");
  const [saveStatus, setSaveStatus] = useState<RequestStatus>("idle");
  const [uploadStatus, setUploadStatus] = useState<RequestStatus>("idle");
  const [deleteStatus, setDeleteStatus] = useState<RequestStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [pageTargetScenes, setPageTargetScenes] = useState<PageVisualBackgroundScene[]>([]);

  const slot = visualSkinSlotByScene(scene);
  const selectedBackground = backgroundList.find((background) => background.id === selectedBackgroundId) ?? null;
  const selectedBackgroundSource = selectedBackground ? backgroundSourceInfo(selectedBackground.id) : null;
  const persistedCrop = data ? cropForVisualBackground(data, selectedBackgroundId) : defaultVisualBackgroundCrop;
  const isPageSlot = slot.kind === "page";
  const effectivePageTargetScenes = isPageSlot ? pageApplyTargets(scene, pageTargetScenes) : [];
  const pageTargetsDirty = isPageSlot && !sameSceneSet(effectivePageTargetScenes, [scene]);
  const dirty = Boolean(
    data &&
      selectedBackgroundId &&
      (selectedBackgroundId !== data.config.fixedBackgroundId ||
        draftConfig.mode !== data.config.mode ||
        draftConfig.switchTrigger !== data.config.switchTrigger ||
        draftConfig.switchOrder !== data.config.switchOrder ||
        draftConfig.switchIntervalMinutes !== data.config.switchIntervalMinutes ||
        draftConfig.overlayOpacity !== data.config.overlayOpacity ||
        !cropEquals(draftCrop, persistedCrop)),
  );
  const busy = loadStatus === "loading" || saveStatus === "loading" || uploadStatus === "loading" || deleteStatus === "loading";
  const canSave = Boolean(selectedBackgroundId && (dirty || pageTargetsDirty) && !busy);
  const canDelete = scope === "personal" && isPersonalBackground(selectedBackgroundId) && !busy;

  const groupedSlots = useMemo(() => {
    const groups = new Map<string, typeof visualSkinSlots[number][]>();
    for (const item of visualSkinSlots) {
      groups.set(item.group, [...(groups.get(item.group) ?? []), item]);
    }
    return Array.from(groups.entries());
  }, []);

  const applyLoadedData = useCallback((nextData: BackgroundData) => {
    const nextSelectedId = nextData.config.fixedBackgroundId ?? nextData.list[0]?.id ?? null;
    setData(nextData);
    setBackgroundList(nextData.list);
    setDraftConfig(nextData.config);
    setSelectedBackgroundId(nextSelectedId);
    setDraftCrop(cropFromConfig(nextData.config, nextSelectedId));
  }, []);

  const loadScene = useCallback(async () => {
    setLoadStatus("loading");
    setErrorMessage(null);
    setData(null);
    setBackgroundList([]);
    setSelectedBackgroundId(null);
    setDraftConfig(defaultVisualBackgroundConfig());
    setDraftCrop(defaultVisualBackgroundCrop);
    try {
      const nextData = scope === "system" ? await getVisualBackgrounds(scene) : await getPersonalBackgrounds(scene);
      applyLoadedData(nextData);
      setLoadStatus("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "皮肤设置加载失败";
      setLoadStatus("error");
      setErrorMessage(message);
    }
  }, [applyLoadedData, scene, scope]);

  useEffect(() => {
    void loadScene();
  }, [loadScene, settingsInvalidationKey]);

  useEffect(() => {
    setPageTargetScenes(slot.kind === "page" ? [scene as PageVisualBackgroundScene] : []);
  }, [scene, slot.kind]);

  const selectBackground = (id: string) => {
    setSelectedBackgroundId(id);
    setDraftCrop(cropFromConfig(draftConfig, id));
  };

  const updateCrop = (nextCrop: VisualBackgroundCrop) => {
    const normalized = normalizeVisualBackgroundCrop(nextCrop);
    setDraftCrop(normalized);
    setDraftConfig((current) => selectedBackgroundId ? configWithCrop(current, selectedBackgroundId, normalized) : current);
  };

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || uploadStatus === "loading") return;
    if (!file.type.startsWith("image/")) {
      const message = "仅支持上传图片文件";
      setErrorMessage(message);
      notify(message);
      return;
    }

    setUploadStatus("loading");
    setErrorMessage(null);
    try {
      const uploaded = scope === "system" ? await uploadVisualBackground(scene, file) : await uploadPersonalBackground(scene, file);
      setBackgroundList((current) => [...current, uploaded]);
      setSelectedBackgroundId(uploaded.id);
      setDraftCrop(defaultVisualBackgroundCrop);
      setDraftConfig((current) => configWithCrop(current, uploaded.id, defaultVisualBackgroundCrop));
      setUploadStatus("success");
      notify("图片已上传");
    } catch (error) {
      const message = error instanceof Error ? error.message : "上传失败";
      setUploadStatus("error");
      setErrorMessage(message);
      notify(message);
    }
  };

  const handleSave = async () => {
    if (!selectedBackgroundId || !selectedBackground || !canSave) return;
    const nextConfig = configWithCrop(
      {
        ...draftConfig,
        version: 2,
        fitMode: "cover-crop",
        switchIntervalMinutes: clamp(draftConfig.switchIntervalMinutes, 1, 1440),
      },
      selectedBackgroundId,
      draftCrop,
    );

    setSaveStatus("loading");
    setErrorMessage(null);
    try {
      if (scope === "system") {
        const targets = slot.kind === "page" ? effectivePageTargetScenes : [scene];
        let savedCurrentConfig: VisualBackgroundConfig | null = null;
        for (const targetScene of targets) {
          const result = await saveVisualBackgroundConfig(targetScene, nextConfig);
          if (targetScene === scene) {
            savedCurrentConfig = result.config;
          }
        }
        setDraftConfig(savedCurrentConfig ?? nextConfig);
      } else {
        const targets = slot.kind === "page" ? effectivePageTargetScenes : [scene];
        const backgrounds: Partial<Record<VisualBackgroundScene, VisualBackgroundConfig | null>> = Object.fromEntries(
          targets.map((targetScene) => [targetScene, nextConfig]),
        );
        await saveUserPreferences({ backgrounds });
        if (scene === "login_background" && currentUser) {
          await cacheLoginBackgroundPreview({
            userId: currentUser.id,
            imageUrl: selectedBackground.url,
            crop: draftCrop,
          }).catch(() => undefined);
        }
      }
      const changedScenes = slot.kind === "page" ? effectivePageTargetScenes : [scene];
      for (const changedScene of changedScenes) {
        dispatchVisualBackgroundChanged(changedScene);
      }
      await loadScene();
      if (slot.kind === "page") {
        setPageTargetScenes([scene as PageVisualBackgroundScene]);
      }
      setSaveStatus("success");
      notify(changedScenes.length > 1 ? `已保存到 ${changedScenes.length} 个页面` : "皮肤已保存");
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      setSaveStatus("error");
      setErrorMessage(message);
      notify(message);
    }
  };

  const handleUseSystemDefault = async () => {
    if (scope !== "personal" || busy) return;
    setSaveStatus("loading");
    setErrorMessage(null);
    try {
      const backgrounds: Partial<Record<VisualBackgroundScene, VisualBackgroundConfig | null>> = { [scene]: null };
      await saveUserPreferences({ backgrounds });
      if (scene === "login_background") {
        clearCachedLoginBackgroundPreview(currentUser?.id);
      }
      dispatchVisualBackgroundChanged(scene);
      await loadScene();
      setSaveStatus("success");
      notify("已使用系统默认");
    } catch (error) {
      const message = error instanceof Error ? error.message : "保存失败";
      setSaveStatus("error");
      setErrorMessage(message);
      notify(message);
    }
  };

  const handleDelete = async () => {
    if (!selectedBackgroundId || !canDelete) return;
    setDeleteStatus("loading");
    setErrorMessage(null);
    try {
      await deletePersonalBackground(selectedBackgroundId);
      if (scene === "login_background") {
        clearCachedLoginBackgroundPreview(currentUser?.id);
      }
      dispatchVisualBackgroundChanged(scene);
      await loadScene();
      setDeleteStatus("success");
      notify("个人图片已删除");
    } catch (error) {
      const message = error instanceof Error ? error.message : "删除失败";
      setDeleteStatus("error");
      setErrorMessage(message);
      notify(message);
    }
  };

  const setMode = (mode: VisualBackgroundConfig["mode"]) => {
    setDraftConfig((current) => ({ ...current, mode }));
  };

  const setSwitchTrigger = (switchTrigger: VisualBackgroundConfig["switchTrigger"]) => {
    setDraftConfig((current) => ({ ...current, switchTrigger }));
  };

  const setSwitchOrder = (switchOrder: VisualBackgroundConfig["switchOrder"]) => {
    setDraftConfig((current) => ({ ...current, switchOrder }));
  };

  const setSwitchInterval = (value: number) => {
    setDraftConfig((current) => ({ ...current, switchIntervalMinutes: clamp(value, 1, 1440) }));
  };

  const setOverlayOpacity = (value: number) => {
    setDraftConfig((current) => configWithOverlayOpacity(current, value));
  };

  return (
    <section className="orf-skin-workbench" data-scope={scope}>
      <aside className="orf-skin-slot-rail" aria-label="皮肤槽位">
        {groupedSlots.map(([group, items]) => (
          <div className="orf-skin-slot-group" key={group}>
            <div className="orf-skin-slot-group-label">{group}</div>
            <div className="orf-skin-slot-list">
              {items.map((item) => {
                const selected = item.scene === scene;
                return (
                  <button
                    key={item.scene}
                    type="button"
                    className={clsx("orf-skin-slot-button", selected && "orf-skin-slot-button-active")}
                    aria-pressed={selected}
                    onClick={() => setScene(item.scene)}
                  >
                    <span>{item.label}</span>
                    {selected && <Check className="h-3.5 w-3.5" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </aside>

      <div className="orf-skin-editor">
        <header className="orf-skin-editor-header">
          <div className="orf-skin-editor-title">
            <span className="orf-skin-editor-kicker">{scope === "system" ? "系统默认" : "我的皮肤"}</span>
            <h2>{slot.label}</h2>
          </div>
          <div className="orf-skin-editor-actions">
            <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={(event) => void handleUpload(event)} />
            {scope === "personal" && (
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => void handleUseSystemDefault()}>
                <RotateCcw className="h-4 w-4" />
                系统默认
              </Button>
            )}
            <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={() => fileInputRef.current?.click()}>
              {uploadStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              上传
            </Button>
            <Button type="button" size="sm" disabled={!canSave} onClick={() => void handleSave()}>
              {saveStatus === "loading" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存
            </Button>
          </div>
        </header>

        <div className="orf-skin-stage-row">
          <VisualSkinPreview
            crop={draftCrop}
            image={selectedBackground}
            overlayOpacity={draftConfig.overlayOpacity}
            previewShape={slot.previewShape}
            onCropChange={updateCrop}
          />

          <div className="orf-skin-inspector">
            {isPageSlot && (
              <div className="orf-skin-inspector-section">
                <div className="orf-skin-inspector-title">
                  <Check className="h-4 w-4" />
                  <span>应用页面</span>
                </div>
                <SegmentedControl
                  value={pageApplyMode(scene, effectivePageTargetScenes)}
                  options={[
                    { label: "当前", value: "current" },
                    { label: "全部", value: "all" },
                    { label: "自选", value: "custom" },
                  ]}
                  onChange={(value) => {
                    if (value === "all") {
                      setPageTargetScenes(visualSkinPageSlots.map((item) => item.scene as PageVisualBackgroundScene));
                      return;
                    }
                    if (value === "current") {
                      setPageTargetScenes([scene as PageVisualBackgroundScene]);
                      return;
                    }
                    setPageTargetScenes(effectivePageTargetScenes);
                  }}
                />
                <div className="orf-skin-page-targets">
                  {visualSkinPageSlots.map((item) => {
                    const targetScene = item.scene as PageVisualBackgroundScene;
                    const selected = effectivePageTargetScenes.includes(targetScene);
                    return (
                      <button
                        key={item.scene}
                        type="button"
                        className={clsx("orf-skin-page-target", selected && "orf-skin-page-target-active")}
                        aria-pressed={selected}
                        onClick={() => {
                          setPageTargetScenes((current) => {
                            const currentSet = new Set(pageApplyTargets(scene, current));
                            if (currentSet.has(targetScene)) {
                              currentSet.delete(targetScene);
                            } else {
                              currentSet.add(targetScene);
                            }
                            currentSet.add(scene as PageVisualBackgroundScene);
                            return Array.from(currentSet);
                          });
                        }}
                      >
                        <span>{item.label}</span>
                        {selected && <Check className="h-3.5 w-3.5" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="orf-skin-inspector-section">
              <div className="orf-skin-inspector-title">
                <Move className="h-4 w-4" />
                <span>位置</span>
              </div>
              <SkinSlider
                label="横向焦点"
                max={visualBackgroundCropLimits.centerMax}
                min={visualBackgroundCropLimits.centerMin}
                step={0.01}
                value={draftCrop.centerX}
                format={(value) => `${Math.round(value * 100)}%`}
                onChange={(value) => updateCrop({ ...draftCrop, centerX: value })}
              />
              <SkinSlider
                label="纵向焦点"
                max={visualBackgroundCropLimits.centerMax}
                min={visualBackgroundCropLimits.centerMin}
                step={0.01}
                value={draftCrop.centerY}
                format={(value) => `${Math.round(value * 100)}%`}
                onChange={(value) => updateCrop({ ...draftCrop, centerY: value })}
              />
              <SkinSlider
                label="放大"
                max={visualBackgroundCropLimits.zoomMax}
                min={visualBackgroundCropLimits.zoomMin}
                step={0.01}
                value={draftCrop.zoom}
                format={(value) => `${Math.round(value * 100)}%`}
                onChange={(value) => updateCrop({ ...draftCrop, zoom: value })}
              />
              <div className="orf-skin-mini-actions">
                <Button type="button" variant="ghost" size="sm" disabled={busy || !selectedBackgroundId} onClick={() => updateCrop(defaultVisualBackgroundCrop)}>
                  <RotateCcw className="h-4 w-4" />
                  重置
                </Button>
                {scope === "personal" && (
                  <IconButton
                    icon={Trash2}
                    label="删除当前个人图片"
                    size="sm"
                    variant="danger"
                    disabled={!canDelete}
                    onClick={() => void handleDelete()}
                  />
                )}
              </div>
            </div>

            <div className="orf-skin-inspector-section">
              <div className="orf-skin-inspector-title">
                <SlidersHorizontal className="h-4 w-4" />
                <span>蒙层</span>
              </div>
              <SkinSlider
                label="强度"
                max={visualBackgroundOverlayLimits.opacityMax}
                min={visualBackgroundOverlayLimits.opacityMin}
                step={0.01}
                value={draftConfig.overlayOpacity}
                format={(value) => `${Math.round(value * 100)}%`}
                onChange={setOverlayOpacity}
              />
            </div>

            <div className="orf-skin-inspector-section">
              <div className="orf-skin-inspector-title">
                <SlidersHorizontal className="h-4 w-4" />
                <span>切换</span>
              </div>
              <SegmentedControl
                value={draftConfig.mode}
                options={[
                  { label: "固定", value: "fixed" },
                  { label: "轮换", value: "switchable" },
                ]}
                onChange={(value) => setMode(value as VisualBackgroundConfig["mode"])}
              />
              <SegmentedControl
                disabled={draftConfig.mode === "fixed"}
                value={draftConfig.switchTrigger}
                options={[
                  { label: "打开", value: "on_open" },
                  { label: "定时", value: "interval" },
                ]}
                onChange={(value) => setSwitchTrigger(value as VisualBackgroundConfig["switchTrigger"])}
              />
              <SegmentedControl
                disabled={draftConfig.mode === "fixed"}
                value={draftConfig.switchOrder}
                options={[
                  { label: "顺序", value: "sequential" },
                  { label: "随机", value: "random" },
                ]}
                onChange={(value) => setSwitchOrder(value as VisualBackgroundConfig["switchOrder"])}
              />
              <SkinSlider
                disabled={draftConfig.mode === "fixed" || draftConfig.switchTrigger !== "interval"}
                label="分钟"
                max={1440}
                min={1}
                step={1}
                value={draftConfig.switchIntervalMinutes}
                onChange={setSwitchInterval}
              />
            </div>
          </div>
        </div>

        <div className="orf-skin-gallery-shell">
          <div className="orf-skin-gallery-heading">
            <div className="orf-skin-inspector-title">
              <Image className="h-4 w-4" />
              <span>图库</span>
            </div>
            {selectedBackground && (
              <span
                className="orf-skin-selected-file"
                title={`应用到：${slot.label}；来源：${selectedBackgroundSource?.detailLabel ?? "未知图库"}；${selectedBackground.fileName}`}
              >
                <span>应用到：{slot.label}</span>
                <span>来源：{selectedBackgroundSource?.detailLabel ?? "未知图库"}</span>
                <span className="orf-skin-selected-file-name">{selectedBackground.fileName}</span>
              </span>
            )}
          </div>
          <div className="orf-skin-gallery" data-loading={loadStatus === "loading" ? "true" : "false"}>
            {loadStatus === "loading" && backgroundList.length === 0 && <div className="orf-skin-state"><Loader2 className="h-5 w-5 animate-spin" />加载中</div>}
            {loadStatus === "error" && <div className="orf-skin-state">{errorMessage ?? "加载失败"}</div>}
            {loadStatus === "success" && backgroundList.length === 0 && (
              <button type="button" className="orf-skin-empty-upload" onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="h-5 w-5" />
                上传第一张图片
              </button>
            )}
            {backgroundList.map((background) => {
              const selected = selectedBackgroundId === background.id;
              const current = data?.config.fixedBackgroundId === background.id;
              const source = backgroundSourceInfo(background.id);
              return (
                <button
                  key={background.id}
                  type="button"
                  className={clsx("orf-skin-gallery-card", selected && "orf-skin-gallery-card-selected")}
                  aria-label={`${background.fileName}，来源：${source.detailLabel}`}
                  title={`${background.fileName} / 来源：${source.detailLabel}`}
                  onClick={() => selectBackground(background.id)}
                >
                  <img src={background.url} alt={background.fileName} draggable={false} />
                  <span className="orf-skin-gallery-card-badges">
                    {current && <span>当前</span>}
                    <span>{source.scopeBadge}</span>
                    <span>{source.slotLabel}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {errorMessage && loadStatus !== "error" && <div className="orf-skin-inline-error">{errorMessage}</div>}
        </div>
      </div>
    </section>
  );
}

function VisualSkinPreview({
  crop,
  image,
  onCropChange,
  overlayOpacity,
  previewShape,
}: {
  crop: VisualBackgroundCrop;
  image: VisualBackgroundImage | null;
  onCropChange: (crop: VisualBackgroundCrop) => void;
  overlayOpacity: number;
  previewShape: VisualSkinPreviewShape;
}) {
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const frameRatio = useRuntimePreviewFrameRatio(previewShape);
  const surfaceSize = useElementSize(surfaceRef);
  const [sourceImageSize, setSourceImageSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    setSourceImageSize(null);
    if (!image?.url || typeof window === "undefined") return;

    let cancelled = false;
    const probe = new window.Image();
    probe.onload = () => {
      if (!cancelled && probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setSourceImageSize({ width: probe.naturalWidth, height: probe.naturalHeight });
      }
    };
    probe.src = image.url;

    return () => {
      cancelled = true;
    };
  }, [image?.url]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!image) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    const frame = frameRef.current;
    if (!drag || !frame || drag.pointerId !== event.pointerId) return;
    const rect = frame.getBoundingClientRect();
    const deltaX = (event.clientX - drag.x) / Math.max(1, rect.width);
    const deltaY = (event.clientY - drag.y) / Math.max(1, rect.height);
    dragRef.current = { ...drag, x: event.clientX, y: event.clientY };
    onCropChange({
      ...crop,
      centerX: clamp(crop.centerX - deltaX / Math.max(1, crop.zoom), visualBackgroundCropLimits.centerMin, visualBackgroundCropLimits.centerMax),
      centerY: clamp(crop.centerY - deltaY / Math.max(1, crop.zoom), visualBackgroundCropLimits.centerMin, visualBackgroundCropLimits.centerMax),
    });
  };

  const handleWheel = useCallback((event: globalThis.WheelEvent) => {
    if (!image) return;
    event.preventDefault();
    const nextZoom = clamp(
      crop.zoom * Math.exp(-event.deltaY * 0.0015),
      visualBackgroundCropLimits.zoomMin,
      visualBackgroundCropLimits.zoomMax,
    );
    if (Math.abs(nextZoom - crop.zoom) < 0.001) return;
    onCropChange({
      ...crop,
      zoom: Number(nextZoom.toFixed(4)),
    });
  }, [crop, image, onCropChange]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    surface.addEventListener("wheel", handleWheel, { passive: false });
    return () => surface.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const stopDrag = (event: PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
    }
  };

  const previewFrameBox = visualSkinPreviewFrameBox(previewShape, frameRatio, surfaceSize);
  const previewFrameStyle = {
    ...previewFrameBox.style,
    "--orf-skin-preview-overlay-opacity": overlayOpacity,
  } as CSSProperties;
  const imageLayerStyle = sourceImageSize
    ? visualSkinPreviewImageLayerStyle(crop, sourceImageSize.width / Math.max(1, sourceImageSize.height), previewFrameBox.box, surfaceSize)
    : ({ opacity: 0 } as CSSProperties);

  return (
    <div className="orf-skin-preview-shell">
      <div className="orf-skin-preview-toolbar">
        <span><Monitor className="h-4 w-4" />预览</span>
      </div>
      <div
        ref={surfaceRef}
        className={clsx("orf-skin-preview", `orf-skin-preview-${previewShape}`)}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={stopDrag}
        onPointerCancel={stopDrag}
      >
        {image && (
          <img
            className="orf-skin-preview-canvas-image"
            src={image.url}
            alt=""
            style={imageLayerStyle}
            aria-hidden="true"
            draggable={false}
            onLoad={(event) => {
              const { naturalWidth, naturalHeight } = event.currentTarget;
              if (naturalWidth > 0 && naturalHeight > 0) {
                setSourceImageSize({ width: naturalWidth, height: naturalHeight });
              }
            }}
          />
        )}
        {!image && <div className="orf-skin-preview-empty">暂无图片</div>}
        <div
          ref={frameRef}
          className={clsx("orf-skin-preview-frame", `orf-skin-preview-frame-${previewShape}`)}
          data-preview-ratio={frameRatio.toFixed(6)}
          style={previewFrameStyle}
          aria-hidden="true"
        >
          <span className="orf-skin-preview-frame-overlay" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

type ElementSize = {
  width: number;
  height: number;
};

type PreviewFitLimits = {
  allowHorizontalOverflow?: boolean;
  heightFraction: number;
  maxHeight: number;
  maxWidth: number;
  minHeight?: number;
  widthFraction: number;
};

type PreviewFrameBox = {
  box: ElementSize | null;
  style: CSSProperties;
};

function useElementSize(ref: { current: HTMLElement | null }) {
  const [size, setSize] = useState<ElementSize | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      const nextSize = { width: rect.width, height: rect.height };
      setSize((current) => (
        current && Math.abs(current.width - nextSize.width) < 0.5 && Math.abs(current.height - nextSize.height) < 0.5
          ? current
          : nextSize
      ));
    };

    updateSize();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateSize);
      return () => window.removeEventListener("resize", updateSize);
    }

    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    window.addEventListener("resize", updateSize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateSize);
    };
  }, [ref]);

  return size;
}

function visualSkinPreviewImageLayerStyle(
  crop: VisualBackgroundCrop,
  sourceRatio: number,
  frameBox: ElementSize | null,
  surfaceSize: ElementSize | null,
) {
  if (!frameBox || !surfaceSize) {
    return { opacity: 0 } as CSSProperties;
  }

  const baseImageBox = coverImageBox(sourceRatio, frameBox);
  const zoom = Math.max(visualBackgroundCropLimits.zoomMin, crop.zoom);
  const frameLeft = (surfaceSize.width - frameBox.width) / 2;
  const frameTop = (surfaceSize.height - frameBox.height) / 2;
  const baseImageLeftInFrame = (frameBox.width - baseImageBox.width) * crop.centerX;
  const baseImageTopInFrame = (frameBox.height - baseImageBox.height) * crop.centerY;
  const imageLeft = frameLeft + frameBox.width / 2 + zoom * (baseImageLeftInFrame - frameBox.width / 2);
  const imageTop = frameTop + frameBox.height / 2 + zoom * (baseImageTopInFrame - frameBox.height / 2);

  return {
    height: baseImageBox.height * zoom,
    transform: `translate3d(${imageLeft}px, ${imageTop}px, 0)`,
    width: baseImageBox.width * zoom,
  } as CSSProperties;
}

function visualSkinPreviewFrameBox(previewShape: VisualSkinPreviewShape, frameRatio: number, surfaceSize: ElementSize | null): PreviewFrameBox {
  const style = {
    "--orf-skin-preview-frame-ratio": `${frameRatio} / 1`,
  } as CSSProperties;

  if (!surfaceSize) return { box: null, style };

  const box = fitPreviewRect(frameRatio, surfaceSize, previewFrameFitLimits[previewShape]);
  return {
    box,
    style: {
      ...style,
      ...box,
    } as CSSProperties,
  };
}

const previewFrameFitLimits: Record<VisualSkinPreviewShape, PreviewFitLimits> = {
  login: { widthFraction: 0.78, heightFraction: 0.86, maxWidth: 720, maxHeight: 560 },
  page: { widthFraction: 0.78, heightFraction: 0.86, maxWidth: 720, maxHeight: 560 },
  sidebar: { widthFraction: 0.78, heightFraction: 0.86, maxWidth: 720, maxHeight: 520 },
  topbar: {
    widthFraction: 0.94,
    heightFraction: 0.86,
    maxWidth: 1000,
    maxHeight: 560,
    minHeight: 86,
    allowHorizontalOverflow: true,
  },
};

function fitPreviewRect(ratio: number, surfaceSize: ElementSize, limits: PreviewFitLimits) {
  const maxWidth = Math.min(surfaceSize.width * limits.widthFraction, limits.maxWidth);
  const maxHeight = Math.min(surfaceSize.height * limits.heightFraction, limits.maxHeight);
  const normalizedRatio = Math.max(0.01, ratio);
  const fitByHeight = maxWidth / Math.max(1, maxHeight) > normalizedRatio;
  const fitted = {
    width: fitByHeight ? maxHeight * normalizedRatio : maxWidth,
    height: fitByHeight ? maxHeight : maxWidth / normalizedRatio,
  };

  if (!limits.minHeight || fitted.height >= limits.minHeight) {
    return fitted;
  }

  const minHeight = Math.min(limits.minHeight, maxHeight);
  const minHeightWidth = minHeight * normalizedRatio;
  if (limits.allowHorizontalOverflow || minHeightWidth <= maxWidth) {
    return {
      width: minHeightWidth,
      height: minHeight,
    };
  }

  return fitted;
}

function coverImageBox(sourceRatio: number, frameBox: ElementSize) {
  const normalizedRatio = Math.max(0.01, sourceRatio);
  const frameRatio = frameBox.width / Math.max(1, frameBox.height);
  const fitByWidth = normalizedRatio < frameRatio;

  return {
    width: fitByWidth ? frameBox.width : frameBox.height * normalizedRatio,
    height: fitByWidth ? frameBox.width / normalizedRatio : frameBox.height,
  };
}

const fallbackPreviewFrameRatios: Record<VisualSkinPreviewShape, number> = {
  login: 16 / 9,
  page: 16 / 9,
  sidebar: 260 / 900,
  topbar: (1600 - 260) / 60,
};

function useRuntimePreviewFrameRatio(previewShape: VisualSkinPreviewShape) {
  const [ratio, setRatio] = useState(() => fallbackPreviewFrameRatios[previewShape]);

  useEffect(() => {
    let animationFrameId: number | null = null;
    const observedElements = new Set<Element>();
    const observedSelectors = [
      ".orf-main-content-skin-frame",
      ".orf-sidebar-background-frame",
      ".orf-sidebar",
      ".orf-topbar-skin-frame",
      ".orf-topbar",
    ] as const;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => scheduleMeasure());

    const measure = () => {
      setRatio(measureRuntimePreviewFrameRatio(previewShape));
    };
    const scheduleMeasure = () => {
      if (animationFrameId !== null) return;
      animationFrameId = window.requestAnimationFrame(() => {
        animationFrameId = null;
        measure();
      });
    };
    const observe = (selector: string) => {
      const element = document.querySelector(selector);
      if (element && observer && !observedElements.has(element)) {
        observer.observe(element);
        observedElements.add(element);
      }
    };
    const observeRuntimeFrames = () => {
      for (const selector of observedSelectors) {
        observe(selector);
      }
    };
    const mutationObserver = typeof MutationObserver === "undefined"
      ? null
      : new MutationObserver(() => {
          observeRuntimeFrames();
          scheduleMeasure();
        });

    measure();
    observeRuntimeFrames();
    mutationObserver?.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", scheduleMeasure);

    return () => {
      if (animationFrameId !== null) {
        window.cancelAnimationFrame(animationFrameId);
      }
      observer?.disconnect();
      mutationObserver?.disconnect();
      window.removeEventListener("resize", scheduleMeasure);
    };
  }, [previewShape]);

  return ratio;
}

function measureRuntimePreviewFrameRatio(previewShape: VisualSkinPreviewShape) {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return fallbackPreviewFrameRatios[previewShape];
  }

  if (previewShape === "login") {
    return clampAspectRatio(window.innerWidth / Math.max(1, window.innerHeight), fallbackPreviewFrameRatios.login);
  }

  if (previewShape === "topbar") {
    return clampAspectRatio(readElementAspectRatio(".orf-topbar-skin-frame") ?? readElementAspectRatio(".orf-topbar"), fallbackPreviewFrameRatios.topbar);
  }

  if (previewShape === "sidebar") {
    return clampAspectRatio(
      readElementAspectRatio(".orf-sidebar-background-frame") ?? readElementAspectRatio(".orf-sidebar"),
      fallbackPreviewFrameRatios.sidebar,
    );
  }

  const sidebarWidth = readVisibleElementRect(".orf-sidebar-background-frame")?.width ?? readVisibleElementRect(".orf-sidebar")?.width ?? 0;
  const topbarHeight = readVisibleElementRect(".orf-topbar-skin-frame")?.height ?? readVisibleElementRect(".orf-topbar")?.height ?? readCssPixelVariable("--orf-topbar-height", 60);
  const bodyWidth = Math.max(1, window.innerWidth - sidebarWidth);
  const visiblePageHeight = Math.max(1, window.innerHeight - topbarHeight);
  return clampAspectRatio(bodyWidth / visiblePageHeight, fallbackPreviewFrameRatios.page);
}

function readElementAspectRatio(selector: string) {
  const rect = readVisibleElementRect(selector);
  return rect ? rect.width / rect.height : null;
}

function readVisibleElementRect(selector: string) {
  const element = document.querySelector(selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return rect;
}

function readCssPixelVariable(name: string, fallback: number) {
  const parsed = Number.parseFloat(window.getComputedStyle(document.documentElement).getPropertyValue(name));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function clampAspectRatio(value: number | null | undefined, fallback: number) {
  if (!value || !Number.isFinite(value)) return fallback;
  return clamp(value, 0.18, 36);
}

function SkinSlider({
  disabled,
  label,
  max,
  min,
  onChange,
  step = 1,
  value,
  format,
}: {
  disabled?: boolean;
  format?: (value: number) => string;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step?: number;
  value: number;
}) {
  return (
    <label className="orf-skin-slider">
      <span>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
      <output>{format ? format(value) : step < 1 ? value.toFixed(2) : Math.round(value)}</output>
    </label>
  );
}

function SegmentedControl({
  disabled,
  onChange,
  options,
  value,
}: {
  disabled?: boolean;
  onChange: (value: string) => void;
  options: Array<{ label: string; value: string }>;
  value: string;
}) {
  return (
    <div className="orf-skin-segmented" aria-disabled={disabled ? "true" : "false"}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          className={clsx(option.value === value && "orf-skin-segmented-active")}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
