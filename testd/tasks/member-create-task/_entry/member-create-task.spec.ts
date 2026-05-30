// testd/tasks/member-create-task/_entry/member-create-task.spec.ts

import { StepSpec } from '../../../../testd-doc/types';
import {
  navigateToUserTaskList,
  memberCreateTask,
  memberAddSubTaskAndWaitForEditor,
} from '../../../operators/member-task-operators';

/**
 * Member creates a task and then adds a sub‑task.
 *
 * StepSpec array reflects the current UI:
 * - uses updated operator for sub‑task creation (handles editor wait)
 * - each step retains its original `caseStepId` and `method` for traceability
 */
export const steps: StepSpec[] = [
  {
    source: {
      caseStepId: 'member-create-task.step-01',
      method: 'navigateToUserTaskList',
    },
    description: 'Navigate to the user task list page',
    action: () => navigateToUserTaskList(),
  },
  {
    source: {
      caseStepId: 'member-create-task.step-02',
      method: 'memberCreateTask',
    },
    description: 'Create a new task as a member',
    action: () => memberCreateTask(),
  },
  {
    source: {
      caseStepId: 'member-create-task.step-03',
      method: 'memberAddSubTaskAndWaitForEditor',
    },
    description:
      'Add a sub‑task to the created task and wait for the inline editor to appear',
    action: () => memberAddSubTaskAndWaitForEditor(),
  },
];