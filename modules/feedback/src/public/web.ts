import { createElement, type ComponentType } from "react";
import type {
  OrfWebModuleCommandItem,
  OrfWebModuleCommandSearch,
  OrfWebModuleContribution,
  OrfWebModuleRoute,
  OrfWebModuleRouteDefinition,
} from "@orf/module-protocol";
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

export interface FeedbackWebNavigationContribution {
  readonly label: "反馈";
  readonly path: "/feedback";
}

export type FeedbackWebCommandItem = OrfWebModuleCommandItem & {
  readonly type: "Feedback";
};

type FeedbackWebCommandUser = Pick<FeedbackWebUser, "role" | "status">;
type FeedbackWebCommandContribution = OrfWebModuleCommandSearch<FeedbackWebCommandUser>;
type FeedbackWebRouteContribution = OrfWebModuleRouteDefinition;

export interface FeedbackWebContributionDefinition extends Omit<OrfWebModuleContribution<FeedbackWebCommandUser>, "routes"> {
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
}

export interface FeedbackWebContribution extends Omit<FeedbackWebContributionDefinition, "routes"> {
  readonly routes: readonly OrfWebModuleRoute[];
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

let feedbackWebStyleLoaded = false;

function loadFeedbackWebStyle() {
  if (feedbackWebStyleLoaded || typeof document === "undefined") {
    return;
  }
  feedbackWebStyleLoaded = true;
  void import("../web/feedback.css");
}

export function createFeedbackWebContribution(host: FeedbackWebHost): FeedbackWebContribution {
  loadFeedbackWebStyle();

  const withHost = (Page: ComponentType): ComponentType => function FeedbackHostedPage() {
    return createElement(FeedbackWebHostProvider, { host, children: createElement(Page) });
  };

  return {
    ...feedbackWebContribution,
    routes: [
      { ...feedbackWebContribution.routes.inbox, Page: withHost(FeedbackInboxPage) },
      { ...feedbackWebContribution.routes.create, Page: withHost(FeedbackCreatePage) },
      { ...feedbackWebContribution.routes.labels, Page: withHost(FeedbackLabelsPage) },
      { ...feedbackWebContribution.routes.detail, Page: withHost(FeedbackIssuePage) },
    ],
  };
}

export function isFeedbackPath(pathname: string) {
  return pathname === feedbackRootPath || pathname.startsWith(`${feedbackRootPath}/`);
}

export { feedbackCreatePath, feedbackIssuePath, feedbackLabelsPath, feedbackListPath, feedbackRootPath };
export {
  FeedbackWebApiError,
  getFeedbackReferenceCard,
  getFeedbackReferences,
} from "../web/api";
export type { FeedbackReferenceSummary } from "../web/types";
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
  useFeedbackDashboardSummary,
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
  FeedbackDashboardSummary,
  FeedbackDashboardSummaryItem,
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
