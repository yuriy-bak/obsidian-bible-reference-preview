const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const CDATA_SECTION_NODE = 4;

/** Parses an EPUB content document. Falls back to the lenient HTML parser when the XHTML is not well-formed. */
export function parseXhtmlDocument(text: string): Document {
    return parseMarkup(text, "application/xhtml+xml");
}

/** Parses an HTML fragment or page with the lenient HTML parser. */
export function parseHtmlDocument(text: string): Document {
    return new DOMParser().parseFromString(text, "text/html");
}

/** Parses an EPUB package or container document. Falls back to the lenient HTML parser when the XML is not well-formed. */
export function parseXmlDocument(text: string): Document {
    return parseMarkup(text, "application/xml");
}

export function isElementNode(node: Node): node is Element {
    return node.nodeType === ELEMENT_NODE;
}

export function isTextNode(node: Node): node is CharacterData {
    return node.nodeType === TEXT_NODE || node.nodeType === CDATA_SECTION_NODE;
}

/** Lower-case qualified name (`dc:title`, `p`), the same in XML and HTML documents. */
export function getElementName(element: Element): string {
    return element.nodeName.toLowerCase();
}

/** All elements with the given qualified name, in document order. */
export function findElementsByName(root: Document | Element, name: string): Element[] {
    return Array.from(root.getElementsByTagName("*")).filter((element) => getElementName(element) === name);
}

export function findFirstElementByName(root: Document | Element, name: string): Element | null {
    return findElementsByName(root, name)[0] ?? null;
}

/** Text content where every element boundary becomes a space, so adjacent cells or words do not merge. */
export function getTextWithElementBreaks(node: Node): string {
    let text = "";

    for (let child = node.firstChild; child !== null; child = child.nextSibling) {
        if (isTextNode(child)) {
            text += child.data;
        } else if (isElementNode(child)) {
            text += ` ${getTextWithElementBreaks(child)} `;
        }
    }

    return text;
}

function parseMarkup(text: string, mimeType: DOMParserSupportedType): Document {
    const parser = new DOMParser();
    const document = parser.parseFromString(text, mimeType);

    if (document.getElementsByTagName("parsererror").length === 0) {
        return document;
    }

    return parser.parseFromString(text, "text/html");
}
