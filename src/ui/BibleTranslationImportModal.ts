import { App, Modal, Notice, Setting } from "obsidian";
import type { EpubBibleSourceMetadata } from "../infrastructure/EpubBibleImporter";
import { BiblePluginLocale, t } from "../i18n/I18n";

export type BibleTranslationImportSettings = {
    translationName: string;
    translationNamePlaceholder: string;
    language: string;
    translationId: string;
};

export class BibleTranslationImportModal extends Modal {
    private value: BibleTranslationImportSettings;
    private resolved = false;

    constructor(
        app: App,
        defaults: BibleTranslationImportSettings,
        private readonly translationAlreadyExists: boolean,
        private readonly locale: BiblePluginLocale,
        private readonly resolve: (value: BibleTranslationImportSettings | null) => void,
    ) {
        super(app);
        this.value = { ...defaults };
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: t(this.locale, "modal.import.title") });

        if (this.translationAlreadyExists) {
            contentEl.createEl("p", {
                text: t(this.locale, "modal.import.replaceWarning"),
                cls: "mod-warning",
            });
        } else {
            contentEl.createEl("p", {
                text: t(this.locale, "modal.import.description"),
            });
        }

        const translationNameSetting = new Setting(contentEl)
            .setName(t(this.locale, "modal.import.translationName"));

        translationNameSetting.settingEl.style.flexDirection = "column";
        translationNameSetting.settingEl.style.alignItems = "stretch";
        translationNameSetting.controlEl.style.width = "100%";

        translationNameSetting.addText((text) => {
            text
                .setPlaceholder(this.value.translationNamePlaceholder || t(this.locale, "defaults.translationNamePlaceholder"))
                .setValue(this.value.translationName)
                .onChange((value) => {
                    this.value.translationName = value.trim();
                });

            text.inputEl.style.width = "100%";
        });

        new Setting(contentEl)
            .setName(t(this.locale, "modal.import.language"))
            .setDesc(this.value.language || t(this.locale, "modal.import.undefined"));

        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText(t(this.locale, "modal.import.cancel"))
                .onClick(() => this.finish(null)))
            .addButton((button) => button
                .setButtonText(t(this.locale, "modal.import.import"))
                .setCta()
                .onClick(() => this.finish(this.value)));
    }

    onClose(): void {
        this.contentEl.empty();
        if (!this.resolved) {
            this.finish(null);
        }
    }

    private finish(value: BibleTranslationImportSettings | null): void {
        if (this.resolved) return;

        if (value === null) {
            this.resolved = true;
            this.resolve(null);
            this.close();
            return;
        }

        const translationName = value.translationName.trim();

        if (translationName.length === 0) {
            new Notice(t(this.locale, "modal.import.translationNameRequired"), 5000);
            return;
        }

        this.resolved = true;

        const normalizedValue = {
            translationName,
            translationNamePlaceholder: value.translationNamePlaceholder,
            language: normalizeLanguageInput(value.language) || "und",
            translationId: value.translationId,
        };

        this.resolve(normalizedValue);
        this.close();
    }
}

export function createImportSettingsDefaults(fileName: string, sourceMetadata: EpubBibleSourceMetadata): BibleTranslationImportSettings {
    const fileNameWithoutExtension = fileName.replace(/\.epub$/i, "").trim();
    const detectedTranslationName = sourceMetadata.title?.trim() ?? "";
    const translationNameForId = detectedTranslationName || fileNameWithoutExtension || "Imported EPUB Bible";
    const language = normalizeLanguageInput(sourceMetadata.language ?? "") || "und";

    return {
        translationName: detectedTranslationName,
        translationNamePlaceholder: fileNameWithoutExtension || "",
        language,
        translationId: createTranslationId(language, translationNameForId),
    };
}

function createTranslationId(language: string, translationName: string): string {
    const normalizedLanguage = normalizeLanguageInput(language) || "und";
    const namePart = sanitizeTranslationId(transliterateToAscii(translationName)) || "translation";
    return sanitizeTranslationId(`${normalizedLanguage}-${namePart}`);
}

function sanitizeTranslationId(value: string): string {
    return value
        .toLowerCase()
        .trim()
        .replace(/_/g, "-")
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
}

function normalizeLanguageInput(value: string): string {
    return value.trim().toLowerCase().replace(/_/g, "-");
}

function transliterateToAscii(value: string): string {
    const map: Record<string, string> = {
        а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
        к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
        х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
        ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
    };

    return value.toLowerCase().replace(/[а-яёçğıöşü]/g, (char) => map[char] ?? char);
}
