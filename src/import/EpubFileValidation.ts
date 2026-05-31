import { EPUB_IMPORT_LIMITS } from "../infrastructure/epub/EpubContainerReader";
import type { I18nKey } from "../i18n/I18n";

export type EpubFileValidationTranslate = (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => string;

export async function readAndValidateEpubFile(file: File, translate: EpubFileValidationTranslate): Promise<ArrayBuffer> {
    if (file.size > EPUB_IMPORT_LIMITS.maxArchiveBytes) {
        throw new Error(`Imported EPUB/ZIP file is too large: ${file.size} bytes. Maximum allowed: ${EPUB_IMPORT_LIMITS.maxArchiveBytes} bytes.`);
    }

    const content = await file.arrayBuffer();

    if (content.byteLength > EPUB_IMPORT_LIMITS.maxArchiveBytes) {
        throw new Error(`Imported EPUB/ZIP file is too large: ${content.byteLength} bytes. Maximum allowed: ${EPUB_IMPORT_LIMITS.maxArchiveBytes} bytes.`);
    }

    if (content.byteLength === 0) {
        throw new Error([
            translate("import.error.emptyFile"),
            translate("import.error.emptyFileDetails", { fileName: file.name, size: file.size }),
            translate("import.error.androidPickerHint"),
            translate("import.error.androidPickerSuggestion"),
        ].join(" "));
    }

    if (content.byteLength < 4) {
        throw new Error(translate("import.error.fileTooSmall", { size: content.byteLength }));
    }

    const bytes = new Uint8Array(content.slice(0, 4));
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
        throw new Error([
            translate("import.error.notZip"),
            translate("import.error.firstBytes", { bytes: Array.from(bytes).join(", ") }),
            translate("import.error.selectRealEpub"),
        ].join(" "));
    }

    return content;
}
