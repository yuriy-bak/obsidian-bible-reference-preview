import { messages, type I18nKey, type I18nParams } from "../i18n/I18n";
import { getVersificationRegistry } from "../versification/VersificationRegistry";

type Translate = (key: I18nKey, params?: I18nParams) => string;

/** User-facing name of a numbering scheme: localized for the built-in ones, the scheme's own name otherwise. */
export function getVersificationLabel(key: string, translate: Translate): string {
    const builtinId = /^builtin:([a-z0-9-]+)$/.exec(key)?.[1];
    const builtinKey = `versification.builtin.${builtinId ?? ""}`;
    if (builtinId !== undefined && isI18nKey(builtinKey)) {
        return translate(builtinKey);
    }
    return getVersificationRegistry().get(key)?.name ?? key;
}

/** Every registered scheme as dropdown options, keyed by scheme key. */
export function getVersificationOptions(translate: Translate): Record<string, string> {
    return Object.fromEntries(getVersificationRegistry().getAll()
        .map((scheme) => [scheme.key, getVersificationLabel(scheme.key, translate)]));
}

function isI18nKey(key: string): key is I18nKey {
    return Object.prototype.hasOwnProperty.call(messages.en, key);
}
