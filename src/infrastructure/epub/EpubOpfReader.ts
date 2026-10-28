import { findElementsByName, findFirstElementByName, parseXmlDocument } from "./MarkupDocument";

export type EpubManifestItem = {
    id: string;
    href: string;
    mediaType: string;
};

export type EpubSpineItem = {
    idref: string;
};

export type EpubOpfDocument = {
    manifestItems: EpubManifestItem[];
    spineItems: EpubSpineItem[];
};

export type EpubOpfMetadata = {
    title: string | null;
    language: string | null;
};

export function parseOpfDocument(opfXml: string): EpubOpfDocument {
    const document = parseXmlDocument(opfXml);

    return {
        manifestItems: parseManifestItems(document),
        spineItems: parseSpineItems(document),
    };
}

export function parseOpfMetadata(opfXml: string): EpubOpfMetadata {
    const document = parseXmlDocument(opfXml);

    return {
        title: getElementText(document, "dc:title") ?? getElementText(document, "title"),
        language: getElementText(document, "dc:language") ?? getElementText(document, "language"),
    };
}

export function getSpineXhtmlItems(opf: EpubOpfDocument): EpubManifestItem[] {
    const manifestById = new Map(opf.manifestItems.map((item) => [item.id, item]));

    return opf.spineItems
        .map((item) => manifestById.get(item.idref))
        .filter((item): item is EpubManifestItem => item !== undefined)
        .filter((item) => item.mediaType === "application/xhtml+xml" || item.mediaType === "text/html");
}

function parseManifestItems(document: Document): EpubManifestItem[] {
    const result: EpubManifestItem[] = [];

    for (const element of findElementsByName(document, "item")) {
        const id = element.getAttribute("id");
        const href = element.getAttribute("href");

        if (id === null || href === null) {
            continue;
        }

        result.push({ id, href, mediaType: element.getAttribute("media-type") ?? "" });
    }

    return result;
}

function parseSpineItems(document: Document): EpubSpineItem[] {
    const result: EpubSpineItem[] = [];

    for (const element of findElementsByName(document, "itemref")) {
        const idref = element.getAttribute("idref");

        if (idref !== null) {
            result.push({ idref });
        }
    }

    return result;
}

function getElementText(document: Document, name: string): string | null {
    const value = (findFirstElementByName(document, name)?.textContent ?? "").replace(/\s+/g, " ").trim();
    return value.length === 0 ? null : value;
}
