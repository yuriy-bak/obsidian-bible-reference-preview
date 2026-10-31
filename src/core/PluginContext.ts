import { Platform, type App, type Plugin } from "obsidian";
import { t, type I18nKey, type I18nParams } from "../i18n/I18n";
import { EMPTY_BIBLE_INDEX, type BibleIndex } from "../infrastructure/BibleIndex";
import { getBibleIndexDataDirectoryPath } from "../infrastructure/PluginDirectoryPath";
import type { BibleIndexV2Data } from "../infrastructure/v2/BibleIndexV2Data";
import { ObsidianBibleIndexV2Repository } from "../infrastructure/v2/ObsidianBibleIndexV2Repository";
import { createBookMappingFromBibleIndexV2Data } from "../infrastructure/v2/createBookMappingFromBibleIndexV2Data";
import { BibleReferenceParser, getBibleReferenceParserSignature, type BibleReferenceMatch } from "../parsing/BibleReferenceParser";
import { createBookMapping, type BookMapping } from "../parsing/BookMapping";
import { DEFAULT_SETTINGS, normalizePluginSettings, type BiblePluginSettings } from "../settings/PluginSettings";
import { mapBibleReferences } from "../application/mapBibleReferences";
import { normalizeTranslationCode, resolveTranslationCodes } from "../translations/translationCodes";
import { DEFAULT_VERSIFICATION_KEY, getVersificationRegistry } from "../versification/VersificationRegistry";

// app.setting is not part of the public API, but it is the usual way for plugins to open their settings tab.
type AppWithSettingModal = App & {
    setting?: {
        open(): void;
        openTabById(id: string): unknown;
    };
};

type RefreshableSettingsTab = {
    update(): void;
};

/**
 * Single owner of the plugin state. Services read the state through it at call time,
 * so nobody keeps a stale snapshot of the index, the parser or the settings.
 */
export class PluginContext {
    readonly app: App;
    readonly isMobile = Platform.isMobileApp;
    readonly dataDirectoryPath: string;

    private currentSettings: BiblePluginSettings = { ...DEFAULT_SETTINGS };
    private currentBibleIndex: BibleIndex = EMPTY_BIBLE_INDEX;
    private currentV2Data: BibleIndexV2Data | null = null;
    private currentActiveTranslationId: string | null = null;
    private currentBookMapping: BookMapping = createBookMapping([]);
    private currentParser = new BibleReferenceParser(this.currentBookMapping);
    private currentParserSignature: string | null = null;
    private settingsTab: RefreshableSettingsTab | null = null;
    private readonly bookMappingListeners: Array<() => void> = [];

    constructor(private readonly plugin: Plugin) {
        this.app = plugin.app;
        this.dataDirectoryPath = getBibleIndexDataDirectoryPath(plugin.manifest, plugin.app.vault.configDir);
    }

    get settings(): BiblePluginSettings {
        return this.currentSettings;
    }

    get bibleIndex(): BibleIndex {
        return this.currentBibleIndex;
    }

    get v2Data(): BibleIndexV2Data | null {
        return this.currentV2Data;
    }

    get activeTranslationId(): string | null {
        return this.currentActiveTranslationId;
    }

    get bookMapping(): BookMapping {
        return this.currentBookMapping;
    }

    async loadSettings(): Promise<void> {
        this.currentSettings = normalizePluginSettings(await this.plugin.loadData());
    }

    updateSettings(patch: Partial<BiblePluginSettings>): void {
        this.currentSettings = { ...this.currentSettings, ...patch };
    }

    async saveSettings(): Promise<void> {
        await this.plugin.saveData(this.currentSettings);
    }

    /** Opens Obsidian settings on this plugin's tab. */
    openPluginSettings(): void {
        const setting = (this.app as AppWithSettingModal).setting;
        if (setting === undefined) return;
        setting.open();
        setting.openTabById(this.plugin.manifest.id);
    }

    t(key: I18nKey, params?: I18nParams): string {
        return t(this.currentSettings.interfaceLanguage, key, params);
    }

    /** Signature of the current parser, see getBibleReferenceParserSignature. */
    get parserSignature(): string {
        if (this.currentParserSignature === null) {
            this.currentParserSignature = getBibleReferenceParserSignature(this.currentBookMapping, this.getTranslationCodeSignature());
        }
        return this.currentParserSignature;
    }

    /**
     * References with a translation code come in that translation's numbering; they are mapped to the
     * active translation's numbering, which everything but the preview of the coded passage works with.
     */
    parseMatches(text: string): BibleReferenceMatch[] {
        const matches = this.currentParser.parseMatches(text);
        const activeTranslationId = this.currentActiveTranslationId;
        return matches.map((match) => {
            if (match.translationId === undefined || activeTranslationId === null) {
                return match;
            }
            if (match.translationId === activeTranslationId) {
                const { translationId: _translationId, ...plainMatch } = match;
                return plainMatch;
            }
            return {
                ...match,
                references: mapBibleReferences(
                    match.references,
                    this.getTranslationVersification(match.translationId),
                    this.getTranslationVersification(activeTranslationId),
                    getVersificationRegistry(),
                ),
                translationReferences: match.references,
            };
        });
    }

    /** The code of every imported translation, in the translation order (see translations/translationCodes). */
    getTranslationCodes(): Map<string, string> {
        const translations = this.currentV2Data?.translations ?? {};
        const order = [
            ...this.currentSettings.translationOrder.filter((translationId) => translations[translationId] !== undefined),
            ...Object.keys(translations).filter((translationId) => !this.currentSettings.translationOrder.includes(translationId)),
        ];
        return resolveTranslationCodes(
            order.map((translationId) => ({ id: translationId, name: translations[translationId].name })),
            this.currentSettings.translationCodes,
        );
    }

    private getTranslationVersification(translationId: string): string {
        return this.currentV2Data?.translations[translationId]?.versification ?? DEFAULT_VERSIFICATION_KEY;
    }

    // The coded references of indexed notes depend on the codes and on the numbering of every translation.
    private getTranslationCodeSignature(): string {
        return [...this.getTranslationCodes()]
            .map(([translationId, code]) => `${normalizeTranslationCode(code)}=${translationId}:${this.getTranslationVersification(translationId)}`)
            // The translation order alone must not look like a parser change.
            .sort()
            .concat(`active:${this.currentActiveTranslationId === null ? "" : this.getTranslationVersification(this.currentActiveTranslationId)}`)
            .join("\n");
    }

    createRepository(): ObsidianBibleIndexV2Repository {
        return new ObsidianBibleIndexV2Repository(this.app.vault.adapter, this.dataDirectoryPath);
    }

    setBibleData(bibleIndex: BibleIndex | null, v2Data: BibleIndexV2Data | null): void {
        this.currentBibleIndex = bibleIndex ?? EMPTY_BIBLE_INDEX;
        this.currentV2Data = v2Data;
    }

    setActiveTranslationId(activeTranslationId: string | null): void {
        this.currentActiveTranslationId = activeTranslationId;
    }

    hasImportedTranslations(): boolean {
        return this.currentV2Data !== null
            && this.currentActiveTranslationId !== null
            && this.currentV2Data.translations[this.currentActiveTranslationId] !== undefined;
    }

    /**
     * Rebuilds the book names and the parser for the active translation (and the translation codes);
     * notifies listeners when the parser changed.
     */
    updateBookMapping(): void {
        const previousParserSignature = this.parserSignature;
        this.currentBookMapping = this.currentV2Data !== null && this.currentActiveTranslationId !== null
            ? createBookMappingFromBibleIndexV2Data(this.currentV2Data, this.currentActiveTranslationId)
            : createBookMapping([]);
        this.currentParser = new BibleReferenceParser(
            this.currentBookMapping,
            new Map([...this.getTranslationCodes()].map(([translationId, code]) => [normalizeTranslationCode(code), translationId])),
        );
        this.currentParserSignature = null;
        if (this.parserSignature === previousParserSignature) {
            return;
        }
        for (const listener of this.bookMappingListeners) {
            listener();
        }
    }

    onBookMappingChanged(listener: () => void): void {
        this.bookMappingListeners.push(listener);
    }

    setSettingsTab(settingsTab: RefreshableSettingsTab): void {
        this.settingsTab = settingsTab;
    }

    refreshSettingsTab(): void {
        this.settingsTab?.update();
    }
}
