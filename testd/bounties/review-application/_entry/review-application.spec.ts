// File: testd/bounties/review-application/_entry/review-application.spec.ts
// Purpose: StepSpec array for review-application test
// Updated: Added fill_application_reason step to match current UI requirement

import { StepSpec } from 'testd/typings'; // adjust import path as needed

export const stepSpecs: StepSpec[] = [
  {
    id: 'navigate_to_challenge',
    action: '打开挑战详情页',
    source: {
      caseStepId: 'navigate_to_challenge',
      method: 'goto'
    }
  },
  {
    id: 'open_apply_modal',
    action: '点击申请挑战按钮',
    source: {
      caseStepId: 'open_apply_modal',
      method: 'click'
    },
    target: { selector: 'button:has-text("申请挑战")' }
  },
  // NEW STEP: fill application reason before confirming
  {
    id: 'fill_application_reason',
    action: '填写申请理由',
    source: {
      caseStepId: 'fill_application_reason',
      method: 'fillIn'
    },
    target: { selector: 'textarea[aria-label="申请理由"]' },
    value: '我具备完成该挑战所需的能力和经验，期待参与。'
  },
  {
    id: 'confirm_application',
    action: '提交申请',
    source: {
      caseStepId: 'confirm_application',
      method: 'click'
    },
    target: { selector: 'button:has-text("确认申请")' },
    waitForNetwork: {
      method: 'POST',
      urlPattern: '/api/objectives/:id/challenge-applications'
    }
  },
  {
    id: 'verify_success_toast',
    action: '验证申请成功提示',
    source: {
      caseStepId: 'verify_success_toast',
      method: 'waitForSelector'
    },
    target: { selector: 'text=申请已提交' }
  }
];