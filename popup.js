// popup.js
(function () {
  'use strict';

  const views = {
    notOnboarded: document.getElementById('viewNotOnboarded'),
    notProduct:   document.getElementById('viewNotProduct'),
    loading:      document.getElementById('viewLoading'),
    match:        document.getElementById('viewMatch'),
    noMatch:      document.getElementById('viewNoMatch'),
  };

  function showView(name) {
    Object.values(views).forEach(v => v.classList.add('hidden'));
    views[name].classList.remove('hidden');
  }

  function isProductPage(url) {
    if (!url) return false;
    if (url.includes('aliexpress') && (url.includes('/item/') || url.includes('/i/') || /\/\d{10,}\.html/.test(url))) return true;
    if (url.includes('shein') && (/-p-\d+/.test(url) || url.includes('/product/') || url.includes('-cat-'))) return true;
    return false;
  }

  // ── PROFILE STATE ────────────────────────────────────────────────────────────
  let allProfiles   = [];
  let activeProfile = null;

  const GENDER_ICON = { man: '👨', woman: '👩', boy: '👦', girl: '👧' };

  function updateSelectAvatar() {
    const el = document.getElementById('selectAvatar');
    if (!el) return;
    if (activeProfile?.avatarImage) {
      el.innerHTML = `<img src="${activeProfile.avatarImage}" alt=""/>`;
    } else {
      el.textContent = GENDER_ICON[activeProfile?.gender] || '👤';
    }
  }

  function updateActiveNameBadge() {
    const el = document.getElementById('activeProfileName');
    if (!el) return;
    if (activeProfile?.name) {
      const icon = GENDER_ICON[activeProfile.gender] || '👤';
      el.textContent = `${icon} ${activeProfile.name}`;
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  }

  function renderProfileCard(profile) {
    if (!profile) return;
    const icon   = GENDER_ICON[profile.gender] || '👤';
    const cm     = profile.measurementsCm || {};
    const raw    = profile.measurementsRaw || {};
    const u      = profile.unit === 'inch' ? 'in' : 'cm';

    const iconEl = document.getElementById('profileCardIcon');
    if (profile.avatarImage) {
      iconEl.innerHTML = `<img src="${profile.avatarImage}" alt=""/>`;
    } else {
      iconEl.textContent = icon;
    }
    document.getElementById('profileCardName').textContent   = profile.name || 'Profile';
    document.getElementById('profileCardGender').textContent = profile.gender || '';
    const sizeEl = document.getElementById('profileCardSize');
    if (sizeEl) sizeEl.textContent = profile.usualSize ? `· ${profile.usualSize}` : '';

    const bust  = raw.bust  || cm.bust?.toFixed(0)  || '—';
    const waist = raw.waist || cm.waist?.toFixed(0) || '—';
    const hips  = raw.hips  || cm.hips?.toFixed(0)  || '—';
    const height = raw.height || cm.height?.toFixed(0) || '—';

    const shapeLabel = { rectangle: 'Rectangle', triangle: 'Pear', inverted_triangle: 'Broad shoulders' };
    document.getElementById('profileCardMeasurements').innerHTML = `
      <div class="meas-row"><span>Height</span><strong>${height} ${u}</strong></div>
      <div class="meas-row"><span>Bust</span><strong>${bust} ${u}</strong></div>
      <div class="meas-row"><span>Waist</span><strong>${waist} ${u}</strong></div>
      <div class="meas-row"><span>Hips</span><strong>${hips} ${u}</strong></div>
      ${profile.usualSize  ? `<div class="meas-row"><span>Usual size</span><strong>${profile.usualSize}</strong></div>` : ''}
      ${profile.bodyShape  ? `<div class="meas-row"><span>Body shape</span><strong>${shapeLabel[profile.bodyShape] || profile.bodyShape}</strong></div>` : ''}
      ${profile.age        ? `<div class="meas-row"><span>Age</span><strong>${profile.age}</strong></div>` : ''}
    `;
  }

  async function loadProfiles() {
    const resp  = await chrome.runtime.sendMessage({ type: 'GET_PROFILES' });
    allProfiles = resp.profiles || [];
    const activeId = resp.activeProfileId;

    const switcher = document.getElementById('profileSwitcher');
    if (allProfiles.length === 0) return;

    switcher.classList.remove('hidden');
    renderSelect(activeId);

    activeProfile = allProfiles.find(p => p.id === activeId) || allProfiles[0] || null;
    updateActiveNameBadge();
    updateSelectAvatar();
    return activeProfile;
  }

  function renderSelect(activeId) {
    const select = document.getElementById('profileSelect');
    select.innerHTML = allProfiles.map(p => {
      const icon     = GENDER_ICON[p.gender] || '👤';
      const selected = p.id === activeId ? 'selected' : '';
      return `<option value="${p.id}" ${selected}>${icon} ${escAttr(p.name || 'Profile')}</option>`;
    }).join('');
  }

  // ── ACTION HANDLERS (delegated — zero null risk) ─────────────────────────────
  document.body.addEventListener('click', async (e) => {
    const id = e.target.closest('button')?.id;
    if (!id) return;

    if (id === 'btnRenameProfile') {
      if (!activeProfile) return;
      const row   = document.getElementById('renameRow');
      const input = document.getElementById('renameInput');
      input.value = activeProfile.name || '';
      row.classList.remove('hidden');
      input.focus(); input.select();
    }

    if (id === 'btnRenameCancel') {
      document.getElementById('renameRow').classList.add('hidden');
    }

    if (id === 'btnRenameSave') {
      await saveRename();
    }

    if (id === 'btnEditFromCard') {
      openInlineEdit();
    }


    if (id === 'btnCancelEdit') {
      closeInlineEdit();
    }

    if (id === 'btnSaveEdit') {
      await saveInlineEdit();
    }

    if (id === 'btnDeleteProfile') {
      if (!activeProfile) return;
      if (allProfiles.length <= 1) { alert('Cannot delete the only profile.'); return; }
      if (!confirm(`Delete profile "${activeProfile.name}"?`)) return;
      const resp = await chrome.runtime.sendMessage({
        type: 'DELETE_PROFILE', data: { profileId: activeProfile.id },
      });
      if (resp?.success) {
        await loadProfiles();
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab && isProductPage(tab.url)) await doScan(tab, activeProfile);
      }
    }
  });

  document.body.addEventListener('keydown', (e) => {
    if (e.target.id === 'renameInput') {
      if (e.key === 'Enter') saveRename();
      if (e.key === 'Escape') document.getElementById('renameRow').classList.add('hidden');
    }
  });

  async function saveRename() {
    const newName = document.getElementById('renameInput').value.trim();
    if (!newName || !activeProfile) return;
    const updated = { ...activeProfile, name: newName };
    const resp = await chrome.runtime.sendMessage({ type: 'SAVE_PROFILE', data: updated });
    if (resp?.success) {
      activeProfile = resp.profile;
      const idx = allProfiles.findIndex(p => p.id === activeProfile.id);
      if (idx >= 0) allProfiles[idx] = activeProfile;
      renderSelect(activeProfile.id);
      updateActiveNameBadge();
      updateSelectAvatar();
      renderProfileCard(activeProfile);
      document.getElementById('renameRow').classList.add('hidden');
    }
  }

  // ── INLINE EDIT ──────────────────────────────────────────────────────────────
  const REGION_SIZES = {
    EU: ['XS','S','M','L','XL','2XL','3XL','4XL'],
    US: ['XS','S','M','L','XL','2XL','3XL'],
    UK: ['6','8','10','12','14','16','18','20'],
    CN: ['S','M','L','XL','2XL','3XL','4XL','5XL'],
  };

  function setEditRegion(region, preselectedSize) {
    document.querySelectorAll('.edit-region-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.region === region);
    });
    const sizeRow = document.getElementById('editSizeRow');
    if (!sizeRow) return;
    sizeRow.innerHTML = (REGION_SIZES[region] || REGION_SIZES.EU).map(s =>
      `<button class="edit-size-btn${preselectedSize === s ? ' selected' : ''}" data-size="${s}">${s}</button>`
    ).join('');
  }

  const FIELDS = ['height','bust','waist','hips'];
  const FIELD_IDS = { height:'editHeight', bust:'editBust', waist:'editWaist', hips:'editHips', weight:'editWeight', age:'editAge' };

  function openInlineEdit() {
    if (!activeProfile) return;
    const cm  = activeProfile.measurementsCm || {};
    const raw = activeProfile.measurementsRaw || {};
    const u   = activeProfile.unit === 'inch' ? 'in' : 'cm';

    FIELDS.forEach(f => {
      const val = raw[f] || cm[f]?.toFixed(0) || 0;
      document.getElementById(FIELD_IDS[f]).value = val;
    });
    document.getElementById('editUnit').textContent = u;

    // Pre-fill weight
    const isInch = activeProfile.unit === 'inch';
    const weightKgStored = activeProfile.weight || 0;
    const weightDisplay  = isInch ? Math.round(weightKgStored * 2.20462) : weightKgStored;
    const editWeightEl   = document.getElementById('editWeight');
    if (editWeightEl) editWeightEl.value = weightDisplay || '';
    const editWeightUnitEl = document.getElementById('editWeightUnit');
    if (editWeightUnitEl) editWeightUnitEl.textContent = isInch ? 'lbs' : 'kg';

    // Pre-select gender
    document.querySelectorAll('.edit-gender-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.gender === activeProfile.gender);
    });

    // Pre-select body shape
    document.querySelectorAll('.edit-shape-btn').forEach(b => {
      b.classList.toggle('selected', b.dataset.shape === (activeProfile.bodyShape || 'rectangle'));
    });

    // Pre-fill age
    const editAgeEl = document.getElementById('editAge');
    if (editAgeEl) editAgeEl.value = activeProfile.age || '';

    // Pre-select region + size (chips rebuild based on region)
    setEditRegion(activeProfile.sizeRegion || 'EU', activeProfile.usualSize || null);

    document.getElementById('inlineEditFields').classList.remove('hidden');
    document.getElementById('btnEditFromCard').classList.add('hidden');
    document.getElementById('btnSaveEdit').classList.remove('hidden');
    document.getElementById('btnCancelEdit').classList.remove('hidden');
  }

  function closeInlineEdit() {
    document.getElementById('inlineEditFields').classList.add('hidden');
    document.getElementById('btnEditFromCard').classList.remove('hidden');
    document.getElementById('btnSaveEdit').classList.add('hidden');
    document.getElementById('btnCancelEdit').classList.add('hidden');
  }

  async function saveInlineEdit() {
    if (!activeProfile) return;
    const u    = activeProfile.unit || 'cm';
    const raw  = {};
    FIELDS.forEach(f => { raw[f] = parseFloat(document.getElementById(FIELD_IDS[f]).value) || 0; });

    const cm = u === 'inch'
      ? { height: raw.height*2.54, bust: raw.bust*2.54, waist: raw.waist*2.54, hips: raw.hips*2.54 }
      : { ...raw };

    const selectedGender = document.querySelector('.edit-gender-btn.selected')?.dataset.gender  || activeProfile.gender;
    const selectedShape  = document.querySelector('.edit-shape-btn.selected')?.dataset.shape    || activeProfile.bodyShape || 'rectangle';
    const selectedRegion = document.querySelector('.edit-region-btn.selected')?.dataset.region  || activeProfile.sizeRegion || 'EU';
    const selectedSize   = document.querySelector('#editSizeRow .edit-size-btn.selected')?.dataset.size || activeProfile.usualSize || null;

    const rawWeightVal = parseFloat(document.getElementById('editWeight')?.value || 0);
    const weightKg     = (activeProfile.unit === 'inch')
      ? Math.round(rawWeightVal / 2.20462)
      : rawWeightVal;

    const ageVal = parseInt(document.getElementById('editAge')?.value || 0) || null;

    const updated = {
      ...activeProfile,
      gender:               selectedGender,
      bodyShape:            selectedShape,
      age:                  ageVal,
      sizeRegion:           selectedRegion,
      usualSize:            selectedSize,
      weight:               weightKg || activeProfile.weight || null,
      measurementsRaw:      raw,
      measurementsCm:       cm,
      measurementsUpdatedAt: Date.now(),
    };
    const resp = await chrome.runtime.sendMessage({ type: 'SAVE_PROFILE', data: updated });
    if (resp?.success) {
      activeProfile = resp.profile;
      const idx = allProfiles.findIndex(p => p.id === activeProfile.id);
      if (idx >= 0) allProfiles[idx] = activeProfile;
      renderProfileCard(activeProfile);
      updateActiveNameBadge();
      updateSelectAvatar();
      closeInlineEdit();
    }
  }

  // Gender selection inside inline edit
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.edit-gender-btn');
    if (!btn) return;
    document.querySelectorAll('.edit-gender-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });

  // Body shape selection
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.edit-shape-btn');
    if (!btn) return;
    document.querySelectorAll('.edit-shape-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  });

  // Region selection: rebuild size chips when region changes
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.edit-region-btn');
    if (!btn) return;
    setEditRegion(btn.dataset.region, null); // reset size when region changes
  });

  // Size selection inside inline edit
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.edit-size-btn');
    if (!btn) return;
    const wasSelected = btn.classList.contains('selected');
    document.querySelectorAll('.edit-size-btn').forEach(b => b.classList.remove('selected'));
    if (!wasSelected) btn.classList.add('selected'); // click again to deselect
  });

  // Spin buttons — up/down arrows
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.spin-btn');
    if (!btn) return;
    const field = btn.dataset.field;
    const dir   = parseInt(btn.dataset.dir);
    const input = document.getElementById(FIELD_IDS[field]);
    if (!input) return;
    input.value = Math.round((parseFloat(input.value) || 0) + dir);
  });

  // ── RENDER MATCH ─────────────────────────────────────────────────────────────
  function renderMatch(data, profile) {
    const badge   = document.getElementById('resultBadge');
    const sizeEl  = document.getElementById('resultSize');
    const labelEl = document.getElementById('resultLabel');
    const detEl   = document.getElementById('resultDetails');
    const sumEl   = document.getElementById('measurementsSummary');

    badge.className     = 'result-badge ' + (data.quality === 'perfect' ? 'perfect' : 'partial');
    sizeEl.textContent  = data.size;
    labelEl.textContent = data.quality === 'perfect' ? '✅ Perfect Match' : '🟡 Close Match';
    detEl.textContent   = data.quality === 'perfect'
      ? 'This size matches your measurements precisely.'
      : 'Closest available — recommended to size up.';

    if (profile?.measurementsCm) {
      const cm  = profile.measurementsCm;
      const raw = profile.measurementsRaw || {};
      const u   = profile.unit === 'inch' ? 'in' : 'cm';
      sumEl.innerHTML = `
        <strong>${profile.name || 'Profile'}:</strong> ${profile.gender} · ${profile.fitPreference}<br/>
        Bust: ${raw.bust || cm.bust?.toFixed(0)}${u} &nbsp;
        Waist: ${raw.waist || cm.waist?.toFixed(0)}${u} &nbsp;
        Hips: ${raw.hips || cm.hips?.toFixed(0)}${u}
      `;
    }
    showView('match');
  }

  async function doScan(tab, profile) {
    showView('loading');
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'TRIGGER_SCAN' });
      if (response?.found) {
        renderMatch(response, profile);
      } else {
        try {
          const dbg  = await chrome.tabs.sendMessage(tab.id, { type: 'GET_DEBUG_INFO' });
          const hint = document.getElementById('debugHint');
          if (hint && dbg) {
            hint.textContent = `Found ${dbg.tablesFound} table(s). ${
              dbg.tablesFound === 0
                ? 'Try opening the "Size Guide" link on the page first, then click Retry.'
                : 'Tables found but no size matched your measurements within threshold.'
            }`;
          }
        } catch { /* no debug info */ }
        showView('noMatch');
      }
    } catch {
      showView('noMatch');
    }
  }

  async function init() {
    await loadProfiles();

    if (!activeProfile?.onboardingCompleted) {
      const stored = await chrome.storage.local.get('userProfile');
      if (!stored.userProfile?.onboardingCompleted) {
        showView('notOnboarded');
        return;
      }
      activeProfile = stored.userProfile;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !isProductPage(tab.url)) {
      renderProfileCard(activeProfile);
      showView('notProduct');
      renderRecentVisits();
      return;
    }

    const key    = `matchResult_${tab.id}`;
    const cached = await chrome.storage.local.get(key);
    if (cached[key]) {
      if (cached[key].found) renderMatch(cached[key], activeProfile);
      else showView('noMatch');
      return;
    }

    await doScan(tab, activeProfile);
  }

  // ── OTHER BUTTONS ────────────────────────────────────────────────────────────
  document.getElementById('btnOpenOnboarding').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_ONBOARDING' });
    window.close();
  });

  document.getElementById('btnRetryScan').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await doScan(tab, activeProfile);
  });

  document.getElementById('btnOpenAdmin').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_ADMIN' });
    window.close();
  });

  document.getElementById('btnAddProfile').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'OPEN_ONBOARDING',
      url: chrome.runtime.getURL('onboarding.html') + '?mode=addProfile',
    });
    window.close();
  });

  document.getElementById('profileSelect').addEventListener('change', async (e) => {
    const profileId = e.target.value;
    const resp = await chrome.runtime.sendMessage({
      type: 'SET_ACTIVE_PROFILE',
      data: { profileId },
    });
    if (resp?.success) {
      activeProfile = resp.profile;
      updateActiveNameBadge();
      updateSelectAvatar();
      renderProfileCard(activeProfile);
      renderRecentVisits(); // refresh carousel for the newly active profile
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && isProductPage(tab.url)) await doScan(tab, activeProfile);
    }
  });

  // ── AVATAR UPLOAD ────────────────────────────────────────────────────────────
  document.getElementById('avatarEditBtn').addEventListener('click', () => {
    document.getElementById('avatarInput').click();
  });

  document.getElementById('avatarInput').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeProfile) return;

    // Resize to 200×200 via canvas to keep storage small
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width  = 200;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');

    // Cover-fit: scale so shorter side fills 200px, then centre-crop
    const scale = Math.max(200 / bitmap.width, 200 / bitmap.height);
    const sw    = 200 / scale;
    const sh    = 200 / scale;
    const sx    = (bitmap.width  - sw) / 2;
    const sy    = (bitmap.height - sh) / 2;
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, 200, 200);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.82);
    const updated = { ...activeProfile, avatarImage: dataUrl };
    const resp    = await chrome.runtime.sendMessage({ type: 'SAVE_PROFILE', data: updated });
    if (resp?.success) {
      activeProfile = resp.profile;
      const idx = allProfiles.findIndex(p => p.id === activeProfile.id);
      if (idx >= 0) allProfiles[idx] = activeProfile;
      renderProfileCard(activeProfile);
      updateSelectAvatar();
    }
    e.target.value = ''; // reset so same file can be re-selected
  });

  // ── RECENT VISITS CAROUSEL ───────────────────────────────────────────────────
  async function renderRecentVisits() {
    const section  = document.getElementById('recentSection');
    const carousel = document.getElementById('recentCarousel');
    const btnPrev  = document.getElementById('carouselPrev');
    const btnNext  = document.getElementById('carouselNext');
    if (!section || !carousel || !activeProfile) return;

    const data   = await chrome.storage.local.get('productVisits');
    const visits = (data.productVisits || [])
      .filter(v => v.profileId === activeProfile.id && v.url)
      .slice(-10)
      .reverse();

    if (!visits.length) { section.classList.add('hidden'); return; }

    const MATCH_COLOR = { perfect: '#4caf50', partial: '#ffc107', none: '#f44336', no_chart: '#ccc' };
    const SCROLL_STEP = 92;

    carousel.innerHTML = visits.map(v => {
      const dot   = `<span class="recent-dot" style="background:${MATCH_COLOR[v.match] || '#ccc'}"></span>`;
      // Prefer the stored data URL (fetched by background.js, no CDN issues)
      const imgSrc = v.imageData || v.image;
      const img    = imgSrc
        ? `<img class="recent-img" src="${escAttr(imgSrc)}" alt="" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'"/>
           <div class="recent-img-ph" style="display:none">${v.site === 'shein' ? 'SH' : 'AE'}</div>`
        : `<div class="recent-img-ph">${v.site === 'shein' ? 'SH' : 'AE'}</div>`;
      const price = v.price ? `<span class="recent-price">$${v.price}</span>` : '';
      const store = (v.storeName || v.site || '').slice(0, 18);
      return `<a class="recent-card" href="${escAttr(v.url)}" target="_blank" title="${escAttr(v.url)}">
        <div class="recent-img-wrap">${img}${dot}</div>
        <div class="recent-info">
          <span class="recent-store">${escAttr(store)}</span>
          ${price}
        </div>
      </a>`;
    }).join('');

    section.classList.remove('hidden');

    // ── Arrow navigation ──
    function updateArrows() {
      if (btnPrev) btnPrev.style.opacity = carousel.scrollLeft > 4 ? '1' : '0.3';
      if (btnNext) btnNext.style.opacity =
        carousel.scrollLeft < carousel.scrollWidth - carousel.clientWidth - 4 ? '1' : '0.3';
    }

    if (btnPrev) btnPrev.onclick = () => { carousel.scrollBy({ left: -SCROLL_STEP, behavior: 'smooth' }); };
    if (btnNext) btnNext.onclick = () => { carousel.scrollBy({ left:  SCROLL_STEP, behavior: 'smooth' }); };
    carousel.addEventListener('scroll', updateArrows, { passive: true });
    updateArrows();
  }

  // ── HELPERS ──────────────────────────────────────────────────────────────────
  function escAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  init();
})();
