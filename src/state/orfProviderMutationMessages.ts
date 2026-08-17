import { ApiError } from "./apiClient";
import { LocalSettlementResponseError, LocalSettlementUnavailableError } from "../services/localSettlementClient";

export function userMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "登录已过期，请重新登录";
    }

    if (error.status === 403) {
      return "只有管理员可以操作成员";
    }

    if (error.status === 409) {
      if (error.message === "Admin cannot delete self") {
        return "管理员不能删除自己";
      }

      if (error.message === "Admin cannot demote self") {
        return "管理员不能将自己降级为成员";
      }

      if (error.message === "Name already exists") {
        return "已存在同名成员";
      }

      if (error.message === "User already exists") {
        return "已存在同邮箱成员，请直接编辑已有成员";
      }

      if (error.message === "User is not disabled") {
        return "该用户当前不是停用状态";
      }

      if (error.message === "User is referenced by ORF records") {
        return "该成员已被 ORF 业务记录引用，不能删除，请改为停用";
      }

      if (error.message === "User login identity is not linked") {
        return "该成员还没有绑定登录身份，不能重置密码";
      }

      return error.message;
    }

    if (error.status === 400 && error.message === "Password must be at least 8 characters") {
      return "密码至少 8 位";
    }

    if (error.status === 404) {
      if (error.message === "Ory identity not found") {
        return "登录身份不存在，请先重新绑定账号";
      }

      return "用户不存在，已刷新成员列表";
    }

    if (error.status === 503 && error.message === "Ory admin URL is not configured") {
      return "修改或删除已绑定登录账号需要先配置 Ory 管理接口";
    }

    return error.message || fallback;
  }

  return fallback;
}

export function avatarMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "登录已过期，请重新登录";
    }

    if (error.status === 413) {
      return "头像图片过大，请压缩后再上传";
    }

    if (error.status === 415) {
      return "头像只支持 PNG、JPEG、GIF 或 WebP 图片";
    }

    if (error.status === 400) {
      return "头像图片文件无效";
    }

    if (error.status === 404) {
      return "当前用户不存在，请重新登录";
    }

    return error.message || fallback;
  }

  return fallback;
}

export function bountyMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "登录已过期，请重新登录";
    }

    if (error.status === 403) {
      return "你没有接受这个悬赏目标的权限";
    }

    if (error.status === 404) {
      return "悬赏目标不存在，已刷新数据";
    }

    if (error.status === 409) {
      if (error.message === "Objective already includes this challenger") {
        return "你已经是这个目标的挑战者";
      }

      if (error.message === "Challenge application already exists") {
        return "你已经申请过这个目标";
      }

      if (error.message === "Objective already recruited this challenger") {
        return "你已被征召，请直接接受挑战";
      }

      if (error.message === "Objective final due date is too close to start confirmation") {
        return "目标截止时间太近，不能接受征召";
      }

      if (
        error.message === "Objective is not open for challenge acceptance" ||
        error.message === "Objective is not open for challenge applications" ||
        error.message === "Objective status does not allow this operation"
      ) {
        return "目标状态已变化，请刷新后再试";
      }

      return error.message || "目标状态已变化，请刷新后再试";
    }

    return error.message || fallback;
  }

  return fallback;
}

export function commentMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    const isAttachmentMutation = fallback.includes("图片") || fallback.includes("附件");

    if (error.status === 401) {
      return "登录已过期，请重新登录";
    }

    if (error.status === 403) {
      return isAttachmentMutation ? "没有权限上传这个评论附件" : "只能编辑或删除自己的评论";
    }

    if (error.status === 404) {
      return "评论对象不存在，已刷新数据";
    }

    if (error.status === 413) {
      return "附件大小超过系统配置上限";
    }

    if (error.status === 415) {
      return "不支持这种附件类型";
    }

    if (error.status === 400) {
      return isAttachmentMutation ? "附件文件无效" : "评论内容不能为空";
    }

    return error.message || fallback;
  }

  return fallback;
}

export function businessMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "登录已过期，请重新登录";
    }

    if (error.status === 403) {
      return "没有执行这个操作的权限";
    }

    if (error.status === 404) {
      return "操作对象不存在，已刷新数据";
    }

    if (error.status === 409) {
      if (error.message === "Feedback owner must be an active member") {
        return "反馈处理人必须是当前可用成员";
      }
      if (error.message === "Objective must have at least one calibrated result before freezing") {
        return "目标至少需要一个已校准指标后才能冻结";
      }
      if (error.message === "Objective result points must be calibrated before freezing") {
        return "请先校准目标下所有指标积分，再完成对齐冻结";
      }
      if (error.message === "Objective is not open for reinforcement") {
        return "目标当前阶段不能加派挑战者";
      }
      if (error.message === "Objective already includes all reinforcement candidates") {
        return "选择的成员已经是目标挑战者";
      }
      if (error.message === "Metric execution completion is locked for this lifecycle state") {
        return "目标当前阶段不能勾选指标完成";
      }
      return error.message || "数据状态已变化，请刷新后再试";
    }

    if (error.status === 413) {
      return "附件过大，请压缩后再上传";
    }

    if (error.status === 415) {
      return "不支持这种附件类型";
    }

    if (error.status === 400) {
      if (error.message === "Objective must have at least one calibrated result before freezing") {
        return "目标至少需要一个已校准指标后才能冻结";
      }
      if (error.message === "Objective result points must be calibrated before freezing") {
        return "请先校准目标下所有指标积分，再完成对齐冻结";
      }
      if (error.message === "Objective alignment request is invalid") {
        return "对齐申请参数无效，请刷新后再试";
      }
      if (error.message === "Reestimate due time is required") {
        return "请先设置新的重估截止时间";
      }
      if (error.message === "Reestimate reason is required") {
        return "请先填写重新重估理由";
      }
      if (error.message === "Reestimate due time is invalid") {
        return "新的重估截止时间无效";
      }
      if (error.message === "Reestimate due time must be in the future") {
        return "新的重估截止时间必须晚于当前时间";
      }
      if (error.message === "Reestimate due time must not exceed objective final deadline") {
        return "新的重估截止时间不能超过目标验收截止时间";
      }
      if (error.message === "Objective reinforcement candidates are invalid") {
        return "加派成员必须是当前可用普通成员";
      }
    }

    return error.message || fallback;
  }

  return fallback;
}

export function localSettlementMutationFailureMessage(error: unknown, fallback: string) {
  if (error instanceof LocalSettlementUnavailableError) {
    return `匿名互评结算服务不可用，请联系管理员确认 ORF 代理和共享结算服务状态：${error.baseUrl}`;
  }

  if (error instanceof LocalSettlementResponseError) {
    return `共享匿名互评结算服务返回错误：${error.message}`;
  }

  return businessMutationFailureMessage(error, fallback);
}
