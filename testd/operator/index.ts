/**
 * testd/operator/index.ts
 *
 * Barrel file – re-exports all semantic operators for easy single-import access.
 *
 * Convention:
 *   Every operator module in this directory exposes named functions that
 *   encapsulate a user-facing business step (e.g. filling a form, clicking
 *   a menu item).  Case files import { … } from '../operator' instead of
 *   reaching into individual DOM details.
 *
 * When adding or refactoring an operator:
 *   - Keep the function signature aligned with its StepSpec (document → case.ts)
 *   - Update only here and in the implementing file – no changes needed in case specs.
 */

export * from './account.operators';
export * from './settings.operators';
export * from './bounties.operators';
export * from './tasks.operators';

/* ──────────────────────────────────────────────────────────────────────────────
 * Future operators (e.g. notifications, teams, search) should be added here as
 * separate module exports.  Do not re-export submodules that are not pure
 * semantic operators (e.g. helpers, types, constants).
 * ──────────────────────────────────────────────────────────────────────────── */