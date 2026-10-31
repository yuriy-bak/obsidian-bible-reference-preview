/** Back/forward through what a reader showed, like a browser tab. Opening something new drops the forward entries. */
export class BibleReaderHistory<T> {
    private entries: T[] = [];
    private index = -1;

    constructor(
        private readonly isSame: (left: T, right: T) => boolean,
        private readonly limit = 100,
    ) {}

    get current(): T | null {
        return this.entries[this.index] ?? null;
    }

    canGoBack(): boolean {
        return this.index > 0;
    }

    canGoForward(): boolean {
        return this.index < this.entries.length - 1;
    }

    /** A new entry after the current one; the same place again only updates the current entry. */
    push(entry: T): void {
        const current = this.current;
        if (current !== null && this.isSame(current, entry)) {
            this.entries[this.index] = entry;
            return;
        }
        this.entries = [...this.entries.slice(0, this.index + 1), entry].slice(-this.limit);
        this.index = this.entries.length - 1;
    }

    /** Updates the current entry in place (a refresh, another translation after a deletion). */
    replaceCurrent(entry: T): void {
        if (this.index < 0) this.push(entry);
        else this.entries[this.index] = entry;
    }

    back(): T | null {
        if (!this.canGoBack()) return null;
        this.index -= 1;
        return this.current;
    }

    forward(): T | null {
        if (!this.canGoForward()) return null;
        this.index += 1;
        return this.current;
    }
}
