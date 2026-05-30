/**
 * @file mlogin.spec.ts
 * @description Mobile login flow – StepSpec definitions.
 * All steps reference semantic operators (see testd/operators/auth).
 * Changes reflect current UI model: account menu via "用户菜单" accessible name.
 */

import { StepSpec } from '../../../types/spec';

const mloginSteps: StepSpec[] = [
  // ============================================================
  // 1. Navigate to login page (mobile)
  // ============================================================
  {
    id: 'mlogin_navigate',
    action: 'navigate',
    target: '/auth/mlogin',
    source: {
      caseStepId: 'mlogin.entry.step.navigate',
      method: 'browser.goto',
    },
    description: 'Navigate to mobile login page',
  },

  // ============================================================
  // 2. Input phone number
  // ============================================================
  {
    id: 'mlogin_input_phone',
    action: 'type',
    target: 'input[name="phone"]',
    value: '${testPhone}',
    source: {
      caseStepId: 'mlogin.entry.step.inputPhone',
      method: 'operator.fillPhoneInput',
    },
    description: 'Enter phone number into the phone field',
  },

  // ============================================================
  // 3. Request verification code
  // ============================================================
  {
    id: 'mlogin_request_code',
    action: 'click',
    target: 'button:has-text("获取验证码")',
    source: {
      caseStepId: 'mlogin.entry.step.requestCode',
      method: 'operator.requestVerificationCode',
    },
    description: 'Click the "Get Code" button to send SMS',
  },

  // ============================================================
  // 4. Input verification code
  // ============================================================
  {
    id: 'mlogin_input_code',
    action: 'type',
    target: 'input[name="code"]',
    value: '${testCode}',
    source: {
      caseStepId: 'mlogin.entry.step.inputCode',
      method: 'operator.fillCodeInput',
    },
    description: 'Enter the verification code from SMS',
  },

  // ============================================================
  // 5. Submit login
  // ============================================================
  {
    id: 'mlogin_submit',
    action: 'click',
    target: 'button[type="submit"]',
    source: {
      caseStepId: 'mlogin.entry.step.submit',
      method: 'operator.submitLogin',
    },
    description: 'Click login submit button',
  },

  // ============================================================
  // 6. Wait for successful login (URL / cookie / session)
  // ============================================================
  {
    id: 'mlogin_verify_login',
    action: 'waitForURL',
    target: '/',
    timeout: 10000,
    source: {
      caseStepId: 'mlogin.entry.step.verifyLogin',
      method: 'operator.waitForLoginSuccess',
    },
    description: 'Wait for redirect to home page after successful login',
  },

  // ============================================================
  // 7. Open account menu – updated accessible name
  //    Previous test used getByLabel("当前用户") which no longer
  //    matches. New operator uses accessible name "用户菜单".
  // ============================================================
  {
    id: 'mlogin_open_account_menu',
    action: 'click',
    target: 'button[aria-label="用户菜单"]',
    source: {
      caseStepId: 'mlogin.entry.step.openAccountMenu',
      method: 'operator.openAccountMenu',
    },
    description: 'Open the user account menu (accessible name: 用户菜单)',
  },

  // ============================================================
  // 8. Verify account menu is visible
  // ============================================================
  {
    id: 'mlogin_verify_menu_visible',
    action: 'waitForSelector',
    target: 'nav[aria-label="用户菜单面板"]',
    timeout: 5000,
    source: {
      caseStepId: 'mlogin.entry.step.verifyMenuVisible',
      method: 'operator.waitForAccountMenuPanel',
    },
    description: 'Verify the account menu dropdown panel is displayed',
  },

  // ============================================================
  // 9. Navigate to personal settings (from menu)
  // ============================================================
  {
    id: 'mlogin_go_to_settings',
    action: 'click',
    target: 'a[aria-label="个人设置"]',
    source: {
      caseStepId: 'mlogin.entry.step.goToSettings',
      method: 'operator.navigateToPersonalSettings',
    },
    description: 'Click "个人设置" in account menu to enter settings',
  },

  // ============================================================
  // 10. Verify settings page loaded
  // ============================================================
  {
    id: 'mlogin_verify_settings',
    action: 'waitForURL',
    target: '/settings',
    timeout: 10000,
    source: {
      caseStepId: 'mlogin.entry.step.verifySettings',
      method: 'operator.waitForSettingsPage',
    },
    description: 'Confirm navigation to /settings succeeded',
  },
];

export default mloginSteps;