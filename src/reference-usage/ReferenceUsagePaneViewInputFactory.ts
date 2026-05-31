import type { App } from "obsidian";
import type { BiblePluginLocale } from "../i18n/I18n";
import { t } from "../i18n/I18n";
import type { ReferenceUsagePaneViewInput } from "../ui/ReferenceUsagePaneView";
import { openReferenceUsageResult } from "./ReferenceUsageResultOpening";

export type ReferenceUsagePaneViewInputFactoryInput = {
    app: App;
    interfaceLanguage: BiblePluginLocale;
    waitForNextAnimationFrame(): Promise<void>;
};

export function createReferenceUsagePaneViewInput(input: ReferenceUsagePaneViewInputFactoryInput): ReferenceUsagePaneViewInput {
    return {
        getTitle: () => t(input.interfaceLanguage, "referenceUsages.panel.titleFallback"),
        getEmptyText: () => t(input.interfaceLanguage, "modal.referenceUsages.empty"),
        getCountText: (count) => t(input.interfaceLanguage, "modal.referenceUsages.count", { count }),
        getOpenResultAria: (result) => t(input.interfaceLanguage, "referenceUsages.openResultAria", { filePath: result.filePath, line: result.line }),
        onOpenResult: (result) => void openReferenceUsageResult({
            app: input.app,
            waitForNextAnimationFrame: input.waitForNextAnimationFrame,
        }, result),
    };
}
