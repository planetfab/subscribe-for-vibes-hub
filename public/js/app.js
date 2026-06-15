/* ── State ───────────────────────────────────────────────────────────────── */

let allItems = [];
let trashItems = [];
let currentFilter = 'all';
let bulkMode = false;
let selectedIds = new Set();
let toastTimer = null;
let lightboxImages = [];
let lightboxIdx = 0;
let editImages = [];
let quill = null;

/* ── Bootstrap ──────────────────────────────────────────────────────────── */

async function init() {
  try {
    const me = await apiFetch('/api/content/me');
    const el = document.getElementById('headerUser');
    if (el) el.textContent = me.username;
  } catch {}
  await loadContent();
  loadStats();
}

/* ── Data ───────────────────────────────────────────────────────────────── */

async function loadContent() {
  try {
    allItems = await apiFetch('/api/content');
    updateCounts();
    renderCards();
  } catch (err) {
    showToast('Failed to load content', true);
  }
}

async function loadStats() {
  try {
    const stats = await apiFetch('/api/content/stats');
    const el = document.getElementById('costDisplay');
    if (el) el.textContent = `Est. API cost this month: $${stats.estimatedCost}`;
  } catch {}
}

function updateCounts() {
  const counts = { all: allItems.length, trash: trashItems.length };
  for (const item of allItems) {
    counts[item.status] = (counts[item.status] || 0) + 1;
  }
  for (const [key, n] of Object.entries(counts)) {
    const el = document.getElementById(`count-${key}`);
    if (el) el.textContent = n ? `(${n})` : '';
  }
}

/* ── Filtering ──────────────────────────────────────────────────────────── */

function setFilter(filter, btn) {
  if (bulkMode) toggleBulkMode();
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  const emptyBtn = document.getElementById('emptyTrashBtn');
  if (filter === 'trash') {
    emptyBtn.style.display = '';
    loadTrash();
  } else {
    emptyBtn.style.display = 'none';
    renderCards();
  }
}

/* ── Rendering ──────────────────────────────────────────────────────────── */

function renderCards() {
  const grid = document.getElementById('cardsGrid');

  if (currentFilter === 'trash') {
    if (!trashItems.length) {
      grid.innerHTML = `<div class="empty-state">
        <h3>Trash is empty</h3>
        <p>Deleted cards appear here for 5 days before being permanently removed.</p>
      </div>`;
    } else {
      grid.innerHTML = trashItems.map(trashCardHTML).join('');
    }
    return;
  }

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

/* ── Copy-to-clipboard helpers ──────────────────────────────────────────── */

const COPY_ICON = `<svg class="icon-copy" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
const CHECK_ICON = `<svg class="icon-check" xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>`;

function copyBtn(id, field) {
  return `<button type="button" class="copy-btn" onclick="copyField(this,'${id}','${field}')" title="Copy">${COPY_ICON}${CHECK_ICON}</button>`;
}

async function copyField(btn, id, field) {
  const item = allItems.find(i => i.id === id);
  if (!item) return;
  let text = item[field] || '';
  // Blog post is stored as Quill HTML — strip tags for plain-text clipboard
  if (field === 'blog_post') text = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 2000);
  } catch {
    showToast('Copy failed', true);
  }
}

// Copies the current live value of a modal field (reads DOM, not allItems).
// elementId 'quillEditor' is the special case for the Quill rich-text field.
async function copyModalField(btn, elementId) {
  let text = '';
  if (elementId === 'quillEditor') {
    text = quill ? quill.root.innerHTML.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() : '';
  } else {
    const el = document.getElementById(elementId);
    if (!el) return;
    text = el.value || '';
  }
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    btn.classList.add('copied');
    setTimeout(() => btn.classList.remove('copied'), 2000);
  } catch {
    showToast('Copy failed', true);
  }
}

// Inject SVG icons into modal copy-button placeholders and wire their onclick.
// Buttons use data-copy-field to identify which element to read from.
function initModalCopyButtons() {
  document.querySelectorAll('.copy-btn[data-copy-field]').forEach(btn => {
    btn.innerHTML = COPY_ICON + CHECK_ICON;
    btn.onclick = () => copyModalField(btn, btn.dataset.copyField);
  });
}

// Renders one labeled field row with a copy button. Skipped when field is empty.
function cardField(item, field, label, maxLen) {
  let text = item[field] || '';
  if (field === 'blog_post') text = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const preview = text.length > maxLen ? esc(text.substring(0, maxLen)) + '&hellip;' : esc(text);
  return `<div class="card-field">
  <div class="card-field-hd">
    <span class="card-field-label">${label}</span>${copyBtn(item.id, field)}
  </div>
  <div class="card-field-val">${preview}</div>
</div>`;
}

/* ── Image helpers ──────────────────────────────────────────────────────── */

// Single swap point: returns a displayable URL for a stored image object.
// Current format: { data: base64string, contentType, filename }
// Future R2 format: { url: "https://...", contentType, filename }
// When migrating to R2, this function and the storedImages builder in
// email-watcher.js are the only two places that need to change.
function getImageSrc(img) {
  return img.url || `data:${img.contentType};base64,${img.data}`;
}

function statusClass(status) {
  const map = { 'Draft': 'status-draft', 'Approved': 'status-approved', 'Published': 'status-published', 'Newsletter Ready': 'status-newsletter' };
  return map[status] || 'status-draft';
}

// Returns a green checkmark prefix if this channel has been published.
function channelCheck(item, channel) {
  return item.published_channels?.[channel]
    ? '<span class="pub-check" aria-label="Published">✓</span>'
    : '';
}

function cardHTML(item) {
  const isPublishable = item.status !== 'Draft';
  function channelDis(channel) {
    if (!isPublishable) return 'disabled title="Approve content first"';
    if (item.published_channels?.[channel]) return 'disabled title="Already published to this channel"';
    return '';
  }
  const urls = (item.source_urls || '').split(',').map(u => u.trim()).filter(Boolean);
  const isSelected = selectedIds.has(item.id);
  const id = item.id;

  const sourceField = urls.length ? `<div class="card-field">
  <div class="card-field-hd">
    <span class="card-field-label">Source URLs</span>${copyBtn(id, 'source_urls')}
  </div>
  <div class="card-field-val source-urls">${urls.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join('')}</div>
</div>` : '';

  return `
<div class="card${isSelected ? ' selected' : ''}" id="card-${id}" onclick="handleCardClick(event,'${id}')">
  <div class="card-checkbox"></div>
  <div class="card-header">
    <h3 class="card-title">${esc(item.piece_title || 'Untitled')}</h3>
    <span class="status-badge ${statusClass(item.status)}">${esc(item.status || 'Draft')}</span>
  </div>
  ${item.section_name ? `<div class="section-tag">${esc(item.section_name)}</div>` : ''}
  <div class="card-fields">
    ${cardField(item, 'newsletter_blurb', 'Newsletter Blurb', 200)}
    ${cardField(item, 'linkedin_hook', 'LinkedIn Post', 160)}
    ${cardField(item, 'instagram_caption', 'Instagram Caption', 120)}
    ${cardField(item, 'blog_post', 'Blog Post', 120)}
    ${sourceField}
  </div>
  ${item.images?.length ? `<div class="card-images">${item.images.map((img, i) => `<img class="card-thumb" src="${getImageSrc(img)}" alt="${esc(img.filename || 'Image')}" onclick="openLightbox('${id}',${i})">`).join('')}</div>` : ''}
  ${item.email_received_at ? `<div class="card-date card-date-email">Email received: ${formatDate(item.email_received_at)}</div>` : ''}
  ${item.created_at ? `<div class="card-date">${formatDate(item.created_at)}</div>` : ''}
  <div class="card-actions">
    <div class="card-actions-row">
      <button class="btn btn-ghost btn-sm" onclick="openEdit('${id}')">Edit</button>
      ${item.status === 'Draft' ? `<button class="btn btn-approve btn-sm" onclick="approve('${id}')">Approve</button>` : ''}
    </div>
    <div class="card-actions-row">
      <button class="btn btn-ghost btn-sm" onclick="publishLinkedIn('${id}','fabrice')" ${channelDis('linkedin_fabrice')}>${channelCheck(item,'linkedin_fabrice')}Fabrice LI</button>
      <button class="btn btn-ghost btn-sm" onclick="publishLinkedIn('${id}','michelle')" ${channelDis('linkedin_michelle')}>${channelCheck(item,'linkedin_michelle')}Michelle LI</button>
    </div>
    <div class="card-actions-row">
      <button class="btn btn-ghost btn-sm" onclick="saveBlog('${id}','fabrice')">${channelCheck(item,'blog_fabrice')}Blog as Fabrice</button>
      <button class="btn btn-ghost btn-sm" onclick="saveBlog('${id}','michelle')">${channelCheck(item,'blog_michelle')}Blog as Michelle</button>
    </div>
    <div class="card-actions-row">
      <button class="btn btn-ghost btn-sm" onclick="publishInstagram('${id}')" ${channelDis('instagram')}>${channelCheck(item,'instagram')}Instagram</button>
      <button class="btn btn-ghost btn-sm" onclick="markNewsletter('${id}')" ${channelDis('newsletter')}>${channelCheck(item,'newsletter')}Newsletter</button>
    </div>
    <div class="card-actions-row card-actions-delete">
      <button class="btn btn-danger btn-sm" onclick="openDeleteConfirm('${id}')">Delete</button>
    </div>
  </div>
</div>`;
}

async function loadTrash() {
  try {
    trashItems = await apiFetch('/api/content/trash');
    updateCounts();
    renderCards();
  } catch (err) {
    showToast('Failed to load trash', true);
  }
}

function trashCardHTML(item) {
  const deletedAt = item.deleted_at ? new Date(item.deleted_at) : null;
  const purgeAt = deletedAt ? new Date(deletedAt.getTime() + 5 * 24 * 60 * 60 * 1000) : null;
  const msLeft = purgeAt ? purgeAt - Date.now() : null;
  const daysLeft = msLeft ? Math.ceil(msLeft / (1000 * 60 * 60 * 24)) : null;
  const purgeNote = daysLeft > 0
    ? `auto-purge in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`
    : 'purging soon';
  const blurb = (item.newsletter_blurb || '').substring(0, 200);
  const blurbTrunc = (item.newsletter_blurb || '').length > 200;

  return `
<div class="card card-trash" id="card-${item.id}">
  <div class="card-header">
    <h3 class="card-title">${esc(item.piece_title || 'Untitled')}</h3>
    <span class="status-badge status-draft">Deleted</span>
  </div>
  ${item.section_name ? `<div class="section-tag">${esc(item.section_name)}</div>` : ''}
  <p class="card-blurb">${esc(blurb)}${blurbTrunc ? '&hellip;' : ''}</p>
  ${deletedAt ? `<div class="card-date">Deleted ${formatDate(item.deleted_at)} &middot; ${purgeNote}</div>` : ''}
  <div class="card-actions">
    <button class="btn btn-approve btn-sm" onclick="restoreItem('${item.id}')">Restore</button>
    <button class="btn btn-danger btn-sm" onclick="permanentDeleteConfirm('${item.id}')">Delete Forever</button>
  </div>
</div>`;
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ── Bulk mode ──────────────────────────────────────────────────────────── */

function toggleBulkMode() {
  bulkMode = !bulkMode;
  selectedIds.clear();

  document.body.classList.toggle('bulk-mode', bulkMode);
  document.getElementById('filtersBar').style.display = bulkMode ? 'none' : '';
  document.getElementById('bulkBar').style.display = bulkMode ? 'flex' : 'none';
  document.getElementById('bulkToggleBtn').textContent = bulkMode ? 'Cancel' : 'Select';

  renderCards();
  updateBulkBar();
}

function handleCardClick(e, id) {
  if (!bulkMode) return;
  if (e.target.closest('button, a')) return;
  e.preventDefault();
  if (selectedIds.has(id)) {
    selectedIds.delete(id);
  } else {
    selectedIds.add(id);
  }
  const cardEl = document.getElementById(`card-${id}`);
  if (cardEl) cardEl.classList.toggle('selected', selectedIds.has(id));
  updateBulkBar();
}

function selectAll() {
  const items = currentFilter === 'all' ? allItems : allItems.filter(i => i.status === currentFilter);
  const allSelected = items.every(i => selectedIds.has(i.id));
  if (allSelected) {
    items.forEach(i => selectedIds.delete(i.id));
  } else {
    items.forEach(i => selectedIds.add(i.id));
  }
  renderCards();
  updateBulkBar();
}

function updateBulkBar() {
  const n = selectedIds.size;
  document.getElementById('bulkCount').textContent = `${n} selected`;
  const btn = document.getElementById('bulkDeleteBtn');
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? `Delete ${n} Item${n !== 1 ? 's' : ''}` : 'Delete Selected';
}

/* ── Delete ─────────────────────────────────────────────────────────────── */

function openDeleteConfirm(id) {
  const item = allItems.find(i => i.id === id);
  const title = item?.piece_title || 'this item';
  openConfirm(
    'Move to Trash',
    `Move "${title}" to Trash? You can restore it within 5 days.`,
    async () => {
      try {
        await apiFetch(`/api/content/${id}`, { method: 'DELETE' });
        allItems = allItems.filter(i => i.id !== id);
        trashItems = []; // stale — will reload on next trash visit
        updateCounts();
        renderCards();
        showToast('Moved to Trash');
      } catch (err) {
        showToast(err.message || 'Delete failed', true);
      }
    }
  );
}

function openBulkDeleteConfirm() {
  const n = selectedIds.size;
  if (!n) return;
  openConfirm(
    'Move to Trash',
    `Move ${n} item${n !== 1 ? 's' : ''} to Trash? You can restore them within 5 days.`,
    async () => {
      try {
        const ids = [...selectedIds];
        await apiFetch('/api/content/bulk-delete', { method: 'POST', body: { ids } });
        allItems = allItems.filter(i => !selectedIds.has(i.id));
        trashItems = []; // stale — will reload on next trash visit
        selectedIds.clear();
        updateCounts();
        renderCards();
        toggleBulkMode();
        showToast(`Moved ${ids.length} item${ids.length !== 1 ? 's' : ''} to Trash`);
      } catch (err) {
        showToast(err.message || 'Bulk delete failed', true);
      }
    }
  );
}

/* ── Trash actions ──────────────────────────────────────────────────────── */

async function restoreItem(id) {
  try {
    const item = await apiFetch(`/api/content/trash/${id}/restore`, { method: 'POST' });
    trashItems = trashItems.filter(i => i.id !== id);
    allItems.unshift(item);
    updateCounts();
    renderCards();
    showToast('Restored');
  } catch (err) {
    showToast(err.message || 'Restore failed', true);
  }
}

function permanentDeleteConfirm(id) {
  const item = trashItems.find(i => i.id === id);
  const title = item?.piece_title || 'this item';
  openConfirm(
    'Delete Forever',
    `Permanently delete "${title}"? This cannot be undone.`,
    async () => {
      try {
        await apiFetch(`/api/content/trash/${id}`, { method: 'DELETE' });
        trashItems = trashItems.filter(i => i.id !== id);
        updateCounts();
        renderCards();
        showToast('Permanently deleted');
      } catch (err) {
        showToast(err.message || 'Delete failed', true);
      }
    }
  );
}

function confirmEmptyTrash() {
  if (!trashItems.length) return;
  openConfirm(
    'Empty Trash',
    `Permanently delete all ${trashItems.length} item${trashItems.length !== 1 ? 's' : ''} in Trash? This cannot be undone.`,
    async () => {
      try {
        await apiFetch('/api/content/trash', { method: 'DELETE' });
        trashItems = [];
        updateCounts();
        renderCards();
        showToast('Trash emptied');
      } catch (err) {
        showToast(err.message || 'Empty trash failed', true);
      }
    }
  );
}

/* ── Confirm modal ──────────────────────────────────────────────────────── */

function openConfirm(title, message, onConfirm, btnLabel = 'Delete', danger = true) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  const btn = document.getElementById('confirmBtn');
  btn.textContent = btnLabel;
  btn.className = `btn ${danger ? 'btn-danger' : 'btn-primary'}`;
  btn.onclick = () => { closeConfirm(); onConfirm(); };
  document.getElementById('confirmModal').style.display = 'flex';
}

function closeConfirm() {
  document.getElementById('confirmModal').style.display = 'none';
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
  document.getElementById('editMetaDescription').value = item.meta_description || '';
  document.getElementById('editSourceUrls').value = item.source_urls || '';
  document.getElementById('editStatus').value = item.status || 'Draft';
  editImages = [...(item.images || [])];
  // Reset file input so the same file can be re-selected after a removal
  document.getElementById('imageFileInput').value = '';
  renderEditImages();
  updateBlurbCount();
  updateMetaDescCount();
  document.getElementById('editModal').style.display = 'flex';

  // Initialize Quill once; on subsequent openEdit calls just update its content
  if (!quill) {
    quill = new Quill('#quillEditor', {
      theme: 'snow',
      modules: {
        toolbar: [
          ['bold', 'italic', 'underline'],
          [{ header: [2, 3, false] }],
          ['link'],
          ['clean'],
        ],
      },
    });
  }
  const blogPost = item.blog_post || '';
  if (blogPost.trimStart().startsWith('<')) {
    quill.clipboard.dangerouslyPasteHTML(blogPost);
  } else if (blogPost) {
    // Plain text from Claude: convert double-newline paragraph breaks to HTML
    const html = blogPost
      .split(/\n{2,}/)
      .map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`)
      .join('');
    quill.clipboard.dangerouslyPasteHTML(html);
  } else {
    quill.setContents([]);
  }

  document.getElementById('editPieceTitle').focus();
}

const MAX_CARD_IMAGES = 3;

function renderEditImages() {
  const container = document.getElementById('editImages');
  container.className = `edit-images${editImages.length > 1 ? ' reorderable' : ''}`;

  const thumbs = editImages.map((img, i) => `
    <div class="edit-thumb-wrap" data-idx="${i}">
      <div class="edit-thumb-img">
        <img class="card-thumb" src="${getImageSrc(img)}" alt="${esc(img.filename || 'Image')}">
        <span class="hero-badge">Hero</span>
        <button type="button" class="edit-thumb-remove" onclick="removeEditImage(${i})" aria-label="Remove image">&times;</button>
      </div>
      <input type="text" class="img-caption-input" placeholder="Photo credit (optional)" value="${esc(img.caption || '')}" oninput="editImages[${i}].caption = this.value">
    </div>
  `).join('');

  const addBtn = editImages.length < MAX_CARD_IMAGES
    ? `<button type="button" class="add-image-btn" onclick="document.getElementById('imageFileInput').click()" title="Add image (JPEG, PNG, WebP)">+ Add Image</button>`
    : '';

  container.innerHTML = thumbs + addBtn;
}

function removeEditImage(idx) {
  editImages.splice(idx, 1);
  renderEditImages();
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
  hint.style.color = words > 150 ? '#c0392b' : 'var(--ink-muted)';
}

document.getElementById('editNewsletterBlurb')?.addEventListener('input', updateBlurbCount);

function updateMetaDescCount() {
  const input = document.getElementById('editMetaDescription');
  const hint  = document.getElementById('metaDescCount');
  if (!input || !hint) return;
  const len = input.value.length;
  hint.textContent = `${len}/160`;
  hint.style.color = len > 160 ? '#c0392b' : len >= 150 ? '#27ae60' : 'var(--ink-muted)';
}
document.getElementById('editMetaDescription')?.addEventListener('input', updateMetaDescCount);


document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editId').value;
  const rawBlogPostHtml = quill ? quill.root.innerHTML : '';
  const payload = {
    piece_title: document.getElementById('editPieceTitle').value,
    section_name: document.getElementById('editSectionName').value,
    newsletter_blurb: document.getElementById('editNewsletterBlurb').value,
    linkedin_hook: document.getElementById('editLinkedinHook').value,
    instagram_caption: document.getElementById('editInstagramCaption').value,
    meta_description: document.getElementById('editMetaDescription').value,
    source_urls: document.getElementById('editSourceUrls').value,
    status: document.getElementById('editStatus').value,
    images: editImages,
    // Quill emits '<p><br></p>' for an empty editor — normalize to empty string
    blog_post: rawBlogPostHtml === '<p><br></p>' ? '' : rawBlogPostHtml,
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

/* ── Publish actions ────────────────────────────────────────────────────── */

async function approve(id) {
  try {
    const updated = await apiFetch(`/api/content/${id}`, { method: 'PUT', body: { status: 'Approved' } });
    mergeItem(updated);
    updateCounts();
    renderCards();
    showToast('Approved');
  } catch (err) {
    showToast(err.message || 'Failed', true);
  }
}

async function publishLinkedIn(id, type) {
  const labels = { fabrice: "Fabrice's LinkedIn", michelle: "Michelle's LinkedIn" };
  showToast(`Publishing to ${labels[type] || 'LinkedIn'}…`);
  try {
    const result = await apiFetch(`/api/publish/linkedin/${type}/${id}`, { method: 'POST' });
    if (result.item) { mergeItem(result.item); updateCounts(); renderCards(); }
    showToast(`Published to ${labels[type] || 'LinkedIn'}`);
  } catch (err) {
    showToast(err.message || 'Publish failed', true);
  }
}

async function publishInstagram(id) {
  showToast('Publishing to Instagram…');
  try {
    const result = await apiFetch(`/api/publish/instagram/${id}`, { method: 'POST' });
    if (result.item) { mergeItem(result.item); renderCards(); }
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

async function saveBlog(id, author) {
  const label = author === 'michelle' ? "Michelle's" : "Fabrice's";
  showToast(`Saving draft to WordPress as ${label} account…`);
  try {
    const result = await apiFetch(`/api/publish/blog/${author}/${id}`, { method: 'POST' });
    if (result.item) { mergeItem(result.item); renderCards(); }
    showToast(`Draft saved to planetfab.com (${label} byline)`);
    if (result.editUrl) {
      setTimeout(() => window.open(result.editUrl, '_blank'), 600);
    }
  } catch (err) {
    showToast(err.message || 'WordPress save failed', true);
  }
}

async function enrichCard() {
  const id = document.getElementById('editId').value;
  const item = allItems.find(i => i.id === id);
  const title = item?.piece_title || 'this card';

  openConfirm(
    'Research & Enrich',
    `Research & Enrich uses web search to add depth to "${title}". Estimated cost: $0.50–$1.00 in API credits. This may take up to a minute. Proceed?`,
    async () => {
      const btn = document.getElementById('enrichBtn');
      if (btn) { btn.disabled = true; btn.textContent = 'Researching…'; }
      showToast('Researching — please wait, this may take up to a minute');
      try {
        const enriched = await apiFetch(`/api/content/${id}/enrich`, { method: 'POST' });
        if (enriched.newsletter_blurb) {
          document.getElementById('editNewsletterBlurb').value = enriched.newsletter_blurb;
          updateBlurbCount();
        }
        if (enriched.linkedin_hook)       document.getElementById('editLinkedinHook').value       = enriched.linkedin_hook;
        if (enriched.instagram_caption)   document.getElementById('editInstagramCaption').value   = enriched.instagram_caption;
        if (enriched.meta_description) {
          document.getElementById('editMetaDescription').value = enriched.meta_description;
          updateMetaDescCount();
        }
        if (enriched.blog_post && quill) {
          const bp = enriched.blog_post;
          const html = bp.trimStart().startsWith('<')
            ? bp
            : bp.split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
          quill.clipboard.dangerouslyPasteHTML(html);
        }
        showToast('Content enriched — review changes and save');
      } catch (err) {
        showToast(err.message || 'Enrichment failed', true);
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Research & Enrich'; }
      }
    },
    'Proceed',
    false
  );
}

// Sets ticker text and triggers the scroll animation when the text overflows
// the clipped container. Removes any prior animation before measuring.
function setTickerText(msg) {
  const ticker = document.getElementById('checkProgress');
  if (!ticker) return;
  ticker.classList.remove('scrolling');
  ticker.style.removeProperty('--ticker-shift');
  ticker.textContent = msg;
  // Two rAFs: first lets the DOM update, second lets layout complete
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const wrap = ticker.parentElement;
    if (!wrap) return;
    const overflow = ticker.scrollWidth - wrap.clientWidth;
    if (overflow > 4) {
      // Shift left by exactly the overflow so the end of the text lands at the
      // right edge of the container, then pause before looping back to the start.
      ticker.style.setProperty('--ticker-shift', `-${overflow}px`);
      ticker.classList.add('scrolling');
    }
  }));
}

async function checkEmail() {
  const btn = document.getElementById('checkEmailBtn');
  // Lock button width at its idle size — ticker is clipped to fit within this
  btn.style.minWidth = btn.offsetWidth + 'px';
  btn.disabled = true;
  btn.dataset.state = 'loading';
  setTickerText('Connecting…');

  let processed = 0;
  let isError = false;

  try {
    const response = await fetch('/api/content/check-email', { method: 'POST' });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events are delimited by \n\n
      const parts = buffer.split('\n\n');
      buffer = parts.pop(); // last part may be incomplete
      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        let event;
        try { event = JSON.parse(part.slice(6)); } catch { continue; }
        if (event.type === 'status') {
          setTickerText(event.message);
        } else if (event.type === 'done') {
          processed = event.processed;
        } else if (event.type === 'error') {
          throw new Error(event.message);
        }
      }
    }

    await loadContent();
    loadStats();
    if (processed > 0) showToast(`${processed} new item${processed !== 1 ? 's' : ''} added`);
  } catch (err) {
    isError = true;
    showToast(err.message || 'Email check failed', true);
  }

  const doneSpan = btn.querySelector('.check-done');
  if (isError) {
    btn.dataset.result = 'error';
    doneSpan.textContent = '✗ Failed';
  } else if (processed > 0) {
    btn.dataset.result = 'success';
    doneSpan.textContent = `✓ ${processed} new`;
  } else {
    btn.dataset.result = 'success';
    doneSpan.textContent = '✓ No new emails';
  }
  btn.dataset.state = 'done';

  setTimeout(() => {
    btn.disabled = false;
    btn.style.minWidth = '';
    delete btn.dataset.state;
    delete btn.dataset.result;
    setTickerText('Connecting…'); // reset ticker text + stop any scroll animation
  }, 2500);
}

/* ── Edit-modal image drag-to-reorder ───────────────────────────────────── */

let dragState = null;

/* ── Edit-modal image upload ─────────────────────────────────────────────── */

function setupImageUpload() {
  document.getElementById('imageFileInput').addEventListener('change', async e => {
    const files = [...e.target.files];
    e.target.value = ''; // reset so the same file can be picked again

    const slots = MAX_CARD_IMAGES - editImages.length;
    if (slots <= 0) { showToast('Maximum 3 images per card', true); return; }

    const accepted = files
      .filter(f => ['image/jpeg', 'image/png', 'image/webp'].includes(f.type))
      .slice(0, slots);

    if (!accepted.length) { showToast('Please select a JPEG, PNG, or WebP image', true); return; }

    for (const file of accepted) {
      const base64 = await readFileAsBase64(file);
      editImages.push({ data: base64, contentType: file.type, filename: file.name });
    }

    renderEditImages();
    if (accepted.length < files.length) {
      showToast(`Added ${accepted.length} image${accepted.length !== 1 ? 's' : ''} (max 3 per card)`);
    }
  });
}

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result.split(',')[1]); // strip "data:…;base64," prefix
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ── Edit-modal image drag-to-reorder ───────────────────────────────────── */

function setupImageDrag() {
  document.getElementById('editImages').addEventListener('pointerdown', startDrag);
}

function startDrag(e) {
  const wrap = e.target.closest('.edit-thumb-wrap');
  // Ignore taps on the remove button; ignore if not in reorderable mode
  if (!wrap || e.target.closest('.edit-thumb-remove') || e.target.tagName === 'INPUT') return;
  if (!document.getElementById('editImages').classList.contains('reorderable')) return;

  e.preventDefault();
  const idx = parseInt(wrap.dataset.idx);
  const rect = wrap.getBoundingClientRect();

  // Floating clone that follows the pointer
  const clone = wrap.cloneNode(true);
  clone.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;` +
    `width:${rect.width}px;height:${rect.height}px;opacity:0.8;pointer-events:none;` +
    `z-index:500;transform:scale(1.08);box-shadow:0 4px 18px rgba(0,0,0,0.28);transition:none;`;
  document.body.appendChild(clone);
  wrap.classList.add('dragging');

  dragState = {
    srcIdx: idx, clone, srcWrap: wrap,
    offsetX: e.clientX - rect.left,
    offsetY: e.clientY - rect.top,
  };

  // Pointer capture ensures move/up events come here even when off-element
  wrap.setPointerCapture(e.pointerId);
  wrap.addEventListener('pointermove', onDragMove);
  wrap.addEventListener('pointerup', onDragEnd);
  wrap.addEventListener('pointercancel', onDragEnd);
}

function onDragMove(e) {
  if (!dragState) return;
  dragState.clone.style.left = `${e.clientX - dragState.offsetX}px`;
  dragState.clone.style.top  = `${e.clientY - dragState.offsetY}px`;

  // Show a drop-before indicator on the target slot
  const container = document.getElementById('editImages');
  container.querySelectorAll('.edit-thumb-wrap').forEach(w => w.classList.remove('drop-before'));
  const wraps = [...container.querySelectorAll('.edit-thumb-wrap')];
  for (let i = 0; i < wraps.length; i++) {
    const r = wraps[i].getBoundingClientRect();
    if (e.clientX < r.left + r.width / 2) { wraps[i].classList.add('drop-before'); break; }
  }
}

function onDragEnd(e) {
  if (!dragState) return;
  const { srcIdx, clone, srcWrap } = dragState;

  srcWrap.removeEventListener('pointermove', onDragMove);
  srcWrap.removeEventListener('pointerup',   onDragEnd);
  srcWrap.removeEventListener('pointercancel', onDragEnd);

  const container = document.getElementById('editImages');
  const wraps = [...container.querySelectorAll('.edit-thumb-wrap')];

  // Find insertion index in the original (pre-mutation) array
  let dropIdx = editImages.length; // default: end
  for (let i = 0; i < wraps.length; i++) {
    if (e.clientX < wraps[i].getBoundingClientRect().left + wraps[i].getBoundingClientRect().width / 2) {
      dropIdx = i; break;
    }
  }

  // Only mutate if the position actually changes
  const noChange = dropIdx === srcIdx || dropIdx === srcIdx + 1;
  if (!noChange) {
    const [moved] = editImages.splice(srcIdx, 1);
    editImages.splice(dropIdx > srcIdx ? dropIdx - 1 : dropIdx, 0, moved);
  }

  clone.remove();
  container.querySelectorAll('.edit-thumb-wrap').forEach(w => w.classList.remove('drop-before'));
  dragState = null;
  renderEditImages();
}

/* ── Lightbox ───────────────────────────────────────────────────────────── */

function openLightbox(itemId, idx) {
  const item = allItems.find(i => i.id === itemId);
  if (!item?.images?.length) return;
  lightboxImages = item.images;
  lightboxIdx = idx;
  renderLightbox();
  document.getElementById('lightbox').style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  document.getElementById('lightbox').style.display = 'none';
  document.body.style.overflow = '';
}

function lightboxNav(delta) {
  lightboxIdx = (lightboxIdx + delta + lightboxImages.length) % lightboxImages.length;
  renderLightbox();
}

function renderLightbox() {
  const img = lightboxImages[lightboxIdx];
  const src = getImageSrc(img);
  document.getElementById('lightboxImg').src = src;
  document.getElementById('lightboxImg').alt = img.filename || 'Image';
  const dl = document.getElementById('lightboxDownload');
  dl.href = src;
  dl.download = img.filename || 'image';
  const n = lightboxImages.length;
  const multi = n > 1;
  document.getElementById('lightboxCounter').textContent = multi ? `${lightboxIdx + 1} / ${n}` : '';
  document.getElementById('lightboxPrevBtn').style.display = multi ? '' : 'none';
  document.getElementById('lightboxNextBtn').style.display = multi ? '' : 'none';
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

function mergeItem(updated) {
  const idx = allItems.findIndex(i => i.id === updated.id);
  if (idx !== -1) allItems[idx] = updated;
  updateCounts();
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

function showToast(msg, error = false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (error ? ' error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast'; }, 3500);
}

/* ── Keyboard shortcuts ─────────────────────────────────────────────────── */

document.addEventListener('keydown', e => {
  if (document.getElementById('lightbox').style.display !== 'none') {
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') lightboxNav(-1);
    if (e.key === 'ArrowRight') lightboxNav(1);
    return;
  }
  if (e.key === 'Escape') { closeModal(); closeConfirm(); if (bulkMode) toggleBulkMode(); }
});

setupImageUpload();
setupImageDrag();
initModalCopyButtons();
init();
