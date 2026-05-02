import { LogIn, UserPlus } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Field } from "../components/ui";
import { useOrf } from "../state/OrfProvider";

type AuthMode = "login" | "register";

export function AuthPage() {
  const navigate = useNavigate();
  const { state, loginUser, registerUser, notify } = useOrf();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState(state.users[0]?.email ?? "");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");

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

  return (
    <main className="orf-auth-page min-h-screen px-4 py-10">
      <Card className="mx-auto grid w-full max-w-[920px] overflow-hidden md:grid-cols-[0.9fr_1.1fr]">
        <section className="orf-auth-aside p-8">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] orf-text-muted">ORF Flow</div>
          <h1 className="mt-4 text-3xl font-semibold orf-text-primary">账号入口</h1>
          <p className="mt-3 text-sm leading-6 orf-text-secondary">身份交给 Kratos；当前页面先保留前端原型入口。</p>
        </section>
        <section className="p-6 md:p-8">
          <div className="mb-6 inline-flex rounded-lg border orf-border orf-surface-muted p-1">
            <button type="button" className={authTabClass(mode === "login")} onClick={() => setMode("login")}>登录</button>
            <button type="button" className={authTabClass(mode === "register")} onClick={() => setMode("register")}>注册</button>
          </div>

          <form className="grid gap-4" onSubmit={submit}>
            {mode === "register" && (
              <Field label="姓名">
                <input className="orf-input px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} required />
              </Field>
            )}
            <Field label="邮箱">
              <input className="orf-input px-3 py-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </Field>
            <Field label="密码">
              <input className="orf-input px-3 py-2" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
            </Field>
            <Button className="mt-2 w-full" type="submit">
              {mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
              {mode === "login" ? "登录" : "注册"}
            </Button>
          </form>

          <div className="mt-6 grid gap-2 text-xs orf-text-muted">
            {state.users.map((user) => (
              <button key={user.id} type="button" className="rounded-md orf-surface-muted px-3 py-2 text-left" onClick={() => setEmail(user.email)}>
                {user.email} · {user.role === "admin" ? "管理员" : "普通成员"}
              </button>
            ))}
          </div>
        </section>
      </Card>
    </main>
  );
}

function authTabClass(active: boolean) {
  return [
    "rounded-md px-4 py-2 text-sm font-semibold transition",
    active ? "orf-surface-elevated orf-text-primary shadow-sm" : "orf-text-secondary hover:text-[color:var(--orf-text-primary)]",
  ].join(" ");
}
