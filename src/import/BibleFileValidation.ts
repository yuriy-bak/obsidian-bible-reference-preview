import type { I18nKey } from "../i18n/I18n";

export type BibleFileValidationTranslate = (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => string;

/**
 * Reads a picked file for import. Only the checks common to every format live here;
 * the format itself and its limits are checked by the Bible source that takes the file.
 */
export async function readBibleFile(file: File, maxFileBytes: number, translate: BibleFileValidationTranslate): Promise<ArrayBuffer> {
    if (file.size > maxFileBytes) {
        throw new Error(`Imported Bible file is too large: ${file.size} bytes. Maximum allowed: ${maxFileBytes} bytes.`);
    }

    // A file picked in another window (e.g. settings opened as a separate window) yields that window's
    // ArrayBuffer, which fails JSZip's `instanceof ArrayBuffer` check here; copy it into this window's realm.
    const content = copyToCurrentRealm(await file.arrayBuffer());

    if (content.byteLength > maxFileBytes) {
        throw new Error(`Imported Bible file is too large: ${content.byteLength} bytes. Maximum allowed: ${maxFileBytes} bytes.`);
    }

    if (content.byteLength === 0) {
        throw new Error([
            translate("import.error.emptyFile"),
            translate("import.error.emptyFileDetails", { fileName: file.name, size: file.size }),
            translate("import.error.androidPickerHint"),
            translate("import.error.androidPickerSuggestion"),
        ].join(" "));
    }

    return content;
}

function copyToCurrentRealm(buffer: ArrayBuffer): ArrayBuffer {
    // Not `instanceof`: TypeScript would narrow the foreign-realm branch to `never`.
    if (Object.getPrototypeOf(buffer) === ArrayBuffer.prototype) return buffer;
    const source = new Uint8Array(buffer);
    const copy = new Uint8Array(source.byteLength);
    copy.set(source);
    return copy.buffer;
}
