import { App, Notice, TFile, type TAbstractFile } from "obsidian";
import type { I18nKey } from "../i18n/I18n";
import { BackgroundTaskProgress } from "../ui/BackgroundTaskProgress";
import { ReferenceUsageBuildQueue } from "./ReferenceUsageBuildQueue";
import {
    isReferenceUsageIndexBuildAbortError,
    type ReferenceUsageIndexBuildProgress,
    type ReferenceUsageIndexService,
    type ReferenceUsageIndexStats,
} from "./ReferenceUsageIndexService";

const REFERENCE_USAGE_FILE_UPDATE_DELAY_MS = 1500;

export type ReferenceUsageControllerInput = {
    app: App;
    getService: () => ReferenceUsageIndexService;
    isIndexingEnabled: () => boolean;
    shouldAutoProcessEvents: () => boolean;
    hasImportedTranslations: () => boolean;
    showNoImportedTranslationsNotice: () => void;
    translate: (key: I18nKey, params?: Record<string, string | number | boolean | null | undefined>) => string;
    refreshSettings: () => void;
    onIndexChanged: () => void;
};

type ReferenceUsageBuildRunOptions = {
    title: I18nKey;
    // The progress notice with its cancel button, and the result notices.
    showNotices: boolean;
    onProgress?: (progress: ReferenceUsageIndexBuildProgress) => void;
};

export class ReferenceUsageController {
    private readonly fileUpdateTimeouts = new Map<string, number>();
    private readonly buildQueue = new ReferenceUsageBuildQueue();
    private activeBuild: { progress: BackgroundTaskProgress; abortController: AbortController } | null = null;
    private unloaded = false;

    constructor(private readonly input: ReferenceUsageControllerInput) {}

    /** The build running now, for the settings status row; null when none runs. */
    public getActiveBuildProgress(): BackgroundTaskProgress | null {
        return this.activeBuild?.progress ?? null;
    }

    public async buildIndex(forceRebuild: boolean): Promise<void> {
        if (!this.input.isIndexingEnabled()) {
            new Notice(this.input.translate("notice.referenceUsageIndexDisabled"), 4000);
            return;
        }
        if (!this.input.hasImportedTranslations()) {
            this.input.showNoImportedTranslationsNotice();
            return;
        }
        const started = await this.buildQueue.tryRun(async () => {
            await this.runBuild(forceRebuild, { title: "notice.referenceUsageIndexBuildStarted", showNotices: true });
        });
        if (!started) {
            this.showAlreadyRunning();
        }
    }

    // Incremental update for the usages panel refresh button: progress is shown in the panel, not in a notice.
    // Returns true when the index was updated.
    public async updateIndexInBackground(onProgress?: (progress: ReferenceUsageIndexBuildProgress) => void): Promise<boolean> {
        if (!this.input.isIndexingEnabled()) {
            new Notice(this.input.translate("notice.referenceUsageIndexDisabled"), 4000);
            return false;
        }
        if (!this.input.hasImportedTranslations()) {
            this.input.showNoImportedTranslationsNotice();
            return false;
        }
        let updated = false;
        const started = await this.buildQueue.tryRun(async () => {
            updated = await this.runBuild(false, { title: "notice.referenceUsageIndexBuildStarted", showNotices: false, onProgress });
        });
        if (!started) {
            this.showAlreadyRunning();
        }
        return updated;
    }

    // Full reparse in the background after the book names changed. Queued behind a running build,
    // and checked again when it starts, since that build may already have used the new parser.
    public requestRebuildAfterParserChange(): void {
        this.buildQueue.schedule(async () => {
            if (!this.input.shouldAutoProcessEvents() || !this.input.getService().isOutdated()) return;
            await this.runBuild(false, { title: "notice.referenceUsageIndexAutoRebuildStarted", showNotices: true });
        });
    }

    public cancelBuild(): void {
        this.activeBuild?.abortController.abort();
    }

    // The build runs in the background: notes, previews and searches keep working with the previous index
    // until it finishes. Returns true when the index was updated.
    private async runBuild(forceRebuild: boolean, options: ReferenceUsageBuildRunOptions): Promise<boolean> {
        const abortController = new AbortController();
        const files = this.input.app.vault.getMarkdownFiles();
        const progress = new BackgroundTaskProgress(
            { title: this.input.translate(options.title), cancel: this.input.translate("common.cancel") },
            this.formatBuildProgress({ totalFileCount: files.length, processedFileCount: 0, updatedFileCount: 0, skippedLargeFileCount: 0 }),
            () => abortController.abort(),
        );
        this.activeBuild = { progress, abortController };
        if (options.showNotices) {
            progress.showNotice();
        }
        this.input.refreshSettings();

        try {
            const result = await this.input.getService().build(files, forceRebuild, {
                signal: abortController.signal,
                onProgress: (buildProgress) => {
                    progress.update(this.formatBuildProgress(buildProgress));
                    options.onProgress?.(buildProgress);
                },
            });
            if (options.showNotices) {
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
            }
            return true;
        } catch (error) {
            if (isReferenceUsageIndexBuildAbortError(error)) {
                if (!this.unloaded) {
                    new Notice(this.input.translate("notice.referenceUsageIndexBuildCancelled"), 5000);
                }
            } else {
                console.warn("Bible reference usage index build failed", error);
                new Notice(this.input.translate("notice.referenceUsageIndexSaveFailed"), 5000);
            }
            return false;
        } finally {
            progress.finish();
            if (this.activeBuild?.progress === progress) {
                this.activeBuild = null;
            }
            if (!this.unloaded) {
                this.input.refreshSettings();
                this.input.onIndexChanged();
            }
        }
    }

    private showAlreadyRunning(): void {
        new Notice(this.input.translate("notice.referenceUsageIndexAlreadyRunning"), 4000);
        this.activeBuild?.progress.showNotice();
    }

    public async clearIndex(): Promise<void> {
        // A running build would put its result back over the cleared index.
        this.cancelBuild();
        try {
            await this.input.getService().clear();
            this.input.refreshSettings();
            this.input.onIndexChanged();
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

    // On unload: stops a running build and writes a scheduled save.
    public clearPendingUpdates(): void {
        this.unloaded = true;
        this.cancelBuild();
        for (const timeout of this.fileUpdateTimeouts.values()) window.clearTimeout(timeout);
        this.fileUpdateTimeouts.clear();
        this.input.getService().flushPendingSave();
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
            ...(stats.isOutdated ? [this.input.translate("notice.referenceUsageIndexStatsOutdated")] : []),
        ].join("\n");
    }
}

function formatMegabytes(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
