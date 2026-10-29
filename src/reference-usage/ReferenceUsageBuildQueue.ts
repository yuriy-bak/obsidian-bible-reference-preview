type BuildTask = () => Promise<void>;

/**
 * Runs index builds one at a time. A build requested while another one runs is not dropped:
 * the latest such request runs once after the current build finishes.
 */
export class ReferenceUsageBuildQueue {
    private running = false;
    private pendingTask: BuildTask | null = null;

    get isRunning(): boolean {
        return this.running;
    }

    /** Runs the task now, or returns false without running it when a build is already in progress. */
    async tryRun(task: BuildTask): Promise<boolean> {
        if (this.running) return false;
        this.running = true;
        try {
            await task();
        } finally {
            this.running = false;
            this.runPendingTask();
        }
        return true;
    }

    /** Runs the task now, or after the current build when one is in progress. */
    schedule(task: BuildTask): void {
        if (this.running) {
            this.pendingTask = task;
            return;
        }
        void this.tryRun(task);
    }

    private runPendingTask(): void {
        const task = this.pendingTask;
        if (task === null) return;
        this.pendingTask = null;
        void this.tryRun(task);
    }
}
