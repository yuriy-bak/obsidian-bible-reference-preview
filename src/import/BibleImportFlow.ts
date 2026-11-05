import type { App } from "obsidian";
import type { BibleImportResult, BibleSource } from "../infrastructure/sources/BibleSource";
import type { BiblePluginLocale } from "../i18n/I18n";
import { createBibleSources, getMaxBibleFileBytes, selectBibleSource } from "../infrastructure/sources/BibleSourceRegistry";
import type { ObsidianBibleIndexRepository } from "../infrastructure/bible-index/ObsidianBibleIndexRepository";
import { createImportSettingsDefaults, openBibleTranslationImportSettingsModal, type BibleTranslationImportSettings } from "../ui/BibleTranslationImportModal";
import { BackgroundTaskProgress } from "../ui/BackgroundTaskProgress";
import { openVersificationChoiceModal } from "../ui/VersificationChoiceModal";
import { createBibleImportAbortError } from "../infrastructure/sources/BibleImportCancellation";
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
    createRepository: () => ObsidianBibleIndexRepository;
};

export type ExecutePreparedBibleImportInput = {
    app: App;
    fileName: string;
    preparedImport: PreparedBibleImport;
    translate: BibleImportTranslate;
    createRepository: () => ObsidianBibleIndexRepository;
    onImported: (repository: ObsidianBibleIndexRepository, result: BibleImportResult) => Promise<void>;
    /** Called once the import starts, with its progress (a notice with a cancel button). */
    onStarted?: (progress: BackgroundTaskProgress) => void;
};

export async function prepareBibleImport(input: PrepareBibleImportInput): Promise<PreparedBibleImport | null> {
    const sources = createBibleSources();
    const content = await readBibleFile(input.file, getMaxBibleFileBytes(sources), input.translate);
    const source = await selectBibleSource(sources, { fileName: input.file.name, content });
    const sourceMetadata = await source.readMetadata(content);
    const defaults = createImportSettingsDefaults(input.file.name, sourceMetadata);
    const existingRepository = input.createRepository();
    await existingRepository.load();
    const translationAlreadyExists = existingRepository.getIndexData()?.translations[defaults.translationId] !== undefined;
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
    // Runs in the background: the progress notice can be closed, and the plugin keeps working with the
    // translations imported before; the new one appears when the import finishes.
    const abortController = new AbortController();
    const progress = new BackgroundTaskProgress(
        { title: input.translate("notice.importStarted", { fileName: input.fileName }), cancel: input.translate("common.cancel") },
        formatBibleImportProgress({ stage: "loading-zip", processedCount: 0, totalCount: 1 }, input.translate),
        () => abortController.abort(),
    );
    progress.showNotice();
    input.onStarted?.(progress);

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
                onProgress: (importProgress) => progress.update(formatBibleImportProgress(importProgress, input.translate)),
            },
            chooseVersification: async (detection) => {
                const key = await openVersificationChoiceModal(input.app, input.preparedImport.importSettings.translationName, detection, input.translate);
                if (key === null || abortController.signal.aborted) {
                    throw createBibleImportAbortError();
                }
                return key;
            },
        });

        await input.onImported(repository, result);
        return result;
    } finally {
        progress.finish();
    }
}
