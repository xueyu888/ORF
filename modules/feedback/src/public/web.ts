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
import { getFeedbackReferences } from "../web/api";
import { FeedbackCreatePage } from "../web/pages/FeedbackCreatePage";
import { FeedbackInboxPage } from "../web/pages/FeedbackInboxPage";
import { FeedbackIssuePage } from "../web/pages/FeedbackIssuePage";
import { FeedbackLabelsPage } from "../web/pages/FeedbackLabelsPage";
import type { FeedbackWebUser } from "../web/types";

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

export interface FeedbackWebCommandItem {
  readonly label: string;
  readonly path: string;
  readonly searchText: string;
  readonly type: "Feedback";
}

export interface FeedbackWebCommandSearchContext {
  readonly currentUser: Pick<FeedbackWebUser, "role" | "status"> | null;
}

export interface FeedbackWebCommandSearchOptions {
  readonly limit?: number;
  readonly signal?: AbortSignal;
}

export interface FeedbackWebCommandContribution {
  readonly minQueryLength?: number;
  readonly canSearch?: (context: FeedbackWebCommandSearchContext) => boolean;
  search(query: string, options: FeedbackWebCommandSearchOptions): Promise<readonly FeedbackWebCommandItem[]>;
}

export interface FeedbackWebContributionDefinition {
  readonly id: "feedback";
  readonly navigation: FeedbackWebNavigationContribution;
  readonly commands: readonly FeedbackWebCommandContribution[];
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
  preload(): Promise<void>;
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
  commands: [
    {
      minQueryLength: 2,
      canSearch({ currentUser }) {
        return currentUser?.status === "active" || currentUser?.role === "admin";
      },
      async search(query, options) {
        const feedback = await getFeedbackReferences({
          limit: options.limit,
          query,
          signal: options.signal,
        });
        return feedback.map((item) => ({
          label: item.title,
          path: feedbackIssuePath(item.id),
          searchText: `${item.id} ${item.title}`,
          type: "Feedback",
        }));
      },
    },
  ],
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
  async preload() {
    return undefined;
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
export {
  FeedbackWebApiError,
  getFeedbackReferenceCard,
} from "../web/api";
export { canCreateTeamFeedback } from "../web/model/capabilities";
export {
  feedbackImpactLabel,
  feedbackLifecycleLabel,
  feedbackPriorityLabel,
} from "../contracts/labels";
export {
  feedbackIssueBodyPreview,
  feedbackIssueDisplayId,
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
  feedbackIssueListDefaultPageLimit,
  feedbackIssueLabelOptions,
  feedbackIssueListCountsForFilters,
  filterFeedbackIssueListItems,
  type FeedbackIssueListFilters,
  type FeedbackIssueListItem,
  type FeedbackIssueListState,
} from "../contracts/issueList";
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
  feedbackIssueListPageQuery,
  mergeFeedbackIssueListReadModelPages,
} from "../web/model/issueListPagination";
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
  useFeedbackIssueListReadModel,
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
  FeedbackReferenceCardData,
  FeedbackReferenceCardQuery,
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
