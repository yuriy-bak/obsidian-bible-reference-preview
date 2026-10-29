import { App, Modal, Setting } from "obsidian";
import type { I18nKey, I18nParams } from "../i18n/I18n";
import type { BibleImportVersificationDetection } from "../infrastructure/sources/BibleSource";
import { getVersificationLabel } from "./VersificationLabels";

type Translate = (key: I18nKey, params?: I18nParams) => string;

/** Asks which numbering scheme an imported translation follows; resolves to null when the user cancels. */
export function openVersificationChoiceModal(
    app: App,
    translationName: string,
    detection: BibleImportVersificationDetection,
    translate: Translate,
): Promise<string | null> {
    return new Promise((resolve) => {
        new VersificationChoiceModal(app, translationName, detection, translate, resolve).open();
    });
}

class VersificationChoiceModal extends Modal {
    private selectedKey: string;
    private resolved = false;

    constructor(
        app: App,
        private readonly translationName: string,
        private readonly detection: BibleImportVersificationDetection,
        private readonly translate: Translate,
        private readonly resolve: (value: string | null) => void,
    ) {
        super(app);
        this.selectedKey = detection.key;
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: this.translate("modal.versification.title") });
        contentEl.createEl("p", {
            text: this.translate("modal.versification.description", { translationName: this.translationName }),
        });

        new Setting(contentEl)
            .setName(this.translate("modal.versification.scheme"))
            .addDropdown((dropdown) => {
                for (const score of this.detection.scores) {
                    dropdown.addOption(score.key, this.translate("versification.matchedChapters", {
                        name: getVersificationLabel(score.key, this.translate),
                        matched: score.matchedChapters,
                        total: this.detection.totalChapters,
                    }));
                }
                dropdown
                    .setValue(this.selectedKey)
                    .onChange((value) => {
                        this.selectedKey = value;
                    });
            });

        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText(this.translate("common.cancel"))
                .onClick(() => this.finish(null)))
            .addButton((button) => button
                .setButtonText(this.translate("modal.versification.continue"))
                .setCta()
                .onClick(() => this.finish(this.selectedKey)));
    }

    onClose(): void {
        this.contentEl.empty();
        this.finish(null);
    }

    private finish(value: string | null): void {
        if (this.resolved) return;
        this.resolved = true;
        this.resolve(value);
        this.close();
    }
}
