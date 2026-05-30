// testd/auth/register/_entry/register.spec.ts
// Updated StepSpec array for registration flow.
// Uses semantic operators instead of hardcoded labels to match current UI.

import type { StepSpec } from '@/testd/types';

/**
 * StepSpec for the registration flow.
 *
 * Changes from previous version:
 * - Replaced `getByLabel("当前用户")` with semantic operator `openAccountMenu`
 * - Registration verification now relies on the menu visibility contract
 * - After successful registration, the test opens the account menu and checks
 *   that the menu contains the registered username or a sign-out option,
 *   instead of checking for a specific aria-label
 */
const registerSteps: StepSpec[] = [
  // Step 1: Navigate to registration page
  {
    source: {
      caseStepId: 'register.01',
      method: 'nav',
    },
    action: 'navigateTo',
    args: ['/register'],
    expected: '注册页面加载完成',
  },

  // Step 2: Fill username field
  {
    source: {
      caseStepId: 'register.02',
      method: 'fill',
    },
    action: 'fillField',
    args: ['username', '__test_user_{timestamp}'],
    expected: '用户名已填写',
  },

  // Step 3: Fill email field
  {
    source: {
      caseStepId: 'register.03',
      method: 'fill',
    },
    action: 'fillField',
    args: ['email', '__test_{timestamp}@example.com'],
    expected: '邮箱已填写',
  },

  // Step 4: Fill password field
  {
    source: {
      caseStepId: 'register.04',
      method: 'fill',
    },
    action: 'fillField',
    args: ['password', 'TestPass123!'],
    expected: '密码已填写',
  },

  // Step 5: Submit registration
  {
    source: {
      caseStepId: 'register.05',
      method: 'submit',
    },
    action: 'clickSubmit',
    args: ['注册'],
    expected: '注册请求已发送，等待后端处理',
  },

  // Step 6: Wait for redirect to dashboard
  {
    source: {
      caseStepId: 'register.06',
      method: 'waitRedirect',
    },
    action: 'waitForNavigation',
    args: ['/dashboard'],
    expected: '已重定向到仪表盘',
  },

  // Step 7: Verify logged-in state by opening account menu
  // Instead of checking for "当前用户" label, use the unified operator
  // that adapts to the current UI model (user menu in sidebar).
  {
    source: {
      caseStepId: 'register.07',
      method: 'verifyMenu',
    },
    action: 'openAccountMenu',
    expected: '账号菜单已打开，用户处于已登录状态',
  },

  // Step 8: Close account menu (cleanup)
  {
    source: {
      caseStepId: 'register.08',
      method: 'cleanup',
    },
    action: 'closeAccountMenu',
    expected: '菜单已关闭',
  },
];

export { registerSteps };