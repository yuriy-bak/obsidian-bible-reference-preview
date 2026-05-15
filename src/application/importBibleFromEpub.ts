import { EpubBibleImporter, EpubBibleImportInput, EpubBibleImportResult } from "../infrastructure/EpubBibleImporter";
import { WritableBibleIndexRepository } from "../infrastructure/BibleIndexRepository";

export type ImportBibleFromEpubInput = {
    epub: EpubBibleImportInput;
    importer: EpubBibleImporter;
    repository: WritableBibleIndexRepository;
};

export async function importBibleFromEpub(input: ImportBibleFromEpubInput): Promise<EpubBibleImportResult> {
    const result = await input.importer.importEpub(input.epub);
    await input.repository.save(result.bibleIndexData);

    return result;
}
