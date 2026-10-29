import { VERSIFICATION_NOT_DETECTED_WARNING_PREFIX } from "../infrastructure/sources/BibleIndexBuilder";
import { BibleImportInput, BibleImportOptions, BibleImportResult, BibleImportVersificationDetection, BibleSource } from "../infrastructure/sources/BibleSource";
import { ObsidianBibleIndexV2Repository } from "../infrastructure/v2/ObsidianBibleIndexV2Repository";

export type ImportBibleInput = {
    file: BibleImportInput;
    source: BibleSource;
    repository: ObsidianBibleIndexV2Repository;
    importOptions?: BibleImportOptions;
    /**
     * Asked before saving when the numbering scheme was not detected reliably. Resolves to the scheme key
     * the user picked; rejecting (e.g. with an abort error) cancels the import.
     */
    chooseVersification?: (detection: BibleImportVersificationDetection) => Promise<string>;
};

export async function importBible(input: ImportBibleInput): Promise<BibleImportResult> {
    const result = await input.source.importBible(input.file, input.importOptions);

    if (!result.versificationDetection.confident && input.chooseVersification !== undefined) {
        applyChosenVersification(result, await input.chooseVersification(result.versificationDetection));
    }

    await input.repository.saveV2({
        metadata: result.bibleIndexV2Data,
        books: result.compactBooks,
        report: result.report,
    });

    return result;
}

function applyChosenVersification(result: BibleImportResult, key: string): void {
    const translation = result.bibleIndexV2Data.translations[result.translationId];
    if (translation !== undefined) {
        translation.versification = key;
    }
    result.versificationDetection = { ...result.versificationDetection, key, confident: true };
    // The report's warnings are the same array.
    const warningIndex = result.warnings.findIndex((warning) => warning.startsWith(VERSIFICATION_NOT_DETECTED_WARNING_PREFIX));
    if (warningIndex >= 0) {
        result.warnings.splice(warningIndex, 1);
    }
}
