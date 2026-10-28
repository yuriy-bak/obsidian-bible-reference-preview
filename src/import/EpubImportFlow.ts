import type { App } from "obsidian";
import type { BibleImportResult, BibleSource } from "../infrastructure/sources/BibleSource";
import type { BiblePluginLocale } from "../i18n/I18n";
import { createBibleSources, selectBibleSource } from "../infrastructure/sources/BibleSourceRegistry";
import type { ObsidianBibleIndexV2Repository } from "../infrastructure/v2/ObsidianBibleIndexV2Repository";
import { createImportSettingsDefaults, openBibleTranslationImportSettingsModal, type BibleTranslationImportSettings } from "../ui/BibleTranslationImportModal";
import { ProgressCancelModal } from "../ui/ProgressCancelModal";
import { importBible } from "../application/importBible";
import { formatEpubImportProgress, type EpubImportTranslate } from "./EpubImportMessages";
import { readAndValidateEpubFile, type EpubFileValidationTranslate } from "./EpubFileValidation";

export type PreparedEpubImport = {
    content: ArrayBuffer;
    source: BibleSource;
    importSettings: BibleTranslationImportSettings;
};

export type PrepareEpubImportSettingsInput = {
    app: App;
    file: File;
    locale: BiblePluginLocale;
    translate: EpubFileValidationTranslate;
    createRepository: () => ObsidianBibleIndexV2Repository;
};

export type ExecutePreparedEpubImportInput = {
    app: App;
    fileName: string;
    preparedImport: PreparedEpubImport;
    translate: EpubImportTranslate;
    createRepository: () => ObsidianBibleIndexV2Repository;
    onImported: (repository: ObsidianBibleIndexV2Repository, result: BibleImportResult) => Promise<void>;
};

export async function prepareEpubImportSettings(input: PrepareEpubImportSettingsInput): Promise<PreparedEpubImport | null> {
    const content = await readAndValidateEpubFile(input.file, input.translate);
    const source = selectBibleSource(createBibleSources(), input.file.name, content);
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

export async function executePreparedEpubImport(input: ExecutePreparedEpubImportInput): Promise<BibleImportResult> {
    const abortController = new AbortController();
    const progressModal = new ProgressCancelModal(
        input.app,
        input.translate("notice.importStarted", { fileName: input.fileName }),
        formatEpubImportProgress({ stage: "loading-zip", processedCount: 0, totalCount: 1 }, input.translate),
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
                onProgress: (progress) => progressModal.updateMessage(formatEpubImportProgress(progress, input.translate)),
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
