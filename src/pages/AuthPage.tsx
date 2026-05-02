import { Eye, EyeOff, LockKeyhole, Mail, Sparkles, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { type FormEvent, type ReactNode, useState } from "react";
import { useNavigate } from "react-router-dom";
import authHero from "../assets/auth/orf-login-sky-adventure.png";
import { useOrf } from "../state/OrfProvider";

type AuthMode = "login" | "register";

export function AuthPage() {
  const navigate = useNavigate();
  const { state, loginUser, registerUser, notify } = useOrf();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState(state.users[0]?.email ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();

    if (mode === "login") {
      if (!state.users.some((user) => user.email.toLowerCase() === email.trim().toLowerCase())) {
        notify("账号不存在");
        return;
      }

      loginUser(email);
      navigate("/tasks");
      return;
    }

    registerUser({ name, email });
    navigate("/tasks");
  };

  const title = mode === "login" ? "Sign in" : "Register";
  const primaryLabel = mode === "login" ? "Sign In" : "Create Account";
  const switchLabel = mode === "login" ? "Register" : "Sign In";

  return (
    <main className="orf-auth-page">
      <img className="orf-auth-hero" src={authHero} alt="" aria-hidden="true" />
      <span className="orf-auth-shape orf-auth-shape-one" aria-hidden="true" />
      <span className="orf-auth-shape orf-auth-shape-two" aria-hidden="true" />
      <span className="orf-auth-shape orf-auth-shape-three" aria-hidden="true" />

      <section className="orf-auth-panel" aria-labelledby="auth-title">
        <div className="orf-auth-logo" aria-label="ORF Flow">
          <span className="orf-auth-logo-main">ORF</span>
          <span className="orf-auth-logo-sub">FLOW</span>
        </div>

        <div className="orf-auth-title-row">
          <span />
          <h1 id="auth-title">{title}</h1>
          <span />
        </div>

        <form className="orf-auth-form" onSubmit={submit}>
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

          <button className="orf-auth-submit" type="submit">
            <Sparkles className="h-5 w-5" />
            <span>{primaryLabel}</span>
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
          onClick={() => setMode((value) => (value === "login" ? "register" : "login"))}
        >
          {switchLabel}
        </button>
      </section>
    </main>
  );
}

function AuthPill({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <div className="orf-auth-pill">
      <Icon className="orf-auth-pill-icon h-6 w-6" />
      {children}
    </div>
  );
}
