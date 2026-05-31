import type { ReadingModeBibleReferenceProcessorInput } from "./ReadingModeBibleReferenceProcessor";
import { processReadingModeBibleReferences as processReadingModeBibleReferencesFlow } from "./ReadingModeBibleReferenceProcessor";

export type ReadingModePluginFlowInput = Omit<ReadingModeBibleReferenceProcessorInput, "element">;

export function processReadingModeBibleReferences(
    input: ReadingModePluginFlowInput,
    element: HTMLElement,
): void {
    processReadingModeBibleReferencesFlow({
        ...input,
        element,
    });
}
