import { Eye, EyeOff, LockKeyhole, Mail, Sparkles, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import brandLogo from "../assets/brand/orf-logo.png";
import { getVisualBackgrounds } from "../state/apiClient";
import { useOrf } from "../state/OrfProvider";

type AuthMode = "login" | "register";

type AuthHeroOption = {
  id: string;
  label: string;
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
    return { id: path, label, src };
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
  const { authReady, isAuthenticated, loginWithPassword, notify, registerWithPassword } = useOrf();
  const [mode, setMode] = useState<AuthMode>("login");
  const [selectedHeroId, setSelectedHeroId] = useState(() => authHeroOptions[0]?.id ?? "");
  const [configuredHeroOptions, setConfiguredHeroOptions] = useState<AuthHeroOption[]>([]);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [authError, setAuthError] = useState("");

  useEffect(() => {
    if (authReady && isAuthenticated) {
      navigate("/tasks");
    }
  }, [authReady, isAuthenticated, navigate]);

  useEffect(() => {
    let cancelled = false;

    void getVisualBackgrounds("login_background")
      .then((data) => {
        if (cancelled || data.list.length === 0) {
          return;
        }

        const options = data.list.map((background) => ({
          id: background.id,
          label: background.fileName,
          src: background.url,
        }));
        setConfiguredHeroOptions(options);
        setSelectedHeroId(data.defaultBackgroundId ?? options[0]?.id ?? "");
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setAuthError("");
  }, [email, mode, name, password]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!authReady || submitting) {
      return;
    }

    setAuthError("");
    const validationMessage = validateAuthInput(mode, { name, email, password });
    if (validationMessage) {
      setAuthError(validationMessage);
      notify(validationMessage);
      return;
    }

    setSubmitting(true);
    const result =
      mode === "login"
        ? await loginWithPassword(email, password)
        : await registerWithPassword({ name, email, password });
    setSubmitting(false);

    if (!result.ok) {
      setAuthError(result.message);
      notify(result.message);
      return;
    }

    navigate("/tasks");
  };

  const title = mode === "login" ? "Sign in" : "Register";
  const primaryLabel = mode === "login" ? "Sign In" : "Create Account";
  const switchLabel = mode === "login" ? "Register" : "Sign In";
  const busyLabel = mode === "login" ? "Signing In" : "Creating";
  const heroOptions = configuredHeroOptions.length > 0 ? configuredHeroOptions : authHeroOptions;
  const selectedHero = heroOptions.find((option) => option.id === selectedHeroId) ?? heroOptions[0];

  return (
    <main className="orf-auth-page">
      {selectedHero && <img className="orf-auth-hero" src={selectedHero.src} alt="" aria-hidden="true" draggable={false} />}
      {heroOptions.length > 1 && <span className="orf-auth-top-gradient" aria-hidden="true" />}
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

        <form className="orf-auth-form" onSubmit={submit} noValidate>
          {mode === "register" && (
            <AuthPill icon={User}>
              <label className="sr-only" htmlFor="auth-name">Name</label>
              <input
                id="auth-name"
                className="orf-auth-input"
                autoComplete="name"
                placeholder="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
              />
            </AuthPill>
          )}

          <AuthPill icon={Mail}>
            <label className="sr-only" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="orf-auth-input"
              type="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </AuthPill>

          <AuthPill icon={LockKeyhole}>
            <label className="sr-only" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              className="orf-auth-input"
              type={showPassword ? "text" : "password"}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              className="orf-auth-eye"
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              title={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? <EyeOff className="h-6 w-6" /> : <Eye className="h-6 w-6" />}
            </button>
          </AuthPill>

          {authError && (
            <p className="orf-auth-error" role="alert">
              {authError}
            </p>
          )}

          <button className="orf-auth-submit" type="submit" disabled={!authReady || submitting}>
            <Sparkles className="h-5 w-5" />
            <span>{submitting ? busyLabel : primaryLabel}</span>
            <Sparkles className="h-5 w-5" />
          </button>
        </form>

        <div className="orf-auth-separator" aria-hidden="true">
          <span />
          <Sparkles className="h-6 w-6" />
          <span />
        </div>

        <button
          className="orf-auth-secondary"
          type="button"
          disabled={!authReady || submitting}
          onClick={() => setMode((value) => (value === "login" ? "register" : "login"))}
        >
          {switchLabel}
        </button>
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

  if (mode === "register" && password.length < 8) {
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
