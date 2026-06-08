import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const CASES_DIR = "./cases";
const OUTPUTS_DIR = "./outputs";

// Edge thường nằm ở 1 trong 2 path này.
const EDGE_PATHS = [
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];

async function main() {
  if (!fs.existsSync(CASES_DIR)) {
    fs.mkdirSync(CASES_DIR);
    console.log("Created ./cases. Put .html files there, then run again.");
    return;
  }

  if (!fs.existsSync(OUTPUTS_DIR)) {
    fs.mkdirSync(OUTPUTS_DIR);
  }

  const files = fs
    .readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".html"))
    .sort();

  if (files.length === 0) {
    console.log("No .html files in ./cases");
    return;
  }

  const executablePath = EDGE_PATHS.find((p) => fs.existsSync(p));

  if (!executablePath) {
    console.error("Cannot find Microsoft Edge executable.");
    console.error("Checked:");
    for (const p of EDGE_PATHS) console.error(" - " + p);
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({
    headless: false,
    executablePath,
  });

  const page = await browser.newPage({
    viewport: {
      width: 1280,
      height: 720,
    },
  });

  for (const file of files) {
    const html = fs.readFileSync(path.join(CASES_DIR, file), "utf8");

    await page.setContent(
      `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(file)}</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      padding: 16px;
    }
  </style>
</head>
<body>
${html}
</body>
</html>`,
      { waitUntil: "domcontentloaded" }
    );

    const tree = await page.evaluate(makeSemanticTree);

    const outputFile = path.basename(file, ".html") + ".json";
    const outputPath = path.join(OUTPUTS_DIR, outputFile);

    fs.writeFileSync(outputPath, JSON.stringify(tree, null, 2), "utf8");

    console.log(`OK: ${file} -> ${outputPath}`);
  }

  await browser.close();

  console.log(`\nDone. Outputs saved in ${OUTPUTS_DIR}`);
}

function makeSemanticTree() {
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
    "option",
  ]);

  // Không dùng class để quyết định giữ node.
  // class vẫn được output nếu node đã được giữ vì lý do khác.
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

  function esc(s) {
    if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
      return CSS.escape(s);
    }

    return String(s).replace(/["\\]/g, "\\$&");
  }

  function attrSel(tag, attr, value) {
    return `${tag}[${attr}="${esc(value)}"]`;
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
        parts.unshift(`${tag}:nth-of-type(${same.indexOf(cur) + 1})`);
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
      candidates.push(`${tag}#${esc(id)}`);
      candidates.push(`#${esc(id)}`);
    }

    for (const a of ["data-testid", "data-test", "data-cy"]) {
      const v = el.getAttribute(a);
      if (v) candidates.push(attrSel(tag, a, v));
    }

    for (const a of ["name", "aria-label", "placeholder", "title"]) {
      const v = el.getAttribute(a);
      if (v) candidates.push(attrSel(tag, a, v));
    }

    const href = el.getAttribute("href");
    if (href && tag === "a") {
      candidates.push(attrSel(tag, "href", href));
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

  function directText(el) {
    const tag = el.tagName.toLowerCase();

    if (
      [
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
      ].includes(tag)
    ) {
      return undefined;
    }

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
      ["button", "a", "input", "textarea", "select", "option", "label"].includes(tag) ||
      (!!role && KEEP_ROLES.has(role)) ||
      el.hasAttribute("onclick") ||
      el.hasAttribute("tabindex") ||
      el.getAttribute("contenteditable") === "true"
    );
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
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});