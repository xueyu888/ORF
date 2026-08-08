import { createElement, type ComponentType } from "react";
import {
  feedbackCreateBasePath,
  feedbackCreatePath,
  feedbackDetailPathTemplate,
  feedbackIssuePath,
  feedbackLabelsPath,
  feedbackListPath,
  feedbackRootPath,
} from "../contracts/links";
import { FeedbackWebHostProvider, type FeedbackWebHost } from "../web/runtime";
import { FeedbackCreatePage } from "../web/pages/FeedbackCreatePage";
import { FeedbackInboxPage } from "../web/pages/FeedbackInboxPage";
import { FeedbackIssuePage } from "../web/pages/FeedbackIssuePage";
import { FeedbackLabelsPage } from "../web/pages/FeedbackLabelsPage";

export interface FeedbackWebRouteContribution {
  readonly id: string;
  readonly path: string;
  readonly routePath: string;
  readonly title: string;
}

export interface FeedbackWebNavigationContribution {
  readonly label: "反馈";
  readonly path: "/feedback";
}

export interface FeedbackWebContributionDefinition {
  readonly id: "feedback";
  readonly navigation: FeedbackWebNavigationContribution;
  readonly routes: {
    readonly inbox: FeedbackWebRouteContribution;
    readonly create: FeedbackWebRouteContribution;
    readonly labels: FeedbackWebRouteContribution;
    readonly detail: FeedbackWebRouteContribution;
  };
  readonly actions: {
    readonly createPath: "/feedback/new";
  };
  breadcrumb(pathname: string): string | null;
}

export interface FeedbackWebContribution extends FeedbackWebContributionDefinition {
  readonly pages: {
    readonly Create: ComponentType;
    readonly Detail: ComponentType;
    readonly Inbox: ComponentType;
    readonly Labels: ComponentType;
  };
}

export const feedbackWebContribution: FeedbackWebContributionDefinition = {
  id: "feedback",
  navigation: {
    label: "反馈",
    path: feedbackRootPath,
  },
  routes: {
    inbox: {
      id: "feedback.inbox",
      path: feedbackRootPath,
      routePath: "feedback",
      title: "反馈",
    },
    create: {
      id: "feedback.create",
      path: feedbackCreateBasePath,
      routePath: "feedback/new",
      title: "新建反馈",
    },
    labels: {
      id: "feedback.labels",
      path: feedbackLabelsPath,
      routePath: "feedback/labels",
      title: "标签",
    },
    detail: {
      id: "feedback.detail",
      path: feedbackDetailPathTemplate,
      routePath: "feedback/:feedbackId",
      title: "详情",
    },
  },
  actions: {
    createPath: feedbackCreateBasePath,
  },
  breadcrumb(pathname: string) {
    if (/^\/feedback\/new\/?$/.test(pathname)) {
      return "反馈 / 新建反馈";
    }
    if (/^\/feedback\/labels\/?$/.test(pathname)) {
      return "反馈 / 标签";
    }
    if (/^\/feedback\/[^/]+\/?$/.test(pathname)) {
      return "反馈 / 详情";
    }
    if (/^\/feedback\/?$/.test(pathname)) {
      return "反馈";
    }
    return null;
  },
};

export function createFeedbackWebContribution(host: FeedbackWebHost): FeedbackWebContribution {
  const withHost = (Page: ComponentType): ComponentType => function FeedbackHostedPage() {
    return createElement(FeedbackWebHostProvider, { host, children: createElement(Page) });
  };

  return {
    ...feedbackWebContribution,
    pages: {
      Create: withHost(FeedbackCreatePage),
      Detail: withHost(FeedbackIssuePage),
      Inbox: withHost(FeedbackInboxPage),
      Labels: withHost(FeedbackLabelsPage),
    },
  };
}

export function isFeedbackPath(pathname: string) {
  return pathname === feedbackRootPath || pathname.startsWith(`${feedbackRootPath}/`);
}

export { feedbackCreatePath, feedbackIssuePath, feedbackLabelsPath, feedbackListPath, feedbackRootPath };
export { canCreateTeamFeedback } from "../web/model/capabilities";
export {
  feedbackIssueBodyPreview,
  feedbackIssueHref,
  feedbackIssueIdFromHref,
  feedbackIssueIdsFromText,
  feedbackIssueMarkdownLabel,
  feedbackIssueMarkdownLink,
  formatPastedFeedbackLinks,
  isFeedbackIssueOpen,
} from "../web/model/issue";
export {
  feedbackCauseGroupForCategory,
  feedbackCauseGroupsForCategories,
  feedbackMatchesCauseGroup,
  teamFeedbackCauseOptions,
  type TeamFeedbackCauseCategory,
} from "../web/model/categories";
export {
  buildFeedbackIssueCurrentViewCsv,
  feedbackIssueCsvExportFileName,
} from "../web/transfer/currentViewCsv";
export {
  buildFeedbackIssueListItems,
  feedbackIssueAssigneeOptions,
  feedbackIssueAuthorOptions,
  feedbackIssueLabelOptions,
  feedbackIssueListCountsForFilters,
  filterFeedbackIssueListItems,
  type FeedbackIssueListFilters,
  type FeedbackIssueListItem,
  type FeedbackIssueListState,
} from "../web/model/issueList";
export {
  clearStoredFeedbackIssueListFilterParams,
  feedbackIssueListFilterParamsFromPreferenceRecord,
  feedbackIssueListFilterPreferenceKey,
  feedbackIssueListFilterPreferenceRecordFromSearchParams,
  feedbackIssueListFilterQueryFromSearchParams,
  feedbackIssueListUrlStateFromSearchParams,
  parseStoredFeedbackIssueListFilterParams,
  readStoredFeedbackIssueListFilterParams,
  type FeedbackIssueListUrlState,
} from "../web/model/issueListViewState";
export {
  feedbackIssueLabelIndexItems,
  feedbackIssueLabels,
  feedbackIssueLinkedFeedback,
  type FeedbackIssueLabelIndexItem,
  type FeedbackIssueLabelIndexSortKey,
} from "../web/model/issueMetadata";
export {
  feedbackAssigneeOptionsFromUsers,
  ensureFeedbackAssigneeOption,
  mergeFeedbackAssigneeOptions,
  type FeedbackAssigneeOption,
} from "../web/model/assigneeOptions";
export {
  useFeedbackAssigneeOptions,
  useFeedbackIssueDetailReadModel,
  useFeedbackIssueReadModel,
} from "../web/hooks";
export type {
  FeedbackCommentDraft,
  FeedbackCommentDraftMode,
  FeedbackCommentMentionUser,
  FeedbackImagePreview,
  FeedbackWebHost,
  FeedbackWebSession,
} from "../web/runtime";
export type {
  FeedbackIssueReadModelData,
  FeedbackSubscription,
  FeedbackSubscriptionMode,
  FeedbackWebActivityItem,
  FeedbackWebAttachment,
  FeedbackWebCommentMessage,
  FeedbackWebCommentThread,
  FeedbackWebIssue,
  FeedbackWebProject,
  FeedbackWebRelation,
  FeedbackWebUser,
  FeedbackWebUserSummary,
} from "../web/types";
