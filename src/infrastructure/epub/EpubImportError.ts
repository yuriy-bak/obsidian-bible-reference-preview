export class EpubImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "EpubImportError";
    }
}
