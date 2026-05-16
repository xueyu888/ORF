import { ArrowLeft, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { PageScaffold } from "../components/PageScaffold";
import { Button, Card, Field } from "../components/ui";
import { useOrf } from "../state/OrfProvider";
import type { LootResultClaimStatus, ObjectiveAcceptedResult, ResultAcceptedResult } from "../types/orf";

const lootClaimOptions: Array<{ label: string; value: LootResultClaimStatus }> = [
  { label: "完成", value: "completed" },
  { label: "证伪", value: "falsified" },
  { label: "未主张", value: "notClaimed" },
];

const resultReviewOptions: Array<{ label: string; value: ResultAcceptedResult }> = [
  { label: "完成", value: "completed" },
  { label: "证伪", value: "falsified" },
  { label: "失败", value: "failed" },
  { label: "不验收", value: "unreviewed" },
];

const objectiveReviewOptions: Array<{ label: string; value: ObjectiveAcceptedResult }> = [
  { label: "完成", value: "completed" },
  { label: "超额完成", value: "overdelivered" },
  { label: "证伪", value: "falsified" },
  { label: "推翻目标", value: "overturned" },
  { label: "放弃", value: "abandoned" },
];

export function LootSubmitPage() {
  const { objectiveId } = useParams();
  const navigate = useNavigate();
  const { currentUser, dataReady, reviewObjectiveLoot, state, submitLoot } = useOrf();
  const objective = state.objectives.find((item) => item.id === objectiveId);
  const results = useMemo(() => (objective ? state.results.filter((result) => result.objectiveId === objective.id) : []), [objective, state.results]);
  const latestLoot = useMemo(
    () => state.objectiveLoot.filter((item) => item.objectiveId === objectiveId).sort((left, right) => right.submittedAt.localeCompare(left.submittedAt))[0],
    [objectiveId, state.objectiveLoot],
  );
  const [body, setBody] = useState("");
  const [selfTestReportBody, setSelfTestReportBody] = useState("");
  const [claims, setClaims] = useState<Record<string, { claim: LootResultClaimStatus; evidenceText: string }>>({});
  const [acceptedResult, setAcceptedResult] = useState<ObjectiveAcceptedResult>("completed");
  const [resultReviews, setResultReviews] = useState<Record<string, ResultAcceptedResult>>({});
  const [contributionRatios, setContributionRatios] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    setClaims((current) => {
      const next: typeof current = {};
      for (const result of results) {
        next[result.id] = current[result.id] ?? { claim: "completed", evidenceText: "" };
      }
      return next;
    });
    setResultReviews((current) => {
      const next: typeof current = {};
      for (const result of results) {
        next[result.id] = current[result.id] ?? "completed";
      }
      return next;
    });
  }, [results]);

  useEffect(() => {
    setContributionRatios((current) => {
      const next: typeof current = {};
      for (const challenger of objective?.challengers ?? []) {
        next[challenger] = current[challenger] ?? "1";
      }
      return next;
    });
  }, [objective?.challengers]);

  if (!objective) {
    return dataReady ? <Navigate to="/tasks" replace /> : <PageScaffold title="加载中" subtitle="正在加载悬赏数据。"><Card className="orf-card-padding text-sm orf-text-secondary">正在加载。</Card></PageScaffold>;
  }

  const canSubmit = objective.flowStatus === "frozen" && objective.challengers.includes(currentUser?.name ?? "");
  const canReview = currentUser?.role === "admin" && objective.flowStatus === "submitted" && latestLoot;

  const submit = () => {
    const value = body.trim();
    if (!canSubmit) {
      setError("目标冻结后，挑战者才能提交战利品");
      return;
    }
    if (!value) {
      setError("请填写完成说明");
      return;
    }
    if (results.length === 0) {
      setError("这个目标没有可验收的指标");
      return;
    }

    void submitLoot({
      objectiveId: objective.id,
      body: value,
      author: currentUser?.name,
      selfTestReportBody: selfTestReportBody.trim() || null,
      resultClaims: results.map((result) => ({
        resultId: result.id,
        claim: claims[result.id]?.claim ?? "notClaimed",
        evidenceText: claims[result.id]?.evidenceText ?? "",
      })),
    }).then((ok) => {
      if (ok) navigate("/tasks");
    });
  };

  const review = () => {
    if (!canReview || !latestLoot) {
      setError("只有指挥官能验收已提交的战利品");
      return;
    }

    void reviewObjectiveLoot(objective.id, {
      lootId: latestLoot.id,
      acceptedResult,
      reason: reason.trim() || undefined,
      resultReviews: results.map((result) => ({
        resultId: result.id,
        acceptedResult: resultReviews[result.id] ?? "completed",
      })),
      contributionRatios: objective.challengers.map((member) => ({
        member,
        ratio: Number(contributionRatios[member] || 0),
      })),
    }).then((ok) => {
      if (ok) navigate("/reports");
    });
  };

  return (
    <PageScaffold
      title={canReview ? "验收战利品" : "提交战利品"}
      subtitle={`目标：${objective.title}`}
      action={
        <Link className="orf-control orf-secondary-action inline-flex items-center gap-2 border px-3 py-2 text-sm font-medium" to="/tasks">
          <ArrowLeft className="h-4 w-4" />
          返回挑战
        </Link>
      }
    >
      <div className="grid max-w-4xl gap-4">
        <Card className="orf-card-padding">
          <div className="grid gap-2">
            <div className="text-xs font-medium orf-text-muted">悬赏目标标题</div>
            <div className="rounded-md border orf-border orf-surface-muted px-3 py-2 text-sm font-semibold orf-text-primary">{objective.title}</div>
            <div className="text-xs orf-text-secondary">当前状态：{objective.flowStatus}</div>
          </div>
        </Card>

        {latestLoot && (
          <Card className="orf-card-padding">
            <div className="grid gap-3 text-sm">
              <div className="font-semibold orf-text-primary">最近提交</div>
              <div className="orf-text-secondary whitespace-pre-wrap">{latestLoot.body}</div>
              {latestLoot.selfTestReportBody && <div className="rounded-md border orf-border p-3 text-xs orf-text-secondary whitespace-pre-wrap">{latestLoot.selfTestReportBody}</div>}
            </div>
          </Card>
        )}

        {canReview ? (
          <Card className="orf-card-padding">
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                review();
              }}
            >
              <Field label="目标验收结论">
                <select className="orf-input px-3 py-2 text-sm" value={acceptedResult} onChange={(event) => setAcceptedResult(event.target.value as ObjectiveAcceptedResult)}>
                  {objectiveReviewOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </Field>
              <div className="grid gap-3">
                {results.map((result) => (
                  <div key={result.id} className="grid gap-2 rounded-md border orf-border p-3">
                    <div className="text-sm font-semibold orf-text-primary">{result.title}</div>
                    <select className="orf-input px-3 py-2 text-sm" value={resultReviews[result.id] ?? "completed"} onChange={(event) => setResultReviews((items) => ({ ...items, [result.id]: event.target.value as ResultAcceptedResult }))}>
                      {resultReviewOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="grid gap-3">
                {objective.challengers.map((member) => (
                  <Field key={member} label={`${member} 贡献权重`}>
                    <input className="orf-input px-3 py-2 text-sm" type="number" min="0" step="0.1" value={contributionRatios[member] ?? "1"} onChange={(event) => setContributionRatios((items) => ({ ...items, [member]: event.target.value }))} />
                  </Field>
                ))}
              </div>
              <Field label="验收说明">
                <textarea className="orf-input min-h-24 px-3 py-2 text-sm" value={reason} onChange={(event) => setReason(event.target.value)} />
              </Field>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => navigate("/tasks")}>取消</Button>
                <Button type="submit">验收并结算</Button>
              </div>
            </form>
          </Card>
        ) : (
          <Card className="orf-card-padding">
            <form
              className="grid gap-5"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Field label="完成说明">
                <textarea className="orf-input min-h-32 px-3 py-2 text-sm" value={body} onChange={(event) => { setBody(event.target.value); if (error) setError(""); }} autoFocus />
              </Field>
              <div className="grid gap-3">
                {results.map((result) => (
                  <div key={result.id} className="grid gap-2 rounded-md border orf-border p-3">
                    <div className="text-sm font-semibold orf-text-primary">{result.title}</div>
                    <select className="orf-input px-3 py-2 text-sm" value={claims[result.id]?.claim ?? "completed"} onChange={(event) => setClaims((items) => ({ ...items, [result.id]: { ...(items[result.id] ?? { evidenceText: "" }), claim: event.target.value as LootResultClaimStatus } }))}>
                      {lootClaimOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                    <textarea className="orf-input min-h-20 px-3 py-2 text-sm" placeholder="证据、数据或链接" value={claims[result.id]?.evidenceText ?? ""} onChange={(event) => setClaims((items) => ({ ...items, [result.id]: { ...(items[result.id] ?? { claim: "completed" }), evidenceText: event.target.value } }))} />
                  </div>
                ))}
              </div>
              <Field label="自测报告 TODO">
                <textarea className="orf-input min-h-24 px-3 py-2 text-sm" placeholder="先粘贴自测摘要；文件编辑器接入后再支持报告文件。" value={selfTestReportBody} onChange={(event) => setSelfTestReportBody(event.target.value)} />
              </Field>
              {error && <div className="text-sm orf-danger-text">{error}</div>}
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => navigate("/tasks")}>取消</Button>
                <Button type="submit" disabled={!canSubmit}>
                  <Send className="h-4 w-4" />
                  提交
                </Button>
              </div>
            </form>
          </Card>
        )}
      </div>
    </PageScaffold>
  );
}
