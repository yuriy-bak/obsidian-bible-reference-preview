// The passage of a preview as Markdown for a note: a callout, a quote or a ```bible block.
import type { BiblePreviewBlock, BiblePreviewContent, BiblePreviewParagraph } from "../application/BiblePreviewModel";
import { BIBLE_CODE_BLOCK_LANGUAGE } from "../code-block/BibleCodeBlock";
import type { I18nKey } from "../i18n/I18n";

/** Both callouts fold: "+" shows the text, "-" hides it until clicked. */
export type BibleInsertFormat = "callout-expanded" | "callout-collapsed" | "quote" | "code-block";

export const BIBLE_INSERT_FORMATS: readonly BibleInsertFormat[] = ["callout-expanded", "callout-collapsed", "quote", "code-block"];
export const BIBLE_CALLOUT_TYPE = "bible";

/** One name per format, in the setting and in the reference suggestions. */
export const INSERT_FORMAT_LABEL_KEYS = {
    "callout-expanded": "settings.insertFormat.calloutExpanded",
    "callout-collapsed": "settings.insertFormat.calloutCollapsed",
    quote: "settings.insertFormat.quote",
    "code-block": "settings.insertFormat.codeBlock",
} as const satisfies Record<BibleInsertFormat, I18nKey>;


export type BibleTextMarkdownOptions = {
    format: BibleInsertFormat;
    verseNumbers: boolean;
    footnotes: boolean;
    /** The translation the note's references follow; the others get their code after the reference. */
    activeTranslationId: string | null;
    getTranslationCode: (translationId: string) => string | undefined;
};

type MarkdownSection = {
    /** A reference the parser recognizes again: "Ин 3:16", "Joh 3:16 (ENG)". */
    title: string;
    paragraphs: BiblePreviewParagraph[];
    footnotes: string[];
};

/** The formats the suggestions offer: both callouts and the bible block, and a quote when the setting chooses it. */
export function getSuggestionInsertFormats(setting: BibleInsertFormat): BibleInsertFormat[] {
    return setting === "quote" ? ["quote", "callout-expanded", "callout-collapsed", "code-block"] : ["callout-expanded", "callout-collapsed", "code-block"];
}

export function isBibleInsertFormat(value: unknown): value is BibleInsertFormat {
    return typeof value === "string" && (BIBLE_INSERT_FORMATS as readonly string[]).includes(value);
}

/** A stored format; the plain callout of the first betas becomes the expanded one. */
export function normalizeBibleInsertFormat(value: unknown, fallback: BibleInsertFormat): BibleInsertFormat {
    if (value === "callout") return "callout-expanded";
    return isBibleInsertFormat(value) ? value : fallback;
}

/** Markdown for the passages of the content; empty when it has none. */
export function formatBibleTextMarkdown(content: BiblePreviewContent, options: BibleTextMarkdownOptions): string {
    const sections = collectSections(content.blocks, options, content.chapterView?.translationId);
    if (sections.length === 0) return "";
    if (options.format === "code-block") {
        const titles = [...new Set(sections.map((section) => section.title))];
        return ["```" + BIBLE_CODE_BLOCK_LANGUAGE, ...titles, "```"].join("\n");
    }
    return sections.map((section) => formatQuotedSection(section, options)).join("\n\n");
}

/** A chapter of the reader names its translation when it is not the main one, like a comparison does. */
function collectSections(blocks: BiblePreviewBlock[], options: BibleTextMarkdownOptions, chapterTranslationId?: string): MarkdownSection[] {
    const sections: MarkdownSection[] = [];
    let last: MarkdownSection | null = null;
    for (const block of blocks) {
        if (block.type === "reference") {
            const title = stripBookIcon(block.title);
            last = {
                title: chapterTranslationId === undefined ? title : formatTranslationTitle(title, chapterTranslationId, undefined, options),
                paragraphs: block.paragraphs,
                footnotes: [],
            };
            sections.push(last);
        } else if (block.type === "footnote") {
            last?.footnotes.push(block.text);
        } else if (block.type === "comparison") {
            last = null;
            for (const translation of block.translations) {
                sections.push({
                    title: formatTranslationTitle(stripBookIcon(translation.referenceTitle), translation.translationId, translation.translationName, options),
                    paragraphs: translation.paragraphs,
                    footnotes: translation.footnotes,
                });
            }
        }
    }
    return sections.filter((section) => section.paragraphs.some((paragraph) => paragraph.verses.length > 0));
}

function formatTranslationTitle(title: string, translationId: string, translationName: string | undefined, options: BibleTextMarkdownOptions): string {
    if (translationId === options.activeTranslationId) return title;
    const code = options.getTranslationCode(translationId);
    if (code !== undefined && code.length > 0) return `${title} (${code})`;
    return translationName === undefined ? title : `${title} — ${translationName}`;
}

function formatQuotedSection(section: MarkdownSection, options: BibleTextMarkdownOptions): string {
    const body: string[] = [];
    section.paragraphs.forEach((paragraph, index) => {
        if (index > 0) body.push("");
        if (paragraph.heading !== undefined) body.push(`*${paragraph.heading}*`);
        body.push(paragraph.verses
            .map((verse) => {
                const number = verse.numberEnd === undefined ? String(verse.number) : `${verse.number}-${verse.numberEnd}`;
                return options.verseNumbers ? `${toSuperscript(number)} ${verse.text}` : verse.text;
            })
            .join(" "));
    });
    if (options.footnotes && section.footnotes.length > 0) {
        body.push("", ...section.footnotes.flatMap((footnote) => footnote.split("\n")));
    }
    const header = options.format === "callout-expanded"
        ? `[!${BIBLE_CALLOUT_TYPE}]+ ${section.title}`
        : options.format === "callout-collapsed" ? `[!${BIBLE_CALLOUT_TYPE}]- ${section.title}` : section.title;
    return [header, ...body].map((line) => (line.length === 0 ? ">" : `> ${line}`)).join("\n");
}

const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** "16-17" → "¹⁶⁻¹⁷": verse numbers that do not need HTML in the note. */
export function toSuperscript(value: string): string {
    return value.replace(/[0-9-]/g, (character) => (character === "-" ? "⁻" : SUPERSCRIPT_DIGITS[Number(character)]));
}

function stripBookIcon(title: string): string {
    return title.replace(/^📖\s*/u, "").trim();
}
