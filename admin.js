// admin.js — SizeFitMe Admin Dashboard

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'admin';

let allVisits       = [];
let allProfiles     = [];
let allInteractions = [];

// ── LOGIN ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnLogin').addEventListener('click', doLogin);
  document.getElementById('loginPass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('loginUser').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('loginPass').focus();
  });
});

function doLogin() {
  const user = document.getElementById('loginUser').value.trim();
  const pass = document.getElementById('loginPass').value;
  const err  = document.getElementById('loginError');

  if (user === ADMIN_USER && pass === ADMIN_PASS) {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('dashboard').classList.remove('hidden');
    loadAll();
  } else {
    err.classList.remove('hidden');
    document.getElementById('loginPass').value = '';
    document.getElementById('loginPass').focus();
  }
}

// ── LOGOUT ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btnLogout')?.addEventListener('click', () => {
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('loginUser').value = '';
    document.getElementById('loginPass').value = '';
    document.getElementById('loginError').classList.add('hidden');
  });
});

// ── LOAD DATA ─────────────────────────────────────────────────────────────────
async function loadAll() {
  const data = await chrome.storage.local.get(['profiles', 'productVisits', 'interactions']);
  allProfiles     = data.profiles      || [];
  allVisits       = data.productVisits || [];
  allInteractions = data.interactions  || [];

  renderStats();
  renderProfiles();
  renderVisits();
  renderInteractions();

  document.getElementById('btnExport').addEventListener('click', exportJSON);
  document.getElementById('filterVisits').addEventListener('input', renderVisits);
  document.getElementById('chkMatchOnly').addEventListener('change', renderVisits);
}

// ── STATS ─────────────────────────────────────────────────────────────────────
function renderStats() {
  const total    = allProfiles.length;
  const men      = allProfiles.filter(p => p.gender === 'man').length;
  const women    = allProfiles.filter(p => p.gender === 'woman').length;
  const children = allProfiles.filter(p => p.gender === 'boy' || p.gender === 'girl').length;
  const visits   = allVisits.length;
  const matched  = allVisits.filter(v => v.match && v.match !== 'none').length;
  const matchRate = visits > 0 ? Math.round((matched / visits) * 100) + '%' : '—';

  document.getElementById('statProfiles').textContent  = total    || '0';
  document.getElementById('statMen').textContent       = men      || '0';
  document.getElementById('statWomen').textContent     = women    || '0';
  document.getElementById('statChildren').textContent  = children || '0';
  document.getElementById('statVisits').textContent    = visits   || '0';
  document.getElementById('statMatchRate').textContent = matchRate;
}

// ── PROFILES TABLE ────────────────────────────────────────────────────────────
function renderProfiles() {
  const tbody = document.getElementById('profilesBody');

  if (allProfiles.length === 0) {
    tbody.innerHTML = '<tr><td class="table-empty" colspan="11">No profiles yet.</td></tr>';
    return;
  }

  const rows = [];

  allProfiles.forEach(p => {
    const genderBadge = {
      man:   '<span class="badge badge-male">Man</span>',
      woman: '<span class="badge badge-female">Woman</span>',
      boy:   '<span class="badge badge-boy">Boy</span>',
      girl:  '<span class="badge badge-girl">Girl</span>',
    }[p.gender] || p.gender || '—';

    const created    = p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—';
    const visits     = allVisits.filter(v => v.profileId === p.id);
    const visitCount = visits.length;
    const safeId     = esc(p.id);

    const expandBtn = `<button class="expand-btn" data-profileid="${safeId}" aria-expanded="false" title="Show details">
        <span class="expand-icon">＋</span>
      </button>`;

    const visitCountCell = visitCount > 0
      ? `<span class="visit-count-badge">${visitCount}</span>`
      : `<span class="visit-count-zero">0</span>`;

    const statusBadge = p.deleted
      ? `<span class="badge badge-inactive">Inactive</span>`
      : `<span class="badge badge-active">Active</span>`;

    // Main profile row
    rows.push(`<tr class="profile-row">
      <td>
        <div class="name-cell">
          ${expandBtn}
          <span class="profile-name-text">${esc(p.name || '—')}</span>
        </div>
      </td>
      <td>${visitCountCell}</td>
      <td>${genderBadge}</td>
      <td>${esc(p.email || '—')}</td>
      <td>${p.measurementsCm?.bust  || p.bust  || '—'}</td>
      <td>${p.measurementsCm?.waist || p.waist || '—'}</td>
      <td>${p.measurementsCm?.hips  || p.hips  || '—'}</td>
      <td>${esc(p.fitPreference || '—')}</td>
      <td>${esc(p.usualSize    || '—')}</td>
      <td>${created}</td>
      <td>${statusBadge}</td>
    </tr>`);

    // Expandable row — always present (shows last-updated + visits if any)
    {
      const visitRows = visits.slice().reverse().map(v => {
        const date = v.timestamp ? new Date(v.timestamp).toLocaleString() : '—';
        const matchBadge = {
          perfect:  '<span class="badge badge-perfect">Perfect</span>',
          partial:  '<span class="badge badge-partial">Partial</span>',
          none:     '<span class="badge badge-nomatch">None</span>',
          no_chart: '<span class="badge badge-inactive">No Chart</span>',
        }[v.match] || '—';
        const shortUrl = (v.url || '').replace(/^https?:\/\/(www\.)?/, '').substring(0, 50);
        const urlCell  = v.url
          ? `<a class="url-link" href="${esc(v.url)}" target="_blank" title="${esc(v.url)}">${esc(shortUrl)}</a>`
          : '—';
        const gap = v.missGapCm;
        const gapCell = gap && (gap.bust > 0 || gap.waist > 0 || gap.hips > 0)
          ? `<span class="gap-badge">B+${gap.bust} W+${gap.waist}</span>` : '—';
        return `<tr class="visit-sub-row">
          <td>${date}</td>
          <td>${esc(v.site || '—')}</td>
          <td>${esc(v.storeName || '—')}</td>
          <td>${esc(v.category || '—')}</td>
          <td>${v.price ? '$' + v.price : '—'}</td>
          <td>${urlCell}</td>
          <td>${matchBadge}</td>
          <td>${esc(v.size || '—')}</td>
          <td>${gapCell}</td>
        </tr>`;
      }).join('');

      const lastUpdated = p.measurementsUpdatedAt
        ? `<div class="meas-updated">📅 Last measurements update: <strong>${new Date(p.measurementsUpdatedAt).toLocaleString()}</strong></div>`
        : `<div class="meas-updated meas-updated-never">📅 Measurements never updated since registration</div>`;

      const visitsContent = visitCount > 0
        ? `<table class="visits-sub-table">
            <thead><tr>
              <th>Date</th><th>Site</th><th>Store</th><th>Category</th>
              <th>Price</th><th>Product URL</th><th>Match</th><th>Size</th><th>Gap</th>
            </tr></thead>
            <tbody>${visitRows}</tbody>
           </table>`
        : `<p class="no-visits-msg">No product visits recorded yet.</p>`;

      // ── Personalization block ──
      const cm  = p.measurementsCm  || {};
      const raw = p.measurementsRaw || {};
      const u   = p.unit === 'inch' ? 'in' : 'cm';
      const height   = raw.height || cm.height?.toFixed(0)  || '—';
      const bust     = raw.bust   || cm.bust?.toFixed(0)    || '—';
      const waist    = raw.waist  || cm.waist?.toFixed(0)   || '—';
      const hips     = raw.hips   || cm.hips?.toFixed(0)    || '—';

      const fitLabel = { tight: '🤏 Tight', regular: '👕 Regular', loose: '🎽 Loose' }[p.fitPreference] || (p.fitPreference || '—');
      const unitLabel = p.unit === 'inch' ? 'Inch' : 'Cm';

      const personalization = `
        <div class="person-block">
          <p class="person-block-title">PERSONALIZATION</p>
          <div class="person-grid">
            <div class="person-item"><span>Height</span><strong>${height} ${u}</strong></div>
            <div class="person-item"><span>Bust</span><strong>${bust} ${u}</strong></div>
            <div class="person-item"><span>Waist</span><strong>${waist} ${u}</strong></div>
            <div class="person-item"><span>Hips</span><strong>${hips} ${u}</strong></div>
            <div class="person-item"><span>Fit Preference</span><strong>${fitLabel}</strong></div>
            <div class="person-item"><span>Usual Size</span><strong>${esc(p.usualSize || '—')}</strong></div>
            <div class="person-item"><span>Unit</span><strong>${unitLabel}</strong></div>
            <div class="person-item"><span>Email</span><strong>${esc(p.email || '—')}</strong></div>
          </div>
        </div>`;

      // ── Shopping Insights block ──────────────────────────────────────────────
      // Price range
      const pricedVisits = visits.filter(v => v.price && v.price > 0);
      let priceCard = '';
      if (pricedVisits.length > 0) {
        const prices   = pricedVisits.map(v => v.price);
        const minPrice = Math.min(...prices).toFixed(2);
        const maxPrice = Math.max(...prices).toFixed(2);
        const avgPrice = (prices.reduce((a, b) => a + b, 0) / prices.length).toFixed(2);
        priceCard = `
          <div class="insight-card">
            <div class="insight-card-label">💰 Price Range</div>
            <div class="insight-card-main">$${minPrice} – $${maxPrice}</div>
            <div class="insight-card-sub">avg $${avgPrice} · ${pricedVisits.length} product${pricedVisits.length !== 1 ? 's' : ''}</div>
          </div>`;
      }

      // Top categories
      const catCounts = {};
      visits.forEach(v => {
        if (v.category) {
          const cat = v.category.split('>')[0].trim();
          if (cat) catCounts[cat] = (catCounts[cat] || 0) + 1;
        }
      });
      const topCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
      let catCard = '';
      if (topCats.length > 0) {
        const maxCnt  = topCats[0][1];
        const catBars = topCats.map(([cat, cnt]) => {
          const pct = Math.round((cnt / maxCnt) * 100);
          return `<div class="insight-bar-row">
            <span class="insight-bar-label" title="${esc(cat)}">${esc(cat.length > 22 ? cat.slice(0, 22) + '…' : cat)}</span>
            <div class="insight-bar-track"><div class="insight-bar-fill" style="width:${pct}%"></div></div>
            <span class="insight-bar-count">${cnt}</span>
          </div>`;
        }).join('');
        catCard = `
          <div class="insight-card insight-card-wide">
            <div class="insight-card-label">🏷️ Top Categories</div>
            <div class="insight-bars">${catBars}</div>
          </div>`;
      }

      // Sites & match breakdown
      const siteCounts = {};
      const matchCounts = { perfect: 0, partial: 0, none: 0, no_chart: 0 };
      visits.forEach(v => {
        if (v.site) siteCounts[v.site] = (siteCounts[v.site] || 0) + 1;
        if (v.matchStatus && matchCounts[v.matchStatus] !== undefined) matchCounts[v.matchStatus]++;
      });
      let activityCard = '';
      if (visitCount > 0) {
        const siteChips = Object.entries(siteCounts).sort((a, b) => b[1] - a[1])
          .map(([s, n]) => `<span class="insight-chip">${esc(s)} <strong>${n}</strong></span>`).join('');
        const matchRate = visitCount > 0
          ? Math.round(((matchCounts.perfect + matchCounts.partial) / visitCount) * 100) : 0;
        activityCard = `
          <div class="insight-card">
            <div class="insight-card-label">📊 Activity</div>
            <div class="insight-chips">${siteChips}</div>
            <div class="insight-match-row">
              <span class="insight-chip insight-chip-green">✅ ${matchCounts.perfect} perfect</span>
              <span class="insight-chip insight-chip-yellow">🟡 ${matchCounts.partial} partial</span>
              <span class="insight-chip insight-chip-red">❌ ${matchCounts.none} no match</span>
            </div>
            <div class="insight-card-sub">Match rate: <strong>${matchRate}%</strong></div>
          </div>`;
      }

      const insightsBlock = (priceCard || catCard || activityCard) ? `
        <div class="insights-block">
          <p class="insights-block-title">SHOPPING INSIGHTS</p>
          <div class="insights-row">
            ${priceCard}
            ${activityCard}
            ${catCard}
          </div>
        </div>` : '';

      rows.push(`<tr class="visits-expand-row hidden" data-profileid="${safeId}">
        <td colspan="11" class="visits-expand-cell">
          <div class="visits-inner">
            ${lastUpdated}
            ${personalization}
            ${insightsBlock}
            <p style="font-size:12px;font-weight:700;color:#00838f;margin:12px 0 8px;text-transform:uppercase;letter-spacing:0.5px;">Product Visits</p>
            ${visitsContent}
          </div>
        </td>
      </tr>`);
    }
  });

  tbody.innerHTML = rows.join('');

  // Toggle expand/collapse
  tbody.querySelectorAll('.expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profileId  = btn.dataset.profileid;
      const expandRow  = tbody.querySelector(`.visits-expand-row[data-profileid="${profileId}"]`);
      const icon       = btn.querySelector('.expand-icon');
      const isOpen     = !expandRow.classList.contains('hidden');

      if (isOpen) {
        expandRow.classList.add('hidden');
        icon.textContent = '＋';
        btn.setAttribute('aria-expanded', 'false');
      } else {
        expandRow.classList.remove('hidden');
        icon.textContent = '－';
        btn.setAttribute('aria-expanded', 'true');
      }
    });
  });
}

// ── VISITS TABLE ──────────────────────────────────────────────────────────────
function renderVisits() {
  const query     = document.getElementById('filterVisits').value.toLowerCase();
  const matchOnly = document.getElementById('chkMatchOnly').checked;
  const tbody     = document.getElementById('visitsBody');

  let filtered = allVisits.slice().reverse(); // newest first

  if (query) {
    filtered = filtered.filter(v => {
      const profileName = (allProfiles.find(p => p.id === v.profileId)?.name || '').toLowerCase();
      return (v.url       || '').toLowerCase().includes(query) ||
             (v.site      || '').toLowerCase().includes(query) ||
             (v.storeName || '').toLowerCase().includes(query) ||
             profileName.includes(query);
    });
  }
  if (matchOnly) {
    filtered = filtered.filter(v => v.match && v.match !== 'none');
  }

  document.getElementById('visitsCount').textContent =
    `Showing ${filtered.length} of ${allVisits.length} visits`;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td class="table-empty" colspan="10">No visits recorded.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(v => {
    const date = v.timestamp ? new Date(v.timestamp).toLocaleString() : '—';

    const matchBadge = {
      perfect:  '<span class="badge badge-perfect">Perfect</span>',
      partial:  '<span class="badge badge-partial">Partial</span>',
      none:     '<span class="badge badge-nomatch">None</span>',
      no_chart: '<span class="badge badge-inactive">No Chart</span>',
    }[v.match] || '—';

    const shortUrl = (v.url || '').replace(/^https?:\/\/(www\.)?/, '').substring(0, 45);
    const urlCell  = v.url
      ? `<a class="url-link" href="${esc(v.url)}" target="_blank" title="${esc(v.url)}">${esc(shortUrl)}…</a>`
      : '—';

    const profileName = v.profileId
      ? esc(allProfiles.find(p => p.id === v.profileId)?.name || v.profileId)
      : '—';

    const gap = v.missGapCm;
    const gapCell = gap && (gap.bust > 0 || gap.waist > 0 || gap.hips > 0)
      ? `<span class="gap-badge" title="Bust:+${gap.bust} Waist:+${gap.waist} Hips:+${gap.hips}">B+${gap.bust} W+${gap.waist} H+${gap.hips}</span>`
      : '—';

    const price = v.price ? `$${v.price}` : '—';

    return `<tr>
      <td>${date}</td>
      <td>${esc(v.site      || '—')}</td>
      <td>${esc(v.storeName || '—')}</td>
      <td>${esc(v.category  || '—')}</td>
      <td>${price}</td>
      <td>${urlCell}</td>
      <td>${matchBadge}</td>
      <td>${esc(v.size || '—')}</td>
      <td>${gapCell}</td>
      <td>${profileName}</td>
    </tr>`;
  }).join('');
}

// ── INTERACTIONS TABLE ─────────────────────────────────────────────────────────
function renderInteractions() {
  const tbody = document.getElementById('interactionsBody');
  const count = document.getElementById('interactionsCount');

  if (allInteractions.length === 0) {
    tbody.innerHTML = '<tr><td class="table-empty" colspan="8">No interactions recorded yet.</td></tr>';
    if (count) count.textContent = '';
    return;
  }

  const sorted = allInteractions.slice().reverse();

  const ACTION_BADGE = {
    Added_To_Cart:      '<span class="badge badge-cart">🛒 Cart</span>',
    Feedback_Accurate:  '<span class="badge badge-perfect">👍 Accurate</span>',
    Feedback_TooLarge:  '<span class="badge badge-partial">👎 Too Large</span>',
    Feedback_TooSmall:  '<span class="badge badge-nomatch">👎 Too Small</span>',
  };

  tbody.innerHTML = sorted.map(i => {
    const date        = i.timestamp ? new Date(i.timestamp).toLocaleString() : '—';
    const actionBadge = ACTION_BADGE[i.action_type] || `<span class="badge">${esc(i.action_type || '—')}</span>`;
    const profileName = i.profileId
      ? esc(allProfiles.find(p => p.id === i.profileId)?.name || i.profileId)
      : '—';
    const matchBadge  = {
      perfect: '<span class="badge badge-perfect">Perfect</span>',
      partial: '<span class="badge badge-partial">Partial</span>',
      none:    '<span class="badge badge-nomatch">None</span>',
    }[i.matchStatus] || '—';

    return `<tr>
      <td>${date}</td>
      <td>${actionBadge}</td>
      <td>${esc(i.site     || '—')}</td>
      <td>${esc(i.storeId  || '—')}</td>
      <td>${esc(i.productId|| '—')}</td>
      <td>${esc(i.recommendedSize || '—')}</td>
      <td>${matchBadge}</td>
      <td>${profileName}</td>
    </tr>`;
  }).join('');

  if (count) count.textContent = `${sorted.length} interaction${sorted.length !== 1 ? 's' : ''}`;
}

// ── EXPORT ────────────────────────────────────────────────────────────────────
function exportJSON() {
  const payload = {
    exportedAt:   new Date().toISOString(),
    profiles:     allProfiles,
    visits:       allVisits,
    interactions: allInteractions,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `sizefitme-export-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── HELPERS ───────────────────────────────────────────────────────────────────
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
