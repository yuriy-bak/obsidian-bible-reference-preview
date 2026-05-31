type ReadingModeBibleReferenceMatch = {
    from: number;
    to: number;
    text: string;
};

export type ReadingModeBibleReferenceProcessorInput = {
    element: HTMLElement;
    hasImportedTranslations(): boolean;
    parseMatches(text: string): ReadingModeBibleReferenceMatch[];
    getBibleReferenceLinkColor(): string;
    openBibleReference(anchorEl: HTMLElement, referenceText: string): Promise<void> | void;
};

export function processReadingModeBibleReferences(input: ReadingModeBibleReferenceProcessorInput): void {
    if (!input.hasImportedTranslations()) {
        return;
    }

    const walker = document.createTreeWalker(input.element, NodeFilter.SHOW_TEXT, {
        acceptNode: (node) => {
            if (!(node instanceof Text) || node.data.trim().length === 0) {
                return NodeFilter.FILTER_REJECT;
            }

            const parent = node.parentElement;
            if (parent === null || parent.closest("a,code,pre,script,style,textarea,button,input,select,option,.math,.math-block,.math-inline,.cm-inline-code,.bible-reference-reading-link") !== null) {
                return NodeFilter.FILTER_REJECT;
            }

            return NodeFilter.FILTER_ACCEPT;
        },
    });

    const textNodes: Text[] = [];
    for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
        if (node instanceof Text) {
            textNodes.push(node);
        }
    }

    for (const textNode of textNodes) {
        replaceReadingModeBibleReferencesInTextNode(textNode, input);
    }
}

function replaceReadingModeBibleReferencesInTextNode(textNode: Text, input: ReadingModeBibleReferenceProcessorInput): void {
    const sourceText = textNode.data;
    const matches = input.parseMatches(sourceText);
    if (matches.length === 0 || textNode.parentNode === null) {
        return;
    }

    const fragment = document.createDocumentFragment();
    let currentOffset = 0;

    for (const match of matches) {
        if (match.from < currentOffset) {
            continue;
        }
        if (match.from > currentOffset) {
            fragment.appendChild(document.createTextNode(sourceText.slice(currentOffset, match.from)));
        }

        const linkEl = document.createElement("a");
        linkEl.href = "#";
        linkEl.textContent = sourceText.slice(match.from, match.to);
        linkEl.className = "bible-reference-link bible-reference-reading-link";
        linkEl.dataset.bibleReference = match.text;
        linkEl.style.color = input.getBibleReferenceLinkColor();
        linkEl.style.textDecoration = "underline";
        linkEl.style.textDecorationStyle = "dotted";
        linkEl.style.cursor = "pointer";
        linkEl.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            void input.openBibleReference(linkEl, match.text);
        });
        fragment.appendChild(linkEl);
        currentOffset = match.to;
    }

    if (currentOffset < sourceText.length) {
        fragment.appendChild(document.createTextNode(sourceText.slice(currentOffset)));
    }
    textNode.parentNode.replaceChild(fragment, textNode);
}
