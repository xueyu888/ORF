import { createBackgroundSettingsOperators } from "../_support/background-settings.operators";
import type { BackgroundPersonalCaseData } from "./_support/background-permission.context";

export const backgroundPersonalOperators = createBackgroundSettingsOperators<BackgroundPersonalCaseData>();
