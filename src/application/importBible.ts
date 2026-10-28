import { BibleImportInput, BibleImportOptions, BibleImportResult, BibleSource } from "../infrastructure/sources/BibleSource";
import { ObsidianBibleIndexV2Repository } from "../infrastructure/v2/ObsidianBibleIndexV2Repository";

export type ImportBibleInput = {
    file: BibleImportInput;
    source: BibleSource;
    repository: ObsidianBibleIndexV2Repository;
    importOptions?: BibleImportOptions;
};

export async function importBible(input: ImportBibleInput): Promise<BibleImportResult> {
    const result = await input.source.importBible(input.file, input.importOptions);

    await input.repository.saveV2({
        metadata: result.bibleIndexV2Data,
        books: result.compactBooks,
        report: result.report,
    });

    return result;
}
