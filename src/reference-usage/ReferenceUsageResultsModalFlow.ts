import type { App } from "obsidian";
import type { BiblePluginLocale } from "../i18n/I18n";
import { ReferenceUsageResultsModal } from "../ui/ReferenceUsageResultsModal";
import type { ReferenceUsageSearchResult } from "./ReferenceUsageIndexService";
import { openReferenceUsageResult } from "./ReferenceUsageResultOpening";

export type ReferenceUsageResultsModalFlowInput = {
    app: App;
    interfaceLanguage: BiblePluginLocale;
    waitForNextAnimationFrame(): Promise<void>;
};

export function openReferenceUsageResultsModal(
    input: ReferenceUsageResultsModalFlowInput,
    titleText: string,
    results: ReferenceUsageSearchResult[],
): void {
    new ReferenceUsageResultsModal(
        input.app,
        input.interfaceLanguage,
        titleText,
        results,
        (result) => void openReferenceUsageResult({
            app: input.app,
            waitForNextAnimationFrame: input.waitForNextAnimationFrame,
        }, result),
    ).open();
}
