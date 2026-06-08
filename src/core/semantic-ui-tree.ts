export const semanticUiTreeEvaluateScript = String.raw`
(() => {
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

  const SEMANTIC_ATTRS = ATTRS.filter((a) => a !== "class");

  function cleanText(s, max = 160) {
    const t = (s ?? "").replace(/\s+/g, " ").trim();
    if (!t) return undefined;
    return t.length > max ? t.slice(0, max) + "…" : t;
  }

  function visible(el) {
    const style = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();

    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0" &&
      !el.hasAttribute("hidden") &&
      el.getAttribute("aria-hidden") !== "true" &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function escIdent(s) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(s);
    }

    return String(s).replace(/([^\w-])/g, "\\$1");
  }

  function escAttrValue(s) {
    return String(s)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\A ")
      .replace(/\r/g, "\\D ");
  }

  function attrSel(tag, attr, value) {
    return \`\${tag}[\${attr}="\${escAttrValue(value)}"]\`;
  }

  function unique(sel) {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  }

  function pathSel(el) {
    const parts = [];
    let cur = el;

    while (cur && cur !== document.body) {
      const tag = cur.tagName.toLowerCase();
      const parent = cur.parentElement;

      if (!parent) {
        parts.unshift(tag);
        break;
      }

      const same = [...parent.children].filter(
        (x) => x.tagName.toLowerCase() === tag
      );

      if (same.length === 1) {
        parts.unshift(tag);
      } else {
        parts.unshift(\`\${tag}:nth-of-type(\${same.indexOf(cur) + 1})\`);
      }

      cur = parent;

      if (parts.length >= 6) break;
    }

    return parts.join(" > ");
  }

  function selector(el) {
    const tag = el.tagName.toLowerCase();
    const candidates = [];

    const id = el.getAttribute("id");
    if (id) {
      candidates.push(\`\${tag}#\${escIdent(id)}\`);
      candidates.push(\`#\${escIdent(id)}\`);
    }

    for (const a of ["data-testid", "data-cy", "data-test"]) {
      const v = el.getAttribute(a);
      if (v) {
        candidates.push(attrSel(tag, a, v));
        candidates.push(\`[\${a}="\${escAttrValue(v)}"]\`);
      }
    }

    for (const a of ["name", "aria-label"]) {
      const v = el.getAttribute(a);
      if (v) candidates.push(attrSel(tag, a, v));
    }

    const href = el.getAttribute("href");
    if (href && tag === "a") {
      candidates.push(attrSel(tag, "href", href));
    }

    for (const a of ["placeholder", "title"]) {
      const v = el.getAttribute(a);
      if (v) candidates.push(attrSel(tag, a, v));
    }

    const type = el.getAttribute("type");
    if (type && ["input", "button"].includes(tag)) {
      candidates.push(attrSel(tag, "type", type));
    }

    for (const c of candidates) {
      if (unique(c)) return c;
    }

    return pathSel(el);
  }

  function directNodeText(el) {
    return cleanText(
      [...el.childNodes]
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .map((n) => n.textContent ?? "")
        .join(" ")
    );
  }

  function hasSemanticAttr(el) {
    return SEMANTIC_ATTRS.some((a) => cleanText(el.getAttribute(a)));
  }

  function interactive(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");

    return (
      [
        "button",
        "a",
        "input",
        "textarea",
        "select",
        "option",
        "label",
        "summary",
      ].includes(tag) ||
      (!!role && KEEP_ROLES.has(role)) ||
      el.hasAttribute("onclick") ||
      el.hasAttribute("tabindex") ||
      el.getAttribute("contenteditable") === "true"
    );
  }

  function isImportantChild(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");

    return (
      interactive(el) ||
      KEEP_TAGS.has(tag) ||
      (!!role && KEEP_ROLES.has(role)) ||
      hasSemanticAttr(el)
    );
  }

  function childSemanticText(el) {
    const parts = [];

    for (const child of [...el.children]) {
      if (!visible(child)) continue;
      if (!isImportantChild(child)) continue;

      const t = cleanText(child.innerText);
      if (t) parts.push(t);
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
      const label = document.querySelector(\`label[for="\${escAttrValue(id)}"]\`);
      if (label) {
        const t = cleanText(label.innerText);
        if (t) return t;
      }
    }

    const parentLabel = el.closest("label");
    if (parentLabel) {
      const t = cleanText(parentLabel.innerText);
      if (t) return t;
    }

    const ariaLabel = cleanText(el.getAttribute("aria-label"));
    if (ariaLabel) return ariaLabel;

    const labelledby = el.getAttribute("aria-labelledby");
    if (labelledby) {
      const parts = labelledby
        .split(/\s+/)
        .map((id) => document.getElementById(id))
        .filter(Boolean)
        .map((node) => cleanText(node.innerText))
        .filter(Boolean);

      if (parts.length) return parts.join(" ");
    }

    return undefined;
  }

  function ownTextUseful(el) {
    return Boolean(directText(el));
  }

  function shouldKeep(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role");

    if (
      ["script", "style", "noscript", "template", "meta", "link"].includes(tag)
    ) {
      return false;
    }

    if (!visible(el)) return false;

    return (
      interactive(el) ||
      KEEP_TAGS.has(tag) ||
      (!!role && KEEP_ROLES.has(role)) ||
      hasSemanticAttr(el) ||
      ownTextUseful(el)
    );
  }

  function build(el) {
    const children = [];

    for (const child of [...el.children]) {
      const n = build(child);
      if (!n) continue;

      if (n.tag === "__fragment__") {
        children.push(...(n.children ?? []));
      } else {
        children.push(n);
      }
    }

    const keep = shouldKeep(el);

    if (!keep && children.length === 0) return null;

    if (!keep) {
      return {
        tag: "__fragment__",
        children,
      };
    }

    const tag = el.tagName.toLowerCase();

    const out = {
      tag,
      selector: selector(el),
      visible: visible(el),
    };

    for (const a of ATTRS) {
      const v = cleanText(el.getAttribute(a));
      if (v) out[a] = v;
    }

    const t = directText(el);
    if (t) out.text = t;

    if (["input", "textarea", "select"].includes(tag)) {
      const lt = labelTextFor(el);
      if (lt) out.labelText = lt;
    }

    if (el.disabled === true) out.disabled = true;
    if (el.readOnly === true) out.readonly = true;
    if (el.checked === true) out.checked = true;
    if (tag === "option" && el.selected === true) out.selected = true;

    if (children.length) out.children = children;

    return out;
  }

  const body = build(document.body);

  return {
    tag: "page",
    title: document.title,
    href: window.location.href,
    children: body?.children ?? [],
  };
})()
`;