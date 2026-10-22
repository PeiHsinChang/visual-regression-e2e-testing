export type SerializeOptions = {
  excludeSelectors: string[];
  computedStyleProps: string[];
};

export type SerializedElement = {
  xpath: string;
  cssSelector: string;
  tag: string;
  rect: { x: number; y: number; w: number; h: number };
  computedStyle: Record<string, string>;
  depth: number;
};

export type SerializedDom = {
  elements: SerializedElement[];
  dpr: number;
};

/**
 * Runs in the browser context via `page.evaluate`. Must be self-contained:
 * no closures over outer scope, no imports, no TS-only syntax that the
 * browser cannot understand after Playwright stringifies the function.
 */
export function serializeDom(opts: SerializeOptions): SerializedDom {
  const excludeSelectors = opts.excludeSelectors;
  const computedStyleProps = opts.computedStyleProps;

  function getXPath(el: Element): string {
    const segs: string[] = [];
    let cur: Element | null = el;
    while (cur && cur.nodeType === 1) {
      let i = 1;
      let sib = cur.previousElementSibling;
      while (sib) {
        if (sib.tagName === cur.tagName) i++;
        sib = sib.previousElementSibling;
      }
      segs.unshift(cur.tagName.toLowerCase() + "[" + i + "]");
      cur = cur.parentElement;
    }
    return "/" + segs.join("/");
  }

  function getSelector(el: Element): string {
    if (el.id) return "#" + el.id;
    let sel = el.tagName.toLowerCase();
    if (el.classList.length > 0) {
      sel += "." + Array.from(el.classList).join(".");
    }
    return sel;
  }

  const skippedTags = new Set([
    "script",
    "style",
    "link",
    "meta",
    "noscript",
    "head",
    "title",
  ]);

  function shouldSkip(el: Element): boolean {
    if (skippedTags.has(el.tagName.toLowerCase())) return true;
    for (const sel of excludeSelectors) {
      try {
        if (el.matches(sel)) return true;
      } catch {
        // invalid selector, ignore
      }
    }
    return false;
  }

  const result: SerializedElement[] = [];
  const root = document.documentElement;
  if (!root) {
    return { elements: [], dpr: window.devicePixelRatio };
  }

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT,
    null
  );

  let node: Element | null = root;
  while (node) {
    // Omit <html> from the manifest so older captures pair cleanly with new runs
    // (otherwise a lone /html[1] node looks "new" after this walker change).
    if (!shouldSkip(node) && node.tagName.toLowerCase() !== "html") {
      const rect = node.getBoundingClientRect();
      if (rect.width * rect.height >= 16) {
        const cs = window.getComputedStyle(node);
        const styleObj: Record<string, string> = {};
        for (const prop of computedStyleProps) {
          styleObj[prop] = (cs as unknown as Record<string, string>)[prop] || "";
        }
        let depth = 0;
        let p = node.parentElement;
        while (p) {
          depth++;
          p = p.parentElement;
        }
        result.push({
          xpath: getXPath(node),
          cssSelector: getSelector(node),
          tag: node.tagName.toLowerCase(),
          rect: {
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
          },
          computedStyle: styleObj,
          depth,
        });
      }
    }
    node = walker.nextNode() as Element | null;
  }

  return { elements: result, dpr: window.devicePixelRatio };
}
