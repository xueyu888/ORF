import { useMemo } from "react";
import { apiJson, apiRequest } from "./apiClient";
import { businessMutationFailureMessage } from "./orfProviderMutationMessages";
import type { Task, TaskChecklistItem, TaskStatus } from "../types/orf";

type CreateTaskResponse = { task: Task };
type CreateChecklistItemResponse = { item: TaskChecklistItem };
type Placement = "before" | "after";
export type MoveTaskInput = { taskId: string; objectiveId: string; referenceTaskId?: string; placement?: Placement };
export type MoveSubtaskInput = { itemId: string; fromTaskId: string; toTaskId: string; referenceItemId?: string; placement?: Placement };

interface TaskActionOptions {
  notify: (message: string) => void;
  refreshTaskManagementData: () => Promise<void>;
  refreshTaskManagementDataAfterCreate: (failureMessage: string) => void;
}

export function useOrfProviderTaskActions({
  notify,
  refreshTaskManagementData,
  refreshTaskManagementDataAfterCreate,
}: TaskActionOptions) {
  return useMemo(
    () => ({
      createTask: async (input: Pick<Task, "title" | "description" | "assignee" | "priority" | "linkedObjectiveId"> & Partial<Pick<Task, "dueDate" | "tags" | "checklist">>) => {
        try {
          const data = await apiJson<CreateTaskResponse>("/api/tasks", {
            method: "POST",
            body: JSON.stringify(input),
          });
          notify("行动项已创建");
          refreshTaskManagementDataAfterCreate("行动项已创建，但数据刷新失败");
          return data.task;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "行动项创建失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return null;
        }
      },
      updateTaskStatus: (taskId: string, status: TaskStatus) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("行动项状态已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "行动项状态更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      setTaskCompletion: async (taskId: string, done: boolean) => {
        try {
          await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/completion`, {
            method: "PATCH",
            body: JSON.stringify({ done }),
          });
          await refreshTaskManagementData();
          notify("行动项完成状态已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "行动项完成状态更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateTaskChecklistItem: async (taskId: string, itemId: string, done: boolean) => {
        try {
          await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, {
            method: "PATCH",
            body: JSON.stringify({ done }),
          });
          await refreshTaskManagementData();
          notify("子行动项完成状态已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "子行动项完成状态更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateTaskTitle: async (taskId: string, title: string) => {
        try {
          await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, {
            method: "PATCH",
            body: JSON.stringify({ title }),
          });
          await refreshTaskManagementData();
          notify("行动项已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "行动项更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      updateTaskChecklistItemLabel: async (taskId: string, itemId: string, label: string) => {
        try {
          await apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}/label`, {
            method: "PATCH",
            body: JSON.stringify({ label }),
          });
          await refreshTaskManagementData();
          notify("子行动项已更新");
          return true;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "子行动项更新失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return false;
        }
      },
      createTaskChecklistItem: async (taskId: string, input = {}) => {
        try {
          const data = await apiJson<CreateChecklistItemResponse>(`/api/tasks/${encodeURIComponent(taskId)}/checklist`, {
            method: "POST",
            body: JSON.stringify(input),
          });
          notify("子行动项已添加");
          refreshTaskManagementDataAfterCreate("子行动项已添加，但数据刷新失败");
          return data.item;
        } catch (error) {
          notify(businessMutationFailureMessage(error, "子行动项添加失败"));
          void refreshTaskManagementData().catch(() => undefined);
          return null;
        }
      },
      moveTask: (input: MoveTaskInput) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(input.taskId)}/move`, {
          method: "PATCH",
          body: JSON.stringify({ objectiveId: input.objectiveId, referenceTaskId: input.referenceTaskId, placement: input.placement }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("行动项位置已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "行动项位置更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      moveTaskChecklistItem: (input: MoveSubtaskInput) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(input.fromTaskId)}/checklist/${encodeURIComponent(input.itemId)}/move`, {
          method: "PATCH",
          body: JSON.stringify({ toTaskId: input.toTaskId, referenceItemId: input.referenceItemId, placement: input.placement }),
        })
          .then(refreshTaskManagementData)
          .then(() => notify("子行动项位置已更新"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "子行动项位置更新失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      deleteTask: (taskId: string) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(taskId)}`, { method: "DELETE" })
          .then(refreshTaskManagementData)
          .then(() => notify("行动项已删除"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "行动项删除失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
      deleteTaskChecklistItem: (taskId: string, itemId: string) => {
        void apiRequest(`/api/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}`, { method: "DELETE" })
          .then(refreshTaskManagementData)
          .then(() => notify("子行动项已删除"))
          .catch((error) => {
            notify(businessMutationFailureMessage(error, "子行动项删除失败"));
            void refreshTaskManagementData().catch(() => undefined);
          });
      },
    }),
    [notify, refreshTaskManagementData, refreshTaskManagementDataAfterCreate],
  );
}
