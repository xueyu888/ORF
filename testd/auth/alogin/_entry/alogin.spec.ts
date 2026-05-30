// testd/auth/alogin/_entry/alogin.spec.ts
// Production-grade test spec for account login entry using operators

import { StepSpec } from '../../../../testd-doc/types'; // adjust path as needed
import { OPERATORS } from '../../../../testd-doc/operators'; // common operator definitions

/**
 * Spec: Account Login Entry
 * Aligns with new account entry operator (user menu).
 * Steps correspond to business intent; DOM details delegated to operators.
 */
export const spec: StepSpec[] = [
  // === Phase: Authentication ===
  {
    action: 'navigate',
    target: '/login',
    source: {
      caseStepId: 'alogin-step-1',
      method: 'navigateToLogin',
    },
    description: 'Navigate to login page',
  },
  {
    action: 'fill',
    target: '#email',
    value: process.env.TEST_USER_EMAIL || 'test@example.com',
    source: {
      caseStepId: 'alogin-step-2',
      method: 'fillEmail',
    },
    description: 'Enter email',
  },
  {
    action: 'fill',
    target: '#password',
    value: process.env.TEST_USER_PASSWORD || 'test-password',
    source: {
      caseStepId: 'alogin-step-3',
      method: 'fillPassword',
    },
    description: 'Enter password',
  },
  {
    action: 'click',
    target: 'button[type="submit"]',
    source: {
      caseStepId: 'alogin-step-4',
      method: 'submitLogin',
    },
    description: 'Click login button',
  },
  {
    action: 'waitForNavigation',
    target: '/dashboard', // adjust based on app
    source: {
      caseStepId: 'alogin-step-5',
      method: 'waitForDashboard',
    },
    description: 'Wait for dashboard after login',
  },

  // === Phase: Account entry verification (new operator) ===
  {
    action: 'invokeOperator',
    target: OPERATORS.openUserMenu, // operator name, resolved in test engine
    source: {
      caseStepId: 'alogin-step-6',
      method: 'openUserMenu',
    },
    description: 'Open user menu (old label "当前用户" replaced by dropdown trigger)',
  },

  // Verify menu is visible after operator executes
  {
    action: 'assertVisible',
    target: '[data-testid="user-menu-dropdown"]', // common testid, adjust to actual
    source: {
      caseStepId: 'alogin-step-7',
      method: 'assertUserMenuVisible',
    },
    description: 'Assert user menu dropdown is displayed',
  },

  // Optionally verify settings entry within menu (routing test)
  {
    action: 'invokeOperator',
    target: OPERATORS.clickSettingsInMenu,
    source: {
      caseStepId: 'alogin-step-8',
      method: 'clickSettingsInMenu',
    },
    description: 'Navigate to personal settings via user menu (new path)',
  },

  // Verify settings page loaded
  {
    action: 'assertVisible',
    target: 'h1:has-text("个人设置")', // adjust to actual heading
    source: {
      caseStepId: 'alogin-step-9',
      method: 'assertSettingsPage',
    },
    description: 'Assert personal settings page is displayed',
  },
];

// Optional: export a helper to merge spec with context if needed
export default spec;