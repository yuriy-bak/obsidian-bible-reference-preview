import type { App } from "obsidian";
import type { EpubBibleImportResult } from "../infrastructure/EpubBibleImporter";
import type { BiblePluginLocale } from "../i18n/I18n";
import { JsZipEpubBibleImporter } from "../infrastructure/epub/JsZipEpubBibleImporter";
import type { ObsidianBibleIndexV2Repository } from "../infrastructure/v2/ObsidianBibleIndexV2Repository";
import { createImportSettingsDefaults, openBibleTranslationImportSettingsModal, type BibleTranslationImportSettings } from "../ui/BibleTranslationImportModal";
import { ProgressCancelModal } from "../ui/ProgressCancelModal";
import { importBibleFromEpub } from "../application/importBibleFromEpub";
import { formatEpubImportProgress, type EpubImportTranslate } from "./EpubImportMessages";
import { readAndValidateEpubFile, type EpubFileValidationTranslate } from "./EpubFileValidation";

export type PreparedEpubImport = {
    content: ArrayBuffer;
    importer: JsZipEpubBibleImporter;
    importSettings: BibleTranslationImportSettings;
};

export type PrepareEpubImportSettingsInput = {
    app: App;
    file: File;
    locale: BiblePluginLocale;
    translate: EpubFileValidationTranslate;
    createRepository(): ObsidianBibleIndexV2Repository;
};

export type ExecutePreparedEpubImportInput = {
    app: App;
    fileName: string;
    preparedImport: PreparedEpubImport;
    translate: EpubImportTranslate;
    createRepository(): ObsidianBibleIndexV2Repository;
    onImported(repository: ObsidianBibleIndexV2Repository, result: EpubBibleImportResult): Promise<void>;
};

export async function prepareEpubImportSettings(input: PrepareEpubImportSettingsInput): Promise<PreparedEpubImport | null> {
    const content = await readAndValidateEpubFile(input.file, input.translate);
    const importer = new JsZipEpubBibleImporter();
    const sourceMetadata = await importer.readMetadata(content);
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

    return { content, importer, importSettings };
}

export async function executePreparedEpubImport(input: ExecutePreparedEpubImportInput): Promise<EpubBibleImportResult> {
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

        const result = await importBibleFromEpub({
            epub: {
                fileName: input.fileName,
                content: input.preparedImport.content,
                translationId: input.preparedImport.importSettings.translationId,
                translationName: input.preparedImport.importSettings.translationName,
                language: input.preparedImport.importSettings.language,
            },
            importer: input.preparedImport.importer,
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
