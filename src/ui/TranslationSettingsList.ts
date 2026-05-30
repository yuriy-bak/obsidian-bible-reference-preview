type TranslationSettingsListI18nKey =
    | "settings.translations.title"
    | "settings.translations.desc"
    | "settings.translations.empty"
    | "settings.translations.language"
    | "settings.translations.books"
    | "settings.translations.file"
    | "settings.translations.compare"
    | "settings.translations.deleteAria";

type TranslationSettingsListI18nParams = Record<string, string | number>;

export type TranslationSettingsListItem = {
    id: string;
    name: string;
    language: string;
    sourceFileName: string;
    bookCount: number;
    isActive: boolean;
    isComparisonEnabled: boolean;
};

export type TranslationSettingsSectionInput = {
    containerEl: HTMLElement;
    translations: TranslationSettingsListItem[];
    translate(key: TranslationSettingsListI18nKey, params?: TranslationSettingsListI18nParams): string;
    onDelete(translationId: string): Promise<void>;
    onToggleComparison(translationId: string, enabled: boolean): Promise<void>;
    getCurrentOrder(): string[];
    onReorder(nextOrder: string[]): Promise<void>;
    refresh(): void;
};

export function renderTranslationSettingsSection(input: TranslationSettingsSectionInput): void {
    const { containerEl, translations, translate } = input;

    containerEl.createEl("h3", { text: translate("settings.translations.title") });
    containerEl.createEl("p", {
        text: translate("settings.translations.desc"),
    });

    if (translations.length === 0) {
        containerEl.createEl("p", { text: translate("settings.translations.empty") });
        return;
    }

    const listEl = containerEl.createDiv();
    listEl.style.display = "flex";
    listEl.style.flexDirection = "column";
    listEl.style.gap = "6px";
    listEl.style.marginBottom = "12px";

    let draggedTranslationId: string | null = null;
    const rows: HTMLElement[] = [];

    const clearDropStyles = (): void => {
        for (const row of rows) {
            row.style.borderTop = "1px solid var(--background-modifier-border)";
            row.style.borderBottom = "1px solid var(--background-modifier-border)";
        }
    };

    for (const translation of translations) {
        const row = listEl.createDiv();
        rows.push(row);
        row.draggable = true;
        row.style.display = "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.padding = "8px";
        row.style.border = "1px solid var(--background-modifier-border)";
        row.style.borderRadius = "6px";
        row.style.background = translation.isActive ? "var(--background-secondary)" : "var(--background-primary)";
        row.style.cursor = "grab";

        const dragHandle = row.createSpan({ text: "☰" });
        dragHandle.style.opacity = "0.7";
        dragHandle.style.fontSize = "18px";
        dragHandle.style.lineHeight = "1";

        const textEl = row.createDiv();
        textEl.style.flex = "1";
        textEl.style.minWidth = "0";

        const titleEl = textEl.createDiv({ text: `${translation.isActive ? "✓ " : ""}${translation.name || translation.id}` });
        titleEl.style.fontWeight = translation.isActive ? "600" : "500";

        const description = [
            `ID: ${translation.id}`,
            translate("settings.translations.language", { language: translation.language || "und" }),
            translate("settings.translations.books", { count: translation.bookCount }),
            translation.sourceFileName.length === 0 ? "" : translate("settings.translations.file", { fileName: translation.sourceFileName }),
        ].filter((part) => part.length > 0).join(" · ");

        const descriptionEl = textEl.createDiv({ text: description });
        descriptionEl.style.fontSize = "12px";
        descriptionEl.style.color = "var(--text-muted)";
        descriptionEl.style.overflow = "hidden";
        descriptionEl.style.textOverflow = "ellipsis";
        descriptionEl.style.whiteSpace = "nowrap";

        const comparisonLabelEl = row.createEl("label");
        comparisonLabelEl.style.display = "inline-flex";
        comparisonLabelEl.style.alignItems = "center";
        comparisonLabelEl.style.gap = "4px";
        comparisonLabelEl.style.fontSize = "12px";
        comparisonLabelEl.style.cursor = "pointer";

        const comparisonCheckboxEl = comparisonLabelEl.createEl("input", { type: "checkbox" });
        comparisonCheckboxEl.checked = translation.isComparisonEnabled;
        comparisonCheckboxEl.addEventListener("click", (event) => event.stopPropagation());
        comparisonCheckboxEl.addEventListener("change", async () => {
            await input.onToggleComparison(translation.id, comparisonCheckboxEl.checked);
            input.refresh();
        });
        comparisonLabelEl.createSpan({ text: translate("settings.translations.compare") });

        const deleteButton = row.createEl("button", { text: "🗑" });
        deleteButton.setAttribute("aria-label", translate("settings.translations.deleteAria", { translationName: translation.name || translation.id }));
        deleteButton.style.cursor = "pointer";
        deleteButton.addEventListener("click", async (event) => {
            event.preventDefault();
            event.stopPropagation();
            await input.onDelete(translation.id);
            input.refresh();
        });

        row.addEventListener("dragstart", (event) => {
            draggedTranslationId = translation.id;
            row.style.opacity = "0.5";

            if (event.dataTransfer !== null) {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", translation.id);
            }
        });

        row.addEventListener("dragend", () => {
            draggedTranslationId = null;
            row.style.opacity = "1";
            clearDropStyles();
        });

        row.addEventListener("dragover", (event) => {
            const sourceTranslationId = event.dataTransfer?.getData("text/plain") || draggedTranslationId;
            if (sourceTranslationId === null || sourceTranslationId === translation.id) {
                return;
            }

            event.preventDefault();
            clearDropStyles();

            const rect = row.getBoundingClientRect();
            const insertAfter = event.clientY > rect.top + rect.height / 2;
            if (insertAfter) {
                row.style.borderBottom = "2px solid var(--color-accent)";
            } else {
                row.style.borderTop = "2px solid var(--color-accent)";
            }
        });

        row.addEventListener("dragleave", () => {
            row.style.borderTop = "1px solid var(--background-modifier-border)";
            row.style.borderBottom = "1px solid var(--background-modifier-border)";
        });

        row.addEventListener("drop", async (event) => {
            event.preventDefault();
            const sourceTranslationId = event.dataTransfer?.getData("text/plain") || draggedTranslationId;
            clearDropStyles();

            if (sourceTranslationId === null || sourceTranslationId === translation.id) {
                return;
            }

            const nextOrder = input.getCurrentOrder();
            const sourceIndex = nextOrder.indexOf(sourceTranslationId);
            let targetIndex = nextOrder.indexOf(translation.id);

            if (sourceIndex < 0 || targetIndex < 0) {
                return;
            }

            const rect = row.getBoundingClientRect();
            const insertAfter = event.clientY > rect.top + rect.height / 2;
            nextOrder.splice(sourceIndex, 1);

            if (sourceIndex < targetIndex) {
                targetIndex -= 1;
            }

            if (insertAfter) {
                targetIndex += 1;
            }

            nextOrder.splice(targetIndex, 0, sourceTranslationId);
            await input.onReorder(nextOrder);
            input.refresh();
        });
    }
}
