import { Platform, getLanguage } from "obsidian";
import { BiblePluginLocale, getBiblePluginLocaleForLanguage, normalizeBiblePluginLocale } from "../i18n/I18n";
import { isValidTranslationCode } from "../translations/translationCodes";
import { normalizeCustomBookAliases, type CustomBookAliases } from "../parsing/customBookAliases";
import { normalizeReferenceUsageExcludedFolders } from "../reference-usage/ReferenceUsageIndexService";
import { DEFAULT_BIBLE_REFERENCE_LINK_COLOR, DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR, normalizeBibleReferenceLinkColor, normalizeFloatingPreviewBackgroundColor } from "../ui/cssColorValidation";

export type BiblePreviewTriggerMode = "current-paragraph" | "clicked-reference";
export type BiblePreviewDisplayMode = "floating" | "side-panel";
export type BiblePreviewPanelSide = "right" | "left";
export type BibleLinkOpenShortcut = "alt-enter" | "ctrl-enter" | "ctrl-alt-enter";

export type BiblePluginSettings = {
    isPluginActive: boolean;
    interfaceLanguage: BiblePluginLocale;
    translationOrder: string[];
    comparisonTranslationIds: string[];
    /** Codes the user gave translations, by translation id (see translations/translationCodes). */
    translationCodes: Record<string, string>;
    /** Book names the user added, by translation id and book id; a re-import keeps them (see parsing/customBookAliases). */
    bookAliases: CustomBookAliases;
    bibleReferenceLinkColor: string;
    floatingPreviewBackgroundColor: string;
    previewTriggerMode: BiblePreviewTriggerMode;
    previewDisplayMode: BiblePreviewDisplayMode;
    previewPanelSide: BiblePreviewPanelSide;
    closePreviewOnActiveLeafChange: boolean;
    autoOpenPreviewOnVerseChange: boolean;
    previewComparisonEnabled: boolean;
    interceptLinkOpenShortcut: boolean;
    linkOpenShortcut: BibleLinkOpenShortcut;
    referenceUsageIndexingEnabled: boolean;
    referenceUsageAutoUpdate: boolean;
    referenceUsageExcludedFolders: string[];
    /** The one-time notice with the first steps was shown (or not needed: translations were already imported). */
    gettingStartedNoticeShown: boolean;
};

const DEFAULT_REFERENCE_USAGE_EXCLUDED_FOLDERS = ["Attachments/", "Templates/", "Archive/", "Bible/"];

export const DEFAULT_SETTINGS: BiblePluginSettings = {
    isPluginActive: true,
    // Until settings are loaded; a new install takes the Obsidian interface language (getDefaultInterfaceLanguage).
    interfaceLanguage: "en",
    translationOrder: [],
    comparisonTranslationIds: [],
    translationCodes: {},
    bookAliases: {},
    bibleReferenceLinkColor: DEFAULT_BIBLE_REFERENCE_LINK_COLOR,
    floatingPreviewBackgroundColor: DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR,
    previewTriggerMode: "current-paragraph",
    previewDisplayMode: "floating",
    previewPanelSide: "right",
    closePreviewOnActiveLeafChange: true,
    autoOpenPreviewOnVerseChange: !Platform.isMobileApp,
    previewComparisonEnabled: false,
    interceptLinkOpenShortcut: true,
    linkOpenShortcut: "alt-enter",
    referenceUsageIndexingEnabled: false,
    referenceUsageAutoUpdate: !Platform.isMobileApp,
    referenceUsageExcludedFolders: DEFAULT_REFERENCE_USAGE_EXCLUDED_FOLDERS,
    gettingStartedNoticeShown: false,
};

export function normalizePluginSettings(value: unknown): BiblePluginSettings {
    if (!isRecord(value)) {
        return { ...DEFAULT_SETTINGS, interfaceLanguage: getDefaultInterfaceLanguage() };
    }

    const translationOrder = Array.isArray(value.translationOrder)
        ? value.translationOrder.filter((translationId): translationId is string => typeof translationId === "string")
        : [];
    const comparisonTranslationIds = Array.isArray(value.comparisonTranslationIds)
        ? value.comparisonTranslationIds.filter((translationId): translationId is string => typeof translationId === "string").slice(0, 4)
        : [];

    return {
        isPluginActive: typeof value.isPluginActive === "boolean" ? value.isPluginActive : DEFAULT_SETTINGS.isPluginActive,
        interfaceLanguage: normalizeBiblePluginLocale(value.interfaceLanguage, getDefaultInterfaceLanguage()),
        translationOrder: [...new Set(translationOrder)],
        comparisonTranslationIds: [...new Set(comparisonTranslationIds)],
        translationCodes: normalizeTranslationCodes(value.translationCodes),
        bookAliases: normalizeBookAliasesSetting(value.bookAliases),
        bibleReferenceLinkColor: typeof value.bibleReferenceLinkColor === "string"
            ? normalizeBibleReferenceLinkColor(value.bibleReferenceLinkColor)
            : DEFAULT_SETTINGS.bibleReferenceLinkColor,
        floatingPreviewBackgroundColor: typeof value.floatingPreviewBackgroundColor === "string"
            ? normalizeFloatingPreviewBackgroundColor(value.floatingPreviewBackgroundColor)
            : DEFAULT_SETTINGS.floatingPreviewBackgroundColor,
        previewTriggerMode: typeof value.previewTriggerMode === "string" && isBiblePreviewTriggerMode(value.previewTriggerMode)
            ? value.previewTriggerMode
            : DEFAULT_SETTINGS.previewTriggerMode,
        previewDisplayMode: typeof value.previewDisplayMode === "string" && isBiblePreviewDisplayMode(value.previewDisplayMode)
            ? value.previewDisplayMode
            : DEFAULT_SETTINGS.previewDisplayMode,
        previewPanelSide: typeof value.previewPanelSide === "string" && isBiblePreviewPanelSide(value.previewPanelSide)
            ? value.previewPanelSide
            : DEFAULT_SETTINGS.previewPanelSide,
        closePreviewOnActiveLeafChange: typeof value.closePreviewOnActiveLeafChange === "boolean"
            ? value.closePreviewOnActiveLeafChange
            : DEFAULT_SETTINGS.closePreviewOnActiveLeafChange,
        autoOpenPreviewOnVerseChange: typeof value.autoOpenPreviewOnVerseChange === "boolean"
            ? value.autoOpenPreviewOnVerseChange
            : DEFAULT_SETTINGS.autoOpenPreviewOnVerseChange,
        previewComparisonEnabled: typeof value.previewComparisonEnabled === "boolean"
            ? value.previewComparisonEnabled
            : DEFAULT_SETTINGS.previewComparisonEnabled,
        interceptLinkOpenShortcut: typeof value.interceptLinkOpenShortcut === "boolean"
            ? value.interceptLinkOpenShortcut
            : DEFAULT_SETTINGS.interceptLinkOpenShortcut,
        linkOpenShortcut: typeof value.linkOpenShortcut === "string" && isBibleLinkOpenShortcut(value.linkOpenShortcut)
            ? value.linkOpenShortcut
            : DEFAULT_SETTINGS.linkOpenShortcut,
        referenceUsageIndexingEnabled: typeof value.referenceUsageIndexingEnabled === "boolean"
            ? value.referenceUsageIndexingEnabled
            : DEFAULT_SETTINGS.referenceUsageIndexingEnabled,
        referenceUsageAutoUpdate: typeof value.referenceUsageAutoUpdate === "boolean"
            ? value.referenceUsageAutoUpdate
            : DEFAULT_SETTINGS.referenceUsageAutoUpdate,
        referenceUsageExcludedFolders: Array.isArray(value.referenceUsageExcludedFolders)
            ? normalizeReferenceUsageExcludedFolders(
                value.referenceUsageExcludedFolders
                    .filter((folder): folder is string => typeof folder === "string")
                    .join("\n"),
            )
            : DEFAULT_SETTINGS.referenceUsageExcludedFolders,
        gettingStartedNoticeShown: typeof value.gettingStartedNoticeShown === "boolean"
            ? value.gettingStartedNoticeShown
            : DEFAULT_SETTINGS.gettingStartedNoticeShown,
    };
}

function normalizeTranslationCodes(value: unknown): Record<string, string> {
    if (!isRecord(value)) {
        return {};
    }
    return Object.fromEntries(Object.entries(value)
        .filter((entry): entry is [string, string] => typeof entry[1] === "string" && isValidTranslationCode(entry[1])));
}

function normalizeBookAliasesSetting(value: unknown): CustomBookAliases {
    if (!isRecord(value)) {
        return {};
    }
    const result: CustomBookAliases = {};
    for (const [translationId, books] of Object.entries(value)) {
        if (!isRecord(books)) {
            continue;
        }
        const translationAliases: Record<string, string[]> = {};
        for (const [bookId, aliases] of Object.entries(books)) {
            if (!/^[1-9]\d*$/u.test(bookId) || !Array.isArray(aliases)) {
                continue;
            }
            const normalized = normalizeCustomBookAliases(aliases.filter((alias): alias is string => typeof alias === "string"));
            if (normalized.length > 0) {
                translationAliases[bookId] = normalized;
            }
        }
        if (Object.keys(translationAliases).length > 0) {
            result[translationId] = translationAliases;
        }
    }
    return result;
}

function getDefaultInterfaceLanguage(): BiblePluginLocale {
    return getBiblePluginLocaleForLanguage(getLanguage());
}

function isBiblePreviewTriggerMode(value: string): value is BiblePreviewTriggerMode {
    return value === "current-paragraph" || value === "clicked-reference";
}

function isBiblePreviewDisplayMode(value: string): value is BiblePreviewDisplayMode {
    return value === "floating" || value === "side-panel";
}

function isBiblePreviewPanelSide(value: string): value is BiblePreviewPanelSide {
    return value === "right" || value === "left";
}

function isBibleLinkOpenShortcut(value: string): value is BibleLinkOpenShortcut {
    return value === "alt-enter" || value === "ctrl-enter" || value === "ctrl-alt-enter";
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
