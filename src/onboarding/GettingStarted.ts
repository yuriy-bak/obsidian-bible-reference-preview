import { Notice } from "obsidian";
import type { BibleBook } from "../domain/BibleBook";
import type { BiblePluginLocale, I18nKey, I18nParams } from "../i18n/I18n";

type Translate = (key: I18nKey, params?: I18nParams) => string;

type BibleSourceLink = { textKey: I18nKey; url: string };

// The Bible page of jw.org's library in the interface language.
const JW_BIBLE_URLS: Record<BiblePluginLocale, string> = {
    ru: "https://www.jw.org/ru/%D0%B1%D0%B8%D0%B1%D0%BB%D0%B8%D0%BE%D1%82%D0%B5%D0%BA%D0%B0/%D0%B1%D0%B8%D0%B1%D0%BB%D0%B8%D1%8F/",
    en: "https://www.jw.org/en/library/bible/",
};
const EBIBLE_URL = "https://ebible.org/find/";
const DBS_URL = "https://dbs.org/bibles";

// Where a new user gets a Bible file the import supports; a free translation in the interface language first.
const BIBLE_SOURCE_LINKS: Record<BiblePluginLocale, BibleSourceLink[]> = {
    ru: [
        { textKey: "gettingStarted.source.russianSynodal", url: "https://ebible.org/find/details.php?id=russyn" },
        { textKey: "gettingStarted.source.ebible", url: EBIBLE_URL },
        { textKey: "gettingStarted.source.jw", url: JW_BIBLE_URLS.ru },
        { textKey: "gettingStarted.source.dbs", url: DBS_URL },
    ],
    en: [
        { textKey: "gettingStarted.source.worldEnglish", url: "https://ebible.org/find/details.php?id=engwebp" },
        { textKey: "gettingStarted.source.ebible", url: EBIBLE_URL },
        { textKey: "gettingStarted.source.jw", url: JW_BIBLE_URLS.en },
        { textKey: "gettingStarted.source.dbs", url: DBS_URL },
    ],
};

/** The import description with the names of the sites it mentions ({jw}, {ebible}, {dbs}) as links. */
export function createImportDescription(locale: BiblePluginLocale, translate: Translate): DocumentFragment {
    const sites: Record<string, { text: string; url: string }> = {
        jw: { text: "jw.org", url: JW_BIBLE_URLS[locale] },
        ebible: { text: "eBible.org", url: EBIBLE_URL },
        dbs: { text: "dbs.org", url: DBS_URL },
    };
    return createFragment((el) => {
        translate("settings.import.desc").split(/\{(jw|ebible|dbs)\}/u).forEach((part, index) => {
            const site = index % 2 === 1 ? sites[part] : undefined;
            if (site === undefined) {
                if (part !== "") el.appendText(part);
            } else {
                el.createEl("a", { text: site.text, href: site.url });
            }
        });
    });
}

const JOHN_BOOK_ID = 43;

/** The first steps for a user without translations: where to get a Bible file, how to import it, what to type. */
export function renderGettingStarted(containerEl: HTMLElement, locale: BiblePluginLocale, translate: Translate): HTMLElement {
    const stepsEl = containerEl.createEl("ol", { cls: "bible-getting-started" });
    const downloadEl = stepsEl.createEl("li", { text: `${translate("gettingStarted.step.download")} ` });
    BIBLE_SOURCE_LINKS[locale].forEach((link, index) => {
        if (index > 0) downloadEl.appendText(", ");
        downloadEl.createEl("a", { text: translate(link.textKey), href: link.url });
    });
    downloadEl.appendText(".");
    stepsEl.createEl("li", { text: translate("gettingStarted.step.import") });
    stepsEl.createEl("li", { text: translate("gettingStarted.step.type") });
    return stepsEl;
}

/** The notice for an action that needs a translation; its button opens the plugin settings with the first steps. */
export function showNoImportedTranslationsNotice(translate: Translate, openSettings: () => void, options: { duration?: number; firstRun?: boolean } = {}): Notice {
    let notice: Notice | null = null;
    const fragment = createFragment((el) => {
        el.createDiv({ text: translate(options.firstRun === true ? "notice.gettingStarted" : "notice.noImportedTranslations") });
        el.createEl("button", { text: translate("notice.gettingStartedButton") }, (buttonEl) => {
            buttonEl.addEventListener("click", () => {
                notice?.hide();
                openSettings();
            });
        });
    });
    notice = new Notice(fragment, options.duration ?? 8000);
    return notice;
}

/**
 * A reference to try after the first import, written with the translation's own book names
 * ("Ин 3:16" for the Synodal translation): the first form of John the parser recognizes.
 */
export function getExampleReference(books: BibleBook[], isRecognized: (text: string) => boolean): string | null {
    const john = books.find((book) => book.id === JOHN_BOOK_ID);
    if (john === undefined) return null;
    const candidates = [john.abbreviation, john.name, ...(john.aliases ?? [])]
        .map((bookName) => bookName.trim())
        .filter((bookName) => bookName.length > 0)
        .map((bookName) => `${bookName} 3:16`);
    return candidates.find(isRecognized) ?? null;
}
