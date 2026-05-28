import { createBackgroundSettingsOperators } from "../_support/background-settings.operators";
import type { BackgroundPermissionCaseData } from "./_support/background-permission.context";

export const backgroundPermissionOperators = createBackgroundSettingsOperators<BackgroundPermissionCaseData>();
