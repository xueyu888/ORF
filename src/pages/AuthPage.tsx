import { Check, Eye, EyeOff, LockKeyhole, Mail, Trash2, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import brandLogo from "../assets/brand/orf-logo.png";
import { VisualBackgroundSlot } from "../components/VisualBackgroundSlot";
import { Button, IconButton } from "../components/ui";
import { readCachedAppearanceMode } from "../features/appearance/appearanceMode";
import { VisualMaterialLayer } from "../features/appearance/material/VisualMaterialLayer";
import { useAdaptiveMaterial } from "../features/appearance/material/useAdaptiveMaterial";
import { DesktopWindowControls } from "../features/desktop/DesktopWindowControls";
import { isDesktopShellAvailable } from "../features/desktop/desktopShellRuntime";
import {
  findSavedCredentialAccountByEmail,
  forgetSavedCredentialByEmail,
  initializeSavedCredentialAccounts,
  readSavedCredentialPassword,
  rememberSuccessfulCredential,
  savedCredentialAccountInitial,
  type SavedCredentialAccount,
} from "../features/auth/credentialMemory";
import { readLastWorkbenchLocationHref } from "../features/workbench-navigation";
import { getUserPreferences, getVisualBackgrounds } from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";
import {
  defaultVisualBackgroundCrop,
  defaultVisualMaterialPreferences,
  type VisualBackgroundCrop,
  type VisualMaterialPreferences,
} from "../domain/settings/visualBackgrounds";
import { readCachedLoginBackgroundPreview } from "../utils/loginBackgroundCache";
import { subscribeVisualBackgroundChanged } from "../features/appearance/background/visualBackgroundRuntime";
import { pickVisualBackground, visualBackgroundIntervalMs } from "../utils/visualBackgrounds";

type AuthMode = "login" | "register";

type AuthHeroOption = {
  crop: VisualBackgroundCrop;
  id: string;
  label: string;
  material: VisualMaterialPreferences;
  src: string;
};

const defaultAuthHeroFile = "orf-login-sky-adventure.png";
const authHeroModules = import.meta.glob("../assets/auth/*.{png,jpg,jpeg,webp,avif}", {
  eager: true,
  import: "default",
}) as Record<string, string>;

const authHeroOptions: AuthHeroOption[] = Object.entries(authHeroModules)
  .map(([path, src]) => {
    const label = path.split("/").at(-1) ?? path;
    return { id: path, label, crop: defaultVisualBackgroundCrop, material: defaultVisualMaterialPreferences, src };
  })
  .sort((first, second) => {
    if (first.label === defaultAuthHeroFile) {
      return -1;
    }
    if (second.label === defaultAuthHeroFile) {
      return 1;
    }
    return first.label.localeCompare(second.label);
  });

const passwordRequirement = "密码至少 8 位";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function AuthPage() {
  const navigate = useNavigate();
  const { authReady, currentUser, isApproved, isAuthenticated, loginWithPassword, notify, registerWithPassword } = useOrf();
  const [desktopChromeEnabled, setDesktopChromeEnabled] = useState(() => isDesktopShellAvailable());
  const [cachedHero] = useState<AuthHeroOption | null>(() => {
    const cached = readCachedLoginBackgroundPreview();
    return cached
      ? {
          id: `cached-login-background:${cached.userId}`,
          label: "本机登录页",
          crop: cached.crop,
          material: cached.material,
          src: cached.dataUrl,
        }
      : null;
  });
  const [mode, setMode] = useState<AuthMode>("login");
  const [selectedHeroId, setSelectedHeroId] = useState(() => cachedHero?.id ?? authHeroOptions[0]?.id ?? "");
  const [configuredHeroOptions, setConfiguredHeroOptions] = useState<AuthHeroOption[]>([]);
  const [savedCredentialAccounts, setSavedCredentialAccounts] = useState<SavedCredentialAccount[]>([]);
  const [credentialProvider, setCredentialProvider] = useState<"browser" | "desktop">("browser");
  const [selectedSavedAccountId, setSelectedSavedAccountId] = useState("");
  const [rememberCredentials, setRememberCredentials] = useState(true);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");
  const [viewportSize, setViewportSize] = useState(() => ({ width: window.innerWidth, height: window.innerHeight }));

  const applySavedAccount = async (account: SavedCredentialAccount) => {
    setEmail(account.email);
    setSelectedSavedAccountId(account.id);
    setAuthError("");
    const result = await readSavedCredentialPassword(account.id);
    if (result.status === "success" && result.password) {
      setPassword(result.password);
      return;
    }
    setPassword("");
    notify("无法读取已保存密码，请手动输入密码");
  };

  const deleteSavedAccount = async (account: SavedCredentialAccount) => {
    const result = await forgetSavedCredentialByEmail(account.email);
    setSavedCredentialAccounts(result.accounts);
    if (selectedSavedAccountId === account.id) {
      setSelectedSavedAccountId("");
      setEmail("");
      setPassword("");
    }
  };

  useEffect(() => {
    setDesktopChromeEnabled(isDesktopShellAvailable());
  }, []);

  useEffect(() => {
    const updateViewportSize = () => setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", updateViewportSize);
    return () => window.removeEventListener("resize", updateViewportSize);
  }, []);

  useEffect(() => {
    const authenticatedUserId = currentUser?.id;
    if (!authReady || !isAuthenticated || !isApproved || !authenticatedUserId) {
      return;
    }

    let cancelled = false;
    void getUserPreferences({ userId: authenticatedUserId })
      .then((preferences) => {
        if (!cancelled) {
          navigate(readLastWorkbenchLocationHref(authenticatedUserId) ?? preferences.defaultLandingPath ?? "/tasks");
        }
      })
      .catch(() => {
        if (!cancelled) {
          navigate(readLastWorkbenchLocationHref(authenticatedUserId) ?? "/tasks");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [authReady, currentUser?.id, isApproved, isAuthenticated, navigate]);

  useEffect(() => {
    let cancelled = false;
    void initializeSavedCredentialAccounts().then((result) => {
      if (cancelled) return;
      setCredentialProvider(result.provider);
      setSavedCredentialAccounts(result.accounts);
      const latest = result.accounts[0];
      if (latest) {
        setEmail((value) => value || latest.email);
        setSelectedSavedAccountId((value) => value || latest.id);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let intervalId: number | null = null;

    const clearRotationTimer = () => {
      if (intervalId) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    };

    const loadLoginBackground = () => {
      clearRotationTimer();
      void getVisualBackgrounds("login_background")
        .then((data) => {
          if (cancelled || data.list.length === 0) {
            return;
          }

          const options = data.list.map((background) => ({
            id: background.id,
            label: background.fileName,
            crop: data.config.crops[background.id] ?? defaultVisualBackgroundCrop,
            material: data.config.material,
            src: background.url,
          }));
          const visibleOptions = cachedHero ? [cachedHero, ...options] : options;
          setConfiguredHeroOptions(visibleOptions);
          if (cachedHero) {
            setSelectedHeroId(cachedHero.id);
            return;
          }
          setSelectedHeroId(pickVisualBackground(data)?.image.id ?? options[0]?.id ?? "");

          const intervalMs = visualBackgroundIntervalMs(data);
          if (intervalMs) {
            intervalId = window.setInterval(() => {
              setSelectedHeroId(pickVisualBackground(data)?.image.id ?? options[0]?.id ?? "");
            }, intervalMs);
          }
        })
        .catch(() => undefined);
    };

    loadLoginBackground();
    const unsubscribe = subscribeVisualBackgroundChanged("login_background", loadLoginBackground);

    return () => {
      cancelled = true;
      unsubscribe();
      clearRotationTimer();
    };
  }, [cachedHero]);

  useEffect(() => {
    setAuthError("");
  }, [email, mode, name, password]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!authReady || submitting) {
      return;
    }

    setAuthError("");
    const normalizedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();
    let submissionPassword = password;
    if (mode === "login" && !submissionPassword && selectedSavedAccountId) {
      const selectedAccount = savedCredentialAccounts.find((account) => account.id === selectedSavedAccountId && account.email === normalizedEmail);
      if (selectedAccount) {
        const savedPassword = await readSavedCredentialPassword(selectedAccount.id);
        if (savedPassword.status === "success" && savedPassword.password) {
          submissionPassword = savedPassword.password;
          setPassword(savedPassword.password);
        }
      }
    }

    const validationMessage = validateAuthInput(mode, { name: normalizedName, email: normalizedEmail, password: submissionPassword });
    if (validationMessage) {
      setAuthError(validationMessage);
      notify(validationMessage);
      return;
    }

    setSubmitting(true);
    const result =
      mode === "login"
        ? await loginWithPassword(normalizedEmail, submissionPassword)
        : await registerWithPassword({ name: normalizedName, email: normalizedEmail, password: submissionPassword });
    setSubmitting(false);

    if (!result.ok) {
      setAuthError(result.message);
      notify(result.message);
      return;
    }

    if (rememberCredentials) {
      const next = await rememberSuccessfulCredential({
        displayName: mode === "register" ? normalizedName : undefined,
        email: normalizedEmail,
        password: submissionPassword,
      });
      setCredentialProvider(next.provider);
      setSavedCredentialAccounts(next.accounts);
      setSelectedSavedAccountId(next.accounts.some((account) => account.id === normalizedEmail) ? normalizedEmail : "");
      if (next.provider === "desktop" && next.status !== "success") {
        notify("无法安全保存账号，请稍后重试");
      }
    } else {
      const next = await forgetSavedCredentialByEmail(normalizedEmail);
      setCredentialProvider(next.provider);
      setSavedCredentialAccounts(next.accounts);
      setSelectedSavedAccountId("");
    }

    const authenticatedUserId = result.user.id;
    const landingPath = await getUserPreferences({ force: true, userId: authenticatedUserId })
      .then((preferences) => readLastWorkbenchLocationHref(authenticatedUserId) ?? preferences.defaultLandingPath ?? "/tasks")
      .catch(() => readLastWorkbenchLocationHref(authenticatedUserId) ?? "/tasks");
    navigate(landingPath);
  };

  const title = mode === "login" ? "登录" : "创建账号";
  const primaryLabel = mode === "login" ? "登录" : "创建账号";
  const switchLabel = mode === "login" ? "注册新账号" : "返回登录";
  const busyLabel = mode === "login" ? "正在登录" : "正在创建";
  const heroOptions = configuredHeroOptions.length > 0 ? configuredHeroOptions : cachedHero ? [cachedHero, ...authHeroOptions] : authHeroOptions;
  const selectedHero = heroOptions.find((option) => option.id === selectedHeroId) ?? heroOptions[0];
  const loginMaterial = useAdaptiveMaterial({
    appearance: readCachedAppearanceMode(),
    crop: selectedHero?.crop ?? defaultVisualBackgroundCrop,
    highContrast: document.documentElement.dataset.orfDisplayContrast === "high",
    imageUrl: selectedHero?.src ?? null,
    preferences: selectedHero?.material ?? defaultVisualMaterialPreferences,
    role: "workspace",
    viewport: viewportSize,
  });
  const rememberLabel = credentialProvider === "desktop" ? "记住到本机" : "让浏览器记住";

  return (
    <main className="orf-auth-page">
      <VisualBackgroundSlot
        frameClassName="orf-auth-hero-frame"
        imageClassName="orf-auth-hero-image"
        imageUrl={selectedHero?.src ?? null}
        crop={selectedHero?.crop ?? defaultVisualBackgroundCrop}
      />
      <VisualMaterialLayer className="orf-auth-material" material={loginMaterial} role="workspace" />
      {heroOptions.length > 1 && <span className="orf-auth-top-gradient" aria-hidden="true" />}
      {desktopChromeEnabled && (
        <div className="orf-auth-desktop-chrome" aria-label="窗口标题栏">
          <DesktopWindowControls enabled />
        </div>
      )}
      {heroOptions.length > 1 && (
        <div className="orf-auth-hero-switch-zone" aria-label="选择登录页背景">
          <div className="orf-auth-hero-dots" role="radiogroup" aria-label="登录页背景">
            {heroOptions.map((option, index) => {
              const selected = option.id === selectedHero?.id;
              return (
                <button
                  key={option.id}
                  className="orf-auth-hero-dot"
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`背景 ${index + 1}: ${option.label}`}
                  data-selected={selected ? "true" : "false"}
                  onClick={() => setSelectedHeroId(option.id)}
                />
              );
            })}
          </div>
        </div>
      )}

      <section className="orf-auth-panel" aria-labelledby="auth-title">
        <div className="orf-auth-logo">
          <img className="orf-auth-logo-image" src={brandLogo} alt="ORF Flow" draggable={false} />
        </div>

        <div className="orf-auth-title-row">
          <span />
          <h1 id="auth-title">{title}</h1>
          <span />
        </div>

        {mode === "login" && savedCredentialAccounts.length > 0 && (
          <div className="orf-auth-saved-accounts" aria-label="已记住账号">
            {savedCredentialAccounts.map((account) => (
              <div className="orf-auth-saved-account" data-selected={selectedSavedAccountId === account.id ? "true" : "false"} key={account.id}>
                <button className="orf-auth-saved-account-main" type="button" onClick={() => void applySavedAccount(account)}>
                  <span className="orf-auth-saved-avatar" aria-hidden="true">
                    {savedCredentialAccountInitial(account)}
                  </span>
                  <span className="orf-auth-saved-copy">
                    <span>{account.displayName || account.email}</span>
                    {account.displayName && <small>{account.email}</small>}
                  </span>
                </button>
                <IconButton
                  className="orf-auth-saved-remove-action"
                  icon={Trash2}
                  label={`删除已记住账号 ${account.email}`}
                  size="sm"
                  variant="danger"
                  type="button"
                  onClick={() => void deleteSavedAccount(account)}
                />
              </div>
            ))}
          </div>
        )}

        <form className="orf-auth-form" onSubmit={submit} noValidate>
          {mode === "register" && (
            <AuthPill icon={User}>
              <label className="sr-only" htmlFor="auth-name">姓名</label>
              <input
                id="auth-name"
                className="orf-auth-input"
                autoComplete="name"
                placeholder="姓名"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </AuthPill>
          )}

          <AuthPill icon={Mail}>
            <label className="sr-only" htmlFor="auth-email">邮箱</label>
            <input
              id="auth-email"
              className="orf-auth-input"
              type="email"
              autoComplete={mode === "login" ? "username" : "email"}
              placeholder="邮箱"
              value={email}
              onChange={(event) => {
                const nextEmail = event.target.value;
                const savedAccount = findSavedCredentialAccountByEmail(savedCredentialAccounts, nextEmail);
                const nextSelectedAccountId = savedAccount?.id ?? "";
                setEmail(nextEmail);
                setSelectedSavedAccountId(nextSelectedAccountId);
                if (nextSelectedAccountId !== selectedSavedAccountId) setPassword("");
              }}
              required
            />
          </AuthPill>

          <AuthPill icon={LockKeyhole}>
            <label className="sr-only" htmlFor="auth-password">密码</label>
            <input
              id="auth-password"
              className="orf-auth-input"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="密码"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              className="orf-auth-eye"
              type="button"
              aria-label={showPassword ? "隐藏密码" : "显示密码"}
              title={showPassword ? "隐藏密码" : "显示密码"}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
            </button>
          </AuthPill>

          <label className="orf-auth-remember">
            <input
              type="checkbox"
              checked={rememberCredentials}
              onChange={(event) => setRememberCredentials(event.target.checked)}
            />
            <span className="orf-auth-remember-box" aria-hidden="true">
              {rememberCredentials && <Check className="h-4 w-4" />}
            </span>
            <span>{rememberLabel}</span>
          </label>

          {authError && (
            <p className="orf-auth-error" role="alert">
              {authError}
            </p>
          )}

          <Button className="orf-auth-submit-action" size="lg" type="submit" disabled={!authReady || submitting}>
            <span>{submitting ? busyLabel : primaryLabel}</span>
          </Button>
        </form>

        <div className="orf-auth-separator">
          <span />
          <small>{mode === "login" ? "还没有账号？" : "已有账号？"}</small>
          <span />
        </div>

        <Button
          className="orf-auth-mode-switch"
          variant="secondary"
          type="button"
          disabled={!authReady || submitting}
          onClick={() => setMode((value) => (value === "login" ? "register" : "login"))}
        >
          {switchLabel}
        </Button>
      </section>
    </main>
  );
}

function validateAuthInput(mode: AuthMode, input: { name: string; email: string; password: string }) {
  const email = input.email.trim();
  const password = input.password.trim();

  if (mode === "register" && !input.name.trim()) {
    return "请输入姓名";
  }

  if (!email) {
    return "请输入邮箱";
  }

  if (!emailPattern.test(email)) {
    return "邮箱格式不正确";
  }

  if (!password) {
    return "请输入密码";
  }

  if (password.length < 8) {
    return passwordRequirement;
  }

  return "";
}

function AuthPill({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="orf-auth-pill">
      <Icon className="orf-auth-pill-icon h-6 w-6" />
      {children}
    </div>
  );
}
