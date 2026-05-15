import { EpubBibleImporter, EpubBibleImportInput, EpubBibleImportResult } from "./EpubBibleImporter";

export class UnsupportedEpubBibleImporter implements EpubBibleImporter {
    async importEpub(_input: EpubBibleImportInput): Promise<EpubBibleImportResult> {
        throw new Error("EPUB import is not implemented yet.");
    }
}
