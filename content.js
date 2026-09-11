// content.js — SizeFitMe content script
(function () {
  'use strict';

  if (window.__sizeFitMeLoaded) return;
  window.__sizeFitMeLoaded = true;

  // ── CONSTANTS ─────────────────────────────────────────────────────────────
  const INCH_TO_CM = 2.54;
  const FIT_MARGINS = {
    tight:   { min: 0,   max: 0   },
    regular: { min: 1.5, max: 2.0 },
    loose:   { min: 4.0, max: 6.0 },
  };
  const PERFECT_THRESHOLD = 1.5;
  const PARTIAL_THRESHOLD = 2.5;

  // Header aliases — includes units in parens like "Bust(cm)", "Chest (in)"
  const HEADER_MAP = {
    bust:  ['bust', 'chest', 'breast', 'bustcm', 'chestin', 'bustchin', 'chest/bust', 'bust/chest'],
    waist: ['waist', 'waistcm', 'waistin', 'mid', 'waistsize'],
    hips:  ['hips', 'hip', 'hipcm', 'hipin', 'bottom', 'seat', 'hips/waist'],
    size:  ['size', 'us', 'uk', 'eu', 'label', 'sizelabel', 'sz', 'int', 'clothingsize', 'sizechart', ''],
  };

  let userProfile      = null;
  let highlightApplied = false;
  let feedbackInjected = false;
  let feedbackTimer    = null;
  let clickAttempted   = false;

  // ── DEBUG PANEL ───────────────────────────────────────────────────────────
  // A small floating panel showing live status — helps diagnose issues
  let debugPanel = null;

  function showDebug(msg, type = 'info') {
    console.log('[SizeFitMe]', msg);

    if (!debugPanel) {
      debugPanel = document.createElement('div');
      debugPanel.id = 'sfm-debug';
      debugPanel.style.cssText = `
        position:fixed; bottom:80px; right:20px; z-index:2147483647;
        background:#1a1a2e; color:#fff; font-family:monospace; font-size:11px;
        padding:10px 14px; border-radius:10px; max-width:320px; line-height:1.6;
        box-shadow:0 4px 20px rgba(0,0,0,.4); border-left:3px solid #00bcd4;
        opacity:0.92; max-height:200px; overflow-y:auto;
      `;
      document.body.appendChild(debugPanel);

      // Auto-hide after 12s
      setTimeout(() => debugPanel?.remove(), 12000);
    }

    const color = type === 'ok' ? '#4caf50' : type === 'warn' ? '#ffc107' : type === 'err' ? '#f44336' : '#00bcd4';
    const line  = document.createElement('div');
    line.style.color = color;
    line.textContent = `[SFM] ${msg}`;
    debugPanel.appendChild(line);
    debugPanel.scrollTop = debugPanel.scrollHeight;
  }

  // ── UTILITIES ──────────────────────────────────────────────────────────────
  function detectSite() {
    const h = window.location.hostname;
    if (h.includes('aliexpress')) return 'aliexpress';
    if (h.includes('shein'))      return 'shein';
    return null;
  }

  const SITE = detectSite();

  // ── STORE NAME ─────────────────────────────────────────────────────────────
  function scrapeStoreName() {
    // Helper: get clean text from an element, reject if it looks like code
    function cleanText(el) {
      if (!el) return null;
      if (['SCRIPT','STYLE','NOSCRIPT'].includes(el.tagName)) return null;
      const txt = el.textContent.trim();
      // Reject empty, too long (>80 chars), or code-like strings
      if (!txt || txt.length > 80 || /[{};=()]/.test(txt)) return null;
      return txt;
    }

    if (SITE === 'shein') {
      // Try specific class selectors first
      const specificSelectors = [
        '.about-store__name',
        '.store-intro__name',
        '[class*="aboutStore"] [class*="name"]',
        '[class*="about-store"] [class*="name"]',
        '[class*="storeInfo"] [class*="name"]',
        '[class*="store-info"] [class*="name"]',
        '[class*="shopInfo"] a',
        '[class*="shop-info"] a',
      ];
      for (const sel of specificSelectors) {
        const el = document.querySelector(sel);
        const txt = cleanText(el);
        if (txt) return txt;
      }

      // Fallback: find the "About store" label, then look for store name nearby
      const labels = document.querySelectorAll('h2, h3, h4, span, p');
      for (const label of labels) {
        if (label.tagName === 'SCRIPT' || label.tagName === 'STYLE') continue;
        const raw = label.textContent.trim();
        if (raw !== 'About store' && raw !== 'About Store') continue;

        // Walk up to a container, then find a link or heading inside
        const container = label.closest('section, div[class], article') || label.parentElement;
        if (!container) continue;

        // Try anchor or heading tags inside the container (skip the label itself)
        const candidates = container.querySelectorAll('a, h2, h3, strong');
        for (const c of candidates) {
          if (c === label) continue;
          const txt = cleanText(c);
          if (txt && txt !== 'About store' && txt !== 'About Store') return txt;
        }
      }
    }

    if (SITE === 'aliexpress') {
      const selectors = [
        '.store-detail--storeName--name',
        '.shop-name',
        '[class*="storeName"]',
        '[class*="shop-name"]',
        '[class*="StoreInfo"] a',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        const txt = cleanText(el);
        if (txt) return txt;
      }
    }

    return null;
  }

  // ── PRODUCT DATA SCRAPERS ───────────────────────────────────────────────────
  function scrapeProductId() {
    const url = window.location.href;
    if (SITE === 'shein') {
      const m = url.match(/-p-(\d+)/);
      if (m) return m[1];
    }
    if (SITE === 'aliexpress') {
      const m = url.match(/\/item\/(\d+)/) || url.match(/\/(\d{10,})\.html/);
      if (m) return m[1];
    }
    return null;
  }

  function scrapeStoreId() {
    if (SITE === 'shein') {
      const m = window.location.href.match(/\/store\/(\d+)/);
      if (m) return m[1];
      const link = document.querySelector('a[href*="/store/"]');
      if (link) { const lm = link.href.match(/\/store\/(\d+)/); if (lm) return lm[1]; }
    }
    if (SITE === 'aliexpress') {
      const m = window.location.href.match(/\/store\/(\d+)/);
      if (m) return m[1];
    }
    return null;
  }

  function scrapeCategory() {
    const selectors = [
      '[class*="breadcrumb"] a', '[class*="bread-crumb"] a',
      'nav[aria-label*="read"] a', '[class*="BreadCrumb"] a', '.breadcrumbs a',
    ];
    for (const sel of selectors) {
      const els = Array.from(document.querySelectorAll(sel));
      if (els.length >= 2) {
        const parts = els.slice(1).map(e => e.textContent.trim()).filter(Boolean);
        if (parts.length) return parts.join(' > ');
      }
    }
    return null;
  }

  function scrapePrice() {
    const selectors = [
      '[class*="ProductIntro__Head"] [class*="price"]', '[class*="original-price"]',
      '[class*="product-price"]', '[class*="productPrice"]', '[class*="sale-price"]',
      '.j-sku-price', '[itemprop="price"]', '[class*="Price__normal"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const m = el.textContent.replace(/,/g, '').match(/[\d.]+/);
      if (m) { const n = parseFloat(m[0]); if (!isNaN(n) && n > 0 && n < 10000) return n; }
    }
    return null;
  }

  function scrapeProductImage() {
    // Helper: get src from element, handles lazy-loading attributes
    function getSrc(el) {
      if (!el) return null;
      const src = el.src
        || el.dataset.src
        || el.dataset.original
        || el.dataset.lazy
        || el.getAttribute('data-lazyload')
        || el.getAttribute('data-img');
      return (src && src.startsWith('http')) ? src : null;
    }

    // Helper: return src only if the element is rendered large enough to be a product image
    function getLargeSrc(el, minPx = 100) {
      if (!el) return null;
      const src = getSrc(el);
      if (!src) return null;
      // Use naturalWidth/Height when available; fall back to layout size
      const w = el.naturalWidth  || el.offsetWidth  || el.width  || 0;
      const h = el.naturalHeight || el.offsetHeight || el.height || 0;
      return (w >= minPx || h >= minPx) ? src : null;
    }

    // 1. Site-specific DOM selectors — most precise, checked first
    if (SITE === 'shein') {
      const sels = [
        '.crop-image-container img',
        '.product-intro__main-img img',
        '[class*="productIntro__main"] img',
        '[class*="main-image"] img',
        '[class*="swiper-slide-active"] img',
        '[class*="swiper-slide"]:first-child img',
        '[class*="productIntro"] img',
        '.goods-img img',
      ];
      for (const s of sels) {
        const src = getLargeSrc(document.querySelector(s));
        if (src) return src;
      }
      // Last resort: any ltwebstatic image that is large enough (excludes tiny logos)
      for (const el of document.querySelectorAll('img[src*="ltwebstatic"]')) {
        const src = getLargeSrc(el, 150);
        if (src) return src;
      }
    }
    if (SITE === 'aliexpress') {
      const sels = [
        '.pdp-mod-common-image img',
        '[class*="slider--img"] img',
        '[class*="product-img"] img',
        '[class*="gallery"] img',
      ];
      for (const s of sels) {
        const src = getLargeSrc(document.querySelector(s));
        if (src) return src;
      }
      // Last resort: any alicdn image that is large enough
      for (const el of document.querySelectorAll('img[src*="alicdn"]')) {
        const src = getLargeSrc(el, 150);
        if (src) return src;
      }
    }

    // 2. JSON-LD Product schema
    for (const s of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const d = JSON.parse(s.textContent);
        const product = Array.isArray(d) ? d.find(x => x?.['@type'] === 'Product') : d;
        if (product?.image) {
          const raw = Array.isArray(product.image) ? product.image[0] : product.image;
          const url = typeof raw === 'string' ? raw : raw?.url;
          if (url?.startsWith('http')) return url;
        }
      } catch { /* malformed JSON */ }
    }

    // 3. og:image meta tag (may be a logo on some pages — last resort)
    const og = document.querySelector('meta[property="og:image"]');
    if (og?.content?.startsWith('http')) return og.content;
    return null;
  }

  // ── CART BUTTON LISTENER ────────────────────────────────────────────────────
  function attachCartListener() {
    const selectors = [
      '[class*="add-to-cart"]', '[class*="addToCart"]', '[class*="add_to_cart"]',
      '.product-intro__add-cart', '.j-add-cart-btn', '[class*="CartBtn"]',
      '[class*="cart-btn"]', '[class*="cartBtn"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && !el.dataset.sfmTracked) {
        el.dataset.sfmTracked = '1';
        el.addEventListener('click', () => {
          if (!lastMatchResult) return;
          chrome.runtime.sendMessage({ type: 'TRACK_INTERACTION', data: {
            action_type:     'Added_To_Cart',
            productId:       scrapeProductId(),
            storeId:         scrapeStoreId(),
            url:             location.href,
            site:            SITE,
            profileId:       userProfile?.id || null,
            recommendedSize: lastMatchResult.size,
            matchStatus:     lastMatchResult.quality,
            timestamp:       Date.now(),
          }});
        });
        return;
      }
    }
  }

  function isProductPage() {
    const url  = window.location.href;
    const host = window.location.hostname;
    if (host.includes('aliexpress')) {
      return url.includes('/item/') || url.includes('/i/') || /\/\d{10,}\.html/.test(url);
    }
    if (host.includes('shein')) {
      return /-p-\d+/.test(url) || url.includes('/product/') || url.includes('-cat-');
    }
    return false;
  }

  // Strip everything except letters — handles "Bust(cm)", "Waist (in)", "Chest/Bust"
  function normaliseHeader(text) {
    return text.toLowerCase().replace(/[^a-z]/g, '').trim();
  }

  function mapHeader(text) {
    const n = normaliseHeader(text);
    if (!n) return 'size'; // empty header → treat as size column
    for (const [canon, aliases] of Object.entries(HEADER_MAP)) {
      if (aliases.some(a => n === a || (a.length > 2 && n.startsWith(a)) || (a.length > 2 && n.includes(a)))) {
        return canon;
      }
    }
    return null;
  }

  function detectTableUnit(el) {
    const text = (el.textContent || '').toLowerCase();
    if (text.includes('inch') || /\bin\b/.test(text) || text.includes('″')) return 'inch';
    return 'cm';
  }

  function toNum(str) {
    // Handle ranges like "86-90" → take midpoint
    const range = String(str).match(/(\d+\.?\d*)\s*[-–]\s*(\d+\.?\d*)/);
    if (range) return (parseFloat(range[1]) + parseFloat(range[2])) / 2;
    const m = String(str).match(/[\d.]+/);
    return m ? parseFloat(m[0]) : NaN;
  }

  function getFitMargin(fitPref) {
    const m = FIT_MARGINS[fitPref] || FIT_MARGINS.regular;
    return (m.min + m.max) / 2;
  }

  // ── TABLE PARSING ──────────────────────────────────────────────────────────
  function parseSizeTable(tableEl) {
    const tableUnit = detectTableUnit(tableEl);
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    if (rows.length < 2) return [];

    // Find header row — scan first 5 rows
    let headerRow = null;
    let headerIdx = 0;

    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const cells  = rows[i].querySelectorAll('th, td');
      const mapped = Array.from(cells).map(c => mapHeader(c.textContent));
      if (mapped.includes('bust') || mapped.includes('waist') || mapped.includes('hips')) {
        headerRow = mapped;
        headerIdx = i;
        break;
      }
    }

    // ── POSITIONAL FALLBACK ──
    // If no bust/waist/hips keywords found, use column-position heuristic.
    // Common AliExpress chart order: Size | Bust | Waist | Hips | Length  (or with Length first)
    if (!headerRow) {
      headerRow = [];
      headerIdx = 0;
      const cells = rows[0].querySelectorAll('th, td');

      // Check if data rows have numbers in clothing range (55–200 cm)
      const hasNumbers = rows.length > 1 && Array.from(
        rows[1].querySelectorAll('td')
      ).some(c => { const n = toNum(c.textContent); return n >= 55 && n <= 220; });

      if (!hasNumbers) return [];

      // Assign positional labels
      cells.forEach((cell, i) => {
        const txt = normaliseHeader(cell.textContent);
        if (i === 0 || txt === 'size' || txt === 'us' || txt === 'uk' || txt === 'eu' || txt.length <= 3) {
          headerRow.push('size');
        } else {
          // Assign bust/waist/hips positionally (whichever isn't taken yet)
          const available = ['bust', 'waist', 'hips'];
          const taken = headerRow.filter(h => available.includes(h));
          headerRow.push(available[taken.length] || null);
        }
      });

      showDebug(`Positional header fallback: [${headerRow.join(', ')}]`, 'warn');
    }

    const sizeIdx  = headerRow.findIndex(h => h === 'size');
    const bustIdx  = headerRow.indexOf('bust');
    const waistIdx = headerRow.indexOf('waist');
    const hipsIdx  = headerRow.indexOf('hips');

    if (bustIdx === -1 && waistIdx === -1) return [];

    showDebug(`Headers: size@${sizeIdx} bust@${bustIdx} waist@${waistIdx} hips@${hipsIdx} unit:${tableUnit}`);

    const results = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll('td, th'));
      if (cells.length < 2) continue;

      const getVal = (idx) => {
        if (idx === -1 || idx >= cells.length) return NaN;
        const raw = toNum(cells[idx].textContent);
        if (isNaN(raw)) return NaN;
        // Sanity check: values must be in clothing measurement range
        if (raw < 30 || raw > 250) return NaN;
        return tableUnit === 'inch' ? raw * INCH_TO_CM : raw;
      };

      const sizeLabel = (sizeIdx >= 0 ? cells[sizeIdx] : cells[0])?.textContent.trim().replace(/\s+/g, ' ');
      if (!sizeLabel || sizeLabel.length > 10) continue;

      const bust  = getVal(bustIdx);
      const waist = getVal(waistIdx);
      const hips  = getVal(hipsIdx);
      if (isNaN(bust) && isNaN(waist)) continue; // need at least bust or waist

      results.push({ size: sizeLabel, bust, waist, hips, rowEl: rows[i] });
    }

    return results;
  }

  // ── FIND ALL CANDIDATE TABLES ─────────────────────────────────────────────
  // Strategy 1: explicit measurement keywords
  // Strategy 2: size-label tables (S/M/L with numbers)
  // Strategy 3: any table inside a known size-guide container
  function findSizeTables() {
    const allTables = Array.from(document.querySelectorAll('table'));
    showDebug(`Total <table> elements in DOM: ${allTables.length}`);

    // S1: measurement keywords
    const s1 = allTables.filter(t => {
      const txt = t.textContent.toLowerCase();
      return (txt.includes('bust') || txt.includes('chest') || txt.includes('waist') || txt.includes('hip'))
          && t.querySelectorAll('tr').length >= 2;
    });
    if (s1.length) { showDebug(`S1: ${s1.length} table(s) with measurement words`, 'ok'); return s1; }

    // S2: size labels + numbers
    const s2 = allTables.filter(t => {
      const txt = t.textContent;
      return /\b(XS|S\b|M\b|L\b|XL|XXL|2XL|3XL|4XL|\bSMALL\b|\bMEDIUM\b|\bLARGE\b)/i.test(txt)
          && /\b\d{2,3}\b/.test(txt)
          && t.querySelectorAll('tr').length >= 2;
    });
    if (s2.length) { showDebug(`S2: ${s2.length} table(s) with size labels`, 'ok'); return s2; }

    // S3: look inside known containers even if table isn't the top-level find
    const containers = document.querySelectorAll(
      '[class*="size-guide"], [class*="sizeGuide"], [class*="size-chart"], ' +
      '[class*="sizeChart"], [class*="size_guide"], [class*="measurement"], ' +
      '[class*="comet-modal"], [class*="ae-size"], [class*="j-size"]'
    );
    for (const c of containers) {
      const t = c.querySelector('table');
      if (t && t.querySelectorAll('tr').length >= 2) {
        showDebug('S3: found table inside size-guide container', 'ok');
        return [t];
      }
    }

    showDebug('No size tables found in DOM', 'warn');
    return [];
  }

  // ── AUTO-CLICK SIZE GUIDE ─────────────────────────────────────────────────
  function clickSizeGuideIfPresent() {
    const btnSelectors = [
      '[class*="size-guide"]', '[class*="sizeGuide"]', '[class*="size_guide"]',
      '[class*="size-chart"]', '[class*="sizeChart"]',
      '.j-size-guide-open', '[class*="size-tips"]',
      'a[href*="size"]', 'button[class*="size"]',
    ];

    for (const sel of btnSelectors) {
      try {
        for (const el of document.querySelectorAll(sel)) {
          const txt = el.textContent.toLowerCase().trim();
          if ((txt.includes('size') || txt.includes('guide') || txt.includes('chart') || txt.includes('measurement'))
              && txt.length < 50 && el.offsetParent !== null) {
            showDebug(`Auto-clicking: "${el.textContent.trim()}"`, 'warn');
            el.click();
            return true;
          }
        }
      } catch { /* ignore */ }
    }

    // Text-based fallback
    for (const el of document.querySelectorAll('a, button, [role="button"], span[class*="guide"]')) {
      const txt = el.textContent.toLowerCase().trim();
      if ((txt === 'size guide' || txt === 'size chart' || txt.includes('size guide') || txt.includes('measurement guide'))
          && txt.length < 40 && el.offsetParent !== null) {
        showDebug(`Auto-clicking (text): "${el.textContent.trim()}"`, 'warn');
        el.click();
        return true;
      }
    }

    showDebug('No size guide button found to auto-click', 'warn');
    return false;
  }

  // ── MATCHING ───────────────────────────────────────────────────────────────
  //
  // Handles two table types automatically:
  //
  // BODY MEASUREMENTS (table values ≈ user body size, e.g. L=92cm bust)
  //   → user fits if their body measurement ≤ table value + small tolerance
  //
  // PRODUCT MEASUREMENTS (table values = garment dimensions, larger than body)
  //   → user fits when garment gives correct ease:
  //     tight=2-5cm, regular=6-12cm, loose=12-20cm
  //
  function findBestMatch(sizeRows, profile) {
    const base    = profile.measurementsCm || {};
    const fitPref = profile.fitPreference || 'regular';

    // Detect table type: if avg bust column is >6cm above user bust → product measurements
    const bustVals = sizeRows.map(r => r.bust).filter(v => !isNaN(v));
    const avgTableBust = bustVals.length ? bustVals.reduce((a, b) => a + b) / bustVals.length : 0;
    const isProduct = avgTableBust > (base.bust || 90) + 6;

    showDebug(`Table type: ${isProduct ? 'PRODUCT measurements' : 'BODY measurements'} (avg bust=${avgTableBust.toFixed(0)}, user bust=${base.bust})`);

    // Ease ranges per fit preference (how much larger garment should be vs body)
    const EASE = {
      tight:   { min: 1,  max: 6  },
      regular: { min: 5,  max: 13 },
      loose:   { min: 12, max: 22 },
    };

    // Body-measurement thresholds: how far user can be from table value
    // Negative = user is smaller (loose fit) ✅  Positive = user is bigger (too tight) ❌
    const BODY_PERFECT = { under: 6, over: 1.5 }; // user can be 6cm under, 1.5cm over
    const BODY_PARTIAL = { under: 10, over: 3   };

    function scoreBust(row) {
      if (isNaN(row.bust) || !base.bust) return null;
      if (isProduct) {
        const ease = row.bust - base.bust;
        const e    = EASE[fitPref] || EASE.regular;
        if (ease >= e.min && ease <= e.max)            return 'perfect';
        if (ease >= e.min - 2 && ease <= e.max + 5)   return 'partial';
        return null;
      } else {
        const diff = base.bust - row.bust; // positive = user bigger than table max
        if (diff <= BODY_PERFECT.over && diff >= -BODY_PERFECT.under) return 'perfect';
        if (diff <= BODY_PARTIAL.over  && diff >= -BODY_PARTIAL.under) return 'partial';
        return null;
      }
    }

    function scoreWaist(row) {
      if (isNaN(row.waist) || !base.waist) return null;
      if (isProduct) {
        const ease = row.waist - base.waist;
        const e    = EASE[fitPref] || EASE.regular;
        if (ease >= e.min - 2 && ease <= e.max + 5)  return 'perfect';
        if (ease >= -2        && ease <= e.max + 10)  return 'partial';
        return null;
      } else {
        const diff = base.waist - row.waist;
        if (diff <= BODY_PERFECT.over && diff >= -BODY_PERFECT.under) return 'perfect';
        if (diff <= BODY_PARTIAL.over  && diff >= -BODY_PARTIAL.under) return 'partial';
        return null;
      }
    }

    function scoreHips(row) {
      if (isNaN(row.hips) || !base.hips) return null;
      if (isProduct) {
        const ease = row.hips - base.hips;
        const e    = EASE[fitPref] || EASE.regular;
        if (ease >= e.min - 2 && ease <= e.max + 5) return 'perfect';
        if (ease >= -2        && ease <= e.max + 10) return 'partial';
        return null;
      } else {
        const diff = base.hips - row.hips;
        if (diff <= BODY_PERFECT.over && diff >= -BODY_PERFECT.under) return 'perfect';
        if (diff <= BODY_PARTIAL.over  && diff >= -BODY_PARTIAL.under) return 'partial';
        return null;
      }
    }

    // Quality ranking
    const rank = { perfect: 2, partial: 1, null: 0 };
    const merge = (a, b) => {
      if (!a && !b) return null;
      const scores = [a, b].filter(Boolean);
      // If scores conflict (one perfect, one null/bad), take the worst
      if (scores.includes(null)) return null;
      return scores.every(s => s === 'perfect') ? 'perfect' : 'partial';
    };

    let best = null, bestQuality = null, bestScore = -1;

    for (const row of sizeRows) {
      const bScore = scoreBust(row);
      const wScore = scoreWaist(row);
      const hScore = scoreHips(row);

      const available = [bScore, wScore, hScore].filter(s => s !== undefined);
      const measured  = [
        isNaN(row.bust)  || !base.bust  ? null : bScore,
        isNaN(row.waist) || !base.waist ? null : wScore,
        isNaN(row.hips)  || !base.hips  ? null : hScore,
      ].filter(s => s !== null && s !== undefined);

      // Need at least one measurement scored
      if (!measured.length) continue;

      // If any required measurement fails → no match
      const fails = measured.filter(s => s === null);
      if (fails.length) continue;

      // Overall quality = worst scoring measurement
      const quality = measured.every(s => s === 'perfect') ? 'perfect' : 'partial';
      const score   = rank[quality];

      showDebug(`${row.size}: bust=${bScore} waist=${wScore} hips=${hScore} → ${quality}`);

      if (score > bestScore) { bestScore = score; best = row; bestQuality = quality; }
    }

    // Bias toward larger size on partial
    if (best && bestQuality === 'partial') {
      const idx  = sizeRows.indexOf(best);
      const next = sizeRows[idx + 1];
      if (next) {
        const nBust  = scoreBust(next);
        const nWaist = scoreWaist(next);
        const nHips  = scoreHips(next);
        const nMeas  = [
          isNaN(next.bust)  || !base.bust  ? null : nBust,
          isNaN(next.waist) || !base.waist ? null : nWaist,
          isNaN(next.hips)  || !base.hips  ? null : nHips,
        ].filter(s => s !== null && s !== undefined);
        if (nMeas.length && !nMeas.includes(null)) best = next;
      }
    }

    // ── USUAL SIZE INTEGRATION ──────────────────────────────────────────────
    const usualSize = profile.usualSize || null;
    const SIZE_ORDER = ['XS','S','M','L','XL','XXL','2XL','3XL','4XL','5XL'];

    function normSize(s) {
      return String(s).toUpperCase().replace(/\s/g,'').replace('XXLARGE','XXL')
        .replace('XLARGE','XL').replace('LARGE','L').replace('MEDIUM','M').replace('SMALL','S');
    }

    function sizeDistance(a, b) {
      const ia = SIZE_ORDER.indexOf(normSize(a));
      const ib = SIZE_ORDER.indexOf(normSize(b));
      if (ia === -1 || ib === -1) return 99;
      return Math.abs(ia - ib);
    }

    if (!best) {
      // Fallback: if no measurement match, use usual size as a partial suggestion
      if (usualSize) {
        const usualRow = sizeRows.find(r => normSize(r.size) === normSize(usualSize));
        if (usualRow) {
          showDebug(`No measurement match — falling back to usual size: ${usualSize}`, 'warn');
          return { found: true, size: usualRow.size, quality: 'partial',
                   rowEl: usualRow.rowEl, source: 'usual_size' };
        }
      }
      const largestBust  = Math.max(...sizeRows.map(r => r.bust).filter(v => !isNaN(v)), 0);
      const largestWaist = Math.max(...sizeRows.map(r => r.waist).filter(v => !isNaN(v)), 0);
      const largestHips  = Math.max(...sizeRows.map(r => r.hips).filter(v => !isNaN(v)), 0);
      const missGapCm = {
        bust:  base.bust  && largestBust  ? +Math.max(0, base.bust  - largestBust).toFixed(1)  : 0,
        waist: base.waist && largestWaist ? +Math.max(0, base.waist - largestWaist).toFixed(1) : 0,
        hips:  base.hips  && largestHips  ? +Math.max(0, base.hips  - largestHips).toFixed(1)  : 0,
      };
      showDebug('No size matched. Scanned: ' + sizeRows.map(r => `${r.size}(b=${r.bust})`).join(', '), 'warn');
      return { found: false, missGapCm };
    }

    // Boost quality when measurement match agrees with usual size
    if (usualSize && best) {
      const dist = sizeDistance(best.size, usualSize);
      if (dist === 0) {
        bestQuality = 'perfect'; // measurement + usual size agree → perfect confidence
        showDebug(`Usual size "${usualSize}" confirms measurement match → perfect`, 'ok');
      } else if (dist === 1 && bestQuality === 'partial') {
        showDebug(`Usual size "${usualSize}" is 1 step away from measured match "${best.size}"`, 'warn');
      } else if (dist >= 2) {
        showDebug(`⚠️ Usual size "${usualSize}" differs significantly from measurement match "${best.size}"`, 'warn');
      }
    }

    // v2: note when recommendation differs from user's usual size
    const usualSizeNote = (usualSize && normSize(best.size) !== normSize(usualSize))
      ? `In this style, size ${best.size} will fit you better than your usual ${usualSize}`
      : null;

    showDebug(`✅ Match: ${best.size} (${bestQuality})${usualSizeNote ? ' ← differs from usual size' : ''}`, 'ok');
    return { found: true, size: best.size, quality: bestQuality, rowEl: best.rowEl, usualSizeNote };
  }

  // ── OVERALL FIT SCRAPER ────────────────────────────────────────────────────
  // Reads the "Overall Fit: Small X% / True to Size Y% / Large Z%" widget
  // Works on both SHEIN and AliExpress (same widget pattern).
  // Returns { small, trueToSize, large, raw } as percentages (0–100), or null.
  function scrapeOverallFit() {
    // Walk every text node looking for "true to size" or "overall fit"
    const bodyText = document.body.innerText.toLowerCase();
    if (!bodyText.includes('true to size') && !bodyText.includes('overall fit')) return null;

    // Strategy A: look for a container that has all three labels + percentages
    const candidates = Array.from(document.querySelectorAll(
      '[class*="fit"], [class*="review"], [class*="rating"], [class*="size-feedback"]'
    ));

    for (const el of candidates) {
      const txt = el.innerText || el.textContent;
      if (!txt.toLowerCase().includes('true to size')) continue;

      // Extract percentages paired with labels
      const result = parseOverallFitText(txt);
      if (result) {
        showDebug(`Overall Fit scraped: small=${result.small}% true=${result.trueToSize}% large=${result.large}%`, 'ok');
        return result;
      }
    }

    // Strategy B: try full page text as fallback
    return parseOverallFitText(document.body.innerText);
  }

  function parseOverallFitText(txt) {
    if (!txt) return null;
    const lower = txt.toLowerCase();

    // Look for patterns like "Small\n5%", "True to Size\n94%", "Large\n1%"
    // or "Small 5% True to Size 94% Large 1%"
    const pct = (label) => {
      const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match label followed by optional whitespace/newline then a percentage
      const re = new RegExp(escaped + '[\\s\\S]{0,30}?(\\d{1,3})\\s*%', 'i');
      const m  = txt.match(re);
      return m ? parseInt(m[1], 10) : null;
    };

    const small      = pct('Small');
    const trueToSize = pct('True to Size') ?? pct('True To Size') ?? pct('true to size');
    const large      = pct('Large');

    if (small === null && trueToSize === null && large === null) return null;

    // Sanity: percentages should sum to ~100
    const sum = (small || 0) + (trueToSize || 0) + (large || 0);
    if (sum < 50 || sum > 150) return null;

    return {
      small:      small      ?? 0,
      trueToSize: trueToSize ?? 0,
      large:      large      ?? 0,
    };
  }

  // ── SMARTFIT v2 FUNCTIONS ──────────────────────────────────────────────────

  // v2: body-shape adjustment — add extra effective cm before matching
  // triangle = pear (wider hips); inverted_triangle = broader bust/shoulders
  function bodyShapeAdjustment(profile, categoryText) {
    const shape = profile.bodyShape;
    if (!shape || shape === 'rectangle') return { bust: 0, waist: 0, hips: 0 };
    const isPants = /pant|trouser|jean|bottom|skirt|short/i.test(categoryText || '');
    if (shape === 'triangle'          && isPants)  return { bust: 0, waist: 0, hips: +2 };
    if (shape === 'inverted_triangle' && !isPants) return { bust: +2, waist: 0, hips: 0 };
    return { bust: 0, waist: 0, hips: 0 };
  }

  // v2: age-based waist ease — bodies 50+ tend to carry more in the midsection
  function ageBiasAdjustment(profile) {
    const age = profile.age;
    if (!age) return { waistExtra: 0, note: null };
    if (age >= 55) return { waistExtra: 2, note: `Age ${age} — waist ease adjusted for mature fit` };
    if (age >= 45) return { waistExtra: 1, note: null };
    return { waistExtra: 0, note: null };
  }

  // v2: detect product gender from title + breadcrumbs
  function detectProductGender(categoryText) {
    const combined = (document.title + ' ' + (categoryText || '') + ' ' + (scrapeCategory() || '')).toLowerCase();
    if (/\bmen['s]?\b|\bboys?\b|\bmale\b/.test(combined))                     return 'male';
    if (/\bwomen['s]?\b|\bgirls?\b|\bfemale\b|\bladies\b/.test(combined))     return 'female';
    return null;
  }

  // BMI-based size adjustment: high BMI → size up, very low BMI → size down
  function weightBiasAdjustment(profile) {
    const weightKg = profile.weight;
    const heightCm = profile.measurementsCm?.height;
    if (!weightKg || !heightCm) return { steps: 0, reason: null };
    const bmi = weightKg / Math.pow(heightCm / 100, 2);
    if (bmi >= 30) return { steps: +1, reason: `BMI ${bmi.toFixed(1)} — going up one size` };
    if (bmi >= 27) return { steps: +1, reason: `BMI ${bmi.toFixed(1)} — slight upsize` };
    if (bmi < 17.5) return { steps: -1, reason: `BMI ${bmi.toFixed(1)} — lean, going smaller` };
    return { steps: 0, reason: null };
  }

  // Translate fit data into a size-order adjustment (-1 = go smaller, 0 = stay, +1 = go bigger)
  function fitBiasAdjustment(fitData) {
    if (!fitData) return { steps: 0, reason: null };

    const { small, trueToSize, large } = fitData;

    // Strong signal thresholds
    if (small >= 35)      return { steps: +1, reason: `Runs small (${small}% say too small) — going up one size` };
    if (large >= 35)      return { steps: -1, reason: `Runs large (${large}% say too large) — going down one size` };
    if (small >= 20)      return { steps: +1, reason: `Slightly small (${small}%) — going up one size to be safe` };
    if (large >= 20)      return { steps: -1, reason: `Slightly large (${large}%) — going down one size` };
    if (trueToSize >= 70) return { steps:  0, reason: `True to size (${trueToSize}%) — keeping measurement match` };

    return { steps: 0, reason: null };
  }

  // Apply bias: shift best row up/down in sizeRows array
  function applyFitBias(best, sizeRows, bias) {
    if (bias.steps === 0 || !best) return best;
    const idx    = sizeRows.indexOf(best);
    const newIdx = Math.max(0, Math.min(sizeRows.length - 1, idx + bias.steps));
    return sizeRows[newIdx];
  }

  // ── SIZE BUTTONS ───────────────────────────────────────────────────────────
  function findSizeButtons() {
    const selectors = SITE === 'aliexpress'
      ? ['[class*="sku-property-item"]', '[class*="sku-item"]', '[class*="size-item"]', '[class*="skuItem"]']
      : ['[class*="size-radio"]', '[class*="goods-size"] [class*="item"]', '[class*="size__item"]', '.product-intro__size-radio'];
    for (const sel of selectors) {
      const els = document.querySelectorAll(sel);
      if (els.length) return Array.from(els);
    }
    return [];
  }

  // ── GENDER MISMATCH BANNER ────────────────────────────────────────────────
  function injectGenderMismatchBanner(productGender) {
    document.getElementById('sfm-result-banner')?.remove();
    const banner = document.createElement('div');
    banner.id        = 'sfm-result-banner';
    banner.className = 'sfm-banner-gender-mismatch';
    const label = productGender === 'male' ? "men's" : "women's";
    banner.innerHTML = `
      <div class="sfm-banner-main">
        <span class="sfm-banner-logo">SizeFitMe</span>
        ⚠️ This is a <strong>${label}</strong> item — size recommendation skipped.
        <button class="sfm-banner-close" id="sfmBannerClose">✕</button>
      </div>
    `;
    const anchor = document.querySelector(
      '[class*="product-sku"], [class*="sku-property"], .product-intro__size, .goods-size'
    );
    if (anchor) anchor.insertAdjacentElement('beforebegin', banner);
    else        document.body.insertAdjacentElement('afterbegin', banner);
    document.getElementById('sfmBannerClose')?.addEventListener('click', () => banner.remove());
  }

  // ── UI INJECTION ───────────────────────────────────────────────────────────
  function highlightRow(rowEl, quality) {
    document.querySelectorAll('.sfm-row-highlight')
      .forEach(el => el.classList.remove('sfm-row-highlight', 'sfm-perfect', 'sfm-partial'));
    if (!rowEl) return;
    rowEl.classList.add('sfm-row-highlight', quality === 'perfect' ? 'sfm-perfect' : 'sfm-partial');
    rowEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function highlightSizeButton(targetSize, quality) {
    document.querySelectorAll('.sfm-btn-badge').forEach(el => el.remove());
    document.querySelectorAll('[class*="sfm-btn-glow"]')
      .forEach(el => el.classList.remove('sfm-btn-glow', 'sfm-btn-glow-perfect', 'sfm-btn-glow-partial'));
    const norm = s => s.toUpperCase().replace(/\s/g, '');
    for (const btn of findSizeButtons()) {
      if (norm(btn.textContent.trim()) === norm(targetSize)) {
        btn.classList.add('sfm-btn-glow', quality === 'perfect' ? 'sfm-btn-glow-perfect' : 'sfm-btn-glow-partial');
        const badge = document.createElement('span');
        badge.className = 'sfm-btn-badge ' + (quality === 'perfect' ? 'sfm-badge-perfect' : 'sfm-badge-partial');
        badge.textContent = '✓';
        btn.style.position = 'relative';
        btn.appendChild(badge);
        break;
      }
    }
  }

  function injectResultBanner(result) {
    document.getElementById('sfm-result-banner')?.remove();
    const banner = document.createElement('div');
    banner.id = 'sfm-result-banner';
    banner.className = result.quality === 'perfect' ? 'sfm-banner-perfect' : 'sfm-banner-partial';

    // Build fit-feedback pill if available
    let fitPill = '';
    if (result.fitData) {
      const { small, trueToSize, large } = result.fitData;
      const dominant = trueToSize >= 70 ? `✅ ${trueToSize}% True to size`
                     : small > large    ? `⬆️ ${small}% say runs small`
                     :                    `⬇️ ${large}% say runs large`;
      fitPill = `<span class="sfm-fit-pill">${dominant}</span>`;
    }

    const biasNote   = result.biasReason
      ? `<span class="sfm-bias-note">${result.biasReason}</span>` : '';
    // v2: usual-size note
    const usualNote = result.usualSizeNote
      ? `<span class="sfm-usual-note">ℹ️ ${result.usualSizeNote}</span>` : '';

    const statusIcon = result.quality === 'perfect' ? '✅' : '🟡';

    banner.innerHTML = `
      <div class="sfm-banner-main">
        <span class="sfm-banner-logo">SizeFitMe</span>
        ${statusIcon}
        Your size: <strong>${result.size}</strong>
        <span class="sfm-banner-sub">${result.quality === 'perfect' ? 'Perfect Match' : 'Close Match'}</span>
        <button class="sfm-banner-close" id="sfmBannerClose">✕</button>
      </div>
      ${fitPill || biasNote || usualNote ? `<div class="sfm-banner-extra">${fitPill}${biasNote}${usualNote}</div>` : ''}
    `;

    const anchor = document.querySelector(
      '[class*="product-sku"], [class*="sku-property"], .product-intro__size, .goods-size'
    );
    if (anchor) anchor.insertAdjacentElement('beforebegin', banner);
    else        document.body.insertAdjacentElement('afterbegin', banner);
    document.getElementById('sfmBannerClose')?.addEventListener('click', () => banner.remove());
  }

  function injectFeedbackWidget(size) {
    if (feedbackInjected) return;
    feedbackInjected = true;
    const w = document.createElement('div');
    w.id = 'sfm-feedback-widget';
    w.innerHTML = `
      <div class="sfm-feedback-header">
        <span class="sfm-logo-mini">SizeFitMe</span>
        <button class="sfm-close" id="sfmFbClose">✕</button>
      </div>
      <p>We recommended size <strong>${size}</strong>. Is this correct?</p>
      <div class="sfm-feedback-btns">
        <button class="sfm-fb-btn sfm-fb-yes" data-answer="accurate">👍 Yes, accurate</button>
        <button class="sfm-fb-btn sfm-fb-no"  data-answer="too_large">👎 Too large</button>
        <button class="sfm-fb-btn sfm-fb-no"  data-answer="too_small">👎 Too small</button>
      </div>
    `;
    document.body.appendChild(w);
    requestAnimationFrame(() => w.classList.add('sfm-visible'));
    const dismiss = () => { w.classList.remove('sfm-visible'); setTimeout(() => w.remove(), 300); };
    document.getElementById('sfmFbClose').addEventListener('click', dismiss);
    const fbActionMap = { accurate: 'Feedback_Accurate', too_large: 'Feedback_TooLarge', too_small: 'Feedback_TooSmall' };
    w.querySelectorAll('.sfm-fb-btn').forEach(b => b.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'SAVE_FEEDBACK', data: { recommendedSize: size, answer: b.dataset.answer } });
      chrome.runtime.sendMessage({ type: 'TRACK_INTERACTION', data: {
        action_type:     fbActionMap[b.dataset.answer] || b.dataset.answer,
        productId:       scrapeProductId(),
        storeId:         scrapeStoreId(),
        url:             location.href,
        site:            SITE,
        profileId:       userProfile?.id || null,
        recommendedSize: size,
        timestamp:       Date.now(),
      }});
      dismiss();
    }));
  }

  // ── IMAGE CACHE ───────────────────────────────────────────────────────────
  // Fetch the product image FROM THE PAGE CONTEXT (same origin as the CDN)
  // then send a data URL to background.js — this avoids CDN hotlink protection
  // that blocks loads from chrome-extension:// origin in the popup.
  function cacheVisitImage(imageUrl, pageUrl) {
    if (!imageUrl || !pageUrl) return;
    (async () => {
      try {
        const resp = await fetch(imageUrl);
        if (!resp.ok) return;
        const blob   = await resp.blob();
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror   = reject;
          reader.readAsDataURL(blob);
        });
        // Resize to thumbnail via a temporary <canvas>
        const img = new Image();
        img.src = dataUrl;
        await new Promise(r => { img.onload = r; img.onerror = r; });
        const maxPx  = 140;
        const scale  = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const canvas = document.createElement('canvas');
        canvas.width  = Math.max(1, Math.round(img.width  * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        const thumb = canvas.toDataURL('image/jpeg', 0.75);
        chrome.runtime.sendMessage({ type: 'UPDATE_VISIT_IMAGE', data: { url: pageUrl, imageData: thumb } });
      } catch { /* silent — popup will fall back to placeholder */ }
    })();
  }

  // ── CORE SCAN ──────────────────────────────────────────────────────────────
  function runScan() {
    if (!userProfile) return null;

    const tables = findSizeTables();

    // Build shared page data once (avoids duplicate DOM queries per table)
    const pageData = {
      url:       location.href,
      site:      SITE,
      productId: scrapeProductId(),
      storeId:   scrapeStoreId(),
      storeName: scrapeStoreName() || null,
      category:  scrapeCategory(),
      price:     scrapePrice(),
      image:     scrapeProductImage(),
      profileId: userProfile?.id || null,
      timestamp: Date.now(),
    };

    if (!tables.length) return null;

    // Scrape customer fit feedback (Overall Fit widget)
    const fitData    = scrapeOverallFit();
    const fitBias    = fitBiasAdjustment(fitData);
    const weightBias = weightBiasAdjustment(userProfile);
    if (fitBias.reason)    showDebug(`Fit bias: ${fitBias.reason}`, 'warn');
    if (weightBias.reason) showDebug(`Weight bias: ${weightBias.reason}`, 'warn');
    const bias = {
      steps:  Math.max(-2, Math.min(2, fitBias.steps + weightBias.steps)),
      reason: fitBias.reason || weightBias.reason,
    };

    // v2: build shape+age adjusted profile for matching
    const categoryText = pageData.category || '';
    const shapeAdj     = bodyShapeAdjustment(userProfile, categoryText);
    const ageAdj       = ageBiasAdjustment(userProfile);
    const totalWaist   = shapeAdj.waist + ageAdj.waistExtra;
    const profileForMatch = (shapeAdj.bust || totalWaist || shapeAdj.hips) ? {
      ...userProfile,
      measurementsCm: {
        height: userProfile.measurementsCm?.height || 0,
        bust:  (userProfile.measurementsCm?.bust  || 0) + shapeAdj.bust,
        waist: (userProfile.measurementsCm?.waist || 0) + totalWaist,
        hips:  (userProfile.measurementsCm?.hips  || 0) + shapeAdj.hips,
      },
    } : userProfile;
    if (shapeAdj.bust || shapeAdj.hips)
      showDebug(`v2 shape (${userProfile.bodyShape}): bust+${shapeAdj.bust} hips+${shapeAdj.hips}`, 'warn');
    if (ageAdj.waistExtra)
      showDebug(`v2 age (${userProfile.age}): waist+${ageAdj.waistExtra}`, 'warn');

    // v2: gender mismatch detection
    const productGender  = detectProductGender(categoryText);
    const userGenderNorm = (userProfile.gender === 'man' || userProfile.gender === 'boy') ? 'male' : 'female';
    const genderMismatch = (productGender && productGender !== userGenderNorm) ? productGender : null;
    if (genderMismatch) {
      showDebug(`⚠️ Gender mismatch: product=${productGender} user=${userGenderNorm} — aborting scan`, 'warn');
      injectGenderMismatchBanner(genderMismatch);
      chrome.runtime.sendMessage({ type: 'SET_MATCH_RESULT', data: { found: false } });
      return null;
    }

    let lastGapCm = null; // capture gap from no-match rows

    for (const table of tables) {
      const rows = parseSizeTable(table);
      showDebug(`Parsed ${rows.length} data rows from table`);
      if (!rows.length) continue;

      const result = findBestMatch(rows, profileForMatch);
      if (!result.found) {
        if (result.missGapCm) lastGapCm = result.missGapCm;
        continue;
      }

      // Apply fit bias: shift recommended size if customers say it runs small/large
      const biasedRow = applyFitBias(
        rows.find(r => r.size === result.size),
        rows,
        bias
      );
      if (biasedRow && biasedRow.size !== result.size) {
        showDebug(`Bias shifted: ${result.size} → ${biasedRow.size}`, 'warn');
        result.size    = biasedRow.size;
        result.rowEl   = biasedRow.rowEl;
        result.quality = 'partial';
      }

      // Attach fit data and v2 metadata to result for banner display
      result.fitData    = fitData;
      result.biasReason = bias.reason || ageAdj.note;

      highlightApplied = true;
      lastMatchResult  = result;
      highlightRow(result.rowEl, result.quality);
      highlightSizeButton(result.size, result.quality);
      injectResultBanner(result);
      attachCartListener();

      chrome.runtime.sendMessage({ type: 'SET_MATCH_RESULT',
        data: { found: true, size: result.size, quality: result.quality } });

      chrome.runtime.sendMessage({ type: 'TRACK_VISIT', data: {
        ...pageData,
        match:       result.quality,
        matchStatus: result.quality,
        size:        result.size,
      }});
      cacheVisitImage(pageData.image, pageData.url);

      if (!feedbackInjected) {
        clearTimeout(feedbackTimer);
        feedbackTimer = setTimeout(() => injectFeedbackWidget(result.size), 15000);
      }
      return result;
    }

    // Tables found but no size matched — track with gap data for B2B analytics
    chrome.runtime.sendMessage({ type: 'TRACK_VISIT', data: {
      ...pageData,
      match:       'none',
      matchStatus: 'none',
      missGapCm:   lastGapCm,
    }});
    cacheVisitImage(pageData.image, pageData.url);
    chrome.runtime.sendMessage({ type: 'SET_MATCH_RESULT', data: { found: false } });
    return null;
  }

  // ── MUTATION OBSERVER — size chart ────────────────────────────────────────
  let scanDebounce = null;
  const observer = new MutationObserver(() => {
    if (highlightApplied) return;
    clearTimeout(scanDebounce);
    scanDebounce = setTimeout(runScan, 600);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // ── FIT-DATA OBSERVER — waits for Overall Fit widget to load ──────────────
  // On SHEIN (and AliExpress) the reviews section is lazy-loaded.
  // This observer keeps running even after a size match is found,
  // and updates the banner once fit data becomes available.
  let fitDataApplied  = false;
  let fitObsDebounce  = null;
  let lastMatchResult = null; // store last result so we can update it

  const fitObserver = new MutationObserver(() => {
    if (fitDataApplied || !highlightApplied || !lastMatchResult) return;

    // Quick pre-check before doing real work
    if (!document.body.innerText.includes('True to Size') &&
        !document.body.innerText.includes('true to size')) return;

    clearTimeout(fitObsDebounce);
    fitObsDebounce = setTimeout(() => {
      const fitData = scrapeOverallFit();
      if (!fitData) return;

      fitDataApplied = true;
      showDebug(`Overall Fit loaded late — re-applying bias`, 'warn');

      const fitBias2    = fitBiasAdjustment(fitData);
      const weightBias2 = weightBiasAdjustment(userProfile);
      if (fitBias2.reason)    showDebug(`Fit bias: ${fitBias2.reason}`, 'warn');
      if (weightBias2.reason) showDebug(`Weight bias: ${weightBias2.reason}`, 'warn');
      const bias = {
        steps:  Math.max(-2, Math.min(2, fitBias2.steps + weightBias2.steps)),
        reason: fitBias2.reason || weightBias2.reason,
      };

      // Re-fetch the size rows from the current table to apply bias
      const tables = findSizeTables();
      if (!tables.length) {
        // No table visible (modal closed) — just update banner display only
        updateBannerFitDisplay(lastMatchResult.size, fitData, bias);
        return;
      }

      for (const table of tables) {
        const rows = parseSizeTable(table);
        if (!rows.length) continue;

        const originalRow = rows.find(r => r.size === lastMatchResult.size);
        if (!originalRow) continue;

        const biasedRow = applyFitBias(originalRow, rows, bias);
        const finalSize = biasedRow?.size || lastMatchResult.size;
        const quality   = biasedRow?.size !== lastMatchResult.size ? 'partial' : lastMatchResult.quality;

        if (biasedRow?.size !== lastMatchResult.size) {
          showDebug(`Fit bias shifted size: ${lastMatchResult.size} → ${finalSize}`, 'warn');
          highlightRow(biasedRow.rowEl, quality);
          highlightSizeButton(finalSize, quality);
        }

        lastMatchResult.size       = finalSize;
        lastMatchResult.quality    = quality;
        lastMatchResult.fitData    = fitData;
        lastMatchResult.biasReason = bias.reason;

        injectResultBanner(lastMatchResult);

        // Update popup's cached result
        chrome.runtime.sendMessage({ type: 'SET_MATCH_RESULT',
          data: { found: true, size: finalSize, quality } });
        return;
      }

      // Table not accessible — update banner display only
      updateBannerFitDisplay(lastMatchResult.size, fitData, bias);
    }, 800);
  });
  fitObserver.observe(document.body, { childList: true, subtree: true });

  // Updates only the fit-pill in an already-shown banner (no size change)
  function updateBannerFitDisplay(size, fitData, bias) {
    const banner = document.getElementById('sfm-result-banner');
    if (!banner) return;

    let extra = banner.querySelector('.sfm-banner-extra');
    if (!extra) {
      extra = document.createElement('div');
      extra.className = 'sfm-banner-extra';
      banner.appendChild(extra);
    }

    const { small, trueToSize, large } = fitData;
    const dominant = trueToSize >= 70 ? `✅ ${trueToSize}% True to size`
                   : small > large    ? `⬆️ ${small}% say runs small`
                   :                    `⬇️ ${large}% say runs large`;

    extra.innerHTML = `<span class="sfm-fit-pill">${dominant}</span>` +
      (bias.reason ? `<span class="sfm-bias-note">${bias.reason}</span>` : '');
  }

  // ── MESSAGE LISTENER ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TRIGGER_SCAN') {
      highlightApplied = false;
      feedbackInjected = false;
      fitDataApplied   = false;
      lastMatchResult  = null;
      clearTimeout(feedbackTimer);
      debugPanel?.remove();
      debugPanel = null;

      const r = runScan();
      if (r) { sendResponse({ found: true, size: r.size, quality: r.quality }); return; }

      if (!clickAttempted) {
        clickAttempted = true;
        const clicked = clickSizeGuideIfPresent();
        if (clicked) {
          setTimeout(() => {
            const r2 = runScan();
            sendResponse(r2 ? { found: true, size: r2.size, quality: r2.quality } : { found: false });
          }, 1800);
          return true;
        }
      }
      sendResponse({ found: false });
    }

    if (message.type === 'GET_DEBUG_INFO') {
      const tables = findSizeTables();
      sendResponse({
        site: SITE,
        isProductPage: isProductPage(),
        profileLoaded: !!userProfile,
        measurementsCm: userProfile?.measurementsCm,
        tablesFound: tables.length,
        tableText: tables[0] ? tables[0].textContent.slice(0, 200) : null,
      });
      return true;
    }
  });

  // ── INIT ───────────────────────────────────────────────────────────────────
  async function init() {
    const onProduct = isProductPage();
    showDebug(`Site: ${SITE || 'unknown'} | Product page: ${onProduct}`);

    if (!onProduct) return;

    const stored = await chrome.storage.local.get(['userProfile', 'activeProfileId', 'profiles']);
    // Prefer the actively selected profile
    const activeId = stored.activeProfileId;
    userProfile = (activeId && stored.profiles?.find(p => p.id === activeId)) || stored.userProfile;

    if (!userProfile?.onboardingCompleted) {
      showDebug('Onboarding not completed', 'err');
      return;
    }

    const cm = userProfile.measurementsCm;
    showDebug(`Profile: bust=${cm?.bust} waist=${cm?.waist} hips=${cm?.hips} fit=${userProfile.fitPreference}`, 'ok');

    // First scan after page settles
    setTimeout(() => { if (!highlightApplied) runScan(); }, 2500);

    // Second attempt: auto-click size guide
    setTimeout(() => {
      if (!highlightApplied && !clickAttempted) {
        clickAttempted = true;
        clickSizeGuideIfPresent();
        setTimeout(runScan, 1800);
      }
    }, 5000);
  }

  init();
})();
