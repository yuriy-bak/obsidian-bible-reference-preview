import { BibleReadingModePreviewController, type BibleReadingModePreviewControllerInput } from "../ui/BibleReadingModePreviewController";
import { FloatingBiblePreviewWindow, type FloatingBiblePreviewWindowInput } from "../ui/FloatingBiblePreviewWindow";

export type FloatingPreviewWindowInitializationInput = {
    createInput(): FloatingBiblePreviewWindowInput;
    registerDisposer(disposer: () => void): void;
};

export function initializeFloatingPreviewWindow(input: FloatingPreviewWindowInitializationInput): FloatingBiblePreviewWindow {
    const floatingPreviewWindow = new FloatingBiblePreviewWindow(input.createInput());
    input.registerDisposer(() => floatingPreviewWindow.destroy());
    return floatingPreviewWindow;
}

export function initializeReadingModePreviewController(
    input: BibleReadingModePreviewControllerInput,
    registerDisposer: (disposer: () => void) => void,
): BibleReadingModePreviewController {
    const controller = new BibleReadingModePreviewController(input);
    registerDisposer(() => controller.destroy());
    return controller;
}
