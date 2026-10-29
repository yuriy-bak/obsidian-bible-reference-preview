// Shared by the floating preview window and its pointer controller.

export type PreviewPosition = { left: number; top: number };
export type PreviewSize = { width: number; height: number };
export type PreviewViewport = { left: number; top: number; width: number; height: number };
export type PreviewSafeMargins = { top: number; right: number; bottom: number; left: number };
export type PreviewResizeResult = PreviewPosition & PreviewSize;

export const COLLAPSED_BUTTON_SIZE = 42;
export const MIN_WIDTH = 260;
export const MIN_HEIGHT = 140;

export function clampNumber(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), Math.max(min, max));
}
