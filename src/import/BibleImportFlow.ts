import type { App } from "obsidian";
import type { BibleImportResult, BibleSource } from "../infrastructure/sources/BibleSource";
import type { BiblePluginLocale } from "../i18n/I18n";
import { createBibleSources, getMaxBibleFileBytes, selectBibleSource } from "../infrastructure/sources/BibleSourceRegistry";
import type { ObsidianBibleIndexV2Repository } from "../infrastructure/v2/ObsidianBibleIndexV2Repository";
import { createImportSettingsDefaults, openBibleTranslationImportSettingsModal, type BibleTranslationImportSettings } from "../ui/BibleTranslationImportModal";
import { ProgressCancelModal } from "../ui/ProgressCancelModal";
import { importBible } from "../application/importBible";
import { formatBibleImportProgress, type BibleImportTranslate } from "./BibleImportMessages";
import { readBibleFile } from "./BibleFileValidation";

export type PreparedBibleImport = {
    content: ArrayBuffer;
    source: BibleSource;
    importSettings: BibleTranslationImportSettings;
};

export type PrepareBibleImportInput = {
    app: App;
    file: File;
    locale: BiblePluginLocale;
    translate: BibleImportTranslate;
    createRepository: () => ObsidianBibleIndexV2Repository;
};

export type ExecutePreparedBibleImportInput = {
    app: App;
    fileName: string;
    preparedImport: PreparedBibleImport;
    translate: BibleImportTranslate;
    createRepository: () => ObsidianBibleIndexV2Repository;
    onImported: (repository: ObsidianBibleIndexV2Repository, result: BibleImportResult) => Promise<void>;
};

export async function prepareBibleImport(input: PrepareBibleImportInput): Promise<PreparedBibleImport | null> {
    const sources = createBibleSources();
    const content = await readBibleFile(input.file, getMaxBibleFileBytes(sources), input.translate);
    const source = await selectBibleSource(sources, { fileName: input.file.name, content });
    const sourceMetadata = await source.readMetadata(content);
    const defaults = createImportSettingsDefaults(input.file.name, sourceMetadata);
    const existingRepository = input.createRepository();
    await existingRepository.load();
    const translationAlreadyExists = existingRepository.getV2Data()?.translations[defaults.translationId] !== undefined;
    const importSettings = await openBibleTranslationImportSettingsModal(
        input.app,
        defaults,
        translationAlreadyExists,
        input.locale,
    );

    if (importSettings === null) {
        return null;
    }

    return { content, source, importSettings };
}

export async function executePreparedBibleImport(input: ExecutePreparedBibleImportInput): Promise<BibleImportResult> {
    const abortController = new AbortController();
    const progressModal = new ProgressCancelModal(
        input.app,
        input.translate("notice.importStarted", { fileName: input.fileName }),
        formatBibleImportProgress({ stage: "loading-zip", processedCount: 0, totalCount: 1 }, input.translate),
        input.translate("common.cancel"),
        () => abortController.abort(),
    );
    progressModal.open();

    try {
        const repository = input.createRepository();
        await repository.load();

        const result = await importBible({
            file: {
                fileName: input.fileName,
                content: input.preparedImport.content,
                translationId: input.preparedImport.importSettings.translationId,
                translationName: input.preparedImport.importSettings.translationName,
                language: input.preparedImport.importSettings.language,
            },
            source: input.preparedImport.source,
            repository,
            importOptions: {
                signal: abortController.signal,
                onProgress: (progress) => progressModal.updateMessage(formatBibleImportProgress(progress, input.translate)),
            },
        });

        await input.onImported(repository, result);
        progressModal.finish();
        return result;
    } catch (error) {
        progressModal.finish();
        throw error;
    }
}
