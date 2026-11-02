import JSZip from "jszip";

// One import reads the same file several times (each source checks whether it recognizes the file, then the
// metadata, then the import itself); the archive is unpacked once per file content.
const loadedArchives = new WeakMap<ArrayBuffer, Promise<JSZip>>();

export function loadZipArchive(content: ArrayBuffer): Promise<JSZip> {
    let archive = loadedArchives.get(content);
    if (archive === undefined) {
        archive = JSZip.loadAsync(content);
        loadedArchives.set(content, archive);
        archive.catch(() => loadedArchives.delete(content));
    }
    return archive;
}
