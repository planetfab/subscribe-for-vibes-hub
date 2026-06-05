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

/* ── Bootstrap ──────────────────────────────────────────────────────────── */

async function init() {
  try {
    const me = await apiFetch('/api/content/me');
    const el = document.getElementById('headerUser');
    if (el) el.textContent = me.username;
  } catch {}
  await loadContent();
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

function cardHTML(item) {
  const isApproved = item.status === 'Approved';
  const dis = isApproved ? '' : 'disabled title="Approve content first"';
  const urls = (item.source_urls || '').split(',').map(u => u.trim()).filter(Boolean);
  const blurb = (item.newsletter_blurb || '').substring(0, 200);
  const blurbTrunc = (item.newsletter_blurb || '').length > 200;
  const hook = (item.linkedin_hook || '').substring(0, 180);
  const isSelected = selectedIds.has(item.id);

  return `
<div class="card${isSelected ? ' selected' : ''}" id="card-${item.id}" onclick="handleCardClick(event,'${item.id}')">
  <div class="card-checkbox"></div>
  <div class="card-header">
    <h3 class="card-title">${esc(item.piece_title || 'Untitled')}</h3>
    <span class="status-badge ${statusClass(item.status)}">${esc(item.status || 'Draft')}</span>
  </div>
  ${item.section_name ? `<div class="section-tag">${esc(item.section_name)}</div>` : ''}
  <p class="card-blurb">${esc(blurb)}${blurbTrunc ? '&hellip;' : ''}</p>
  <div class="card-meta">
    <div>
      <div class="meta-label">LinkedIn Post</div>
      <div class="meta-value">${esc(hook)}${(item.linkedin_hook||'').length > 180 ? '&hellip;' : ''}</div>
    </div>
    <div>
      <div class="meta-label">Blog Potential</div>
      <div class="meta-value">${esc(item.blog_potential || '—')}</div>
    </div>
  </div>
  ${urls.length ? `<div class="source-urls">${urls.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join('')}</div>` : ''}
  ${item.images?.length ? `<div class="card-images">${item.images.map((img, i) => `<img class="card-thumb" src="${getImageSrc(img)}" alt="${esc(img.filename || 'Image')}" onclick="openLightbox('${item.id}',${i})">`).join('')}</div>` : ''}
  ${item.created_at ? `<div class="card-date">${formatDate(item.created_at)}</div>` : ''}
  <div class="card-actions">
    <button class="btn btn-ghost btn-sm" onclick="openEdit('${item.id}')">Edit</button>
    ${item.status === 'Draft' ? `<button class="btn btn-approve btn-sm" onclick="approve('${item.id}')">Approve</button>` : ''}
    <button class="btn btn-ghost btn-sm" onclick="publishLinkedIn('${item.id}','planetfab')" ${dis}>PF LinkedIn</button>
    <button class="btn btn-ghost btn-sm" onclick="publishLinkedIn('${item.id}','fabrice')" ${dis}>Fabrice LI</button>
    <button class="btn btn-ghost btn-sm" onclick="publishLinkedIn('${item.id}','michelle')" ${dis}>Michelle LI</button>
    <button class="btn btn-ghost btn-sm" onclick="publishInstagram('${item.id}')" ${dis}>Instagram</button>
    <button class="btn btn-ghost btn-sm" onclick="markNewsletter('${item.id}')" ${dis}>Newsletter</button>
    <button class="btn btn-ghost btn-sm" onclick="saveBlog('${item.id}','fabrice')">Blog as Fabrice</button>
    <button class="btn btn-ghost btn-sm" onclick="saveBlog('${item.id}','michelle')">Blog as Michelle</button>
    <button class="btn btn-danger btn-sm" onclick="openDeleteConfirm('${item.id}')">Delete</button>
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
  // Don't trigger on button clicks inside the card
  if (e.target.closest('.card-actions')) return;
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

function openConfirm(title, message, onConfirm) {
  document.getElementById('confirmTitle').textContent = title;
  document.getElementById('confirmMessage').textContent = message;
  document.getElementById('confirmBtn').onclick = () => { closeConfirm(); onConfirm(); };
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
  const bpField = document.getElementById('editBlogPotential');
  bpField.value = item.blog_potential || '';
  document.getElementById('editSourceUrls').value = item.source_urls || '';
  document.getElementById('editStatus').value = item.status || 'Draft';
  editImages = [...(item.images || [])];
  renderEditImages();
  updateBlurbCount();
  document.getElementById('editModal').style.display = 'flex';
  // Auto-size blog potential after the modal is painted — scrollHeight is 0 while display:none
  requestAnimationFrame(() => {
    bpField.style.height = 'auto';
    bpField.style.height = bpField.scrollHeight + 'px';
  });
  document.getElementById('editPieceTitle').focus();
}

function renderEditImages() {
  const section = document.getElementById('editImagesSection');
  const container = document.getElementById('editImages');
  if (!editImages.length) {
    section.style.display = 'none';
    container.innerHTML = '';
    return;
  }
  section.style.display = '';
  container.className = `edit-images${editImages.length > 1 ? ' reorderable' : ''}`;
  container.innerHTML = editImages.map((img, i) => `
    <div class="edit-thumb-wrap" data-idx="${i}">
      <img class="card-thumb" src="${getImageSrc(img)}" alt="${esc(img.filename || 'Image')}">
      <span class="hero-badge">Hero</span>
      <button type="button" class="edit-thumb-remove" onclick="removeEditImage(${i})" aria-label="Remove image">&times;</button>
    </div>
  `).join('');
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

// Real-time auto-grow for Blog Potential textarea
document.getElementById('editBlogPotential')?.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
});

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
    images: editImages,
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
  const labels = { planetfab: 'PlanetFab LinkedIn', fabrice: "Fabrice's LinkedIn", michelle: "Michelle's LinkedIn" };
  showToast(`Publishing to ${labels[type]}…`);
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

async function saveBlog(id, author) {
  const label = author === 'michelle' ? "Michelle's" : "Fabrice's";
  showToast(`Saving draft to WordPress as ${label} account…`);
  try {
    const result = await apiFetch(`/api/publish/blog/${author}/${id}`, { method: 'POST' });
    showToast(`Draft saved to planetfab.com (${label} byline)`);
    if (result.editUrl) {
      setTimeout(() => window.open(result.editUrl, '_blank'), 600);
    }
  } catch (err) {
    showToast(err.message || 'WordPress save failed', true);
  }
}

async function checkEmail() {
  const btn = document.getElementById('checkEmailBtn');
  // Lock current width so the button never shrinks during state changes
  btn.style.minWidth = btn.offsetWidth + 'px';
  btn.disabled = true;
  btn.dataset.state = 'loading';

  let processed = 0;
  let isError = false;

  try {
    const result = await apiFetch('/api/content/check-email', { method: 'POST' });
    processed = result.processed;
    await loadContent();
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
  }, 2500);
}

/* ── Edit-modal image drag-to-reorder ───────────────────────────────────── */

let dragState = null;

function setupImageDrag() {
  document.getElementById('editImages').addEventListener('pointerdown', startDrag);
}

function startDrag(e) {
  const wrap = e.target.closest('.edit-thumb-wrap');
  // Ignore taps on the remove button; ignore if not in reorderable mode
  if (!wrap || e.target.closest('.edit-thumb-remove')) return;
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

setupImageDrag();
init();
