const assert = require("assert");
const {
  BibleReferenceParser,
  getBibleReferenceParserSignature,
} = require("../.test-build/src/parsing/BibleReferenceParser.js");
const {
  getBiblePluginLocaleForLanguage,
  normalizeBiblePluginLocale,
} = require("../.test-build/src/i18n/I18n.js");
const {
  getBibleIndexDataDirectoryPath,
  getPluginDirectoryPath,
} = require("../.test-build/src/infrastructure/PluginDirectoryPath.js");
const {
  createBookMapping,
  removeChapterNumberFromAlias,
} = require("../.test-build/src/parsing/BookMapping.js");
const { getParagraphReferencesKey } = require("../.test-build/src/editor/EditorTextAnalysis.js");
const { DEFAULT_TRANSLATION_ID, syntheticMetadata } = require("./fixtures/synthetic-bible-index.js");
const { getBibleChapterTextBlock, getBibleTextBlocks } = require("../.test-build/src/application/getBibleTexts.js");
const {
  findAdjacentChapter,
  getChapterTargetFromReferences,
  isVerseInRanges,
} = require("../.test-build/src/application/BibleChapterNavigation.js");
const {
  backFromBiblePreviewChapter,
  isBiblePreviewChapterModeActive,
  navigateBiblePreviewChapter,
  isBiblePreviewChapterHighlightHidden,
  setBiblePreviewChapterHighlightHidden,
  openBiblePreviewChapter,
  trackShownBiblePreviewContent,
} = require("../.test-build/src/preview-navigation/BiblePreviewChapterFlow.js");
const {
  BiblePreviewAnalyzer,
} = require("../.test-build/src/application/BiblePreviewAnalyzer.js");
const {
  LazyBibleIndexV2,
} = require("../.test-build/src/infrastructure/v2/LazyBibleIndexV2.js");
const {
  createBookMappingFromBibleIndexV2Data,
} = require("../.test-build/src/infrastructure/v2/createBookMappingFromBibleIndexV2Data.js");
const { JSDOM } = require("jsdom");
global.DOMParser = new JSDOM("").window.DOMParser;
const {
  enrichBookTableFromNavigationDocument,
  extractBookNavigationAliasesFromDocument,
  extractBookTableFromDocument,
  extractVersesFromDocument,
} = require("../.test-build/src/infrastructure/sources/jw-epub/jwEpubHtml.js");
const {
  parseXhtmlDocument,
} = require("../.test-build/src/infrastructure/epub/MarkupDocument.js");
const extractBookTableFromHtml = (html) => extractBookTableFromDocument(parseXhtmlDocument(html));
const enrichBookTableFromNavigationHtml = (bookTable, path, html) =>
  enrichBookTableFromNavigationDocument(bookTable, path, parseXhtmlDocument(html));
const extractBookNavigationAliasesFromHtml = (html, bookTable) =>
  extractBookNavigationAliasesFromDocument(parseXhtmlDocument(html), bookTable);
const extractVersesFromHtml = (html) => extractVersesFromDocument(parseXhtmlDocument(html));
const {
  extractBibleTextFromCompactBook,
} = require("../.test-build/src/infrastructure/v2/extractBibleTextFromCompactBook.js");
const {
  formatBibleComparisonTextBlocks,
  formatBibleTextBlocks,
} = require("../.test-build/src/application/BiblePreviewModel.js");
const {
  isCssColor,
  normalizeBibleReferenceLinkColor,
  normalizeFloatingPreviewBackgroundColor,
} = require("../.test-build/src/ui/cssColorValidation.js");
const {
  ReferenceUsageIndexService,
  REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES,
  REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES,
} = require("../.test-build/src/reference-usage/ReferenceUsageIndexService.js");
const {
  createChapterUsageQuery,
  groupReferenceUsagesByChapterVerses,
} = require("../.test-build/src/reference-usage/ReferenceUsageChapterGroups.js");
const { ensureLeafViewLoaded } = require("../.test-build/src/workspace/WorkspaceLeafViewLoading.js");
const JSZip = require("jszip");
const vm = require("vm");
const { readBibleFile } = require("../.test-build/src/import/BibleFileValidation.js");
const {
  EPUB_IMPORT_LIMITS,
  normalizeZipPath,
  readContainerOpfPath,
  readZipText,
  resolveZipPath,
  validateZipArchive,
} = require("../.test-build/src/infrastructure/epub/EpubContainerReader.js");
const {
  getSpineXhtmlItems,
  parseOpfDocument,
} = require("../.test-build/src/infrastructure/epub/EpubOpfReader.js");
const {
  EpubImportError,
} = require("../.test-build/src/infrastructure/epub/EpubImportError.js");

// Code that runs in Obsidian uses window timers.
global.window = global.window || global;

module.exports = {
  BibleReferenceParser,
  getParagraphReferencesKey,
  getBibleReferenceParserSignature,
  getBiblePluginLocaleForLanguage,
  normalizeBiblePluginLocale,
  getBibleIndexDataDirectoryPath,
  getPluginDirectoryPath,
  createBookMapping,
  removeChapterNumberFromAlias,
  getBibleChapterTextBlock,
  getBibleTextBlocks,
  findAdjacentChapter,
  getChapterTargetFromReferences,
  isVerseInRanges,
  backFromBiblePreviewChapter,
  isBiblePreviewChapterModeActive,
  navigateBiblePreviewChapter,
  isBiblePreviewChapterHighlightHidden,
  setBiblePreviewChapterHighlightHidden,
  openBiblePreviewChapter,
  trackShownBiblePreviewContent,
  BiblePreviewAnalyzer,
  LazyBibleIndexV2,
  createBookMappingFromBibleIndexV2Data,
  JSDOM,
  enrichBookTableFromNavigationDocument,
  extractBookNavigationAliasesFromDocument,
  extractBookTableFromDocument,
  extractVersesFromDocument,
  parseXhtmlDocument,
  extractBibleTextFromCompactBook,
  formatBibleComparisonTextBlocks,
  formatBibleTextBlocks,
  isCssColor,
  normalizeBibleReferenceLinkColor,
  normalizeFloatingPreviewBackgroundColor,
  ReferenceUsageIndexService,
  REFERENCE_USAGE_MAX_MARKDOWN_FILE_SIZE_BYTES,
  REFERENCE_USAGE_MOBILE_MAX_MARKDOWN_FILE_SIZE_BYTES,
  createChapterUsageQuery,
  groupReferenceUsagesByChapterVerses,
  ensureLeafViewLoaded,
  readBibleFile,
  EPUB_IMPORT_LIMITS,
  normalizeZipPath,
  readContainerOpfPath,
  readZipText,
  resolveZipPath,
  validateZipArchive,
  getSpineXhtmlItems,
  parseOpfDocument,
  EpubImportError,
  assert,
  DEFAULT_TRANSLATION_ID,
  syntheticMetadata,
  extractBookTableFromHtml,
  enrichBookTableFromNavigationHtml,
  extractBookNavigationAliasesFromHtml,
  extractVersesFromHtml,
  JSZip,
  vm,
};
