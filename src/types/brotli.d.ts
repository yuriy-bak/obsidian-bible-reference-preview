declare module "brotli/decompress" {
    /** Decodes a Brotli stream; `outputSize` is optional. */
    function decompress(input: Uint8Array, outputSize?: number): Uint8Array;
    export = decompress;
}
