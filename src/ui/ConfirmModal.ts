import { App, Modal, Setting } from "obsidian";

export type ConfirmModalOptions = {
    title: string;
    messageLines: string[];
    confirmText: string;
    cancelText: string;
};

export function openConfirmModal(app: App, options: ConfirmModalOptions): Promise<boolean> {
    return new Promise((resolve) => {
        new ConfirmModal(app, options, resolve).open();
    });
}

class ConfirmModal extends Modal {
    private resolved = false;

    constructor(app: App, private readonly options: ConfirmModalOptions, private readonly resolve: (confirmed: boolean) => void) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        this.setTitle(this.options.title);
        for (const line of this.options.messageLines) {
            contentEl.createEl("p", { text: line });
        }
        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText(this.options.cancelText)
                .onClick(() => this.close()))
            .addButton((button) => button
                .setButtonText(this.options.confirmText)
                .setDestructive()
                .onClick(() => {
                    this.finish(true);
                    this.close();
                }));
    }

    onClose(): void {
        this.contentEl.empty();
        this.finish(false);
    }

    private finish(confirmed: boolean): void {
        if (this.resolved) {
            return;
        }
        this.resolved = true;
        this.resolve(confirmed);
    }
}
