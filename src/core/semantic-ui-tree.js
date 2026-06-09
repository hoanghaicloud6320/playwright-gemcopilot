// @ts-check
// src/core/semanticTree.browser.js
// Browser-native semantic UI tree extractor.
// IMPORTANT: keep this file as plain JS so Playwright page.evaluate(fn)
// receives clean browser code with no tsx/esbuild helper such as __name.

/**
 * @typedef {Object} SelectorCandidate
 * @property {string} selector
 * @property {string} reason
 * @property {number} count
 */

/**
 * @typedef {Object} SelectorInfo
 * @property {string=} selector
 * @property {"unique" | "not_unique"} selectorStatus
 * @property {string} selectorReason
 * @property {SelectorCandidate[]=} selectorCandidates
 */

/**
 * @typedef {Object} SemanticUiNode
 * @property {string} tag
 * @property {true=} visible
 * @property {"unique" | "not_unique"=} selectorStatus
 * @property {string=} selector
 * @property {string=} selectorReason
 * @property {SelectorCandidate[]=} selectorCandidates
 * @property {SemanticUiNode[]=} children
 * @property {string=} text
 * @property {string=} labelText
 * @property {true=} disabled
 * @property {true=} readonly
 * @property {true=} checked
 * @property {true=} selected
 * @property {true=} focused
 * @property {true=} focusWithin
 * @property {true=} editable
 * @property {true=} canReceiveText
 * @property {true=} canPressEnter
 * @property {true=} hasValue
 * @property {number=} selectionStart
 * @property {number=} selectionEnd
 * @property {string=} id
 * @property {string=} class
 * @property {string=} role
 * @property {string=} name
 * @property {string=} type
 * @property {string=} value
 * @property {string=} placeholder
 * @property {string=} title
 * @property {string=} href
 * @property {string=} src
 * @property {string=} alt
 * @property {string=} for
 * @property {string=} [aria-label]
 * @property {string=} [aria-labelledby]
 * @property {string=} [aria-describedby]
 * @property {string=} [data-testid]
 * @property {string=} [data-test]
 * @property {string=} [data-cy]
 */

/**
 * @typedef {Object} SemanticUiTree
 * @property {"page"} tag
 * @property {string} title
 * @property {string} href
 * @property {boolean} truncated
 * @property {SemanticUiNode[]=} activePath
 * @property {SemanticUiNode[]} children
 */

/**
 * Build a compact semantic tree for the current browser page.
 * This function is intentionally self-contained: do not reference Node globals,
 * imported values, or outer-scope variables from here.
 *
 * @returns {SemanticUiTree}
 */
export function makeSemanticUiTree() {
    const MAX_TEXT = 160;
    const MAX_ATTR = 220;
    const MAX_HREF = 260;
    const MAX_SRC = 120;
    const MAX_CHILDREN_PER_NODE = 80;
    const MAX_TOTAL_NODES = 1200;
    let emittedNodes = 0;
    /** @type {SemanticUiNode[]} */
    const activePath = [];
    const activeElement = document.activeElement && document.activeElement.nodeType === Node.ELEMENT_NODE
        ? document.activeElement
        : null;
    const TEXT_INPUT_TYPES = new Set([
        "",
        "text",
        "search",
        "url",
        "tel",
        "email",
        "password",
        "number",
    ]);
    const ATTRS = [
        "id",
        "class",
        "role",
        "name",
        "type",
        "value",
        "placeholder",
        "title",
        "href",
        "src",
        "alt",
        "for",
        "aria-label",
        "aria-labelledby",
        "aria-describedby",
        "data-testid",
        "data-test",
        "data-cy",
    ];
    const KEEP_TAGS = new Set([
        "main",
        "header",
        "footer",
        "nav",
        "section",
        "article",
        "aside",
        "form",
        "fieldset",
        "legend",
        "label",
        "button",
        "a",
        "input",
        "textarea",
        "select",
        "option",
        "dialog",
        "table",
        "thead",
        "tbody",
        "tfoot",
        "tr",
        "th",
        "td",
        "ul",
        "ol",
        "li",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "img",
        "summary",
        "details",
    ]);
    const KEEP_ROLES = new Set([
        "button",
        "link",
        "textbox",
        "searchbox",
        "combobox",
        "checkbox",
        "radio",
        "switch",
        "dialog",
        "alertdialog",
        "navigation",
        "main",
        "form",
        "search",
        "region",
        "list",
        "listitem",
        "table",
        "row",
        "cell",
        "grid",
        "gridcell",
        "columnheader",
        "rowheader",
        "tab",
        "tablist",
        "tabpanel",
        "menu",
        "menubar",
        "menuitem",
        "menuitemcheckbox",
        "menuitemradio",
        "option",
        "progressbar",
        "slider",
        "spinbutton",
        "status",
        "alert",
        "tooltip",
    ]);
    const CONTAINER_TAGS_NO_TEXT = new Set([
        "body",
        "main",
        "form",
        "section",
        "article",
        "nav",
        "table",
        "tbody",
        "thead",
        "tfoot",
        "tr",
        "ul",
        "ol",
        "fieldset",
        "dialog",
    ]);
    const TEXT_BEARING_TAGS = new Set([
        "button",
        "a",
        "label",
        "legend",
        "option",
        "th",
        "td",
        "h1",
        "h2",
        "h3",
        "h4",
        "h5",
        "h6",
        "p",
        "li",
        "summary",
    ]);
    const SEMANTIC_ATTRS = ATTRS.filter((attr) => attr !== "class");
    function cleanText(value, max = MAX_TEXT) {
        const text = (value == null ? "" : String(value)).replace(/\s+/g, " ").trim();
        if (!text)
            return undefined;
        return text.length > max ? text.slice(0, max) + "…" : text;
    }
    function cleanAttr(name, value) {
        let max = MAX_ATTR;
        if (name === "href")
            max = MAX_HREF;
        if (name === "src")
            max = MAX_SRC;
        return cleanText(value, max);
    }
    function visible(el) {
        if (!el || el.nodeType !== Node.ELEMENT_NODE)
            return false;
        if (el.hasAttribute("hidden"))
            return false;
        if (el.getAttribute("aria-hidden") === "true")
            return false;
        const htmlEl = el;
        const style = window.getComputedStyle(htmlEl);
        const rect = htmlEl.getBoundingClientRect();
        const opacity = Number(style.opacity);
        return (style.display !== "none" &&
            style.visibility !== "hidden" &&
            !Number.isNaN(opacity) &&
            opacity > 0.01 &&
            rect.width > 0 &&
            rect.height > 0);
    }
    function escIdent(value) {
        if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
            return CSS.escape(value);
        }
        return String(value).replace(/([^\w-])/g, "\\$1");
    }
    function escAttrValue(value) {
        return String(value)
            .replace(/\\/g, "\\\\")
            .replace(/"/g, '\\"')
            .replace(/\n/g, "\\A ")
            .replace(/\r/g, "\\D ");
    }
    function attrSel(tag, attr, value) {
        return `${tag}[${attr}="${escAttrValue(value)}"]`;
    }
    function anyAttrSel(attr, value) {
        return `[${attr}="${escAttrValue(value)}"]`;
    }
    function roleAttrSel(role, attr, value) {
        return `[role="${escAttrValue(role)}"][${attr}="${escAttrValue(value)}"]`;
    }
    function queryCount(selector) {
        try {
            return document.querySelectorAll(selector).length;
        }
        catch {
            return -1;
        }
    }
    function unique(selector) {
        return queryCount(selector) === 1;
    }
    function pushCandidate(list, seen, selector, reason) {
        if (!selector || seen.has(selector))
            return;
        seen.add(selector);
        list.push({ selector, reason, count: queryCount(selector) });
    }
    function getSelectorCandidates(el) {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        const candidates = [];
        const seen = new Set();
        for (const attr of ["data-testid", "data-cy", "data-test"]) {
            const value = el.getAttribute(attr);
            if (value) {
                pushCandidate(candidates, seen, attrSel(tag, attr, value), "test_attr_tag");
                pushCandidate(candidates, seen, anyAttrSel(attr, value), "test_attr_any");
            }
        }
        const name = el.getAttribute("name");
        if (name) {
            pushCandidate(candidates, seen, attrSel(tag, "name", name), "name_tag");
            const type = el.getAttribute("type");
            if (type) {
                pushCandidate(candidates, seen, `${tag}[name="${escAttrValue(name)}"][type="${escAttrValue(type)}"]`, "name_type");
            }
        }
        const aria = el.getAttribute("aria-label");
        if (aria) {
            if (role) {
                pushCandidate(candidates, seen, roleAttrSel(role, "aria-label", aria), "role_aria_label");
            }
            pushCandidate(candidates, seen, attrSel(tag, "aria-label", aria), "aria_label_tag");
            pushCandidate(candidates, seen, anyAttrSel("aria-label", aria), "aria_label_any");
        }
        const labelledby = el.getAttribute("aria-labelledby");
        if (labelledby) {
            if (role) {
                pushCandidate(candidates, seen, roleAttrSel(role, "aria-labelledby", labelledby), "role_aria_labelledby");
            }
            pushCandidate(candidates, seen, attrSel(tag, "aria-labelledby", labelledby), "aria_labelledby_tag");
        }
        const placeholder = el.getAttribute("placeholder");
        if (placeholder) {
            pushCandidate(candidates, seen, attrSel(tag, "placeholder", placeholder), "placeholder_tag");
        }
        const title = el.getAttribute("title");
        if (title) {
            pushCandidate(candidates, seen, attrSel(tag, "title", title), "title_tag");
        }
        const href = el.getAttribute("href");
        if (href && tag === "a") {
            pushCandidate(candidates, seen, attrSel(tag, "href", href), "href_exact");
        }
        const id = el.getAttribute("id");
        if (id) {
            pushCandidate(candidates, seen, `${tag}#${escIdent(id)}`, "id_tag");
            pushCandidate(candidates, seen, `#${escIdent(id)}`, "id_any");
        }
        const type = el.getAttribute("type");
        if (type && ["input", "button"].includes(tag)) {
            pushCandidate(candidates, seen, attrSel(tag, "type", type), "type_tag");
        }
        return candidates;
    }
    function simplePart(el) {
        const tag = el.tagName.toLowerCase();
        const id = el.getAttribute("id");
        if (id)
            return `${tag}#${escIdent(id)}`;
        const role = el.getAttribute("role");
        const aria = el.getAttribute("aria-label");
        if (role && aria) {
            return `${tag}[role="${escAttrValue(role)}"][aria-label="${escAttrValue(aria)}"]`;
        }
        const name = el.getAttribute("name");
        if (name)
            return `${tag}[name="${escAttrValue(name)}"]`;
        const parent = el.parentElement;
        if (!parent)
            return tag;
        const same = Array.from(parent.children).filter((child) => child.tagName.toLowerCase() === tag);
        if (same.length === 1)
            return tag;
        return `${tag}:nth-of-type(${same.indexOf(el) + 1})`;
    }
    function pathSelector(el) {
        const parts = [];
        let current = el;
        while (current &&
            current.nodeType === Node.ELEMENT_NODE &&
            current !== document.documentElement) {
            parts.unshift(simplePart(current));
            const selector = parts.join(" > ");
            if (unique(selector))
                return { selector, reason: "path_unique" };
            if (current === document.body)
                break;
            current = current.parentElement;
        }
        const finalSelector = parts.join(" > ");
        if (finalSelector && unique(finalSelector)) {
            return { selector: finalSelector, reason: "path_full_unique" };
        }
        return { selector: null, reason: "not_unique" };
    }
    function selectorInfo(el) {
        const candidates = getSelectorCandidates(el);
        for (const item of candidates) {
            if (item.count === 1) {
                return {
                    selector: item.selector,
                    selectorStatus: "unique",
                    selectorReason: item.reason,
                };
            }
        }
        const path = pathSelector(el);
        if (path.selector) {
            return {
                selector: path.selector,
                selectorStatus: "unique",
                selectorReason: path.reason,
            };
        }
        const compactCandidates = candidates
            .filter((item) => item.count > 1)
            .slice(0, 5)
            .map((item) => ({
            selector: item.selector,
            count: item.count,
            reason: item.reason,
        }));
        return {
            selectorStatus: "not_unique",
            selectorReason: "all_candidates_not_unique",
            selectorCandidates: compactCandidates.length ? compactCandidates : undefined,
        };
    }
    function directNodeText(el) {
        return cleanText(Array.from(el.childNodes)
            .filter((node) => node.nodeType === Node.TEXT_NODE)
            .map((node) => node.textContent || "")
            .join(" "));
    }
    function hasSemanticAttr(el) {
        return SEMANTIC_ATTRS.some((attr) => cleanText(el.getAttribute(attr)));
    }
    function interactive(el) {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        return (["button", "a", "input", "textarea", "select", "option", "label", "summary"].includes(tag) ||
            Boolean(role && KEEP_ROLES.has(role)) ||
            el.hasAttribute("onclick") ||
            el.hasAttribute("tabindex") ||
            el.getAttribute("contenteditable") === "true");
    }
    function isFocused(el) {
        return Boolean(activeElement && el === activeElement);
    }
    function hasFocusedDescendant(el) {
        return Boolean(activeElement && el !== activeElement && el.contains(activeElement));
    }
    function isEditable(el) {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        if (el.getAttribute("contenteditable") === "true")
            return true;
        if (tag === "textarea")
            return true;
        if (tag === "input") {
            const type = (el.getAttribute("type") || "text").toLowerCase();
            return TEXT_INPUT_TYPES.has(type);
        }
        return role === "textbox" || role === "searchbox" || role === "combobox";
    }
    function canReceiveText(el) {
        const formEl = el;
        if ("disabled" in formEl && formEl.disabled === true)
            return false;
        if ("readOnly" in formEl && formEl.readOnly === true)
            return false;
        return isEditable(el);
    }
    function getElementValue(el) {
        const tag = el.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select") {
            return cleanAttr("value", el.value);
        }
        if (el.getAttribute("contenteditable") === "true") {
            return cleanText(el.innerText, MAX_ATTR);
        }
        return cleanAttr("value", el.getAttribute("value"));
    }
    function canPressEnter(el) {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        if (canReceiveText(el))
            return true;
        return tag === "button" || tag === "a" || role === "button" || role === "link" || role === "menuitem" || role === "option";
    }
    function addFocusState(output, el) {
        if (isFocused(el))
            output.focused = true;
        if (hasFocusedDescendant(el))
            output.focusWithin = true;
        if (isEditable(el))
            output.editable = true;
        if (canReceiveText(el))
            output.canReceiveText = true;
        if (canPressEnter(el))
            output.canPressEnter = true;
        const value = getElementValue(el);
        if (value) {
            output.value = value;
            output.hasValue = true;
        }
        if (isFocused(el) && "selectionStart" in el && typeof el.selectionStart === "number") {
            output.selectionStart = el.selectionStart;
        }
        if (isFocused(el) && "selectionEnd" in el && typeof el.selectionEnd === "number") {
            output.selectionEnd = el.selectionEnd;
        }
    }
    function isImportantChild(el) {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        return (interactive(el) ||
            KEEP_TAGS.has(tag) ||
            Boolean(role && KEEP_ROLES.has(role)) ||
            hasSemanticAttr(el));
    }
    function childSemanticText(el) {
        const parts = [];
        for (const child of Array.from(el.children)) {
            if (!visible(child))
                continue;
            if (!isImportantChild(child))
                continue;
            const text = cleanText(child.innerText);
            if (text)
                parts.push(text);
        }
        return cleanText(parts.join(" "));
    }
    function directText(el) {
        const tag = el.tagName.toLowerCase();
        if (CONTAINER_TAGS_NO_TEXT.has(tag)) {
            return undefined;
        }
        const direct = directNodeText(el);
        if (TEXT_BEARING_TAGS.has(tag)) {
            const full = cleanText(el.innerText);
            const childText = childSemanticText(el);
            if (full && childText && full === childText) {
                return direct;
            }
            return full;
        }
        return direct;
    }
    function labelTextFor(el) {
        const id = el.getAttribute("id");
        if (id) {
            const label = document.querySelector(`label[for="${escAttrValue(id)}"]`);
            if (label) {
                const text = cleanText(label.innerText);
                if (text)
                    return text;
            }
        }
        const parentLabel = el.closest("label");
        if (parentLabel) {
            const text = cleanText(parentLabel.innerText);
            if (text)
                return text;
        }
        const ariaLabel = cleanText(el.getAttribute("aria-label"));
        if (ariaLabel)
            return ariaLabel;
        const labelledby = el.getAttribute("aria-labelledby");
        if (labelledby) {
            const parts = labelledby
                .split(/\s+/)
                .map((labelId) => document.getElementById(labelId))
                .filter((node) => Boolean(node))
                .map((node) => cleanText(node.innerText))
                .filter((text) => Boolean(text));
            if (parts.length)
                return parts.join(" ");
        }
        return undefined;
    }
    function ownTextUseful(el) {
        return Boolean(directText(el));
    }
    function shouldKeep(el) {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute("role");
        if (["script", "style", "noscript", "template", "meta", "link"].includes(tag)) {
            return false;
        }
        if (!visible(el))
            return false;
        return (interactive(el) ||
            KEEP_TAGS.has(tag) ||
            Boolean(role && KEEP_ROLES.has(role)) ||
            hasSemanticAttr(el) ||
            ownTextUseful(el));
    }
    function childKey(node) {
        return [
            node.tag || "",
            node.role || "",
            node.name || "",
            node.type || "",
            node.text || "",
            node.labelText || "",
            node["aria-label"] || "",
            node.href || "",
            node.selector || "",
        ].join("|");
    }
    function dedupeChildren(children) {
        const output = [];
        const seen = new Set();
        for (const child of children) {
            const key = childKey(child);
            if (seen.has(key))
                continue;
            seen.add(key);
            output.push(child);
            if (output.length >= MAX_CHILDREN_PER_NODE)
                break;
        }
        return output;
    }
    function build(el) {
        if (emittedNodes >= MAX_TOTAL_NODES)
            return null;
        const children = [];
        for (const child of Array.from(el.children)) {
            const node = build(child);
            if (!node)
                continue;
            if (node.tag === "__fragment__") {
                children.push(...(node.children || []));
            }
            else {
                children.push(node);
            }
        }
        const keep = shouldKeep(el);
        if (!keep && children.length === 0)
            return null;
        if (!keep) {
            return {
                tag: "__fragment__",
                children: dedupeChildren(children),
            };
        }
        emittedNodes += 1;
        const tag = el.tagName.toLowerCase();
        const sel = selectorInfo(el);
        const output = {
            tag,
            visible: true,
            selectorStatus: sel.selectorStatus,
        };
        if (sel.selector)
            output.selector = sel.selector;
        if (sel.selectorReason)
            output.selectorReason = sel.selectorReason;
        if (sel.selectorCandidates)
            output.selectorCandidates = sel.selectorCandidates;
        for (const attr of ATTRS) {
            const value = cleanAttr(attr, el.getAttribute(attr));
            if (value) {
                output[attr] = value;
            }
        }
        addFocusState(output, el);
        if (output.focused || output.focusWithin) {
            activePath.push(output);
        }
        const text = directText(el);
        if (text)
            output.text = text;
        if (["input", "textarea", "select"].includes(tag)) {
            const labelText = labelTextFor(el);
            if (labelText)
                output.labelText = labelText;
        }
        const formEl = el;
        if ("disabled" in formEl && formEl.disabled === true)
            output.disabled = true;
        if ("readOnly" in formEl && formEl.readOnly === true)
            output.readonly = true;
        if ("checked" in formEl && formEl.checked === true)
            output.checked = true;
        if (tag === "option" && "selected" in formEl && formEl.selected === true)
            output.selected = true;
        const finalChildren = dedupeChildren(children);
        if (finalChildren.length)
            output.children = finalChildren;
        return output;
    }
    const body = build(document.body);
    return {
        tag: "page",
        title: document.title,
        href: window.location.href,
        truncated: emittedNodes >= MAX_TOTAL_NODES,
        activePath: activePath.length ? activePath.slice().reverse() : undefined,
        children: body?.children ?? [],
    };
}
