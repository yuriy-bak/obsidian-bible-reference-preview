import { App, Modal, Setting } from "obsidian";

export class ProgressCancelModal extends Modal {
    private messageEl: HTMLDivElement | null = null;
    private completed = false;

    constructor(
        app: App,
        private readonly titleText: string,
        private messageText: string,
        private readonly cancelText: string,
        private readonly onCancel: () => void,
    ) {
        super(app);
    }

    onOpen(): void {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: this.titleText });
        this.messageEl = contentEl.createDiv({ text: this.messageText });
        this.messageEl.style.whiteSpace = "pre-wrap";
        new Setting(contentEl)
            .addButton((button) => button
                .setButtonText(this.cancelText)
                .onClick(() => {
                    this.onCancel();
                    this.close();
                }));
    }

    onClose(): void {
        this.contentEl.empty();
        this.messageEl = null;
        if (!this.completed) {
            this.onCancel();
        }
    }

    public updateMessage(messageText: string): void {
        this.messageText = messageText;
        if (this.messageEl !== null) {
            this.messageEl.textContent = messageText;
        }
    }

    public finish(): void {
        this.completed = true;
        this.close();
    }
}
