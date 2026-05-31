import { App, Notice } from "obsidian";
import type { BiblePluginLocale } from "../i18n/I18n";
import { t } from "../i18n/I18n";
import type { ReferenceUsageUnderCursorFlowInput } from "./ReferenceUsageUnderCursorFlow";
import { openReferenceUsageResultsModal } from "./ReferenceUsageResultsModalFlow";

export type ReferenceUsageUnderCursorFlowInputFactoryInput = {
    app: App;
    interfaceLanguage: BiblePluginLocale;
    isIndexingEnabled(): boolean;
    getReferenceUnderCursor: ReferenceUsageUnderCursorFlowInput["getReferenceUnderCursor"];
    findUsages: ReferenceUsageUnderCursorFlowInput["findUsages"];
    showResultsInPanel: ReferenceUsageUnderCursorFlowInput["showResultsInPanel"];
    waitForNextAnimationFrame(): Promise<void>;
};

export function createReferenceUsageUnderCursorFlowInput(input: ReferenceUsageUnderCursorFlowInputFactoryInput): ReferenceUsageUnderCursorFlowInput {
    return {
        isIndexingEnabled: input.isIndexingEnabled,
        showIndexingDisabledNotice: () => new Notice(t(input.interfaceLanguage, "notice.referenceUsageIndexDisabled"), 4000),
        getReferenceUnderCursor: input.getReferenceUnderCursor,
        findUsages: input.findUsages,
        formatTitle: (referenceText) => t(input.interfaceLanguage, "modal.referenceUsages.title", { reference: referenceText }),
        openResultsModal: (titleText, results) => openReferenceUsageResultsModal({
            app: input.app,
            interfaceLanguage: input.interfaceLanguage,
            waitForNextAnimationFrame: input.waitForNextAnimationFrame,
        }, titleText, results),
        showResultsInPanel: input.showResultsInPanel,
    };
}
