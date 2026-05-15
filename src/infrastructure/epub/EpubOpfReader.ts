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

export function parseOpfDocument(opfXml: string): EpubOpfDocument {
    return {
        manifestItems: parseManifestItems(opfXml),
        spineItems: parseSpineItems(opfXml),
    };
}

export function getSpineXhtmlItems(opf: EpubOpfDocument): EpubManifestItem[] {
    const manifestById = new Map(opf.manifestItems.map((item) => [item.id, item]));

    return opf.spineItems
        .map((item) => manifestById.get(item.idref))
        .filter((item): item is EpubManifestItem => item !== undefined)
        .filter((item) => item.mediaType === "application/xhtml+xml" || item.mediaType === "text/html");
}

function parseManifestItems(opfXml: string): EpubManifestItem[] {
    const result: EpubManifestItem[] = [];
    const itemPattern = /<item\s+([^>]+?)\/?\s*>/gi;

    for (let match = itemPattern.exec(opfXml); match !== null; match = itemPattern.exec(opfXml)) {
        const attributes = parseAttributes(match[1]);
        const id = attributes.get("id");
        const href = attributes.get("href");
        const mediaType = attributes.get("media-type") ?? "";

        if (id === undefined || href === undefined) {
            continue;
        }

        result.push({ id, href, mediaType });
    }

    return result;
}

function parseSpineItems(opfXml: string): EpubSpineItem[] {
    const result: EpubSpineItem[] = [];
    const itemRefPattern = /<itemref\s+([^>]+?)\/?\s*>/gi;

    for (let match = itemRefPattern.exec(opfXml); match !== null; match = itemRefPattern.exec(opfXml)) {
        const attributes = parseAttributes(match[1]);
        const idref = attributes.get("idref");

        if (idref !== undefined) {
            result.push({ idref });
        }
    }

    return result;
}

function parseAttributes(rawAttributes: string): Map<string, string> {
    const attributes = new Map<string, string>();
    const attributePattern = /([\w:-]+)=["']([^"']*)["']/g;

    for (let match = attributePattern.exec(rawAttributes); match !== null; match = attributePattern.exec(rawAttributes)) {
        attributes.set(match[1].toLowerCase(), decodeXmlEntities(match[2]));
    }

    return attributes;
}

function decodeXmlEntities(value: string): string {
    return value
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");
}
