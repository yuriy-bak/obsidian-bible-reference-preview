import { Notice } from "obsidian";

export type BackgroundTaskProgressTexts = {
    title: string;
    cancel: string;
};

/**
 * A long task running in the background (an import, an index build): its progress is shown in a notice that
 * stays until the task ends and can be closed without stopping the task, and in any status rows that
 * subscribe to it (the settings). Cancel stops the task.
 */
export class BackgroundTaskProgress {
    private notice: Notice | null = null;
    private noticeMessageEl: HTMLElement | null = null;
    private readonly listeners = new Set<() => void>();
    private finished = false;

    constructor(
        private readonly texts: BackgroundTaskProgressTexts,
        private message: string,
        private readonly onCancel: () => void,
    ) {}

    get title(): string {
        return this.texts.title;
    }

    get cancelText(): string {
        return this.texts.cancel;
    }

    get currentMessage(): string {
        return this.message;
    }

    get isFinished(): boolean {
        return this.finished;
    }

    /** Shows the progress notice, again if the user closed it. */
    showNotice(): void {
        if (this.finished || (this.notice !== null && this.notice.messageEl.isConnected)) {
            return;
        }
        const fragment = createFragment((el) => {
            el.createDiv({ text: this.texts.title, cls: "bible-reference-preview-task-title" });
            this.noticeMessageEl = el.createDiv({ text: this.message, cls: "bible-reference-preview-task-message" });
            el.createEl("button", { text: this.texts.cancel, cls: "bible-reference-preview-task-cancel" }, (buttonEl) => {
                buttonEl.addEventListener("click", (event) => {
                    event.stopPropagation();
                    this.cancel();
                });
            });
        });
        this.notice = new Notice(fragment, 0);
    }

    update(message: string): void {
        if (this.finished || message === this.message) {
            return;
        }
        this.message = message;
        this.noticeMessageEl?.setText(message);
        this.notifyListeners();
    }

    cancel(): void {
        if (this.finished) {
            return;
        }
        this.onCancel();
    }

    /** Hides the notice and tells the status rows to go away. */
    finish(): void {
        if (this.finished) {
            return;
        }
        this.finished = true;
        this.notice?.hide();
        this.notice = null;
        this.noticeMessageEl = null;
        this.notifyListeners();
        this.listeners.clear();
    }

    /** Calls the listener on every progress change and at the end; returns the unsubscribe function. */
    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notifyListeners(): void {
        for (const listener of [...this.listeners]) {
            listener();
        }
    }
}

/**
 * A status row for the settings: the task's progress text and a cancel button, updated live. The row
 * removes itself when the task ends and stops listening once the settings re-render it away.
 */
export function renderBackgroundTaskStatus(containerEl: HTMLElement, task: BackgroundTaskProgress): void {
    if (task.isFinished) {
        return;
    }
    const rowEl = containerEl.createDiv({ cls: "bible-reference-preview-task-status" });
    const textEl = rowEl.createDiv({ cls: "bible-reference-preview-task-status-text" });
    const render = (): void => {
        textEl.setText(`${task.title} ${task.currentMessage}`);
    };
    render();
    rowEl.createEl("button", { text: task.cancelText }, (buttonEl) => {
        buttonEl.addEventListener("click", (event) => {
            event.preventDefault();
            task.cancel();
        });
    });
    let attached = false;
    const unsubscribe = task.subscribe(() => {
        // Wait until the row is in the document, then stop once it has left it.
        if (rowEl.isConnected) {
            attached = true;
        } else if (attached) {
            unsubscribe();
            return;
        }
        if (task.isFinished) {
            rowEl.remove();
            return;
        }
        render();
    });
}
