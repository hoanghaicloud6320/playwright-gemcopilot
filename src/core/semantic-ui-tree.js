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

  // ---------------------------------------------------------------------------
  // Selector generation policy:
  // - Computed ONLY from the original DOM element/ancestors.
  // - Does NOT depend on semantic UI tree, region ids, action ids, or emitted order.
  // - Every emitted action gets a selector.
  // - Preferred selectors use stable DOM anchors and stable attributes.
  // - nth-of-type is the final fallback only, and when a path is needed, every
  //   ancestor segment first tries stable attributes before nth-of-type.
  // - Final selector is always proven exact at extraction time:
  //     querySelectorAll(selector).length === 1 && querySelector(selector) === el
  // ---------------------------------------------------------------------------

  function cssString(value) {
    // Attribute values are CSS strings, not CSS identifiers.
    return JSON.stringify(String(value));
  }

  function cssIdent(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function attr(name, value) {
    return `[${name}=${cssString(value)}]`;
  }

  function selectorNodes(sel) {
    try {
      return Array.from(document.querySelectorAll(sel));
    } catch {
      return [];
    }
  }

  function selectorHitsExactly(sel, el) {
    const nodes = selectorNodes(sel);
    return nodes.length === 1 && nodes[0] === el;
  }

  function addCandidate(list, sel, score) {
    if (!sel || list.some((x) => x.sel === sel)) return;
    list.push({ sel, score });
  }

  function isStableId(id) {
    if (!id) return false;
    if (id.length > 80) return false;
    if (/^(:r|radix-|headlessui-|react-aria-|ember\d+|mui-|chakra-|mantine-|rc_|rc-)/i.test(id)) return false;
    if (/^[a-f0-9]{8,}$/i.test(id)) return false;
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return false;
    if (/\d{8,}/.test(id)) return false;
    return true;
  }

  function usefulAttrValue(el, name) {
    const v = el.getAttribute(name);
    if (v == null) return undefined;
    const t = String(v).replace(/\s+/g, ' ').trim();
    if (!t) return undefined;
    if (t.length > 180) return undefined;
    return t;
  }

  function stableClassTokens(el) {
    const cls = typeof el.className === 'string' ? el.className : '';
    if (!cls) return [];
    return cls
      .split(/\s+/)
      .filter(Boolean)
      .filter((c) => c.length <= 40)
      .filter((c) => !/^[a-z0-9_-]*[0-9a-f]{6,}[a-z0-9_-]*$/i.test(c))
      .filter((c) => !/^(active|selected|disabled|open|closed|focus|focused|hover|ng-|css-|sc-|jss|makeStyles|emotion-|__)/i.test(c))
      .slice(0, 3);
  }

  function directSelectorCandidates(el) {
    const tag = el.tagName.toLowerCase();
    const out = [];

    for (const a of ['data-testid', 'data-test-id', 'data-cy', 'data-test', 'data-qa', 'data-automation-id']) {
      const v = usefulAttrValue(el, a);
      if (!v) continue;
      addCandidate(out, `${tag}${attr(a, v)}`, 100);
      addCandidate(out, attr(a, v), 98);
    }

    const id = usefulAttrValue(el, 'id');
    if (isStableId(id)) {
      addCandidate(out, `${tag}#${cssIdent(id)}`, 96);
      addCandidate(out, `#${cssIdent(id)}`, 94);
    }

    const singleAttrs = [
      'aria-label',
      'aria-labelledby',
      'name',
      'placeholder',
      'title',
      'alt',
      'role',
      'type',
      'value',
      'autocomplete',
      'href',
      'for',
    ];

    for (const a of singleAttrs) {
      const v = usefulAttrValue(el, a);
      if (!v) continue;
      let sc = 70;
      if (a === 'aria-label' || a === 'aria-labelledby') sc = 88;
      else if (['name', 'placeholder', 'title', 'alt', 'value'].includes(a)) sc = 78;
      else if (a === 'href') sc = 68;
      addCandidate(out, `${tag}${attr(a, v)}`, sc);
    }

    const comboAttrs = [
      'role',
      'aria-label',
      'aria-labelledby',
      'name',
      'placeholder',
      'title',
      'alt',
      'type',
      'value',
      'autocomplete',
      'href',
    ].filter((a) => usefulAttrValue(el, a));

    for (let i = 0; i < comboAttrs.length; i++) {
      for (let j = i + 1; j < comboAttrs.length; j++) {
        const a = comboAttrs[i];
        const b = comboAttrs[j];
        addCandidate(out, `${tag}${attr(a, usefulAttrValue(el, a))}${attr(b, usefulAttrValue(el, b))}`, 86);
      }
    }

    if (comboAttrs.length >= 3) {
      const sel = `${tag}${comboAttrs.slice(0, 5).map((a) => attr(a, usefulAttrValue(el, a))).join('')}`;
      addCandidate(out, sel, 90);
    }

    const classes = stableClassTokens(el);
    if (classes.length) {
      addCandidate(out, `${tag}.${classes.map(cssIdent).join('.')}`, 55);
      for (const c of classes) addCandidate(out, `${tag}.${cssIdent(c)}`, 45);
    }

    return out;
  }

  function anchorSelectorCandidates(el) {
    const tag = el.tagName.toLowerCase();
    const out = [];

    for (const c of directSelectorCandidates(el)) {
      if (selectorHitsExactly(c.sel, el)) addCandidate(out, c.sel, c.score);
    }

    const role = usefulAttrValue(el, 'role');
    const aria = usefulAttrValue(el, 'aria-label');
    const name = usefulAttrValue(el, 'name');

    if (role) addCandidate(out, `${tag}${attr('role', role)}`, 70);
    if (aria) addCandidate(out, `${tag}${attr('aria-label', aria)}`, 76);
    if (role && aria) addCandidate(out, `${tag}${attr('role', role)}${attr('aria-label', aria)}`, 86);
    if (tag === 'form') {
      if (name) addCandidate(out, `form${attr('name', name)}`, 76);
      if (role) addCandidate(out, `form${attr('role', role)}`, 82);
      if (role && aria) addCandidate(out, `form${attr('role', role)}${attr('aria-label', aria)}`, 90);
    }

    return out.filter((c) => selectorHitsExactly(c.sel, el)).sort((a, b) => b.score - a.score);
  }

  function localSegmentCandidates(el) {
    const tag = el.tagName.toLowerCase();
    const out = [];

    // Similar to direct candidates, but these only need to be unique among siblings.
    // This lets parent paths stay stable without nth whenever possible.
    for (const c of directSelectorCandidates(el)) {
      const seg = c.sel.startsWith(tag) || c.sel.startsWith('#') || c.sel.startsWith('[') ? c.sel : `${tag}${c.sel}`;
      addCandidate(out, seg, c.score);
    }

    addCandidate(out, tag, 1);
    return out.sort((a, b) => b.score - a.score || a.sel.length - b.sel.length);
  }

  function childMatchesSegment(parent, child, seg) {
    try {
      const hits = Array.from(parent.children).filter((x) => x.matches(seg));
      return hits.length === 1 && hits[0] === child;
    } catch {
      return false;
    }
  }

  function segmentForChild(parent, child) {
    for (const c of localSegmentCandidates(child)) {
      if (childMatchesSegment(parent, child, c.sel)) return c.sel;
    }

    const tag = child.tagName.toLowerCase();
    const same = Array.from(parent.children).filter((x) => x.tagName === child.tagName);
    const idx = same.indexOf(child) + 1;
    return same.length === 1 ? tag : `${tag}:nth-of-type(${idx})`;
  }

  function smartPathFromAnchor(el, anchorEl, anchorSel) {
    const parts = [];
    let cur = el;
    while (cur && cur !== anchorEl && cur !== document.documentElement) {
      const parent = cur.parentElement;
      if (!parent) return undefined;
      parts.unshift(segmentForChild(parent, cur));
      cur = parent;
    }
    if (cur !== anchorEl || !parts.length) return undefined;
    return `${anchorSel} > ${parts.join(' > ')}`;
  }

  function absoluteSmartPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.documentElement) {
      const parent = cur.parentElement;
      if (!parent) break;
      parts.unshift(segmentForChild(parent, cur));
      cur = parent;
    }
    parts.unshift('html');
    return parts.join(' > ');
  }

  function selectorBundleFor(el) {
    const candidates = [];

    // 1) Direct exact selectors from the element itself.
    for (const c of directSelectorCandidates(el)) {
      if (selectorHitsExactly(c.sel, el)) addCandidate(candidates, c.sel, c.score + 2000);
    }

    // 2) Stable ancestor + target stable selector, no nth.
    const ancestors = [];
    for (let a = el.parentElement, depth = 0; a && a !== document.body && a !== document.documentElement && depth < 10; a = a.parentElement, depth++) {
      ancestors.push({ el: a, depth });
    }

    const rels = directSelectorCandidates(el).slice(0, 24);
    for (const { el: anc, depth } of ancestors) {
      const anchors = anchorSelectorCandidates(anc).slice(0, 6);
      for (const an of anchors) {
        for (const r of rels) {
          const sel = `${an.sel} ${r.sel}`;
          if (selectorHitsExactly(sel, el)) addCandidate(candidates, sel, 1500 + an.score + r.score - depth * 5);
        }
      }
    }

    // 3) Stable ancestor + smart child path. Each parent segment tries stable
    // attrs/classes first, and uses nth only for the specific ambiguous level.
    for (const { el: anc, depth } of ancestors) {
      const anchors = anchorSelectorCandidates(anc).slice(0, 6);
      for (const an of anchors) {
        const sel = smartPathFromAnchor(el, anc, an.sel);
        if (sel && selectorHitsExactly(sel, el)) addCandidate(candidates, sel, 900 + an.score - depth * 12);
      }
    }

    // 4) Full DOM smart path. This is the guaranteed fallback. It still tries
    // stable selectors at every parent level before nth-of-type.
    const abs = absoluteSmartPath(el);
    if (abs && selectorHitsExactly(abs, el)) addCandidate(candidates, abs, 1);

    candidates.sort((a, b) => b.score - a.score || a.sel.length - b.sel.length);
    const primary = candidates[0]?.sel || abs;

    const cssFallbacks = [];
    for (const c of candidates) {
      if (c.sel === primary) continue;
      cssFallbacks.push(c.sel);
      if (cssFallbacks.length >= 2) break;
    }

    return { primary, cssFallbacks };
  }

  function selectorFor(el) {
    return selectorBundleFor(el).primary;
  }

  function roleForFallback(el, kind) {
    const role = getRoleForFallback(el, kind);
    const name = elementLabel(el);
    if (!role || !name) return undefined;
    return ['role', role, name];
  }

  function getRoleForFallback(el, kind) {
    const explicit = cleanText(el.getAttribute('role'), 40);
    if (explicit) return explicit;
    if (kind === 'button') return 'button';
    if (kind === 'link') return 'link';
    if (kind === 'textbox' || kind === 'input') return 'textbox';
    if (kind === 'checkbox') return 'checkbox';
    if (kind === 'radio') return 'radio';
    if (kind === 'select') return 'combobox';
    if (kind === 'tab') return 'tab';
    if (kind === 'option') return 'option';
    if (kind === 'menuitem') return 'menuitem';
    return undefined;
  }

  function formSubmitFallback(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    const isSubmitLike =
      (tag === 'button' && (!type || type === 'submit')) ||
      (tag === 'input' && ['submit', 'image'].includes(type));
    if (!isSubmitLike) return undefined;
    const form = el.closest('form');
    if (!form) return undefined;
    const fs = selectorFor(form);
    return fs ? ['submit', fs] : undefined;
  }

  function fallbackFor(el, kind, primarySelector, sub) {
    const fb = [];
    if (sub) fb.push(['key', sub]);

    const submit = formSubmitFallback(el);
    if (submit) fb.push(submit);
    if (fb.length >= 3) return fb;

    const bundle = selectorBundleFor(el);
    for (const s of bundle.cssFallbacks) {
      if (s && s !== primarySelector) fb.push(['css', s]);
      if (fb.length >= 3) return fb;
    }

    const role = roleForFallback(el, kind);
    if (role) fb.push(role);
    if (fb.length >= 3) return fb;

    if (primarySelector && !isTextEditable(el)) fb.push(['domclick']);
    return fb.slice(0, 3);
  }

  function isProbablyOccluded(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return true;
    const pts = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + Math.min(rect.width - 1, 6), rect.top + Math.min(rect.height - 1, 6)],
      [rect.right - Math.min(rect.width - 1, 6), rect.bottom - Math.min(rect.height - 1, 6)],
    ];
    let visibleHit = false;
    for (const [x, y] of pts) {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (top && (top === el || el.contains(top))) visibleHit = true;
    }
    return !visibleHit;
  }

  function submitHintFor(el, kind) {
    if (!isTextEditable(el)) return undefined;
    const form = el.closest('form');
    const role = form?.getAttribute('role') || '';
    const label = `${elementLabel(el) || ''} ${role} ${form?.getAttribute('aria-label') || ''}`.toLowerCase();
    if (/search|tìm kiếm|tim kiem/.test(label)) return 'Enter';
    if (document.activeElement === el && 'value' in el && el.value && form) return 'Enter';
    return undefined;
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
    if (item.state && item.state.includes('occluded')) s -= 120;

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

    // Every emitted action gets a selector. selectorFor() has a guaranteed
    // full-DOM smart-path fallback, so absence here would mean a non-standard
    // DOM edge case that querySelectorAll cannot represent.
    if (!selector) continue;
    const occluded = !isTextEditable(el) && isProbablyOccluded(el);

    const region = regionIdFor(el);
    const group = summarizeGroup(findGroup(el), el);
    let state = elementState(el, kind);
    if (occluded) state = [...(state || []), 'occluded'];
    const value = usefulValue(el, kind);
    const sub = submitHintFor(el, kind);
    const fb = fallbackFor(el, kind, selector, sub);

    const key = `${kind}|${selector || ''}|${label || ''}|${region || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const item = { id: '', kind };
    if (label) item.label = label;
    if (value) item.value = value;
    item.selector = selector;
    if (sub) item.sub = sub;
    if (fb.length) item.fb = fb;
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
    for (const a of result.actions) {
      if (a.group && !a.group.label) delete a.group;
    }
  }

  if (byteLen(result) > cfg.maxBytes) {
    for (const a of result.actions) {
      if (a.group) delete a.group;
    }
  }

  // Hard byte budget: trim low-score tail until the serialized tree fits.
  // Selectors are never shortened or weakened to fit the budget.
  while (byteLen(result) > cfg.maxBytes && result.actions.length > 8) {
    result.actions.pop();
    result.stats.emittedActions = result.actions.length;
    const used = new Set(result.actions.map((a) => a.region).filter(Boolean));
    result.regions = result.regions.filter((r) => used.has(r.id));
    result.stats.emittedRegions = result.regions.length;
  }

  if (byteLen(result) > cfg.maxBytes) {
    delete result.page.title;
  }

  return result;
}

export default makeSemanticUiTree;
