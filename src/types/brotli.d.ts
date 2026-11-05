declare module "brotli/dec/streams" {
    export class BrotliInput {
        constructor(buffer: Uint8Array);
    }
}

declare module "brotli/dec/decode" {
    /** The output the decoder writes to: it replaces `buffer` with a bigger one before each larger meta-block. */
    export type BrotliOutputStream = {
        buffer: Uint8Array;
        pos: number;
        write(buffer: Uint8Array, count: number): number;
    };
    export function BrotliDecompressedSize(input: Uint8Array): number;
    export function BrotliDecompress(input: import("brotli/dec/streams").BrotliInput, output: BrotliOutputStream): void;
}
