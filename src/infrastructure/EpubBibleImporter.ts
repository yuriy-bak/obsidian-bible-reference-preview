import { BibleBook } from "../domain/BibleBook";
import { BibleIndexV2Data } from "./v2/BibleIndexV2Data";
import { CompactBibleBookData } from "./v2/CompactBibleBookData";

export type EpubBibleImportInput = {
    fileName: string;
    content: ArrayBuffer;
    translationId: string;
    translationName: string;
    language: string;
};

export type EpubBibleSourceMetadata = {
    title: string | null;
    language: string | null;
};

export type EpubBibleImportReport = {
    fileName: string;
    translationId: string;
    translationName: string;
    language: string;
    books: number;
    chapters: number;
    verses: number;
    footnotes: number;
    warnings: string[];
    createdAt: string;
    metadataBytes: number;
    booksBytes: number;
};

export type EpubBibleImportResult = {
    translationId: string;
    translationName: string;
    language: string;
    books: BibleBook[];
    bibleIndexV2Data: BibleIndexV2Data;
    compactBooks: Record<string, CompactBibleBookData>;
    report: EpubBibleImportReport;
    warnings: string[];
};

export type EpubBibleImporter = {
    readMetadata?(content: ArrayBuffer): Promise<EpubBibleSourceMetadata>;
    importEpub(input: EpubBibleImportInput): Promise<EpubBibleImportResult>;
};
