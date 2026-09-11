// background.js — SizeFitMe Service Worker

// ── API CONFIG ────────────────────────────────────────────────────────────────
// To activate: chrome.storage.local.set({ apiEndpoint: 'https://your-api.com/events' })
// Or hardcode a URL in API_ENDPOINT_FALLBACK below.
const API_ENDPOINT_FALLBACK = '';

async function getApiEndpoint() {
  const cfg = await chrome.storage.local.get('apiEndpoint');
  return cfg.apiEndpoint || API_ENDPOINT_FALLBACK || null;
}

async function sendToApi(eventType, payload) {
  const endpoint = await getApiEndpoint();
  if (!endpoint) return; // Not configured — store locally only

  try {
    const resp = await fetch(endpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ eventType, payload, sentAt: Date.now() }),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  } catch {
    // Queue for retry on next startup
    const q     = await chrome.storage.local.get('apiRetryQueue');
    const queue = (q.apiRetryQueue || []).slice(-200);
    queue.push({ eventType, payload, queuedAt: Date.now() });
    await chrome.storage.local.set({ apiRetryQueue: queue });
  }
}

async function flushRetryQueue() {
  const endpoint = await getApiEndpoint();
  if (!endpoint) return;
  const q = await chrome.storage.local.get('apiRetryQueue');
  if (!q.apiRetryQueue?.length) return;

  const remaining = [];
  for (const item of q.apiRetryQueue) {
    try {
      const resp = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ eventType: item.eventType, payload: item.payload, sentAt: Date.now(), retried: true }),
      });
      if (!resp.ok) remaining.push(item);
    } catch {
      remaining.push(item);
    }
  }
  await chrome.storage.local.set({ apiRetryQueue: remaining });
}

chrome.runtime.onStartup.addListener(flushRetryQueue);

// ── INSTALL ────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('onboarding.html') });
  }
  // Migrate existing single userProfile → profiles array
  await migrateProfiles();
  // Clear legacy visits that have no imageData (they were collected before thumbnail caching)
  await clearLegacyVisits();
});

chrome.runtime.onStartup.addListener(clearLegacyVisits);

// Clear all productVisits that predate imageData support (one-time, flagged)
async function clearLegacyVisits() {
  const data = await chrome.storage.local.get('visitsImageMigrated');
  if (data.visitsImageMigrated) return;
  await chrome.storage.local.set({ productVisits: [], visitsImageMigrated: true });
}

// ── PROFILE MIGRATION ──────────────────────────────────────────────────────
async function migrateProfiles() {
  const data = await chrome.storage.local.get(['userProfile', 'profiles']);
  if (data.profiles) return; // Already migrated

  if (data.userProfile?.onboardingCompleted) {
    const profile = {
      ...data.userProfile,
      id:   data.userProfile.id || `prof_${Date.now()}`,
      name: data.userProfile.name || 'My Profile',
    };
    await chrome.storage.local.set({
      profiles:        [profile],
      activeProfileId: profile.id,
      userProfile:     profile,
    });
  } else {
    await chrome.storage.local.set({ profiles: [], activeProfileId: null });
  }
}

// ── MESSAGE HANDLER ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // ── Legacy: single profile read ──────────────────────────────────────────
  if (message.type === 'GET_USER_PROFILE') {
    chrome.storage.local.get(['userProfile', 'activeProfileId', 'profiles'], (data) => {
      sendResponse({ profile: data.userProfile || null });
    });
    return true;
  }

  // ── Profiles CRUD ─────────────────────────────────────────────────────────
  if (message.type === 'GET_PROFILES') {
    chrome.storage.local.get(['profiles', 'activeProfileId'], (data) => {
      sendResponse({
        profiles:        (data.profiles || []).filter(p => !p.deleted),
        activeProfileId: data.activeProfileId || null,
      });
    });
    return true;
  }

  if (message.type === 'SAVE_PROFILE') {
    const newProfile = message.data;
    chrome.storage.local.get(['profiles'], (data) => {
      const profiles = data.profiles || [];
      const idx      = profiles.findIndex(p => p.id === newProfile.id);
      if (idx >= 0) {
        profiles[idx] = newProfile;          // update existing
      } else {
        profiles.push(newProfile);            // add new
      }
      // Always mirror active profile to userProfile for content.js compatibility
      chrome.storage.local.set({
        profiles,
        activeProfileId: newProfile.id,
        userProfile:     newProfile,
      }, () => {
        sendResponse({ success: true, profile: newProfile });
        sendToApi('profile_save', newProfile);
      });
    });
    return true;
  }

  if (message.type === 'SET_ACTIVE_PROFILE') {
    const { profileId } = message.data;
    chrome.storage.local.get(['profiles'], (data) => {
      const profiles = data.profiles || [];
      const profile  = profiles.find(p => p.id === profileId);
      if (!profile) { sendResponse({ success: false }); return; }
      chrome.storage.local.set({
        activeProfileId: profileId,
        userProfile:     profile,
      }, () => sendResponse({ success: true, profile }));
    });
    return true;
  }

  if (message.type === 'DELETE_PROFILE') {
    const { profileId } = message.data;
    chrome.storage.local.get(['profiles', 'activeProfileId'], (data) => {
      // Soft-delete: mark as deleted instead of removing
      const profiles = (data.profiles || []).map(p =>
        p.id === profileId ? { ...p, deleted: true, deletedAt: Date.now() } : p
      );
      const activeProfiles = profiles.filter(p => !p.deleted);
      let activeId = data.activeProfileId;
      let active   = null;
      if (activeId === profileId) {
        active   = activeProfiles[0] || null;
        activeId = active?.id || null;
      } else {
        active = activeProfiles.find(p => p.id === activeId) || null;
      }
      chrome.storage.local.set({
        profiles,
        activeProfileId: activeId,
        userProfile:     active,
      }, () => sendResponse({ success: true }));
    });
    return true;
  }

  // ── Visit / URL tracking ──────────────────────────────────────────────────
  if (message.type === 'TRACK_VISIT') {
    chrome.storage.local.get('productVisits', (data) => {
      const visits = data.productVisits || [];
      visits.push(message.data);
      chrome.storage.local.set({ productVisits: visits.slice(-200) });
    });
    sendToApi('visit', message.data);
    return false;
  }

  // ── Image thumbnail (sent from content script after page-context fetch) ──
  if (message.type === 'UPDATE_VISIT_IMAGE') {
    const { url, imageData } = message.data;
    chrome.storage.local.get('productVisits', (data) => {
      const visits = data.productVisits || [];
      const idx = visits.findLastIndex(v => v.url === url);
      if (idx >= 0) {
        visits[idx].imageData = imageData;
        chrome.storage.local.set({ productVisits: visits });
      }
    });
    return false;
  }

  // ── Interaction tracking (cart adds, feedback) ─────────────────────────────
  if (message.type === 'TRACK_INTERACTION') {
    chrome.storage.local.get('interactions', (data) => {
      const interactions = data.interactions || [];
      interactions.push({ ...message.data, timestamp: message.data.timestamp || Date.now() });
      chrome.storage.local.set({ interactions: interactions.slice(-1000) });
    });
    sendToApi('interaction', message.data);
    return false;
  }

  // ── Match result cache (keyed by tab) ─────────────────────────────────────
  if (message.type === 'SET_MATCH_RESULT') {
    const tabId = sender.tab?.id;
    if (tabId) {
      chrome.storage.local.set({ [`matchResult_${tabId}`]: message.data });
    }
    return false;
  }

  // ── Feedback ──────────────────────────────────────────────────────────────
  if (message.type === 'SAVE_FEEDBACK') {
    chrome.storage.local.get('feedback', (data) => {
      const feedbackList = data.feedback || [];
      const entry = { ...message.data, timestamp: Date.now(), url: sender.tab?.url };
      feedbackList.push(entry);
      chrome.storage.local.set({ feedback: feedbackList });
      sendToApi('feedback', entry);
    });
    return false;
  }

  // ── Navigation ────────────────────────────────────────────────────────────
  if (message.type === 'OPEN_ONBOARDING') {
    const url = message.url || chrome.runtime.getURL('onboarding.html');
    chrome.tabs.create({ url });
    sendResponse({ success: true });
  }

  if (message.type === 'OPEN_ADMIN') {
    chrome.tabs.create({ url: chrome.runtime.getURL('admin.html') });
    sendResponse({ success: true });
  }
});
