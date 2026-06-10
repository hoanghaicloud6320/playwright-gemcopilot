// semantic-ui-tree.js
// ESM, self-contained, safe for: page.evaluate(makeSemanticUiTree)
// Usage from TS/ESM:
//   import { makeSemanticUiTree } from './semantic-ui-tree.js';
//   const tree = await page.evaluate(makeSemanticUiTree);

export function makeSemanticUiTree(options = {}) {
  const cfg = {
    maxActions: Number.isFinite(options.maxActions) ? options.maxActions : 80,
    maxRegions: Number.isFinite(options.maxRegions) ? options.maxRegions : 12,
    maxBytes: Number.isFinite(options.maxBytes) ? options.maxBytes : 5000,
    labelLimit: Number.isFinite(options.labelLimit) ? options.labelLimit : 90,
    contextLimit: Number.isFinite(options.contextLimit) ? options.contextLimit : 180,
  };

  const ACTION_SELECTOR = [
    'button',
    'a[href]',
    'input',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[onclick]',
  ].join(',');

  const REGION_SELECTOR = [
    'main',
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    'section[aria-label]',
    'article[aria-label]',
    'table[aria-label]',
    '[role="main"]',
    '[role="navigation"]',
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[role="region"]',
    '[role="search"]',
    '[role="form"]',
  ].join(',');

  function cleanText(s, limit = cfg.labelLimit) {
    if (s == null) return undefined;
    const t = String(s).replace(/\s+/g, ' ').trim();
    if (!t) return undefined;
    return t.length > limit ? t.slice(0, Math.max(0, limit - 1)) + '…' : t;
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(value);
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function isElement(x) {
    return x instanceof Element;
  }

  function hasHiddenAncestor(el) {
    for (let n = el; isElement(n); n = n.parentElement) {
      if (n.hidden) return true;
      if (n.getAttribute('aria-hidden') === 'true') return true;
      const st = window.getComputedStyle(n);
      if (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse') return true;
    }
    return false;
  }

  function isVisible(el) {
    if (!isElement(el) || hasHiddenAncestor(el)) return false;
    const rect = el.getBoundingClientRect();
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && el.type === 'hidden') return false;
    return rect.width > 0 || rect.height > 0 || !!cleanText(el.textContent, 20);
  }

  function textById(id) {
    const e = document.getElementById(id);
    if (!e || hasHiddenAncestor(e)) return undefined;
    return cleanText(e.innerText || e.textContent);
  }

  function textFromLabelledBy(el) {
    const ids = cleanText(el.getAttribute('aria-labelledby'), 500);
    if (!ids) return undefined;
    const parts = ids.split(/\s+/).map(textById).filter(Boolean);
    return cleanText(parts.join(' '));
  }

  function associatedLabelText(el) {
    const id = el.getAttribute('id');
    if (id) {
      const label = document.querySelector(`label[for="${cssEscape(id)}"]`);
      if (label && !hasHiddenAncestor(label)) {
        const t = cleanText(label.innerText || label.textContent);
        if (t) return t;
      }
    }

    const wrapping = el.closest('label');
    if (wrapping && !hasHiddenAncestor(wrapping)) {
      const t = cleanText(wrapping.innerText || wrapping.textContent);
      if (t) return t;
    }

    // Dirty-HTML fallback: <label for="email">Email</label><input name="email">
    const name = el.getAttribute('name');
    if (name) {
      const loose = document.querySelector(`label[for="${cssEscape(name)}"]`);
      if (loose && !hasHiddenAncestor(loose)) {
        const t = cleanText(loose.innerText || loose.textContent);
        if (t) return t;
      }
    }

    // Nearby previous label fallback in the same form/section.
    let prev = el.previousElementSibling;
    for (let i = 0; prev && i < 3; i++, prev = prev.previousElementSibling) {
      if (prev.tagName && prev.tagName.toLowerCase() === 'label' && !hasHiddenAncestor(prev)) {
        const t = cleanText(prev.innerText || prev.textContent);
        if (t) return t;
      }
    }

    return undefined;
  }

  function ownText(el, limit = cfg.labelLimit) {
    const parts = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        parts.push(node.textContent || '');
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node;
        const tag = child.tagName.toLowerCase();
        if (hasHiddenAncestor(child)) continue;
        if (['svg', 'path', 'use', 'script', 'style'].includes(tag)) continue;
        if (child.matches && child.matches(ACTION_SELECTOR)) continue;
        const txt = cleanText(child.innerText || child.textContent, 40);
        if (txt) parts.push(txt);
      }
    }
    return cleanText(parts.join(' '), limit);
  }

  function elementLabel(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');

    return cleanText(
      el.getAttribute('aria-label') ||
        textFromLabelledBy(el) ||
        associatedLabelText(el) ||
        el.getAttribute('placeholder') ||
        el.getAttribute('alt') ||
        el.getAttribute('title') ||
        (tag === 'input' ? el.getAttribute('name') : undefined) ||
        ownText(el) ||
        cleanText(el.innerText || el.textContent) ||
        el.getAttribute('data-testid') ||
        el.getAttribute('data-cy') ||
        el.id ||
        role ||
        tag,
      cfg.labelLimit
    );
  }

  function inferKind(el) {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    if (role === 'textbox' || tag === 'textarea' || el.isContentEditable) return 'textbox';
    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (['submit', 'button', 'reset'].includes(type)) return 'button';
      return 'input';
    }
    if (tag === 'select') return 'select';
    if (tag === 'a' || role === 'link') return 'link';
    if (role === 'checkbox') return 'checkbox';
    if (role === 'radio') return 'radio';
    if (role === 'switch') return 'checkbox';
    if (role === 'tab') return 'tab';
    if (role === 'menuitem') return 'menuitem';
    if (role === 'option') return 'option';
    return 'button';
  }

  function isTextEditable(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (el.hasAttribute('disabled') || el.hasAttribute('readonly')) return false;
    if (el.isContentEditable) return true;
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      return !['button', 'submit', 'reset', 'checkbox', 'radio', 'hidden', 'file', 'image', 'range', 'color'].includes(type);
    }
    return (el.getAttribute('role') || '').toLowerCase() === 'textbox';
  }

  function elementState(el, kind) {
    const s = [];
    if (document.activeElement === el) s.push('focused');
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') s.push('disabled');
    if (el.hasAttribute('readonly')) s.push('readonly');
    if (isTextEditable(el)) s.push('editable');
    if ((kind === 'checkbox' || kind === 'radio') && (el.checked || el.getAttribute('aria-checked') === 'true')) s.push('checked');
    if (el.getAttribute('aria-selected') === 'true') s.push('selected');
    if (el.getAttribute('aria-expanded') === 'true') s.push('expanded');
    if (el.getAttribute('aria-expanded') === 'false') s.push('collapsed');
    return s.length ? s : undefined;
  }

  function regionRole(el) {
    if (!el) return undefined;
    const role = el.getAttribute('role');
    if (role) return role;
    const tag = el.tagName.toLowerCase();
    if (tag === 'nav') return 'navigation';
    if (tag === 'main') return 'main';
    if (tag === 'form') return 'form';
    if (tag === 'section') return 'section';
    if (tag === 'article') return 'article';
    if (tag === 'table') return 'table';
    return tag;
  }

  function firstHeadingText(root) {
    if (!root) return undefined;
    const h = root.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]');
    if (!h || hasHiddenAncestor(h)) return undefined;
    return cleanText(h.innerText || h.textContent);
  }

  function regionLabel(el) {
    if (!el) return undefined;
    return cleanText(
      el.getAttribute('aria-label') ||
        textFromLabelledBy(el) ||
        firstHeadingText(el) ||
        (el.tagName.toLowerCase() === 'form' ? el.getAttribute('id') : undefined) ||
        regionRole(el),
      cfg.labelLimit
    );
  }

  function findRegion(el) {
    const dialog = el.closest('[role="dialog"],[role="alertdialog"]');
    if (dialog && isVisible(dialog)) return dialog;

    let cur = el.parentElement;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (cur.matches(REGION_SELECTOR) && isVisible(cur)) return cur;
      cur = cur.parentElement;
    }
    return undefined;
  }

  function groupType(el) {
    if (!el) return undefined;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    if (tag === 'tr' || role === 'row') return 'row';
    if (tag === 'form' || role === 'form') return 'form';
    if (tag === 'li' || role === 'listitem') return 'listitem';
    if (tag === 'article') return 'card';
    if (tag === 'section') return 'section';
    if (role === 'dialog' || role === 'alertdialog') return 'dialog';
    if (role === 'group' || role === 'region') return 'section';
    return 'section';
  }

  function groupScore(ancestor, action) {
    const tag = ancestor.tagName.toLowerCase();
    const role = (ancestor.getAttribute('role') || '').toLowerCase();
    let s = 0;
    if (['tr', 'li', 'form', 'article', 'section', 'fieldset'].includes(tag)) s += 35;
    if (['row', 'listitem', 'form', 'group', 'region', 'dialog', 'alertdialog'].includes(role)) s += 35;
    if (ancestor.hasAttribute('aria-label') || ancestor.hasAttribute('aria-labelledby')) s += 20;
    if (firstHeadingText(ancestor)) s += 15;
    if (tag === 'body' || tag === 'html' || tag === 'main') s -= 50;

    const rect = ancestor.getBoundingClientRect();
    const viewportArea = Math.max(1, window.innerWidth * window.innerHeight);
    const area = rect.width * rect.height;
    if (area > viewportArea * 0.75) s -= 35;

    let d = 0;
    for (let n = action.parentElement; n && n !== ancestor; n = n.parentElement) d++;
    s -= d * 4;
    return s;
  }

  function findGroup(el) {
    let best = undefined;
    let bestScore = -Infinity;
    let cur = el.parentElement;
    let depth = 0;
    while (cur && cur !== document.body && cur !== document.documentElement && depth < 8) {
      if (isVisible(cur)) {
        const sc = groupScore(cur, el);
        if (sc > bestScore) {
          best = cur;
          bestScore = sc;
        }
      }
      cur = cur.parentElement;
      depth++;
    }
    return bestScore >= 25 ? best : undefined;
  }

  function directDescriptiveText(root, excludeEl) {
    const parts = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (excludeEl && (parent === excludeEl || excludeEl.contains(parent))) return NodeFilter.FILTER_REJECT;
        if (parent.closest(ACTION_SELECTOR)) return NodeFilter.FILTER_REJECT;
        if (hasHiddenAncestor(parent)) return NodeFilter.FILTER_REJECT;
        const tag = parent.tagName.toLowerCase();
        if (['script', 'style', 'svg', 'path', 'use'].includes(tag)) return NodeFilter.FILTER_REJECT;
        const text = cleanText(node.textContent, 60);
        return text ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });

    while (parts.join(' ').length < cfg.contextLimit) {
      const n = walker.nextNode();
      if (!n) break;
      const t = cleanText(n.textContent, 60);
      if (t && !parts.includes(t)) parts.push(t);
    }
    return cleanText(parts.join(' '), cfg.contextLimit);
  }

  function formFields(form) {
    const controls = Array.from(form.querySelectorAll('input,textarea,select,[role="textbox"],[contenteditable="true"]'));
    const labels = [];
    for (const c of controls) {
      if (!isVisible(c)) continue;
      const kind = inferKind(c);
      if (!['input', 'textbox', 'select', 'checkbox', 'radio'].includes(kind)) continue;
      const l = elementLabel(c);
      if (l && !labels.includes(l)) labels.push(l);
      if (labels.length >= 8) break;
    }
    return labels;
  }

  function rowContext(row, action) {
    const cells = Array.from(row.children).filter((c) => ['td', 'th'].includes(c.tagName.toLowerCase()));
    const pieces = [];
    for (const cell of cells) {
      if (action && cell.contains(action)) continue;
      const t = directDescriptiveText(cell, action) || cleanText(cell.innerText || cell.textContent, 80);
      if (t && !pieces.includes(t)) pieces.push(t);
      if (pieces.join(' | ').length >= cfg.contextLimit) break;
    }
    return cleanText(pieces.join(' | '), cfg.contextLimit);
  }

  function summarizeGroup(group, action) {
    if (!group) return undefined;
    const type = groupType(group);
    const label = cleanText(
      group.getAttribute('aria-label') ||
        textFromLabelledBy(group) ||
        firstHeadingText(group) ||
        (group.tagName.toLowerCase() === 'form' ? group.getAttribute('id') : undefined),
      cfg.labelLimit
    );

    let text;
    if (type === 'form') {
      const fields = formFields(group);
      text = fields.length ? cleanText('Fields: ' + fields.join(', '), cfg.contextLimit) : undefined;
    } else if (type === 'row') {
      text = rowContext(group, action);
    } else if (type === 'dialog') {
      text = directDescriptiveText(group, action);
    } else {
      text = directDescriptiveText(group, action);
    }

    if (text && label && text === label) text = undefined;

    const out = { type };
    if (label) out.label = label;
    if (text) out.text = text;
    return out.label || out.text ? out : undefined;
  }

  function isStableId(id) {
    if (!id) return false;
    if (id.length > 80) return false;
    if (/^radix-|^headlessui-|^react-aria-|^:r/i.test(id)) return false;
    return true;
  }

  function isUniqueSelector(sel) {
    try {
      return document.querySelectorAll(sel).length === 1;
    } catch {
      return false;
    }
  }

  function selectorFor(el) {
    const tag = el.tagName.toLowerCase();

    for (const attr of ['data-testid', 'data-cy', 'data-test', 'aria-label']) {
      const v = el.getAttribute(attr);
      if (v) {
        const sel = `${tag}[${attr}="${CSS.escape(v)}"]`;
        if (isUniqueSelector(sel)) return sel;
      }
    }

    const id = el.getAttribute('id');
    if (isStableId(id)) {
      const sel = `${tag}#${CSS.escape(id)}`;
      if (isUniqueSelector(sel)) return sel;
      const idSel = `#${CSS.escape(id)}`;
      if (isUniqueSelector(idSel)) return idSel;
    }

    const name = el.getAttribute('name');
    if (name && ['input', 'textarea', 'select'].includes(tag)) {
      const sel = `${tag}[name="${CSS.escape(name)}"]`;
      if (isUniqueSelector(sel)) return sel;
    }

    if (tag === 'button') {
      const type = el.getAttribute('type');
      const form = el.closest('form');
      if (type && form && isStableId(form.id)) {
        const sel = `form#${CSS.escape(form.id)} button[type="${CSS.escape(type)}"]`;
        if (isUniqueSelector(sel)) return sel;
      }
    }

    const region = findRegion(el);
    if (region) {
      const rLabel = region.getAttribute('aria-label');
      const rTag = region.tagName.toLowerCase();
      if (rLabel) {
        const siblings = Array.from(region.querySelectorAll(tag)).filter((x) => isVisible(x));
        const idx = siblings.indexOf(el) + 1;
        const scoped = `${rTag}[aria-label="${CSS.escape(rLabel)}"] ${tag}:nth-of-type(${idx || 1})`;
        try {
          if (document.querySelector(scoped) === el) return scoped;
        } catch {}
      }
    }

    const parts = [];
    let cur = el;
    while (cur && cur !== document.documentElement && parts.length < 5) {
      const t = cur.tagName.toLowerCase();
      const cid = cur.getAttribute('id');
      if (isStableId(cid)) {
        parts.unshift(`${t}#${CSS.escape(cid)}`);
        break;
      }
      const parent = cur.parentElement;
      if (!parent) break;
      const same = Array.from(parent.children).filter((c) => c.tagName === cur.tagName);
      const nth = same.indexOf(cur) + 1;
      parts.unshift(`${t}:nth-of-type(${nth})`);
      cur = parent;
    }
    return parts.join(' > ');
  }

  const regionMap = new Map();
  const regions = [];

  function regionIdFor(el) {
    const region = findRegion(el);
    if (!region) return undefined;
    if (regionMap.has(region)) return regionMap.get(region);
    if (regions.length >= cfg.maxRegions) return undefined;

    const id = `r${regions.length + 1}`;
    regionMap.set(region, id);
    regions.push({
      id,
      role: regionRole(region),
      label: regionLabel(region),
    });
    return id;
  }

  function usefulValue(el, kind) {
    if (!('value' in el)) return undefined;
    const value = cleanText(el.value, 120);
    if (!value) return undefined;
    if ((kind === 'checkbox' || kind === 'radio') && value === 'on') return undefined;
    if (kind === 'button') return undefined;
    return value;
  }

  const activeDialog = Array.from(document.querySelectorAll('[role="dialog"],[role="alertdialog"]')).find(isVisible);

  function actionScore(item, el) {
    let s = 0;
    if (activeDialog) s += activeDialog.contains(el) ? 300 : -100;
    if (document.activeElement === el) s += 150;
    if (item.state && item.state.includes('editable')) s += 80;
    if (item.label) s += 35;
    if (item.region) s += 15;
    if (item.group && (item.group.label || item.group.text)) s += 15;
    if (item.state && item.state.includes('disabled')) s -= 80;

    const txt = `${item.label || ''} ${item.group?.label || ''}`.toLowerCase();
    if (/terms|privacy|cookie|learn more/.test(txt)) s -= 40;
    return s;
  }

  const raw = Array.from(document.querySelectorAll(ACTION_SELECTOR)).filter((el) => {
    if (!isVisible(el)) return false;
    const tag = el.tagName.toLowerCase();
    if (['svg', 'path', 'use'].includes(tag)) return false;
    const parentAction = el.parentElement && el.parentElement.closest(ACTION_SELECTOR);
    if (parentAction && parentAction !== el && parentAction.contains(el)) return false;
    return true;
  });

  const actions = [];
  const seen = new Set();

  for (const el of raw) {
    const kind = inferKind(el);
    const label = elementLabel(el);
    const selector = selectorFor(el);
    if (!selector) continue;

    const region = regionIdFor(el);
    const group = summarizeGroup(findGroup(el), el);
    const state = elementState(el, kind);
    const value = usefulValue(el, kind);

    const key = `${kind}|${selector}|${label || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const item = { id: '', kind };
    if (label) item.label = label;
    if (value) item.value = value;
    item.selector = selector;
    if (region) item.region = region;
    if (group) item.group = group;
    if (state) item.state = state;

    item._score = actionScore(item, el);
    actions.push(item);
  }

  actions.sort((a, b) => b._score - a._score);

  const limited = actions.slice(0, cfg.maxActions).map((a, i) => {
    const out = { ...a, id: `a${i + 1}` };
    delete out._score;
    return out;
  });

  // Keep only used regions.
  const usedRegionIds = new Set(limited.map((a) => a.region).filter(Boolean));
  const usedRegions = regions.filter((r) => usedRegionIds.has(r.id));

  const focus = limited.find((a) => Array.isArray(a.state) && a.state.includes('focused'));

  let result = {
    page: {
      title: document.title || undefined,
      url: location.href,
    },
    regions: usedRegions,
    actions: limited,
    stats: {
      rawCandidates: raw.length,
      emittedActions: limited.length,
      emittedRegions: usedRegions.length,
    },
  };

  if (focus) {
    result.focus = {
      actionId: focus.id,
      label: focus.label,
      selector: focus.selector,
    };
  }

  // Byte budget fallback: remove non-essential verbose context first.
  function byteLen(obj) {
    return new Blob([JSON.stringify(obj)]).size;
  }

  if (byteLen(result) > cfg.maxBytes) {
    result = JSON.parse(JSON.stringify(result));
    for (const a of result.actions) {
      if (a.group && a.group.text) delete a.group.text;
    }
  }

  if (byteLen(result) > cfg.maxBytes) {
    result.actions = result.actions.slice(0, Math.max(10, Math.floor(cfg.maxActions / 2)));
    result.stats.emittedActions = result.actions.length;
  }

  return result;
}

export default makeSemanticUiTree;
