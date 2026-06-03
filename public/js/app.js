/* global state */
let allItems = [];
let currentFilter = 'all';
let toastTimer = null;

/* ── Bootstrap ─────────────────────────────────────────────────────────── */

async function init() {
  try {
    const me = await apiFetch('/api/content/me');
    const el = document.getElementById('headerUser');
    if (el) el.textContent = me.username;
  } catch {}
  await loadContent();
}

/* ── Data loading ───────────────────────────────────────────────────────── */

async function loadContent() {
  try {
    allItems = await apiFetch('/api/content');
    updateCounts();
    renderCards();
  } catch (err) {
    showToast('Failed to load content', true);
  }
}

function updateCounts() {
  const counts = { all: allItems.length };
  for (const item of allItems) {
    counts[item.status] = (counts[item.status] || 0) + 1;
  }
  for (const [key, n] of Object.entries(counts)) {
    const el = document.getElementById(`count-${key}`);
    if (el) el.textContent = n ? `(${n})` : '';
  }
}

/* ── Filtering & rendering ──────────────────────────────────────────────── */

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderCards();
}

function renderCards() {
  const grid = document.getElementById('cardsGrid');
  const items = currentFilter === 'all'
    ? allItems
    : allItems.filter(i => i.status === currentFilter);

  if (!items.length) {
    const msg = currentFilter === 'all'
      ? 'Send an email to buzzby@planetfab.com to get started.'
      : `No items with status "${currentFilter}".`;
    grid.innerHTML = `<div class="empty-state">
      <h3>${currentFilter === 'all' ? 'No content yet' : 'Nothing here'}</h3>
      <p>${msg}</p>
    </div>`;
    return;
  }

  grid.innerHTML = items.map(cardHTML).join('');
}

function statusBadgeClass(status) {
  const map = {
    'Draft': 'status-draft',
    'Approved': 'status-approved',
    'Published': 'status-published',
    'Newsletter Ready': 'status-newsletter',
  };
  return map[status] || 'status-draft';
}

function cardHTML(item) {
  const isApproved = item.status === 'Approved';
  const disabledAttr = isApproved ? '' : 'disabled title="Approve content first"';
  const urls = (item.source_urls || '').split(',').map(u => u.trim()).filter(Boolean);
  const blurbPreview = (item.newsletter_blurb || '').substring(0, 180);
  const blurbTrunc = (item.newsletter_blurb || '').length > 180;
  const liHook = (item.linkedin_hook || '').substring(0, 90);
  const liTrunc = (item.linkedin_hook || '').length > 90;

  return `
<div class="card" id="card-${item.id}">
  <div class="card-header">
    <h3 class="card-title">${esc(item.piece_title || 'Untitled')}</h3>
    <span class="status-badge ${statusBadgeClass(item.status)}">${esc(item.status || 'Draft')}</span>
  </div>

  ${item.section_name ? `<div class="section-tag">${esc(item.section_name)}</div>` : ''}

  <p class="card-blurb">${esc(blurbPreview)}${blurbTrunc ? '&hellip;' : ''}</p>

  <div class="card-meta">
    <div class="card-meta-item">
      <div class="meta-label">LinkedIn Hook</div>
      <div class="meta-value">${esc(liHook)}${liTrunc ? '&hellip;' : ''}</div>
    </div>
    <div class="card-meta-item">
      <div class="meta-label">Blog Potential</div>
      <div class="meta-value">${esc(item.blog_potential || '—')}</div>
    </div>
  </div>

  ${urls.length ? `<div class="source-urls">${urls.map(u =>
    `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u)}</a>`
  ).join('')}</div>` : ''}

  ${item.created_at ? `<div class="card-date">${formatDate(item.created_at)}</div>` : ''}

  <div class="card-actions">
    <button class="btn btn-secondary btn-sm" onclick="openEdit('${item.id}')">Edit</button>
    ${item.status === 'Draft'
      ? `<button class="btn btn-approve btn-sm" onclick="approve('${item.id}')">Approve</button>`
      : ''}
    <button class="btn btn-secondary btn-sm" onclick="publishLinkedIn('${item.id}','planetfab')" ${disabledAttr}>PF LinkedIn</button>
    <button class="btn btn-secondary btn-sm" onclick="publishLinkedIn('${item.id}','fabrice')" ${disabledAttr}>Fabrice LI</button>
    <button class="btn btn-secondary btn-sm" onclick="publishLinkedIn('${item.id}','michelle')" ${disabledAttr}>Michelle LI</button>
    <button class="btn btn-secondary btn-sm" onclick="publishInstagram('${item.id}')" ${disabledAttr}>Instagram</button>
    <button class="btn btn-secondary btn-sm" onclick="markNewsletter('${item.id}')" ${disabledAttr}>Newsletter</button>
  </div>
</div>`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ── Edit modal ─────────────────────────────────────────────────────────── */

function openEdit(id) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;

  document.getElementById('editId').value = id;
  document.getElementById('editPieceTitle').value = item.piece_title || '';
  document.getElementById('editSectionName').value = item.section_name || '';
  document.getElementById('editNewsletterBlurb').value = item.newsletter_blurb || '';
  document.getElementById('editLinkedinHook').value = item.linkedin_hook || '';
  document.getElementById('editInstagramCaption').value = item.instagram_caption || '';
  document.getElementById('editBlogPotential').value = item.blog_potential || '';
  document.getElementById('editSourceUrls').value = item.source_urls || '';
  document.getElementById('editStatus').value = item.status || 'Draft';

  updateBlurbCount();
  document.getElementById('editModal').style.display = 'flex';
  document.getElementById('editPieceTitle').focus();
}

function closeModal() {
  document.getElementById('editModal').style.display = 'none';
}

function updateBlurbCount() {
  const ta = document.getElementById('editNewsletterBlurb');
  const hint = document.getElementById('blurbCount');
  if (!ta || !hint) return;
  const words = ta.value.trim().split(/\s+/).filter(Boolean).length;
  hint.textContent = `${words}/150 words`;
  hint.style.color = words > 150 ? 'var(--accent)' : 'var(--muted)';
}

document.getElementById('editNewsletterBlurb')?.addEventListener('input', updateBlurbCount);

document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const payload = {
    piece_title: document.getElementById('editPieceTitle').value,
    section_name: document.getElementById('editSectionName').value,
    newsletter_blurb: document.getElementById('editNewsletterBlurb').value,
    linkedin_hook: document.getElementById('editLinkedinHook').value,
    instagram_caption: document.getElementById('editInstagramCaption').value,
    blog_potential: document.getElementById('editBlogPotential').value,
    source_urls: document.getElementById('editSourceUrls').value,
    status: document.getElementById('editStatus').value,
  };

  try {
    const updated = await apiFetch(`/api/content/${id}`, { method: 'PUT', body: payload });
    mergeItem(updated);
    renderCards();
    closeModal();
    showToast('Changes saved');
  } catch (err) {
    showToast(err.message || 'Failed to save', true);
  }
});

/* ── Actions ────────────────────────────────────────────────────────────── */

async function approve(id) {
  try {
    const updated = await apiFetch(`/api/content/${id}`, {
      method: 'PUT',
      body: { status: 'Approved' },
    });
    mergeItem(updated);
    updateCounts();
    renderCards();
    showToast('Approved');
  } catch (err) {
    showToast(err.message || 'Failed to approve', true);
  }
}

async function publishLinkedIn(id, type) {
  const labels = { planetfab: 'PlanetFab LinkedIn', fabrice: "Fabrice's LinkedIn", michelle: "Michelle's LinkedIn" };
  showToast(`Publishing to ${labels[type] || 'LinkedIn'}…`);
  try {
    await apiFetch(`/api/publish/linkedin/${type}/${id}`, { method: 'POST' });
    showToast(`Published to ${labels[type]}`);
    await loadContent();
  } catch (err) {
    showToast(err.message || 'Publish failed', true);
  }
}

async function publishInstagram(id) {
  showToast('Publishing to Instagram…');
  try {
    await apiFetch(`/api/publish/instagram/${id}`, { method: 'POST' });
    showToast('Posted to Instagram');
  } catch (err) {
    showToast(err.message || 'Publish failed', true);
  }
}

async function markNewsletter(id) {
  try {
    const { item } = await apiFetch(`/api/publish/newsletter/${id}`, { method: 'POST' });
    mergeItem(item);
    updateCounts();
    renderCards();
    showToast('Marked as Newsletter Ready');
  } catch (err) {
    showToast(err.message || 'Failed', true);
  }
}

async function checkEmail() {
  const btn = document.getElementById('checkEmailBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Checking…';
  try {
    const result = await apiFetch('/api/content/check-email', { method: 'POST' });
    await loadContent();
    showToast(result.processed > 0 ? `${result.processed} new item(s) added` : 'No new emails');
  } catch (err) {
    showToast(err.message || 'Email check failed', true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Check Email';
  }
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function mergeItem(updated) {
  const idx = allItems.findIndex(i => i.id === updated.id);
  if (idx !== -1) allItems[idx] = updated;
  updateCounts();
}

async function apiFetch(url, { method = 'GET', body } = {}) {
  const opts = {
    method,
    headers: {},
  };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(url, opts);
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Session expired');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function showToast(msg, error = false) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.className = 'toast'; }, 3500);
}

/* ── Keyboard shortcuts ─────────────────────────────────────────────────── */

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

/* ── Start ──────────────────────────────────────────────────────────────── */

init();
