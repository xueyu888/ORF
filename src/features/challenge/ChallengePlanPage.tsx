import { useEffect, useMemo, useState } from "react";
import { CommentPanel, type CommentReplyInput } from "./comments/CommentPanel";
import { ChallengeToolbar } from "./components/ChallengeToolbar";
import { ChallengeTree } from "./components/ChallengeTree";
import { TeamDashboard } from "./components/TeamDashboard";
import { useOrf } from "../../state/OrfProvider";
import type { PermissionResource, Result } from "../../types/orf";
import { challengeLinkForTarget } from "./model/challengeLinks";
import { commentCountsByTarget, commentTargetForChallengeTarget, submittedLootIdsFromComments } from "./model/challengeComments";
import { canAccess, canAccessDragItem, canAccessTarget, objectiveStage, permissionDeniedMessage, resourceForDragItem, resourceForTarget } from "./model/challengePermissions";
import { buildChallengeTree } from "./model/challengeTreeModel";
import { deleteConfirmMessage } from "./model/deleteConfirm";
import type { ChallengeCommentTarget, ChallengeRowAction, ChallengeScope, ChallengeTarget, DragItem, DropTarget } from "./model/types";

export function ChallengePlanPage() {
  const {
    addComment,
    createTaskChecklistItem,
    currentUser,
    deleteCommentMessage,
    deleteObjective,
    deleteResult,
    deleteTask,
    deleteTaskChecklistItem,
    isAdmin,
    moveResult,
    moveTask,
    moveTaskChecklistItem,
    notify,
    openModal,
    setTaskCompletion,
    state,
    updateCommentMessage,
    updateObjectiveTitle,
    updateResultTitle,
    updateTaskChecklistItem,
    updateTaskChecklistItemLabel,
    updateTaskTitle,
  } = useOrf();
  const role = currentUser?.role;
  const currentMember = currentUser?.name ?? "User";
  const [scope, setScope] = useState<ChallengeScope>(isAdmin ? "all" : "mine");
  const [collapsedBountyIds, setCollapsedBountyIds] = useState<Set<string>>(() => new Set());
  const [collapsedActionIds, setCollapsedActionIds] = useState<Set<string>>(() => new Set());
  const [commentTarget, setCommentTarget] = useState<ChallengeCommentTarget | null>(null);
  const [editingTarget, setEditingTarget] = useState<ChallengeTarget | null>(null);
  const [activeActionId, setActiveActionId] = useState<string | null>(null);
  const [openActionId, setOpenActionId] = useState<string | null>(null);
  const [dragItem, setDragItem] = useState<DragItem | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const now = useMinuteNow();

  useEffect(() => {
    if (!isAdmin && scope === "all") {
      setScope("mine");
    }
  }, [isAdmin, scope]);

  useEffect(() => {
    if (!openActionId) return undefined;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenActionId(null);
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [openActionId]);

  const activateRowAction = (id: string | null) => {
    if (id && openActionId && openActionId !== id) {
      setOpenActionId(null);
    }
    setActiveActionId(id);
  };

  const objectiveIdsInMyChallenges = useMemo(
    () => new Set(state.results.filter((result) => result.owner === currentMember).map((result) => result.objectiveId)),
    [currentMember, state.results],
  );
  const submittedLootIds = useMemo(() => submittedLootIdsFromComments(state.comments), [state.comments]);
  const showAll = isAdmin && scope === "all";
  const groups = useMemo(
    () =>
      buildChallengeTree(
        {
          automaticCompletions: state.automaticCompletions,
          evidence: state.evidence,
          feedback: state.feedback,
          objectives: state.objectives,
          results: state.results,
          submittedLootIds,
          tasks: state.tasks,
        },
        showAll ? undefined : objectiveIdsInMyChallenges,
      ),
    [objectiveIdsInMyChallenges, showAll, state.automaticCompletions, state.evidence, state.feedback, state.objectives, state.results, state.tasks, submittedLootIds],
  );
  const commentCounts = useMemo(() => commentCountsByTarget(state.comments), [state.comments]);

  const requireTargetPermission = (target: ChallengeTarget, action: "create" | "delete" | "edit") => {
    if (canAccessTarget(state, role, target, action)) return true;
    notify(permissionDeniedMessage(action, resourceForTarget(target)));
    return false;
  };

  const requirePermission = (objectiveId: string, action: "create" | "delete" | "edit", resource: PermissionResource) => {
    if (canAccess(state, role, objectiveStage(state, objectiveId), action, resource)) return true;
    notify(permissionDeniedMessage(action, resource));
    return false;
  };

  const addBounty = (objectiveId: string) => {
    if (requirePermission(objectiveId, "create", "result")) {
      openModal({ type: "newResult", objectiveId });
    }
  };

  const addAction = (bounty: Result) => {
    if (requirePermission(bounty.objectiveId, "create", "task")) {
      openModal({ type: "newTask", objectiveId: bounty.objectiveId, resultId: bounty.id });
    }
  };

  const addSubAction = (actionId: string, afterItemId?: string) => {
    const action = state.tasks.find((item) => item.id === actionId);
    if (!action || !requirePermission(action.linkedObjectiveId, "create", "subtask")) return;
    createTaskChecklistItem(actionId, afterItemId);
    setCollapsedActionIds((items) => withoutItem(items, actionId));
  };

  const beginEdit = (target: ChallengeTarget) => {
    if (!requireTargetPermission(target, "edit")) return;
    setEditingTarget(target);
    setOpenActionId(null);
  };

  const saveTitle = (target: ChallengeTarget, title: string) => {
    const value = title.trim();
    if (!value) {
      notify("标题不能为空");
      return;
    }

    if (target.type === "objective") updateObjectiveTitle(target.id, value);
    if (target.type === "bounty") updateResultTitle(target.id, value);
    if (target.type === "action") updateTaskTitle(target.id, value);
    if (target.type === "subAction") updateTaskChecklistItemLabel(target.actionId, target.id, value);
    setEditingTarget(null);
  };

  const deleteTarget = (target: ChallengeTarget) => {
    if (!requireTargetPermission(target, "delete")) return;
    if (!window.confirm(deleteConfirmMessage(target, state))) return;

    if (target.type === "objective") deleteObjective(target.id);
    if (target.type === "bounty") deleteResult(target.id);
    if (target.type === "action") deleteTask(target.id);
    if (target.type === "subAction") deleteTaskChecklistItem(target.actionId, target.id);
  };

  const copyLink = (target: ChallengeTarget) => {
    const write = navigator.clipboard?.writeText(challengeLinkForTarget(target));
    if (!write) {
      notify("当前浏览器不支持复制链接");
      return;
    }

    void write.then(() => notify("链接已复制")).catch(() => notify("复制链接失败"));
  };

  const handleRowAction = (action: ChallengeRowAction, target: ChallengeTarget) => {
    if (action === "copyLink") copyLink(target);
    if (action === "edit") beginEdit(target);
    if (action === "comment") setCommentTarget(commentTargetForChallengeTarget(target));
    if (action === "delete") deleteTarget(target);
  };

  const setActionDone = (actionId: string, done: boolean) => {
    const action = state.tasks.find((item) => item.id === actionId);
    if (!action || !requirePermission(action.linkedObjectiveId, "edit", "task")) return;
    setTaskCompletion(actionId, done);
  };

  const setSubActionDone = (actionId: string, itemId: string, done: boolean) => {
    const action = state.tasks.find((item) => item.id === actionId);
    if (!action || !requirePermission(action.linkedObjectiveId, "edit", "subtask")) return;
    updateTaskChecklistItem(actionId, itemId, done);
  };

  const dragDrop = {
    dragItem,
    dropTarget,
    onDragStart: (item: DragItem) => {
      setDragItem(item);
      setDropTarget(null);
      setOpenActionId(null);
    },
    onDragEnd: () => {
      setDragItem(null);
      setDropTarget(null);
    },
    onDropTargetChange: setDropTarget,
    onDrop: (target: DropTarget) => {
      if (!dragItem) return;
      if (!canAccessDragItem(state, role, dragItem, "edit")) {
        notify(permissionDeniedMessage("edit", resourceForDragItem(dragItem)));
        setDragItem(null);
        setDropTarget(null);
        return;
      }

      if (dragItem.type === "bounty" && target.type === "bounty") {
        moveResult({ resultId: dragItem.id, objectiveId: target.objectiveId, referenceResultId: target.bountyId, placement: target.placement });
      }

      if (dragItem.type === "action") {
        if (target.type === "bountyActions") {
          moveTask({ taskId: dragItem.id, toResultId: target.bountyId });
        }
        if (target.type === "action") {
          moveTask({ taskId: dragItem.id, toResultId: target.bountyId, referenceTaskId: target.actionId, placement: target.placement });
        }
      }

      if (dragItem.type === "subAction") {
        if (target.type === "actionSubActions") {
          moveTaskChecklistItem({ itemId: dragItem.id, fromTaskId: dragItem.actionId, toTaskId: target.actionId });
        }
        if (target.type === "subAction") {
          moveTaskChecklistItem({ itemId: dragItem.id, fromTaskId: dragItem.actionId, toTaskId: target.actionId, referenceItemId: target.itemId, placement: target.placement });
        }
      }

      setDragItem(null);
      setDropTarget(null);
    },
  };

  return (
    <div
      className="grid gap-4"
      onPointerDown={(event) => {
        if (!openActionId) return;
        if (event.target instanceof Element && event.target.closest("[data-challenge-row-actions], [data-challenge-disclosure-action]")) return;
        setOpenActionId(null);
      }}
    >
      {showAll && <TeamDashboard groups={groups} />}
      <ChallengeToolbar isAdmin={isAdmin} onScopeChange={setScope} scope={scope} />
      <ChallengeTree
        automaticCompletions={state.automaticCompletions}
        emptyText={showAll ? "当前还没有挑战内容。" : "当前没有与你的挑战目标相关的内容。"}
        groups={groups}
        handlers={{
          activeActionId,
          collapsedActionIds,
          collapsedBountyIds,
          commentCounts,
          dragDrop,
          editingTarget,
          onActionDoneChange: setActionDone,
          onActionRowAction: handleRowAction,
          onActiveActionChange: activateRowAction,
          onAddAction: addAction,
          onAddBounty: addBounty,
          onAddSubAction: addSubAction,
          onCancelEdit: () => setEditingTarget(null),
          onEditTarget: beginEdit,
          onOpenActionChange: setOpenActionId,
          onSaveTitle: saveTitle,
          onSubActionDoneChange: setSubActionDone,
          onToggleAction: (actionId) => setCollapsedActionIds((items) => toggleSetItem(items, actionId)),
          onToggleBounty: (bountyId) => setCollapsedBountyIds((items) => toggleSetItem(items, bountyId)),
          openActionId,
        }}
        now={now}
        scope={scope}
      />

      {commentTarget && (
        <CommentPanel
          currentMember={currentMember}
          targetTitle={commentTarget.title}
          threads={state.comments.filter((thread) => thread.targetType === commentTarget.type && thread.targetId === commentTarget.id)}
          onAddComment={(body, replyInput?: CommentReplyInput) =>
            addComment({
              targetType: commentTarget.type,
              targetId: commentTarget.id,
              targetTitle: commentTarget.title,
              body,
              author: currentMember,
              parentMessageId: replyInput?.parentMessageId,
              replyToMessageId: replyInput?.replyToMessageId,
              replyToAuthor: replyInput?.replyToAuthor,
            })
          }
          onClose={() => setCommentTarget(null)}
          onDeleteComment={deleteCommentMessage}
          onUpdateComment={updateCommentMessage}
        />
      )}
    </div>
  );
}

function useMinuteNow() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  return now;
}

function toggleSetItem<T>(items: Set<T>, item: T) {
  const next = new Set(items);
  if (next.has(item)) next.delete(item);
  else next.add(item);
  return next;
}

function withoutItem<T>(items: Set<T>, item: T) {
  const next = new Set(items);
  next.delete(item);
  return next;
}
