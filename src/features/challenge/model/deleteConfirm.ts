import type { OrfState } from "../../../types/orf";
import type { ChallengeTarget } from "./types";

export function deleteConfirmMessage(target: ChallengeTarget, state: OrfState) {
  if (target.type === "objective") {
    const bounties = state.results.filter((result) => result.objectiveId === target.id);
    const actions = state.tasks.filter((action) => action.linkedObjectiveId === target.id);
    const subActionCount = actions.reduce((count, action) => count + action.checklist.length, 0);
    return `删除目标「${target.title}」会同时删除 ${bounties.length} 个悬赏、${actions.length} 个行动项和 ${subActionCount} 个子行动项。是否确认？`;
  }

  if (target.type === "bounty") {
    const actions = state.tasks.filter((action) => action.linkedResultId === target.id);
    const subActionCount = actions.reduce((count, action) => count + action.checklist.length, 0);
    return `删除悬赏「${target.title}」会同时删除 ${actions.length} 个行动项和 ${subActionCount} 个子行动项。是否确认？`;
  }

  if (target.type === "action") {
    const action = state.tasks.find((item) => item.id === target.id);
    const subActionCount = action?.checklist.length ?? 0;
    return subActionCount > 0
      ? `删除行动项「${target.title}」会同时删除 ${subActionCount} 个子行动项。是否确认？`
      : `删除行动项「${target.title}」？`;
  }

  return `删除子行动项「${target.title}」？`;
}
