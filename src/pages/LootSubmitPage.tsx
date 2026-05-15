import { ArrowLeft, Send } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, Field } from "../components/ui";
import { useOrf } from "../state/OrfProvider";

export function LootSubmitPage() {
  const { objectiveId } = useParams();
  const navigate = useNavigate();
  const { dataReady, state, currentUser, submitLoot } = useOrf();
  const objective = state.objectives.find((item) => item.id === objectiveId);
  const results = objective ? state.results.filter((result) => result.objectiveId === objective.id) : [];
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  if (!objective) {
    return dataReady ? <Navigate to="/tasks" replace /> : <PageScaffold title="加载中" subtitle="正在加载悬赏数据。"><Card className="orf-card-padding text-sm orf-text-secondary">正在加载。</Card></PageScaffold>;
  }

  return (
    <PageScaffold
      title="提交战利品"
      subtitle={`目标：${objective.title}`}
      action={
        <Link className="orf-control orf-secondary-action inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium" to="/tasks">
          <ArrowLeft className="h-4 w-4" />
          返回挑战
        </Link>
      }
    >
      <Card className="orf-card-padding max-w-3xl">
        <form
          className="grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const value = body.trim();
            if (!value) {
              setError("请填写完成说明");
              return;
            }

            void submitLoot({ objectiveId: objective.id, body: value, author: currentUser?.name }).then((ok) => {
              if (ok) {
                navigate("/tasks");
              }
            });
          }}
        >
          <div className="grid gap-1">
            <div className="text-xs font-medium orf-text-muted">悬赏目标标题</div>
            <div className="rounded-md border orf-border orf-surface-muted px-3 py-2 text-sm font-semibold orf-text-primary">{objective.title}</div>
            {results.length > 0 && (
              <div className="mt-2 grid gap-1 text-xs orf-text-secondary">
                {results.map((result) => (
                  <span key={result.id}>{result.title}</span>
                ))}
              </div>
            )}
          </div>

          <Field label="完成说明">
            <textarea
              className="orf-input min-h-40 px-3 py-2 text-sm"
              value={body}
              onChange={(event) => {
                setBody(event.target.value);
                if (error) setError("");
              }}
              autoFocus
            />
          </Field>
          {error && <div className="text-sm orf-danger-text">{error}</div>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => navigate("/tasks")}>
              取消
            </Button>
            <Button type="submit">
              <Send className="h-4 w-4" />
              提交
            </Button>
          </div>
        </form>
      </Card>
    </PageScaffold>
  );
}
