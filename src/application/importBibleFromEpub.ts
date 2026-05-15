import { EpubBibleImporter, EpubBibleImportInput, EpubBibleImportResult } from "../infrastructure/EpubBibleImporter";
import { ObsidianBibleIndexV2Repository } from "../infrastructure/v2/ObsidianBibleIndexV2Repository";

export type ImportBibleFromEpubInput = {
    epub: EpubBibleImportInput;
    importer: EpubBibleImporter;
    repository: ObsidianBibleIndexV2Repository;
};

export async function importBibleFromEpub(input: ImportBibleFromEpubInput): Promise<EpubBibleImportResult> {
    const result = await input.importer.importEpub(input.epub);

    await input.repository.saveV2({
        metadata: result.bibleIndexV2Data,
        books: result.compactBooks,
        report: result.report,
    });

    return result;
}
