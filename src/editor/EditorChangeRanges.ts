import type { ViewUpdate } from "@codemirror/view";

export function didChangesTouchRange(update: ViewUpdate, from: number, to: number): boolean {
    let touched = false;
    update.changes.iterChangedRanges((changedFrom, changedTo) => {
        if (changedFrom === changedTo) {
            if (changedFrom > from && changedFrom < to) {
                touched = true;
            }
            return;
        }
        if (changedFrom < to && changedTo > from) {
            touched = true;
        }
    });
    return touched;
}
