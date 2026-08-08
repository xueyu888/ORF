import type {
  FeedbackActivityType,
  FeedbackActorSnapshot,
  FeedbackCapabilities,
  FeedbackEntitySnapshot,
  FeedbackRelationDraft,
  FeedbackRelationType,
  FeedbackResolution,
  FeedbackTransitionInput,
} from "../contracts/index";

export type FeedbackDomainErrorCode =
  | "actor_inactive"
  | "actor_out_of_scope"
  | "administrative_takeover_reason_required"
  | "duplicate_relation_required"
  | "expected_version_mismatch"
  | "forbidden"
  | "invalid_relation"
  | "invalid_transition_source"
  | "lifecycle_invariant_violation";

export interface FeedbackDomainError {
  readonly code: FeedbackDomainErrorCode;
  readonly message: string;
}

export interface FeedbackDomainSuccess<T> {
  readonly ok: true;
  readonly value: T;
}

export interface FeedbackDomainFailure {
  readonly ok: false;
  readonly error: FeedbackDomainError;
}

export type FeedbackDomainResult<T> = FeedbackDomainSuccess<T> | FeedbackDomainFailure;

export interface FeedbackDuplicateRelationFacts {
  readonly duplicateTargetFeedbackIds?: readonly string[];
}

export interface FeedbackTransitionContext {
  readonly feedback: FeedbackEntitySnapshot;
  readonly actor: FeedbackActorSnapshot;
  readonly command: FeedbackTransitionInput;
  readonly occurredAt: string;
  readonly duplicateRelations?: FeedbackDuplicateRelationFacts;
}

export interface FeedbackTransitionOutcome {
  readonly feedback: FeedbackEntitySnapshot;
  readonly activityType: FeedbackActivityType;
}

export interface FeedbackRelationCanonicalForm {
  readonly sourceFeedbackId: string;
  readonly targetFeedbackId: string;
  readonly type: FeedbackRelationType;
}

export interface FeedbackLifecycleInvariantContext {
  readonly feedback: Pick<
    FeedbackEntitySnapshot,
    "stage" | "resolution" | "closedAt" | "closedByUserId"
  >;
  readonly duplicateRelations?: FeedbackDuplicateRelationFacts;
}

const terminalResolutions = new Set<FeedbackResolution>([
  "resolved",
  "not_needed",
  "cannot_resolve",
  "duplicate",
  "unspecified",
]);

const pendingOrClosedStages = new Set(["pending_verification", "closed"]);

export function validateFeedbackLifecycle(
  context: FeedbackLifecycleInvariantContext,
): readonly FeedbackDomainError[] {
  const { feedback, duplicateRelations } = context;
  const errors: FeedbackDomainError[] = [];

  if (feedback.stage === "open" || feedback.stage === "in_progress") {
    if (feedback.resolution !== null) {
      errors.push(error("lifecycle_invariant_violation", "Active feedback cannot carry a resolution."));
    }
    if (feedback.closedAt || feedback.closedByUserId) {
      errors.push(error("lifecycle_invariant_violation", "Active feedback cannot carry close facts."));
    }
  }

  if (pendingOrClosedStages.has(feedback.stage)) {
    if (feedback.resolution === null) {
      errors.push(error("lifecycle_invariant_violation", "Verification or closed feedback needs a resolution."));
    }
    if (feedback.resolution !== null && !terminalResolutions.has(feedback.resolution)) {
      errors.push(error("lifecycle_invariant_violation", "Unknown feedback resolution."));
    }
  }

  if (feedback.stage === "closed" && (!feedback.closedAt || !feedback.closedByUserId)) {
    errors.push(error("lifecycle_invariant_violation", "closed stage requires close facts."));
  }

  if (feedback.stage !== "closed" && (feedback.closedAt || feedback.closedByUserId)) {
    errors.push(error("lifecycle_invariant_violation", "Only closed feedback can carry close facts."));
  }

  if (feedback.resolution === "duplicate" && !hasDuplicateRelation(duplicateRelations)) {
    errors.push(error("duplicate_relation_required", "Duplicate resolution requires a duplicate relation."));
  }

  return errors;
}

export function deriveFeedbackCapabilities(input: {
  readonly feedback: FeedbackEntitySnapshot;
  readonly actor: FeedbackActorSnapshot;
}): FeedbackCapabilities {
  const { feedback, actor } = input;
  const canView = actorCanViewFeedback(actor, feedback);
  const activeVisibleMember = canView && actor.status === "active";
  const admin = activeVisibleMember && actor.role === "admin";
  const creator = activeVisibleMember && actor.id === feedback.createdByUserId;
  const assignee = activeVisibleMember && actor.id === feedback.assigneeUserId;
  const assigneeOrAdmin = assignee || admin;
  const creatorOrAdmin = creator || admin;

  return {
    canView,
    canStart: assigneeOrAdmin && feedback.stage === "open",
    canSubmitVerification:
      assigneeOrAdmin && (feedback.stage === "open" || feedback.stage === "in_progress"),
    canAcceptVerification: creatorOrAdmin && feedback.stage === "pending_verification",
    canRejectVerification: creatorOrAdmin && feedback.stage === "pending_verification",
    canWithdraw: creatorOrAdmin && (feedback.stage === "open" || feedback.stage === "in_progress"),
    canReopen: creatorOrAdmin && feedback.stage === "closed",
    canEditReport: activeVisibleMember,
    canSetPriority: activeVisibleMember,
    canChangeAssignee: activeVisibleMember,
    canImportExport: activeVisibleMember,
  };
}

export function applyFeedbackTransition(
  context: FeedbackTransitionContext,
): FeedbackDomainResult<FeedbackTransitionOutcome> {
  const { feedback, actor, command, occurredAt, duplicateRelations } = context;
  const invariantErrors = validateFeedbackLifecycle({ feedback, duplicateRelations });
  if (invariantErrors.length > 0) {
    return failure(invariantErrors[0]);
  }
  if (command.expectedVersion !== feedback.version) {
    return failure(error("expected_version_mismatch", "Feedback version does not match command version."));
  }
  if (actor.status !== "active") {
    return failure(error("actor_inactive", "Only active actors can change feedback."));
  }
  if (!actorCanViewFeedback(actor, feedback)) {
    return failure(error("actor_out_of_scope", "Actor cannot access this feedback."));
  }

  const capabilities = deriveFeedbackCapabilities({ feedback, actor });

  switch (command.type) {
    case "start": {
      if (feedback.stage !== "open") {
        return invalidTransitionSource("Start requires open feedback.");
      }
      if (!capabilities.canStart) {
        return transitionForbidden("Only the assignee or an admin can start this feedback.");
      }
      return success({
        feedback: nextFeedback(feedback, {
          stage: "in_progress",
          resolution: null,
          closedAt: null,
          closedByUserId: null,
        }),
        activityType: "feedback.lifecycle.changed",
      });
    }

    case "submit_verification": {
      if (feedback.stage !== "open" && feedback.stage !== "in_progress") {
        return invalidTransitionSource("Verification submission requires active feedback.");
      }
      if (!capabilities.canSubmitVerification) {
        return transitionForbidden("Only the assignee or an admin can submit verification.");
      }
      if (
        command.resolution === "duplicate" &&
        (!command.duplicateTargetFeedbackId ||
          !hasDuplicateRelation(duplicateRelations, command.duplicateTargetFeedbackId))
      ) {
        return failure(
          error("duplicate_relation_required", "Duplicate verification needs an existing duplicate relation."),
        );
      }
      return success({
        feedback: nextFeedback(feedback, {
          stage: "pending_verification",
          resolution: command.resolution,
          closedAt: null,
          closedByUserId: null,
        }),
        activityType: "feedback.lifecycle.changed",
      });
    }

    case "accept_verification": {
      if (feedback.stage !== "pending_verification") {
        return invalidTransitionSource("Verification acceptance requires pending verification feedback.");
      }
      if (!capabilities.canAcceptVerification) {
        return transitionForbidden("Only the reporter or an admin can accept verification.");
      }
      const authorityError = creatorAuthorityError(feedback, actor, command);
      if (authorityError) {
        return failure(authorityError);
      }
      return success({
        feedback: nextFeedback(feedback, {
          stage: "closed",
          resolution: feedback.resolution,
          closedAt: occurredAt,
          closedByUserId: actor.id,
        }),
        activityType: "feedback.lifecycle.changed",
      });
    }

    case "reject_verification": {
      if (feedback.stage !== "pending_verification") {
        return invalidTransitionSource("Verification rejection requires pending verification feedback.");
      }
      if (!capabilities.canRejectVerification) {
        return transitionForbidden("Only the reporter or an admin can reject verification.");
      }
      const authorityError = creatorAuthorityError(feedback, actor, command);
      if (authorityError) {
        return failure(authorityError);
      }
      return success({
        feedback: nextFeedback(feedback, {
          stage: "in_progress",
          resolution: null,
          closedAt: null,
          closedByUserId: null,
        }),
        activityType: "feedback.lifecycle.changed",
      });
    }

    case "withdraw": {
      if (feedback.stage !== "open" && feedback.stage !== "in_progress") {
        return invalidTransitionSource("Withdrawal requires active feedback.");
      }
      if (!capabilities.canWithdraw) {
        return transitionForbidden("Only the reporter or an admin can withdraw feedback.");
      }
      const authorityError = creatorAuthorityError(feedback, actor, command);
      if (authorityError) {
        return failure(authorityError);
      }
      return success({
        feedback: nextFeedback(feedback, {
          stage: "closed",
          resolution: "not_needed",
          closedAt: occurredAt,
          closedByUserId: actor.id,
        }),
        activityType: "feedback.lifecycle.changed",
      });
    }

    case "reopen": {
      if (feedback.stage !== "closed") {
        return invalidTransitionSource("Reopen requires closed feedback.");
      }
      if (!capabilities.canReopen) {
        return transitionForbidden("Only the reporter or an admin can reopen feedback.");
      }
      const authorityError = creatorAuthorityError(feedback, actor, command);
      if (authorityError) {
        return failure(authorityError);
      }
      return success({
        feedback: nextFeedback(feedback, {
          stage: "open",
          resolution: null,
          closedAt: null,
          closedByUserId: null,
        }),
        activityType: "feedback.lifecycle.changed",
      });
    }
  }
}

export function canonicalizeFeedbackRelation(
  draft: FeedbackRelationDraft,
): FeedbackDomainResult<FeedbackRelationCanonicalForm> {
  if (draft.sourceFeedbackId === draft.targetFeedbackId) {
    return failure(error("invalid_relation", "Feedback cannot relate to itself."));
  }

  if (draft.type !== "related") {
    return success(draft);
  }

  const [sourceFeedbackId, targetFeedbackId] = [
    draft.sourceFeedbackId,
    draft.targetFeedbackId,
  ].sort();

  return success({
    type: draft.type,
    sourceFeedbackId,
    targetFeedbackId,
  });
}

function nextFeedback(
  feedback: FeedbackEntitySnapshot,
  changes: Pick<FeedbackEntitySnapshot, "stage" | "resolution"> & {
    readonly closedAt: string | null;
    readonly closedByUserId: string | null;
  },
): FeedbackEntitySnapshot {
  return {
    ...feedback,
    ...changes,
    version: feedback.version + 1,
  };
}

function actorCanViewFeedback(actor: FeedbackActorSnapshot, feedback: FeedbackEntitySnapshot): boolean {
  if (actor.status !== "active" || actor.teamId !== feedback.teamId) {
    return false;
  }
  if (actor.role === "admin" || actor.id === feedback.createdByUserId || actor.id === feedback.assigneeUserId) {
    return true;
  }
  return feedback.visibleUserIds ? feedback.visibleUserIds.includes(actor.id) : true;
}

function creatorAuthorityError(
  feedback: FeedbackEntitySnapshot,
  actor: FeedbackActorSnapshot,
  command: Extract<
    FeedbackTransitionInput,
    { type: "accept_verification" | "reject_verification" | "withdraw" | "reopen" }
  >,
): FeedbackDomainError | null {
  if (actor.id === feedback.createdByUserId) {
    return null;
  }
  if (actor.role !== "admin") {
    return error("forbidden", "Only the feedback reporter can perform this transition.");
  }
  if (!command.administrativeTakeover?.reason.trim()) {
    return error(
      "administrative_takeover_reason_required",
      "Admin takeover of a reporter transition requires a reason.",
    );
  }
  return null;
}

function hasDuplicateRelation(
  facts: FeedbackDuplicateRelationFacts | undefined,
  targetFeedbackId?: string,
): boolean {
  if (!facts?.duplicateTargetFeedbackIds?.length) {
    return false;
  }
  if (!targetFeedbackId) {
    return facts.duplicateTargetFeedbackIds.length > 0;
  }
  return facts.duplicateTargetFeedbackIds.includes(targetFeedbackId);
}

function transitionForbidden(message: string): FeedbackDomainFailure {
  return failure(error("forbidden", message));
}

function invalidTransitionSource(message: string): FeedbackDomainFailure {
  return failure(error("invalid_transition_source", message));
}

function success<T>(value: T): FeedbackDomainSuccess<T> {
  return { ok: true, value };
}

function failure(errorValue: FeedbackDomainError): FeedbackDomainFailure {
  return { ok: false, error: errorValue };
}

function error(code: FeedbackDomainErrorCode, message: string): FeedbackDomainError {
  return { code, message };
}
