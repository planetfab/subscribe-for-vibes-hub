const PROFILES = {
  fabrice:  { label: 'Fabrice Frere',       subtitle: 'Personal LinkedIn',        envToken: 'LINKEDIN_FABRICE_TOKEN',   envUrn: 'LINKEDIN_FABRICE_URN' },
  michelle: { label: 'Michelle Keller',      subtitle: 'Personal LinkedIn',        envToken: 'LINKEDIN_MICHELLE_TOKEN',  envUrn: 'LINKEDIN_MICHELLE_URN' },
  planetfab: { label: 'PlanetFab Studio',   subtitle: 'Company Page LinkedIn',    envToken: 'LINKEDIN_PLANETFAB_TOKEN', envUrn: 'LINKEDIN_PLANETFAB_PAGE_ID' },
};

async function loadStatus() {
  try {
    const status = await apiFetch('/api/settings/linkedin');
    renderCards(status);
  } catch (err) {
    document.getElementById('liCards').innerHTML =
      `<div class="settings-card"><p style="color:var(--accent)">${err.message}</p></div>`;
  }
}

function renderCards(status) {
  const container = document.getElementById('liCards');
  container.innerHTML = Object.entries(PROFILES).map(([type, meta]) => {
    const s = status[type] || {};
    const connected = s.connected;
    const hasToken = s.hasToken;

    let statusHtml;
    if (connected) {
      statusHtml = `<span class="li-status li-status-connected">Connected</span>`;
    } else if (hasToken) {
      statusHtml = `<span class="li-status li-status-partial">Token set — URN missing</span>`;
    } else {
      statusHtml = `<span class="li-status li-status-disconnected">Not connected</span>`;
    }

    const urnHtml = s.urn
      ? `<div class="li-detail"><span class="li-detail-label">URN</span><code>${s.urn}</code></div>`
      : '';

    const sourceHtml = s.source
      ? `<div class="li-detail"><span class="li-detail-label">Source</span><span>${s.source === 'oauth' ? 'OAuth (stored)' : 'Environment variable'}</span></div>`
      : '';

    // Org picker for planetfab when multiple orgs found
    let orgPickerHtml = '';
    if (type === 'planetfab' && !s.urn && s.pendingOrgs && s.pendingOrgs.length > 1) {
      orgPickerHtml = `
        <div class="li-orgs">
          <p class="li-orgs-label">Multiple organizations found — select PlanetFab Studio:</p>
          ${s.pendingOrgs.map(o => `
            <button class="btn btn-secondary btn-sm" onclick="selectOrg('${o.id}', '${esc(o.name)}')">
              ${esc(o.name)} <span style="opacity:.5">(${o.id})</span>
            </button>
          `).join('')}
        </div>`;
    }

    const envRef = `
      <div class="li-env-ref">
        <span class="li-detail-label">Railway env vars</span>
        <code>${meta.envToken}</code>
        <code>${meta.envUrn}</code>
      </div>`;

    return `
<div class="settings-card ${connected ? 'settings-card-connected' : ''}">
  <div class="settings-card-header">
    <div>
      <div class="settings-card-title">${meta.label}</div>
      <div class="settings-card-subtitle">${meta.subtitle}</div>
    </div>
    ${statusHtml}
  </div>
  ${urnHtml}
  ${sourceHtml}
  ${orgPickerHtml}
  ${envRef}
  <div class="settings-card-actions">
    <a href="/auth/linkedin/${type}" class="btn btn-primary btn-sm">
      ${connected ? 'Reconnect' : 'Connect'} via OAuth
    </a>
  </div>
</div>`;
  }).join('');
}

async function selectOrg(orgId, name) {
  try {
    await apiFetch('/api/settings/linkedin/planetfab-org', {
      method: 'POST',
      body: { orgId },
    });
    showToast(`PlanetFab org set: ${name}`);
    await loadStatus();
  } catch (err) {
    showToast(err.message, true);
  }
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function apiFetch(url, { method = 'GET', body } = {}) {
  const opts = { method, headers: {} };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) { window.location.href = '/login'; throw new Error('Session expired'); }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

let toastTimer;
function showToast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

// Handle redirect params from OAuth callback
const params = new URLSearchParams(location.search);
if (params.get('li_error')) {
  const el = document.getElementById('liError');
  el.textContent = decodeURIComponent(params.get('li_error'));
  el.style.display = 'block';
}
if (params.get('li_connected')) {
  const type = params.get('li_connected');
  const label = { fabrice: 'Fabrice', michelle: 'Michelle', planetfab: 'PlanetFab' }[type] || type;
  const el = document.getElementById('liSuccess');
  el.textContent = `${label} LinkedIn connected successfully.`;
  el.style.display = 'block';
}
// Clean the URL
if (params.get('li_error') || params.get('li_connected')) {
  history.replaceState({}, '', '/settings');
}

loadStatus();
