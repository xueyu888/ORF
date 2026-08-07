import {
  feedbackCreateBasePath,
  feedbackCreatePath,
  feedbackDetailPathTemplate,
  feedbackIssuePath,
  feedbackLabelsPath,
  feedbackListPath,
  feedbackRootPath,
} from "../contracts/links";

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

export interface FeedbackWebContribution {
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

export const feedbackWebContribution: FeedbackWebContribution = {
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

export function isFeedbackPath(pathname: string) {
  return pathname === feedbackRootPath || pathname.startsWith(`${feedbackRootPath}/`);
}

export { feedbackCreatePath, feedbackIssuePath, feedbackListPath };
