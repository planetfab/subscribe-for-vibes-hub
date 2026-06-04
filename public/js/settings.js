// ── LinkedIn ──────────────────────────────────────────────────────────────

const LI_PROFILES = {
  fabrice:   { label: 'Fabrice Frere',    subtitle: 'Personal LinkedIn',     envToken: 'LINKEDIN_FABRICE_TOKEN',   envUrn: 'LINKEDIN_FABRICE_URN' },
  michelle:  { label: 'Michelle Keller',  subtitle: 'Personal LinkedIn',     envToken: 'LINKEDIN_MICHELLE_TOKEN',  envUrn: 'LINKEDIN_MICHELLE_URN' },
  planetfab: { label: 'PlanetFab Studio', subtitle: 'Company Page LinkedIn', envToken: 'LINKEDIN_PLANETFAB_TOKEN', envUrn: 'LINKEDIN_PLANETFAB_PAGE_ID' },
};

async function loadLinkedIn() {
  try {
    const status = await apiFetch('/api/settings/linkedin');
    renderLinkedInCards(status);
  } catch (err) {
    document.getElementById('liCards').innerHTML =
      `<div class="settings-card"><p style="color:var(--accent)">${esc(err.message)}</p></div>`;
  }
}

function renderLinkedInCards(status) {
  document.getElementById('liCards').innerHTML = Object.entries(LI_PROFILES).map(([type, meta]) => {
    const s = status[type] || {};

    let statusHtml;
    if (s.connected) {
      statusHtml = `<span class="li-status li-status-connected">Connected</span>`;
    } else if (s.hasToken) {
      statusHtml = `<span class="li-status li-status-partial">Token set — URN missing</span>`;
    } else {
      statusHtml = `<span class="li-status li-status-disconnected">Not connected</span>`;
    }

    const urnHtml = s.urn
      ? `<div class="li-detail"><span class="li-detail-label">URN</span><code>${esc(s.urn)}</code></div>` : '';
    const srcHtml = s.source
      ? `<div class="li-detail"><span class="li-detail-label">Source</span><span>${s.source === 'oauth' ? 'OAuth (stored)' : 'Environment variable'}</span></div>` : '';

    let orgPickerHtml = '';
    if (type === 'planetfab' && !s.urn && s.pendingOrgs && s.pendingOrgs.length > 1) {
      orgPickerHtml = `<div class="li-orgs">
        <p class="li-orgs-label">Multiple organizations found — select PlanetFab Studio:</p>
        ${s.pendingOrgs.map(o => `
          <button class="btn btn-secondary btn-sm" onclick="selectLinkedInOrg('${esc(o.id)}','${esc(o.name)}')">
            ${esc(o.name)} <span style="opacity:.5">(${o.id})</span>
          </button>`).join('')}
      </div>`;
    }

    return `
<div class="settings-card ${s.connected ? 'settings-card-connected' : ''}">
  <div class="settings-card-header">
    <div>
      <div class="settings-card-title">${esc(meta.label)}</div>
      <div class="settings-card-subtitle">${esc(meta.subtitle)}</div>
    </div>
    ${statusHtml}
  </div>
  ${urnHtml}${srcHtml}${orgPickerHtml}
  <div class="li-env-ref">
    <span class="li-detail-label">Railway env vars</span>
    <code>${meta.envToken}</code><code>${meta.envUrn}</code>
  </div>
  <div class="settings-card-actions">
    <a href="/auth/linkedin/${type}" class="btn btn-primary btn-sm">
      ${s.connected ? 'Reconnect' : 'Connect'} via OAuth
    </a>
  </div>
</div>`;
  }).join('');
}

async function selectLinkedInOrg(orgId, name) {
  try {
    await apiFetch('/api/settings/linkedin/planetfab-org', { method: 'POST', body: { orgId } });
    showToast(`PlanetFab org set: ${name}`);
    await loadLinkedIn();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ── Instagram ─────────────────────────────────────────────────────────────

async function loadInstagram() {
  try {
    const s = await apiFetch('/api/settings/instagram');
    renderInstagramCard(s);
  } catch (err) {
    document.getElementById('igCard').innerHTML =
      `<div class="settings-card"><p style="color:var(--accent)">${esc(err.message)}</p></div>`;
  }
}

function renderInstagramCard(s) {
  let statusHtml;
  if (s.connected) {
    statusHtml = `<span class="li-status li-status-connected">Connected</span>`;
  } else if (s.accountId) {
    statusHtml = `<span class="li-status li-status-partial">Account ID set — token missing</span>`;
  } else {
    statusHtml = `<span class="li-status li-status-disconnected">Not connected</span>`;
  }

  const detailsHtml = [
    s.username  ? `<div class="li-detail"><span class="li-detail-label">Account</span><code>@${esc(s.username)}</code></div>` : '',
    s.pageName  ? `<div class="li-detail"><span class="li-detail-label">Facebook page</span><span>${esc(s.pageName)}</span></div>` : '',
    s.accountId ? `<div class="li-detail"><span class="li-detail-label">IG Account ID</span><code>${esc(s.accountId)}</code></div>` : '',
    s.source    ? `<div class="li-detail"><span class="li-detail-label">Source</span><span>${s.source === 'oauth' ? 'OAuth (stored)' : 'Environment variable'}</span></div>` : '',
  ].join('');

  let pickerHtml = '';
  if (!s.connected && s.pendingAccounts && s.pendingAccounts.length > 1) {
    pickerHtml = `<div class="li-orgs">
      <p class="li-orgs-label">Multiple Instagram Business accounts found — select PlanetFab:</p>
      ${s.pendingAccounts.map(a => `
        <button class="btn btn-secondary btn-sm" onclick="selectInstagramAccount('${esc(a.igId)}')">
          @${esc(a.igUsername)} <span style="opacity:.5">via ${esc(a.pageName)}</span>
        </button>`).join('')}
    </div>`;
  }

  document.getElementById('igCard').innerHTML = `
<div class="settings-card ${s.connected ? 'settings-card-connected' : ''}">
  <div class="settings-card-header">
    <div>
      <div class="settings-card-title">planetfab</div>
      <div class="settings-card-subtitle">Instagram Business Account</div>
    </div>
    ${statusHtml}
  </div>
  ${detailsHtml}${pickerHtml}
  <div class="li-env-ref">
    <span class="li-detail-label">Railway env vars</span>
    <code>INSTAGRAM_ACCESS_TOKEN</code><code>INSTAGRAM_ACCOUNT_ID</code>
  </div>
  <div class="settings-card-actions">
    <a href="/auth/instagram" class="btn btn-primary btn-sm">
      ${s.connected ? 'Reconnect' : 'Connect'} via Facebook OAuth
    </a>
  </div>
</div>`;
}

async function selectInstagramAccount(igId) {
  try {
    const result = await apiFetch('/api/settings/instagram/select', { method: 'POST', body: { igId } });
    showToast(`Instagram connected: @${result.username}`);
    await loadInstagram();
  } catch (err) {
    showToast(err.message, true);
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function apiFetch(url, { method = 'GET', body } = {}) {
  const opts = { method, headers: {} };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
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

// ── Handle OAuth redirect params ──────────────────────────────────────────

const params = new URLSearchParams(location.search);

if (params.get('li_error')) {
  const el = document.getElementById('liError');
  el.textContent = decodeURIComponent(params.get('li_error'));
  el.style.display = 'block';
}
if (params.get('li_connected')) {
  const label = { fabrice: 'Fabrice', michelle: 'Michelle', planetfab: 'PlanetFab' }[params.get('li_connected')] || params.get('li_connected');
  const el = document.getElementById('liSuccess');
  el.textContent = `${label} LinkedIn connected successfully.`;
  el.style.display = 'block';
}

if (params.get('ig_error')) {
  const el = document.getElementById('igError');
  el.textContent = decodeURIComponent(params.get('ig_error'));
  el.style.display = 'block';
}
if (params.get('ig_connected') || params.get('ig_pick')) {
  const el = document.getElementById('igSuccess');
  el.textContent = params.get('ig_pick')
    ? 'Multiple Instagram accounts found — please select one below.'
    : 'Instagram connected successfully.';
  el.style.display = 'block';
  if (params.get('ig_pick')) {
    document.getElementById('igSuccess').className = 'settings-alert settings-alert-error';
    el.style.background = '#fef3c7';
    el.style.color = '#92400e';
  }
}

if ([...params.keys()].some(k => k.startsWith('li_') || k.startsWith('ig_'))) {
  history.replaceState({}, '', '/settings');
}

// ── Boot ──────────────────────────────────────────────────────────────────

loadLinkedIn();
loadInstagram();
