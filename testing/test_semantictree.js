/*
  test_semantictree_final.js

  Zero-npm browser DOM tester for compact accessibility/action snapshots.

  Usage:
    mkdir -p cases
    node test_semantictree_final.js ./cases ./outputs

  Notes:
    - ESM script. Safe inside repos with package.json { "type": "module" }.
    - No playwright-core, no puppeteer, no jsdom.
    - Launches Chrome/Chromium/Edge through Chrome DevTools Protocol.
    - Output keeps interaction/accessibility data only: role/name/state/context + selector for runtime.
*/

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

const CASES_DIR = path.resolve(process.argv[2] || "./cases");
const OUT_DIR = path.resolve(process.argv[3] || "./outputs");
const MAX_ACTIONS = Number(process.env.MAX_ACTIONS || 80);
const MAX_REGIONS = Number(process.env.MAX_REGIONS || 12);
const MAX_BYTES = Number(process.env.MAX_BYTES || 5000);
const MIN_ACTIONS_AFTER_BUDGET = Number(process.env.MIN_ACTIONS_AFTER_BUDGET || 12);

const BROWSER_PATHS = [
  process.env.BROWSER_PATH,
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
].filter(Boolean);

function findBrowser() {
  for (const p of BROWSER_PATHS) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {}
  }
  throw new Error("Cannot find Chrome/Chromium/Edge. Set BROWSER_PATH=/path/to/browser.");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function launchBrowser() {
  const exe = findBrowser();
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sem-ui-cdp-"));
  const args = [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-background-networking",
    "about:blank",
  ];

  if (process.platform !== "win32") args.unshift("--no-sandbox");

  const proc = spawn(exe, args, { stdio: ["ignore", "ignore", "pipe"] });
  proc.userDataDir = userDataDir;
  return proc;
}

async function getBrowserWs(proc) {
  let buf = "";
  return await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for DevTools URL")), 15000);
    proc.stderr.on("data", (chunk) => {
      buf += chunk.toString();
      const m = buf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]);
      }
    });
    proc.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Browser exited before DevTools URL. code=${code}\n${buf}`));
    });
  });
}

class CDP {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = new Map();
    this.opened = new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message || "CDP error"}: ${JSON.stringify(msg.error)}`));
        else resolve(msg.result);
        return;
      }
      if (msg.method) {
        const handlers = this.events.get(msg.method) || [];
        for (const h of handlers) h(msg.params || {});
      }
    });
  }

  async send(method, params = {}) {
    await this.opened;
    const id = ++this.id;
    const payload = JSON.stringify({ id, method, params });
    const p = new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    this.ws.send(payload);
    return p;
  }

  on(method, handler) {
    if (!this.events.has(method)) this.events.set(method, []);
    this.events.get(method).push(handler);
  }

  close() {
    try { this.ws.close(); } catch {}
  }
}

async function withTimeout(promise, ms, message) {
  let t;
  const timeout = new Promise((_, reject) => { t = setTimeout(() => reject(new Error(message)), ms); });
  try { return await Promise.race([promise, timeout]); }
  finally { clearTimeout(t); }
}

async function createPage(browserWs, url) {
  const u = new URL(browserWs);
  const http = `http://${u.host}/json/new?${encodeURIComponent(url)}`;
  let res = await fetch(http, { method: "PUT" });
  if (!res.ok) res = await fetch(http); // older Chromium fallback
  if (!res.ok) throw new Error(`Cannot create target: ${res.status} ${await res.text()}`);
  const info = await res.json();
  return info.webSocketDebuggerUrl;
}

const EXTRACTOR_SOURCE = String(function buildCompactAccessibilitySnapshot(opts) {
  const MAX_ACTIONS = opts?.maxActions || 80;
  const MAX_REGIONS = opts?.maxRegions || 12;
  const MAX_RAW_ACTIONS = opts?.maxRawActions || Math.max(200, MAX_ACTIONS * 4);

  const INTERACTIVE_SEL = [
    "button",
    "a[href]",
    "input",
    "textarea",
    "select",
    "summary",
    "[contenteditable='true']",
    "[role='button']",
    "[role='link']",
    "[role='textbox']",
    "[role='checkbox']",
    "[role='radio']",
    "[role='switch']",
    "[role='tab']",
    "[role='menuitem']",
    "[role='option']",
    "[role='combobox']",
    "[onclick]",
    "[data-testid]",
    "[data-cy]",
    "[data-test]",
  ].join(",");

  const INTERACTIVE_ANCESTOR_SEL = "button,a,input,textarea,select,summary,[role='button'],[role='link'],[role='textbox'],[role='checkbox'],[role='radio'],[role='switch'],[role='tab'],[role='menuitem'],[role='option'],[role='combobox']";

  function main() {
    const activeDialog = findActiveDialog();
    const raw = collectActions();
    const ctx = { regions: [], regionIds: new Map() };
    const actions = [];

    for (const el of raw) {
      if (isNestedInteractiveDuplicate(el, raw)) continue;
      const role = inferRole(el);
      if (!role) continue;
      const name = accessibleName(el);
      if (!name && weakUnnamedRole(role)) continue;
      const selector = stableSelector(el);
      if (!selector) continue;

      const regionEl = nearestRegion(el, activeDialog);
      const region = getRegion(ctx, regionEl);
      const context = buildContext(el, regionEl);
      const state = elementState(el, role);
      const value = usefulValue(el, role);

      const action = removeEmpty({
        id: "",
        role,
        name,
        selector,
        region: region.id,
        context,
        state,
        value,
        _el: el,
      });
      action._score = scoreAction(el, action, region, activeDialog);
      actions.push(action);
    }

    let deduped = dedupe(actions);
    expandAmbiguity(deduped);
    deduped = rankAndLimit(deduped, MAX_ACTIONS);
    deduped.forEach((a, i) => { a.id = `a${i + 1}`; });

    const usedRegionIds = new Set(deduped.map((a) => a.region));
    let regions = ctx.regions.filter((r) => usedRegionIds.has(r.id)).slice(0, MAX_REGIONS);
    // A lone unnamed document region carries no useful accessibility context.
    // Drop it and remove action.region to save tokens.
    const onlyDocumentRegion = regions.length === 1 && regions[0].role === "document" && !regions[0].name && !regions[0].description;
    const validRegionIds = new Set(onlyDocumentRegion ? [] : regions.map((r) => r.id));
    if (onlyDocumentRegion) regions = [];
    for (const a of deduped) {
      if (!validRegionIds.has(a.region)) delete a.region;
      delete a._el;
      delete a._score;
    }

    return removeEmpty({
      page: removeEmpty({ title: document.title, url: window.__SEMANTIC_SOURCE_URL || location.href }),
      focus: focusInfo(deduped),
      regions,
      actions: deduped.map(removeEmpty),
      stats: {
        rawCandidates: raw.length,
        emittedActions: deduped.length,
        emittedRegions: regions.length,
      },
    });
  }

  function collectActions() {
    const out = [];
    for (const el of Array.from(document.querySelectorAll(INTERACTIVE_SEL))) {
      if (!(el instanceof Element)) continue;
      if (hiddenByA11y(el)) continue;
      if (!visibleEnough(el)) continue;
      const tag = tagName(el);
      const role = attr(el, "role");
      const direct = ["button", "a", "input", "textarea", "select", "summary"].includes(tag) ||
        ["button", "link", "textbox", "checkbox", "radio", "switch", "tab", "menuitem", "option", "combobox"].includes(role || "") ||
        el.getAttribute("contenteditable") === "true";
      if (direct || typeof el.onclick === "function" || el.tabIndex >= 0) out.push(el);
      if (out.length >= MAX_RAW_ACTIONS) break;
    }
    return out;
  }

  function inferRole(el) {
    const explicit = attr(el, "role");
    const tag = tagName(el);
    const type = (attr(el, "type") || "").toLowerCase();
    if (["button", "link", "textbox", "checkbox", "radio", "switch", "tab", "menuitem", "option", "combobox"].includes(explicit || "")) {
      if (explicit === "switch") return "checkbox";
      if (explicit === "combobox") return "select";
      return explicit;
    }
    if (tag === "button" || tag === "summary") return "button";
    if (tag === "a") return "link";
    if (tag === "textarea") return "textbox";
    if (tag === "select") return "select";
    if (tag === "input") {
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (["button", "submit", "reset", "image"].includes(type)) return "button";
      if (type === "hidden") return null;
      return "textbox";
    }
    if (el.getAttribute("contenteditable") === "true") return "textbox";
    if (typeof el.onclick === "function" || el.tabIndex >= 0) return "button";
    return null;
  }

  function accessibleName(el) {
    return firstClean([
      attr(el, "aria-label"),
      labelledBy(el),
      associatedLabel(el),
      attr(el, "placeholder"),
      attr(el, "alt"),
      attr(el, "title"),
      directText(el, 80),
      textExcludingInteractive(el, 80),
      attr(el, "name"),
      attr(el, "data-testid"),
      attr(el, "data-cy"),
      attr(el, "data-test"),
      stableId(el),
    ]);
  }

  function associatedLabel(el) {
    const id = attr(el, "id");
    if (id) {
      const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
      const t = label ? textExcludingInteractive(label, 80) : "";
      if (t) return t;
    }
    const wrap = el.closest("label");
    if (wrap) {
      const t = textExcludingElements(wrap, [el], 80);
      if (t) return t;
    }
    const tag = tagName(el);
    if (!["input", "textarea", "select"].includes(tag) && attr(el, "role") !== "textbox") return "";

    // Broken but common HTML: <label for="email">Email</label><input name="email">
    const name = attr(el, "name");
    if (name) {
      const exact = Array.from(document.querySelectorAll("label[for]")).find((l) => attr(l, "for") === name);
      if (exact && closeEnough(exact, el)) return textExcludingInteractive(exact, 80);
    }

    // Fallback: closest preceding label in same local form/container.
    const root = el.closest("form, fieldset, section, article, [role='form']") || el.parentElement;
    if (!root) return "";
    const labels = Array.from(root.querySelectorAll("label")).filter((l) => visibleEnough(l) && !hiddenByA11y(l));
    let best = null;
    let bestDist = Infinity;
    for (const label of labels) {
      const pos = label.compareDocumentPosition(el);
      if (!(pos & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
      const d = domDistance(label, el, root);
      if (d < bestDist) { best = label; bestDist = d; }
    }
    if (best && bestDist <= 4) return textExcludingInteractive(best, 80);
    return "";
  }

  function buildContext(el, regionEl) {
    const row = el.closest("tr, [role='row']");
    if (row && row.closest("table, [role='table'], [role='grid']")) {
      return removeEmpty({ role: "row", name: rowContext(row, el) });
    }

    const form = el.closest("form, fieldset, [role='form']");
    if (form) {
      if (form === regionEl) return undefined;
      return removeEmpty({
        role: "form",
        name: regionName(form) || groupName(form),
        fields: fieldNames(form),
      });
    }

    const dialog = el.closest("[role='dialog'], dialog, [aria-modal='true']");
    if (dialog) {
      if (dialog === regionEl) return undefined;
      return removeEmpty({
        role: "dialog",
        name: regionName(dialog) || groupName(dialog),
        description: descriptiveText(dialog, el, 180),
      });
    }

    const group = bestGroupAncestor(el, regionEl);
    if (!group || group === regionEl) return undefined;
    return removeEmpty({
      role: groupRole(group),
      name: groupName(group),
      description: descriptiveText(group, el, 140),
    });
  }

  function fieldNames(form) {
    const fields = Array.from(form.querySelectorAll("input, textarea, select, [role='textbox'], [role='combobox']"))
      .filter((x) => visibleEnough(x) && !hiddenByA11y(x))
      .map((x) => accessibleName(x))
      .filter(Boolean);
    const uniq = unique(fields).slice(0, 10);
    return uniq.length ? uniq : undefined;
  }

  function rowContext(row, action) {
    const cells = Array.from(row.children).filter((c) => /^(td|th)$/i.test(c.tagName) || attr(c, "role") === "cell" || attr(c, "role") === "gridcell");
    const parts = [];
    for (const cell of cells) {
      if (cell.contains(action)) continue;
      const t = descriptiveText(cell, action, 80) || textExcludingInteractive(cell, 80);
      if (t) parts.push(t);
    }
    return unique(parts).join(" | ").slice(0, 180) || undefined;
  }

  function bestGroupAncestor(el, regionEl) {
    let cur = el.parentElement;
    let depth = 0;
    const candidates = [];
    while (cur && cur !== document.documentElement && depth < 8) {
      if (cur === regionEl && !smallSemanticRegion(cur)) break;
      if (potentialGroup(cur)) candidates.push({ el: cur, score: groupScore(cur, el, depth) });
      cur = cur.parentElement;
      depth += 1;
    }
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.score >= 28 ? candidates[0].el : undefined;
  }

  function potentialGroup(el) {
    const tag = tagName(el);
    const role = attr(el, "role");
    if (["article", "section", "li", "fieldset", "details"].includes(tag)) return true;
    if (["group", "region", "listitem", "tabpanel"].includes(role || "")) return true;
    if (attr(el, "aria-label") || attr(el, "aria-labelledby")) return true;
    if (firstHeading(el)) return true;
    return looksLikeCard(el);
  }

  function groupScore(g, action, depth) {
    let s = 0;
    const tag = tagName(g);
    const role = attr(g, "role");
    if (["article", "section", "li", "fieldset", "details"].includes(tag)) s += 28;
    if (["group", "region", "listitem", "tabpanel"].includes(role || "")) s += 28;
    if (attr(g, "aria-label") || attr(g, "aria-labelledby")) s += 24;
    if (firstHeading(g)) s += 22;
    if (descriptiveText(g, action, 70)) s += 12;
    if (countActions(g) > 1) s += 6;
    if (tooLarge(g)) s -= 40;
    s -= depth * 3;
    return s;
  }

  function groupRole(el) {
    const tag = tagName(el);
    const role = attr(el, "role");
    if (role === "listitem" || tag === "li") return "listitem";
    if (tag === "article") return "article";
    if (tag === "section" || role === "region") return "section";
    if (tag === "details") return "section";
    return role || "group";
  }

  function groupName(el) {
    return firstClean([regionName(el), firstHeading(el), firstLegend(el), attr(el, "title")]);
  }

  function nearestRegion(el, activeDialog) {
    if (activeDialog && activeDialog.contains(el)) return activeDialog;
    const selectors = [
      "[role='dialog']", "dialog", "[aria-modal='true']",
      "main", "[role='main']", "nav", "[role='navigation']",
      "form[aria-label]", "form[aria-labelledby]", "[role='form'][aria-label]", "[role='form'][aria-labelledby]",
      "section[aria-label]", "section[aria-labelledby]", "article[aria-label]", "article[aria-labelledby]",
      "aside", "[role='complementary']", "header", "footer",
      "table[aria-label]", "[role='table'][aria-label]", "[role='grid'][aria-label]",
    ].join(",");
    return el.closest(selectors) || document.body;
  }

  function getRegion(ctx, el) {
    const key = el || document.body;
    if (ctx.regionIds.has(key)) return ctx.regionIds.get(key);
    const id = `r${ctx.regions.length + 1}`;
    const role = regionRole(key);
    const name = regionName(key) || defaultRegionName(role, key);
    const description = regionDescription(key, role);
    const region = removeEmpty({ id, role, name, description });
    ctx.regionIds.set(key, region);
    ctx.regions.push(region);
    return region;
  }

  function regionRole(el) {
    if (!el || el === document.body) return "document";
    const role = attr(el, "role");
    if (role === "navigation") return "navigation";
    if (role === "main") return "main";
    if (role === "dialog") return "dialog";
    if (role === "form") return "form";
    if (role === "table" || role === "grid") return role;
    if (role) return role;
    const tag = tagName(el);
    if (tag === "nav") return "navigation";
    if (tag === "form") return "form";
    if (tag === "dialog") return "dialog";
    if (tag === "table") return "table";
    if (tag === "section") return "section";
    if (tag === "article") return "article";
    return tag || "region";
  }

  function regionName(el) {
    if (!el || el === document.body) return "";
    return firstClean([attr(el, "aria-label"), labelledBy(el), firstHeading(el), firstLegend(el), attr(el, "title")]);
  }

  function regionDescription(el, role) {
    if (!el || el === document.body) return undefined;
    // Only dialog descriptions are normally worth global region budget.
    // Forms/sections/cards are already represented by their action names.
    if (role !== "dialog") return undefined;
    const d = descriptiveText(el, null, 160);
    const n = regionName(el);
    const out = removeRepeatedPrefix(d, n);
    return out || undefined;
  }

  function defaultRegionName(role, el) {
    if (role === "document") return undefined;
    if (role === "main") return "Main";
    if (role === "navigation") return "Navigation";
    if (role === "form") return "Form";
    if (role === "dialog") return "Dialog";
    if (role === "table" || role === "grid") return attr(el, "aria-label") || undefined;
    return undefined;
  }

  function descriptiveText(root, action, limit) {
    const parts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        if (action && p.contains(action)) return NodeFilter.FILTER_REJECT;
        if (!visibleEnough(p) || hiddenByA11y(p)) return NodeFilter.FILTER_REJECT;
        if (p.closest(INTERACTIVE_ANCESTOR_SEL)) return NodeFilter.FILTER_REJECT;
        const t = clean(node.nodeValue || "");
        return t ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) {
      parts.push(clean(walker.currentNode.nodeValue || ""));
      if (parts.join(" ").length > limit) break;
    }
    const text = unique(parts).join(" ");
    return truncate(removeRepeatedPrefix(text, groupName(root)), limit);
  }

  function textExcludingInteractive(root, limit) {
    const parts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || !visibleEnough(p) || hiddenByA11y(p)) return NodeFilter.FILTER_REJECT;
        if (p.closest(INTERACTIVE_ANCESTOR_SEL)) return NodeFilter.FILTER_REJECT;
        const t = clean(node.nodeValue || "");
        return t ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) parts.push(clean(walker.currentNode.nodeValue || ""));
    return truncate(unique(parts).join(" "), limit);
  }

  function textExcludingElements(root, excluded, limit) {
    const parts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || !visibleEnough(p) || hiddenByA11y(p)) return NodeFilter.FILTER_REJECT;
        if (excluded.some((x) => x === p || x.contains(p))) return NodeFilter.FILTER_REJECT;
        const t = clean(node.nodeValue || "");
        return t ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    while (walker.nextNode()) parts.push(clean(walker.currentNode.nodeValue || ""));
    return truncate(unique(parts).join(" "), limit);
  }

  function directText(el, limit) {
    const parts = [];
    for (const n of el.childNodes) {
      if (n.nodeType === Node.TEXT_NODE) parts.push(clean(n.nodeValue || ""));
      else if (n.nodeType === Node.ELEMENT_NODE) {
        const child = n;
        if (child.matches?.("svg,path,use,script,style")) continue;
        if (child.matches?.(INTERACTIVE_ANCESTOR_SEL)) continue;
        const t = textExcludingInteractive(child, Math.max(20, limit - parts.join(" ").length));
        if (t) parts.push(t);
      }
      if (parts.join(" ").length >= limit) break;
    }
    return truncate(unique(parts).join(" "), limit);
  }

  function expandAmbiguity(actions) {
    const buckets = new Map();
    for (const a of actions) {
      const key = `${a.role}|${a.name || ""}|${a.region || ""}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(a);
    }
    for (const bucket of buckets.values()) {
      if (bucket.length <= 1) continue;
      for (const a of bucket) {
        const row = a._el?.closest?.("tr, [role='row']");
        if (row) {
          const name = rowContext(row, a._el);
          if (name) a.context = removeEmpty({ role: "row", name });
          continue;
        }
        const group = bestGroupAncestor(a._el, null);
        if (group) {
          const desc = descriptiveText(group, a._el, 220);
          a.context = removeEmpty({
            role: groupRole(group),
            name: groupName(group),
            description: desc,
          });
        }
      }
    }
  }

  function scoreAction(el, a, region, activeDialog) {
    let s = 0;
    if (document.activeElement === el) s += 250;
    if (activeDialog && activeDialog.contains(el)) s += 200;
    if (isInViewport(el)) s += 60;
    if (a.name) s += 45;
    if (a.context?.name || a.context?.description) s += 12;
    if (region?.role === "dialog") s += 50;
    if (["textbox", "select"].includes(a.role)) s += 45;
    if (["checkbox", "radio"].includes(a.role)) s += 35;
    if (isDisabled(el)) s -= 140;
    if (looksLegal(a.name)) s -= 80;
    return s;
  }

  function rankAndLimit(actions, max) {
    return actions.sort((a, b) => b._score - a._score).slice(0, max);
  }

  function dedupe(actions) {
    const seenEl = new Set();
    const seenKey = new Set();
    const out = [];
    for (const a of actions) {
      if (a._el && seenEl.has(a._el)) continue;
      const key = `${a.role}|${a.name || ""}|${a.selector}`;
      if (seenKey.has(key)) continue;
      if (a._el) seenEl.add(a._el);
      seenKey.add(key);
      out.push(a);
    }
    return out;
  }

  function elementState(el, role) {
    const state = [];
    if (document.activeElement === el) state.push("focused");
    if (isDisabled(el)) state.push("disabled");
    if (isReadonly(el)) state.push("readonly");
    if (isTextEditable(el, role)) state.push("editable");
    if (isChecked(el)) state.push("checked");
    if (attr(el, "aria-selected") === "true" || el.selected) state.push("selected");
    if (attr(el, "aria-expanded") === "true") state.push("expanded");
    if (attr(el, "aria-expanded") === "false") state.push("collapsed");
    return state.length ? state : undefined;
  }

  function isTextEditable(el, role) {
    if (role !== "textbox") return false;
    if (isDisabled(el) || isReadonly(el)) return false;
    if (el instanceof HTMLInputElement) {
      const type = (el.type || "text").toLowerCase();
      return !["checkbox", "radio", "button", "submit", "reset", "file", "hidden", "image", "range", "color"].includes(type);
    }
    if (el instanceof HTMLTextAreaElement) return true;
    if (el.getAttribute("contenteditable") === "true") return true;
    return attr(el, "role") === "textbox";
  }

  function usefulValue(el, role) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return undefined;
    if (role === "checkbox" || role === "radio") {
      return el.value && el.value !== "on" ? truncate(el.value, 80) : undefined;
    }
    if (el.type === "password") return undefined;
    return el.value ? truncate(el.value, 80) : undefined;
  }

  function isChecked(el) {
    if (el instanceof HTMLInputElement && ["checkbox", "radio"].includes((el.type || "").toLowerCase())) return el.checked;
    return attr(el, "aria-checked") === "true";
  }

  function isDisabled(el) { return Boolean(el.disabled || attr(el, "aria-disabled") === "true"); }
  function isReadonly(el) { return Boolean(el.readOnly || attr(el, "aria-readonly") === "true"); }
  function weakUnnamedRole(role) { return ["button", "link", "tab", "menuitem", "option"].includes(role); }

  function hiddenByA11y(el) {
    return Boolean(el.closest("[hidden], [aria-hidden='true']"));
  }

  function visibleEnough(el) {
    if (!(el instanceof Element)) return false;
    if (el.hasAttribute("hidden")) return false;
    if (attr(el, "type") === "hidden") return false;
    const style = getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.visibility === "collapse") return false;
    const rects = el.getClientRects();
    if (!rects || rects.length === 0) {
      return document.activeElement === el || Boolean(attr(el, "aria-label") || attr(el, "aria-labelledby"));
    }
    return true;
  }

  function isNestedInteractiveDuplicate(el, all) {
    const p = el.parentElement?.closest?.(INTERACTIVE_ANCESTOR_SEL);
    return Boolean(p && p !== el && all.includes(p));
  }

  function findActiveDialog() {
    const dialogs = Array.from(document.querySelectorAll("[role='dialog'], dialog, [aria-modal='true']"))
      .filter((d) => visibleEnough(d) && !hiddenByA11y(d));
    return dialogs.at(-1);
  }

  function focusInfo(actions) {
    const f = actions.find((a) => a.state?.includes("focused"));
    return f ? removeEmpty({ actionId: f.id, role: f.role, name: f.name, selector: f.selector }) : undefined;
  }

  function stableSelector(el) {
    const test = testAttrSelector(el);
    if (test) return test;

    const id = stableId(el);
    if (id) {
      const s = `${tagName(el)}#${cssEscape(id)}`;
      if (uniqueSelector(s)) return s;
    }

    const tag = tagName(el);
    const name = attr(el, "name");
    if (name && ["input", "textarea", "select", "button"].includes(tag)) {
      const s = `${tag}[name="${cssString(name)}"]`;
      if (uniqueSelector(s)) return s;
    }

    const aria = attr(el, "aria-label");
    if (aria) {
      const s = `${tag}[aria-label="${cssString(aria)}"]`;
      if (uniqueSelector(s)) return s;
    }

    if (tag === "button") {
      const type = attr(el, "type");
      const scoped = scopedSelector(el, `button${type ? `[type="${cssString(type)}"]` : ""}`);
      if (scoped) return scoped;
    }

    const scoped = scopedSelector(el, tag);
    if (scoped) return scoped;

    return cssPath(el);
  }

  function testAttrSelector(el) {
    for (const key of ["data-testid", "data-cy", "data-test"]) {
      const v = attr(el, key);
      if (!v) continue;
      const s = `${tagName(el)}[${key}="${cssString(v)}"]`;
      if (uniqueSelector(s)) return s;
    }
    return "";
  }

  function scopedSelector(el, leaf) {
    const scopes = [];
    let cur = el.parentElement;
    while (cur && cur !== document.documentElement) {
      const s = scopeSelector(cur);
      if (s) scopes.push({ el: cur, selector: s });
      cur = cur.parentElement;
    }

    for (const sc of scopes) {
      const same = Array.from(sc.el.querySelectorAll(leaf)).filter((x) => x.matches(leaf));
      const idx = same.indexOf(el);
      if (idx < 0) continue;
      const direct = `${sc.selector} ${leaf}`;
      if (same.length === 1 && uniqueSelector(direct)) return direct;
      const nth = `${sc.selector} ${leaf}:nth-of-type(${nthOfType(el)})`;
      if (uniqueSelector(nth)) return nth;
      const childNth = `${sc.selector} > ${tagName(el)}:nth-of-type(${nthOfType(el)})`;
      if (uniqueSelector(childNth)) return childNth;
    }
    return "";
  }

  function scopeSelector(el) {
    const test = testAttrSelector(el);
    if (test) return test;
    const id = stableId(el);
    if (id) {
      const s = `${tagName(el)}#${cssEscape(id)}`;
      if (uniqueSelector(s)) return s;
    }
    const aria = attr(el, "aria-label");
    if (aria && ["section", "article", "form", "table", "nav", "main", "div"].includes(tagName(el))) {
      const role = attr(el, "role");
      const rolePart = role ? `[role="${cssString(role)}"]` : "";
      const s = `${tagName(el)}${rolePart}[aria-label="${cssString(aria)}"]`;
      if (uniqueSelector(s)) return s;
    }
    return "";
  }

  function cssPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && cur !== document.documentElement) {
      const tag = tagName(cur);
      let part = tag;
      const id = stableId(cur);
      if (id) {
        part += `#${cssEscape(id)}`;
        parts.unshift(part);
        break;
      }
      part += `:nth-of-type(${nthOfType(cur)})`;
      parts.unshift(part);
      cur = cur.parentElement;
    }
    return parts.join(" > ");
  }

  function nthOfType(el) {
    let i = 1;
    let p = el.previousElementSibling;
    while (p) {
      if (tagName(p) === tagName(el)) i++;
      p = p.previousElementSibling;
    }
    return i;
  }

  function uniqueSelector(s) {
    try { return document.querySelectorAll(s).length === 1; }
    catch { return false; }
  }

  function labelledBy(el) {
    const ids = (attr(el, "aria-labelledby") || "").split(/\s+/).filter(Boolean);
    const parts = [];
    for (const id of ids) {
      const ref = document.getElementById(id);
      if (ref && visibleEnough(ref) && !hiddenByA11y(ref)) parts.push(textExcludingInteractive(ref, 80));
    }
    return firstClean(parts);
  }

  function firstHeading(el) {
    const h = Array.from(el.querySelectorAll("h1,h2,h3,h4,h5,h6,[role='heading']"))
      .find((x) => visibleEnough(x) && !hiddenByA11y(x));
    return h ? textExcludingInteractive(h, 90) || directText(h, 90) : "";
  }

  function firstLegend(el) {
    const l = Array.from(el.querySelectorAll("legend")).find((x) => visibleEnough(x) && !hiddenByA11y(x));
    return l ? textExcludingInteractive(l, 90) || directText(l, 90) : "";
  }

  function closeEnough(a, b) {
    const root = b.closest("form, fieldset, section, article") || b.parentElement || document.body;
    return domDistance(a, b, root) <= 4;
  }

  function domDistance(a, b, root) {
    const nodes = Array.from(root.querySelectorAll("*"));
    const ia = nodes.indexOf(a);
    const ib = nodes.indexOf(b);
    if (ia < 0 || ib < 0) return Infinity;
    return Math.abs(ib - ia);
  }

  function countActions(el) {
    return Array.from(el.querySelectorAll(INTERACTIVE_SEL)).filter((x) => visibleEnough(x) && !hiddenByA11y(x)).length;
  }

  function tooLarge(el) {
    const rect = el.getBoundingClientRect();
    const area = Math.max(1, rect.width * rect.height);
    const vp = Math.max(1, window.innerWidth * window.innerHeight);
    return area > vp * 0.75 || countActions(el) > 40;
  }

  function smallSemanticRegion(el) {
    return countActions(el) <= 12;
  }

  function looksLikeCard(el) {
    const cls = `${attr(el, "class")} ${attr(el, "data-testid")} ${attr(el, "id")}`;
    return /card|item|row|result|product|tile|entry/i.test(cls) && countActions(el) > 0;
  }

  function isInViewport(el) {
    const r = el.getBoundingClientRect();
    return r.bottom >= 0 && r.right >= 0 && r.top <= window.innerHeight && r.left <= window.innerWidth;
  }

  function stableId(el) {
    const id = attr(el, "id");
    if (!id) return "";
    if (/^(radix-|headlessui-|react-|mui-|ember|:r|_R_|[0-9]+$)/i.test(id)) return "";
    return id;
  }

  function looksLegal(name) { return /terms|privacy|cookie|policy|learn more/i.test(name || ""); }
  function tagName(el) { return (el?.tagName || "").toLowerCase(); }
  function attr(el, name) { return el?.getAttribute?.(name)?.trim?.() || ""; }
  function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function truncate(s, n) { s = clean(s); return s.length > n ? s.slice(0, Math.max(0, n - 1)).trim() + "…" : s; }
  function firstClean(xs) { return xs.map(clean).find(Boolean) || ""; }

  function unique(xs) {
    const out = [];
    const seen = new Set();
    for (const x of xs.map(clean).filter(Boolean)) {
      const k = x.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(x);
    }
    return out;
  }

  function removeRepeatedPrefix(text, prefix) {
    text = clean(text);
    prefix = clean(prefix);
    if (!prefix) return text;
    if (text.toLowerCase() === prefix.toLowerCase()) return "";
    if (text.toLowerCase().startsWith(prefix.toLowerCase() + " ")) return text.slice(prefix.length).trim();
    return text;
  }

  function removeEmpty(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (k.startsWith("_")) { out[k] = v; continue; }
      if (v === undefined || v === null || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === "object" && !Array.isArray(v)) {
        const c = removeEmpty(v);
        if (Object.keys(c).length === 0) continue;
        out[k] = c;
      } else {
        out[k] = v;
      }
    }
    return out;
  }

  function cssEscape(s) {
    if (window.CSS && typeof window.CSS.escape === "function") return window.CSS.escape(s);
    return String(s).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
  }
  function cssString(s) { return String(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }

  return main();
});

async function evaluateFile(filePath, outPath, browserWs) {
  const pageWs = await createPage(browserWs, "about:blank");
  const cdp = new CDP(pageWs);
  await cdp.opened;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");

  let loaded = false;
  const loadPromise = new Promise((resolve) => {
    cdp.on("Page.loadEventFired", () => { loaded = true; resolve(); });
  });

  const sourceUrl = pathToFileURL(filePath).href;
  const html = fs.readFileSync(filePath, "utf8");
  await cdp.send("Page.navigate", { url: "about:blank" });
  if (!loaded) await withTimeout(loadPromise, 10000, `Timed out opening blank page for ${sourceUrl}`);
  await cdp.send("Runtime.evaluate", { expression: "document.open();", returnByValue: true });
  const chunkSize = 16000;
  for (let i = 0; i < html.length; i += chunkSize) {
    const chunk = html.slice(i, i + chunkSize);
    await cdp.send("Runtime.evaluate", {
      expression: `document.write(${JSON.stringify(chunk)});`,
      returnByValue: true,
    });
  }
  await cdp.send("Runtime.evaluate", {
    expression: `document.close(); window.__SEMANTIC_SOURCE_URL = ${JSON.stringify(sourceUrl)};`,
    returnByValue: true,
  });
  // Let layout settle for CSS visibility.
  await wait(50);

  const expression = `(${EXTRACTOR_SOURCE})({ maxActions: ${MAX_ACTIONS}, maxRegions: ${MAX_REGIONS}, maxRawActions: ${Math.max(200, MAX_ACTIONS * 4)} })`;
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
    timeout: 10000,
  });

  if (result.exceptionDetails) {
    throw new Error(`Evaluation failed in ${filePath}: ${JSON.stringify(result.exceptionDetails, null, 2)}`);
  }

  const obj = result.result.value;
  applyByteBudget(obj);
  fs.writeFileSync(outPath, JSON.stringify(obj, null, 2), "utf8");
  cdp.close();
  return obj;
}

function applyByteBudget(obj) {
  if (!obj || !Array.isArray(obj.actions)) return;
  const originalActions = obj.actions.length;
  const usedRegions = () => new Set(obj.actions.map((a) => a.region).filter(Boolean));

  function pruneUnusedRegions() {
    if (!Array.isArray(obj.regions)) return;
    const used = usedRegions();
    obj.regions = obj.regions.filter((r) => used.has(r.id));
    if (obj.regions.length === 0) delete obj.regions;
  }

  pruneUnusedRegions();
  obj.stats.bytes = Buffer.byteLength(JSON.stringify(obj), "utf8");

  while (obj.stats.bytes > MAX_BYTES && obj.actions.length > MIN_ACTIONS_AFTER_BUDGET) {
    obj.actions.pop();
    pruneUnusedRegions();
    obj.stats.emittedActions = obj.actions.length;
    obj.stats.emittedRegions = Array.isArray(obj.regions) ? obj.regions.length : 0;
    if (originalActions > obj.actions.length) obj.stats.truncatedActions = originalActions - obj.actions.length;
    obj.stats.bytes = Buffer.byteLength(JSON.stringify(obj), "utf8");
  }

  if (originalActions > obj.actions.length) obj.stats.truncatedActions = originalActions - obj.actions.length;
  obj.stats.bytes = Buffer.byteLength(JSON.stringify(obj), "utf8");
}

async function main() {
  if (!fs.existsSync(CASES_DIR)) throw new Error(`Cases dir not found: ${CASES_DIR}`);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const files = fs.readdirSync(CASES_DIR).filter((f) => f.toLowerCase().endsWith(".html")).sort();
  if (!files.length) throw new Error(`No .html files in ${CASES_DIR}`);

  const browser = launchBrowser();
  const browserWs = await getBrowserWs(browser);
  console.log(`Browser: ${browser.spawnfile}`);
  console.log(`Cases: ${CASES_DIR}`);
  console.log(`Outputs: ${OUT_DIR}`);

  const summary = [];
  try {
    for (const f of files) {
      const inFile = path.join(CASES_DIR, f);
      const outFile = path.join(OUT_DIR, f.replace(/\.html$/i, ".json"));
      const obj = await evaluateFile(inFile, outFile, browserWs);
      summary.push({ file: f, actions: obj.actions.length, regions: obj.regions?.length || 0, bytes: obj.stats.bytes });
      console.log(`${f}: ${obj.actions.length} actions, ${obj.regions?.length || 0} regions, ${obj.stats.bytes} bytes`);
    }
  } finally {
    browser.kill();
    try { fs.rmSync(browser.userDataDir, { recursive: true, force: true }); } catch {}
  }

  const sumFile = path.join(OUT_DIR, "_summary.json");
  fs.writeFileSync(sumFile, JSON.stringify(summary, null, 2), "utf8");
}

main().catch((err) => {
  console.error(err.stack || err.message || err);
  process.exitCode = 1;
});
