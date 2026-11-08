import { Platform, getLanguage } from "obsidian";
import { BiblePluginLocale, getBiblePluginLocaleForLanguage, normalizeBiblePluginLocale } from "../i18n/I18n";
import { isValidTranslationCode } from "../translations/translationCodes";
import { normalizeCustomBookAliases, type CustomBookAliases } from "../parsing/customBookAliases";
import { normalizeReferenceUsageExcludedFolders } from "../reference-usage/ReferenceUsageIndexService";
import { clampReaderSplitRatio, DEFAULT_READER_SPLIT_RATIO } from "../reader/ReaderSplitGeometry";
import { normalizeBibleInsertFormat, type BibleInsertFormat } from "../insertion/BibleTextMarkdown";
import { DEFAULT_BIBLE_REFERENCE_LINK_COLOR, DEFAULT_FLOATING_PREVIEW_BACKGROUND_COLOR, normalizeBibleReferenceLinkColor, normalizeFloatingPreviewBackgroundColor } from "./cssColorValidation";

export const DEFAULT_REFERENCE_SUGGEST_TRIGGER = "--";

export type BiblePreviewTriggerMode = "current-paragraph" | "clicked-reference";
export type BiblePreviewDisplayMode = "floating" | "side-panel";
export type BiblePreviewPanelSide = "right" | "left";
export type BibleLinkOpenShortcut = "alt-enter" | "ctrl-enter" | "ctrl-alt-enter";
/** Where the reader opens on a phone: in a tab (in place of the note), or in the panel under the note. */
export type PhoneReaderPlacement = "tab" | "below";
/** The reader under the note on a phone: open or not, and its chapter, in its own translation's numbering. */
export type ReaderSplitState = {
    open: boolean;
    book?: number;
    chapter?: number;
    translationId?: string;
};

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
    phoneReaderPlacement: PhoneReaderPlacement;
    /** The reader's share of the height under the note (BibleReaderSplitPanel). */
    readerSplitRatio: number;
    readerSplit: ReaderSplitState;
    /** How inserted Bible text looks in the note. */
    insertFormat: BibleInsertFormat;
    insertVerseNumbers: boolean;
    insertFootnotes: boolean;
    /** Typed before a book name, opens reference suggestions ("--Ин 3:16"); empty turns them off. */
    referenceSuggestTrigger: string;
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
    phoneReaderPlacement: "tab",
    readerSplitRatio: DEFAULT_READER_SPLIT_RATIO,
    readerSplit: { open: false },
    insertFormat: "callout-expanded",
    insertVerseNumbers: true,
    insertFootnotes: false,
    referenceSuggestTrigger: DEFAULT_REFERENCE_SUGGEST_TRIGGER,
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
        phoneReaderPlacement: value.phoneReaderPlacement === "tab" || value.phoneReaderPlacement === "below"
            ? value.phoneReaderPlacement
            : DEFAULT_SETTINGS.phoneReaderPlacement,
        readerSplitRatio: typeof value.readerSplitRatio === "number"
            ? clampReaderSplitRatio(value.readerSplitRatio)
            : DEFAULT_SETTINGS.readerSplitRatio,
        readerSplit: normalizeReaderSplitState(value.readerSplit),
        insertFormat: normalizeBibleInsertFormat(value.insertFormat, DEFAULT_SETTINGS.insertFormat),
        insertVerseNumbers: typeof value.insertVerseNumbers === "boolean" ? value.insertVerseNumbers : DEFAULT_SETTINGS.insertVerseNumbers,
        insertFootnotes: typeof value.insertFootnotes === "boolean" ? value.insertFootnotes : DEFAULT_SETTINGS.insertFootnotes,
        referenceSuggestTrigger: typeof value.referenceSuggestTrigger === "string"
            ? normalizeReferenceSuggestTrigger(value.referenceSuggestTrigger)
            : DEFAULT_SETTINGS.referenceSuggestTrigger,
    };
}

const MAX_REFERENCE_SUGGEST_TRIGGER_LENGTH = 5;

/** No spaces, letters or digits (they would start a book name); at most a few characters; empty turns it off. */
export function normalizeReferenceSuggestTrigger(value: string): string {
    const trigger = value.trim();
    if (trigger.length > MAX_REFERENCE_SUGGEST_TRIGGER_LENGTH || /[\s\p{L}\p{N}]/u.test(trigger)) return DEFAULT_REFERENCE_SUGGEST_TRIGGER;
    return trigger;
}

function normalizeReaderSplitState(value: unknown): ReaderSplitState {
    if (!isRecord(value)) return { open: false };
    const book = value.book;
    const chapter = value.chapter;
    return {
        open: value.open === true,
        ...(isPositiveInteger(book) && isPositiveInteger(chapter) ? { book, chapter } : {}),
        ...(typeof value.translationId === "string" ? { translationId: value.translationId } : {}),
    };
}

function isPositiveInteger(value: unknown): value is number {
    return typeof value === "number" && Number.isInteger(value) && value > 0;
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
