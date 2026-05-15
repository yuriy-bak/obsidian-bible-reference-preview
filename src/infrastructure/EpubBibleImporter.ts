import { BibleBook } from "../domain/BibleBook";
import { BibleIndexData } from "./BibleIndexData";

export type EpubBibleImportInput = {
    fileName: string;
    content: ArrayBuffer;
    translationId: string;
    translationName: string;
};

export type EpubBibleImportResult = {
    translationId: string;
    translationName: string;
    books: BibleBook[];
    bibleIndexData: BibleIndexData;
    warnings: string[];
};

export type EpubBibleImporter = {
    importEpub(input: EpubBibleImportInput): Promise<EpubBibleImportResult>;
};
