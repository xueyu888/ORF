import { ArrowLeft, Send } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, Field } from "../components/ui";
import { useOrf } from "../state/OrfProvider";

export function LootSubmitPage() {
  const { bountyId } = useParams();
  const navigate = useNavigate();
  const { state, currentUser, submitLoot } = useOrf();
  const bounty = state.results.find((result) => result.id === bountyId);
  const objective = bounty ? state.objectives.find((item) => item.id === bounty.objectiveId) : undefined;
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  if (!bounty) {
    return <Navigate to="/tasks" replace />;
  }

  return (
    <PageScaffold
      title="提交战利品"
      subtitle={objective ? `目标：${objective.title}` : undefined}
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

            submitLoot({ bountyId: bounty.id, body: value, author: currentUser?.name });
            navigate("/tasks");
          }}
        >
          <div className="grid gap-1">
            <div className="text-xs font-medium orf-text-muted">悬赏标题</div>
            <div className="rounded-md border orf-border orf-surface-muted px-3 py-2 text-sm font-semibold orf-text-primary">{bounty.title}</div>
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
