import { App, Notice, TFile, type TAbstractFile } from "obsidian";
import type { I18nKey } from "../i18n/I18n";
import { ProgressCancelModal } from "../ui/ProgressCancelModal";
import {
    isReferenceUsageIndexBuildAbortError,
    type ReferenceUsageIndexBuildProgress,
    type ReferenceUsageIndexService,
    type ReferenceUsageIndexStats,
} from "./ReferenceUsageIndexService";

const REFERENCE_USAGE_FILE_UPDATE_DELAY_MS = 1500;

export type ReferenceUsageControllerInput = {
    app: App;
    getService(): ReferenceUsageIndexService;
    isIndexingEnabled(): boolean;
    shouldAutoProcessEvents(): boolean;
    hasImportedTranslations(): boolean;
    translate(key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>): string;
    refreshSettings(): void;
};

export class ReferenceUsageController {
    private readonly fileUpdateTimeouts = new Map<string, number>();
    private indexingInProgress = false;

    constructor(private readonly input: ReferenceUsageControllerInput) {}

    public async buildIndex(forceRebuild: boolean): Promise<void> {
        if (!this.input.isIndexingEnabled()) {
            new Notice(this.input.translate("notice.referenceUsageIndexDisabled"), 4000);
            return;
        }
        if (!this.input.hasImportedTranslations()) {
            new Notice(this.input.translate("notice.noImportedTranslations"), 4000);
            return;
        }
        if (this.indexingInProgress) {
            new Notice(this.input.translate("notice.referenceUsageIndexAlreadyRunning"), 4000);
            return;
        }

        this.indexingInProgress = true;
        const abortController = new AbortController();
        const files = this.input.app.vault.getMarkdownFiles();
        const progressModal = new ProgressCancelModal(
            this.input.app,
            this.input.translate("notice.referenceUsageIndexBuildStarted"),
            this.formatBuildProgress({
                totalFileCount: files.length,
                processedFileCount: 0,
                updatedFileCount: 0,
                skippedLargeFileCount: 0,
            }),
            this.input.translate("common.cancel"),
            () => abortController.abort(),
        );
        progressModal.open();

        try {
            const result = await this.input.getService().build(files, forceRebuild, {
                signal: abortController.signal,
                onProgress: (progress) => progressModal.updateMessage(this.formatBuildProgress(progress)),
            });
            new Notice(this.input.translate("notice.referenceUsageIndexBuildCompleted", {
                fileCount: result.fileCount,
                updatedFileCount: result.updatedFileCount,
                referenceCount: result.referenceCount,
            }), 8000);
            if (result.skippedLargeFileCount > 0) {
                new Notice(this.input.translate("notice.referenceUsageIndexSkippedLargeFiles", {
                    count: result.skippedLargeFileCount,
                    maxSize: formatMegabytes(result.maxFileSizeBytes),
                }), 8000);
            }
        } catch (error) {
            if (isReferenceUsageIndexBuildAbortError(error)) {
                new Notice(this.input.translate("notice.referenceUsageIndexBuildCancelled"), 5000);
            } else {
                console.warn("Bible reference usage index build failed", error);
                new Notice(this.input.translate("notice.referenceUsageIndexSaveFailed"), 5000);
            }
        } finally {
            progressModal.finish();
            this.indexingInProgress = false;
            this.input.refreshSettings();
        }
    }

    public async clearIndex(): Promise<void> {
        try {
            await this.input.getService().clear();
            this.input.refreshSettings();
            new Notice(this.input.translate("notice.referenceUsageIndexCleared"), 4000);
        } catch (error) {
            console.warn("Bible reference usage index clear failed", error);
            new Notice(this.input.translate("notice.referenceUsageIndexSaveFailed"), 5000);
        }
    }

    public showStats(): void {
        const stats = this.input.getService().getStats();
        new Notice(this.formatStats(stats), 12000);
    }

    public handleFileCreateOrModify(file: TAbstractFile): void {
        if (!(file instanceof TFile) || !this.input.shouldAutoProcessEvents()) return;
        const service = this.input.getService();
        if (!service.shouldIndexFile(file)) {
            service.removeFile(file.path);
            return;
        }
        this.scheduleFileUpdate(file);
    }

    public handleFileDelete(file: TAbstractFile): void {
        if (!this.input.shouldAutoProcessEvents()) return;
        this.input.getService().removeFile(file.path);
    }

    public handleFileRename(file: TAbstractFile, oldPath: string): void {
        if (!this.input.shouldAutoProcessEvents()) return;
        this.input.getService().removeFile(oldPath);
        this.handleFileCreateOrModify(file);
    }

    public clearPendingUpdates(): void {
        for (const timeout of this.fileUpdateTimeouts.values()) window.clearTimeout(timeout);
        this.fileUpdateTimeouts.clear();
        this.input.getService().clearPendingSave();
    }

    private scheduleFileUpdate(file: TFile): void {
        const existingTimeout = this.fileUpdateTimeouts.get(file.path);
        if (existingTimeout !== undefined) window.clearTimeout(existingTimeout);
        const timeout = window.setTimeout(() => {
            this.fileUpdateTimeouts.delete(file.path);
            void this.input.getService().updateFile(file);
        }, REFERENCE_USAGE_FILE_UPDATE_DELAY_MS);
        this.fileUpdateTimeouts.set(file.path, timeout);
    }

    private formatBuildProgress(progress: ReferenceUsageIndexBuildProgress): string {
        return this.input.translate("notice.referenceUsageIndexBuildProgress", {
            processed: progress.processedFileCount,
            total: progress.totalFileCount,
            updated: progress.updatedFileCount,
            skipped: progress.skippedLargeFileCount,
        });
    }

    private formatStats(stats: ReferenceUsageIndexStats): string {
        return [
            this.input.translate("notice.referenceUsageIndexStats"),
            this.input.translate("notice.referenceUsageIndexStatsFiles", { count: stats.fileCount }),
            this.input.translate("notice.referenceUsageIndexStatsReferences", { count: stats.referenceCount }),
            this.input.translate("notice.referenceUsageIndexStatsUpdated", { date: stats.updatedAt <= 0 ? this.input.translate("notice.none") : new Date(stats.updatedAt).toLocaleString() }),
            this.input.translate("notice.referenceUsageIndexStatsPath", { path: stats.indexPath }),
        ].join("\n");
    }
}

function formatMegabytes(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
