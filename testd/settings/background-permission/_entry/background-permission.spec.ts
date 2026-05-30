/**
 * @file testd/settings/background-permission/_entry/background-permission.spec.ts
 *
 * StepSpec for background permission setting test.
 * Updated to reflect current UI: settings entry is inside the user menu dropdown.
 * Flow: open user menu → click personal settings → navigate to background permission → configure.
 */

import { StepSpec } from '@testd/types';
import {
  openUserMenu,
  clickPersonalSettings,
  openBackgroundPermissionTab,
  setPermissionOptions,
  savePermissionSettings,
} from '../_operators/background-permission';

export const spec: StepSpec[] = [
  {
    id: 'background-permission-001',
    description: 'Open user menu',
    action: openUserMenu,
    source: {
      caseStepId: 'background-permission-001',
      method: 'operator',
    },
    expect: {
      // e.g., user menu dropdown visible, personal settings link present
    },
  },
  {
    id: 'background-permission-002',
    description: 'Click personal settings',
    action: clickPersonalSettings,
    source: {
      caseStepId: 'background-permission-002',
      method: 'operator',
    },
    expect: {
      // e.g., navigated to /settings
    },
  },
  {
    id: 'background-permission-003',
    description: 'Open background permission tab',
    action: openBackgroundPermissionTab,
    source: {
      caseStepId: 'background-permission-003',
      method: 'operator',
    },
    expect: {
      // e.g., background permission section visible
    },
  },
  {
    id: 'background-permission-004',
    description: 'Set permission options',
    action: (ctx) => setPermissionOptions(ctx, { allowBackground: true }),
    source: {
      caseStepId: 'background-permission-004',
      method: 'operator',
    },
    expect: {
      // e.g., options selected
    },
  },
  {
    id: 'background-permission-005',
    description: 'Save permission settings',
    action: savePermissionSettings,
    source: {
      caseStepId: 'background-permission-005',
      method: 'operator',
    },
    expect: {
      // e.g., success toast, settings persisted
    },
  },
];

export default spec;