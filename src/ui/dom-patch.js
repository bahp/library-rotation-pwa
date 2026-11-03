/**
 * @fileoverview Non-destructive DOM tree reconciler for `render()` updates.
 * Preserves mounted elements—especially already-decoded book cover `<img>` nodes—when opening or
 * closing slide-up sheets/drawers so cover art never reloads, re-decodes, or flashes.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;

/**
 * Extracts a stable reconciliation key for keyed elements (`id`, `data-book-card`, `data-backdrop-action`).
 * @param {Node | null | undefined} node
 * @returns {string | null}
 */
export function getDomNodeKey(node) {
  if (!node || node.nodeType !== ELEMENT_NODE) return null;
  const el = /** @type {Element} */ (node);
  const id = el.getAttribute('id');
  if (id) return `id:${id}`;
  const bookCard = el.getAttribute('data-book-card');
  if (bookCard) return `book:${bookCard}`;
  const backdrop = el.getAttribute('data-backdrop-action');
  if (backdrop) return `backdrop:${backdrop}`;
  return null;
}

/**
 * Checks whether `liveNode` can be updated in place to represent `nextNode` without remounting.
 * - Never reuses an `<img>` whose `src` changed (mounts fresh image cleanly).
 * - Never reuses a closing `.sheet-backdrop.is-closing` or a different dialog backdrop so animations stay crisp.
 * - Never reuses the cold-boot `[data-app-splash]` screen once `[data-app-shell]` mounts.
 *
 * @param {Node} liveNode
 * @param {Node} nextNode
 * @returns {boolean}
 */
export function canReuseDomNode(liveNode, nextNode) {
  if (liveNode.nodeType !== nextNode.nodeType) return false;

  if (liveNode.nodeType === TEXT_NODE || liveNode.nodeType === COMMENT_NODE) {
    return true;
  }

  if (liveNode.nodeType !== ELEMENT_NODE) return false;

  const liveEl = /** @type {Element} */ (liveNode);
  const nextEl = /** @type {Element} */ (nextNode);

  if (liveEl.tagName !== nextEl.tagName) return false;
  if ((liveEl.namespaceURI || '') !== (nextEl.namespaceURI || '')) return false;

  const liveKey = getDomNodeKey(liveEl);
  const nextKey = getDomNodeKey(nextEl);
  if (liveKey !== nextKey) return false;

  if (
    liveEl.hasAttribute('data-app-splash') !== nextEl.hasAttribute('data-app-splash') ||
    liveEl.hasAttribute('data-app-shell') !== nextEl.hasAttribute('data-app-shell')
  ) {
    return false;
  }

  if (liveEl.classList && liveEl.classList.contains('is-closing')) {
    return false;
  }

  if (liveEl.tagName.toUpperCase() === 'IMG') {
    return liveEl.getAttribute('src') === nextEl.getAttribute('src');
  }

  return true;
}

/**
 * Syncs HTML/SVG attributes from `nextEl` onto `liveEl` while skipping no-op writes
 * (critical on WebKit/Safari where re-setting identical `img[src]` can trigger repaint)
 * and preserving runtime `style` on unchanged `<img>` (`onerror` fallback hiding) and `[data-cover-tint]`.
 *
 * @param {Element} liveEl
 * @param {Element} nextEl
 */
function syncElementAttributes(liveEl, nextEl) {
  const tag = liveEl.tagName.toUpperCase();
  const isSameSrcImg =
    tag === 'IMG' && liveEl.getAttribute('src') === nextEl.getAttribute('src');
  const isStreamingVideo =
    tag === 'VIDEO' && Boolean(/** @type {HTMLVideoElement} */ (liveEl).srcObject);
  const preserveRuntimeStyle =
    !nextEl.hasAttribute('style') &&
    (isSameSrcImg || isStreamingVideo || liveEl.hasAttribute('data-cover-tint'));

  const liveAttrs = Array.from(liveEl.attributes);
  for (const attr of liveAttrs) {
    if (attr.name === 'style' && preserveRuntimeStyle) continue;
    if (
      isStreamingVideo &&
      (attr.name === 'muted' ||
        attr.name === 'playsinline' ||
        attr.name === 'webkit-playsinline' ||
        attr.name === 'autoplay')
    ) {
      continue;
    }
    if (!nextEl.hasAttribute(attr.name)) {
      liveEl.removeAttribute(attr.name);
    }
  }

  const nextAttrs = Array.from(nextEl.attributes);
  for (const attr of nextAttrs) {
    if (liveEl.getAttribute(attr.name) !== attr.value) {
      liveEl.setAttribute(attr.name, attr.value);
    }
  }
}

/**
 * Synchronizes live DOM properties (`.value`, `.checked`, `.selected`, `.disabled`) that diverge
 * from HTML attributes after user interaction.
 *
 * @param {Element} liveEl
 * @param {Element} nextEl
 */
function syncFormControlProperties(liveEl, nextEl) {
  const tag = liveEl.tagName.toUpperCase();
  if (tag === 'INPUT') {
    const liveInput = /** @type {HTMLInputElement} */ (liveEl);
    const nextInput = /** @type {HTMLInputElement} */ (nextEl);
    if (liveInput.checked !== nextInput.checked) {
      liveInput.checked = nextInput.checked;
    }
    if (liveInput.disabled !== nextInput.disabled) {
      liveInput.disabled = nextInput.disabled;
    }
    if (liveInput.type !== 'file' && liveInput.value !== nextInput.value) {
      liveInput.value = nextInput.value;
    }
  } else if (tag === 'TEXTAREA') {
    const liveArea = /** @type {HTMLTextAreaElement} */ (liveEl);
    const nextArea = /** @type {HTMLTextAreaElement} */ (nextEl);
    if (liveArea.disabled !== nextArea.disabled) {
      liveArea.disabled = nextArea.disabled;
    }
    if (liveArea.value !== nextArea.value) {
      liveArea.value = nextArea.value;
    }
  } else if (tag === 'OPTION') {
    const liveOpt = /** @type {HTMLOptionElement} */ (liveEl);
    const nextOpt = /** @type {HTMLOptionElement} */ (nextEl);
    if (liveOpt.selected !== nextOpt.selected) {
      liveOpt.selected = nextOpt.selected;
    }
  } else if (tag === 'SELECT') {
    const liveSel = /** @type {HTMLSelectElement} */ (liveEl);
    const nextSel = /** @type {HTMLSelectElement} */ (nextEl);
    if (liveSel.disabled !== nextSel.disabled) {
      liveSel.disabled = nextSel.disabled;
    }
    if (liveSel.value !== nextSel.value) {
      liveSel.value = nextSel.value;
    }
  } else if (tag === 'VIDEO') {
    hydrateSingleVideoProperties(liveEl);
  }
}

/**
 * Initializes runtime IDL properties (`muted`, `defaultMuted`, `playsInline`, `autoplay`)
 * on a `<video>` element so WebKit/iOS Safari and Chromium never block programmatic camera playback.
 *
 * @param {Element} el
 */
function hydrateSingleVideoProperties(el) {
  const video = /** @type {HTMLVideoElement} */ (el);
  if (el.hasAttribute('muted')) {
    video.defaultMuted = true;
    video.muted = true;
  }
  if (el.hasAttribute('playsinline') || el.hasAttribute('webkit-playsinline')) {
    video.playsInline = true;
  }
  if (el.hasAttribute('autoplay')) {
    video.autoplay = true;
  }
}

/**
 * Replaces `<video>` elements parsed inside an inert `<template>` document with brand-new
 * `ownerDoc.createElement('video')` elements created directly in the active browsing-context `Document`.
 *
 * Why this is critical: In WebKit (iOS Safari / macOS Safari / PWA standalone) and mobile Chromium,
 * an `HTMLVideoElement` constructed by `<template>.innerHTML` belongs to a browsing-context-less inert
 * document without a hardware `MediaPlayer` renderer—even after `document.adoptNode()`—causing
 * `getUserMedia` to record while painting a blank box. Creating `<video>` via `ownerDoc.createElement('video')`
 * guarantees a genuine active-document media player.
 *
 * @param {Node} node
 * @param {Document | null} ownerDoc
 * @returns {Node}
 */
function materializeLiveMediaElements(node, ownerDoc) {
  if (!node || node.nodeType !== ELEMENT_NODE) return node;
  const el = /** @type {Element} */ (node);

  /**
   * @param {Element} tplVideo
   * @returns {Element}
   */
  const createLiveVideo = (tplVideo) => {
    if (ownerDoc && typeof ownerDoc.createElement === 'function') {
      const fresh = ownerDoc.createElement('video');
      if (fresh && fresh.nodeType === ELEMENT_NODE && typeof fresh.setAttribute === 'function') {
        for (const attr of Array.from(tplVideo.attributes || [])) {
          fresh.setAttribute(attr.name, attr.value);
        }
        hydrateSingleVideoProperties(fresh);
        return fresh;
      }
    }
    hydrateSingleVideoProperties(tplVideo);
    return tplVideo;
  };

  if (el.tagName.toUpperCase() === 'VIDEO') {
    return createLiveVideo(el);
  }

  if (typeof el.querySelectorAll === 'function') {
    const nestedVideos = Array.from(el.querySelectorAll('video'));
    for (const tplVideo of nestedVideos) {
      const freshVideo = createLiveVideo(tplVideo);
      if (freshVideo !== tplVideo && tplVideo.parentNode) {
        if (typeof tplVideo.parentNode.replaceChild === 'function') {
          tplVideo.parentNode.replaceChild(freshVideo, tplVideo);
        } else {
          tplVideo.parentNode.insertBefore(freshVideo, tplVideo);
          tplVideo.parentNode.removeChild(tplVideo);
        }
      }
    }
  }

  return el;
}

/**
 * Updates `liveNode` in place so its attributes, properties, and descendants match `nextNode`.
 * @param {Node} liveNode
 * @param {Node} nextNode
 */
export function syncDomNode(liveNode, nextNode) {
  if (liveNode.nodeType === TEXT_NODE || liveNode.nodeType === COMMENT_NODE) {
    if (liveNode.nodeValue !== nextNode.nodeValue) {
      liveNode.nodeValue = nextNode.nodeValue;
    }
    return;
  }

  if (liveNode.nodeType !== ELEMENT_NODE) return;

  const liveEl = /** @type {Element} */ (liveNode);
  const nextEl = /** @type {Element} */ (nextNode);

  syncElementAttributes(liveEl, nextEl);
  reconcileDomChildren(liveEl, nextEl);
  syncFormControlProperties(liveEl, nextEl);
}

/**
 * Reconciles `liveParent.childNodes` against `nextParent.childNodes` using keyed lookup
 * (`id`, `data-book-card`, `data-backdrop-action`) plus positional reuse so unchanged subtrees
 * and book cover `<img>` nodes stay mounted without flashing.
 *
 * @param {Node} liveParent
 * @param {Node} nextParent
 */
export function reconcileDomChildren(liveParent, nextParent) {
  const ownerDoc = liveParent.ownerDocument;
  /** @type {Map<string, Element>} */
  const keyedLiveMap = new Map();
  for (const child of Array.from(liveParent.childNodes)) {
    const key = getDomNodeKey(child);
    if (key && child.nodeType === ELEMENT_NODE) {
      const el = /** @type {Element} */ (child);
      if (!el.classList || !el.classList.contains('is-closing')) {
        keyedLiveMap.set(key, el);
      }
    }
  }

  const nextChildren = Array.from(nextParent.childNodes);

  for (let i = 0; i < nextChildren.length; i += 1) {
    const nextChild = nextChildren[i];
    const currentAtIndex = liveParent.childNodes[i] || null;
    const nextKey = getDomNodeKey(nextChild);

    if (nextKey && keyedLiveMap.has(nextKey)) {
      const matchedLive = /** @type {Element} */ (keyedLiveMap.get(nextKey));
      keyedLiveMap.delete(nextKey);
      if (canReuseDomNode(matchedLive, nextChild)) {
        if (matchedLive !== currentAtIndex) {
          liveParent.insertBefore(matchedLive, currentAtIndex);
        }
        syncDomNode(matchedLive, nextChild);
        continue;
      }
    }

    if (currentAtIndex && !getDomNodeKey(currentAtIndex) && canReuseDomNode(currentAtIndex, nextChild)) {
      syncDomNode(currentAtIndex, nextChild);
      continue;
    }

    const adoptedChild =
      ownerDoc && typeof ownerDoc.adoptNode === 'function' && nextChild.ownerDocument !== ownerDoc
        ? ownerDoc.adoptNode(nextChild)
        : nextChild;
    const liveReadyChild = materializeLiveMediaElements(adoptedChild, ownerDoc);
    if (
      currentAtIndex &&
      !getDomNodeKey(currentAtIndex) &&
      liveParent.childNodes.length === nextChildren.length &&
      typeof liveParent.replaceChild === 'function'
    ) {
      liveParent.replaceChild(liveReadyChild, currentAtIndex);
    } else {
      liveParent.insertBefore(liveReadyChild, currentAtIndex);
    }
  }

  while (liveParent.childNodes.length > nextChildren.length) {
    const trailing = liveParent.lastChild;
    if (!trailing) break;
    liveParent.removeChild(trailing);
  }
}

/**
 * Parses `nextHtml` inside an inert `<template>` and reconciles `rootEl` in place.
 *
 * @param {HTMLElement} rootEl
 * @param {string} nextHtml
 */
export function patchRootHtml(rootEl, nextHtml) {
  const doc = rootEl.ownerDocument;
  if (!doc || typeof doc.createElement !== 'function') {
    rootEl.innerHTML = nextHtml;
    return;
  }
  const tpl = /** @type {HTMLTemplateElement} */ (doc.createElement('template'));
  tpl.innerHTML = nextHtml;
  reconcileDomChildren(rootEl, tpl.content);
}
