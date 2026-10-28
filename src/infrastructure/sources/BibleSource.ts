import { BibleBook } from "../../domain/BibleBook";
import { BibleIndexV2Data } from "../v2/BibleIndexV2Data";
import { CompactBibleBookData } from "../v2/CompactBibleBookData";

export type BibleImportInput = {
    fileName: string;
    content: ArrayBuffer;
    translationId: string;
    translationName: string;
    language: string;
};

export type BibleSourceMetadata = {
    title: string | null;
    language: string | null;
};

export type BibleImportProgressStage =
    | "loading-zip"
    | "reading-documents"
    | "extracting-verses"
    | "building-index";

export type BibleImportProgress = {
    stage: BibleImportProgressStage;
    processedCount: number;
    totalCount: number;
};

export type BibleImportOptions = {
    signal?: AbortSignal;
    onProgress?: (progress: BibleImportProgress) => void;
};

export type BibleImportReport = {
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

export type BibleImportResult = {
    translationId: string;
    translationName: string;
    language: string;
    books: BibleBook[];
    bibleIndexV2Data: BibleIndexV2Data;
    compactBooks: Record<string, CompactBibleBookData>;
    report: BibleImportReport;
    warnings: string[];
};

/**
 * One supported Bible file format. A source reads its own container and markup and hands
 * books and verses to BibleIndexBuilder, which produces the stored index.
 */
export type BibleSource = {
    readonly id: string;
    canHandle: (fileName: string, content: ArrayBuffer) => boolean;
    readMetadata: (content: ArrayBuffer) => Promise<BibleSourceMetadata>;
    importBible: (input: BibleImportInput, options?: BibleImportOptions) => Promise<BibleImportResult>;
};
