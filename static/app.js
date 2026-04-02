// ===== State =====
let contacts = [];
let selectedIds = new Set();
let currentFilter = 'all';
let currentSort = 'name';
let sortDir = 1; // 1 = asc, -1 = desc
let detailContactId = null;
let deleteTargetId = null;

let todos = [];
let projects = [];
let editProjectId = null;
let projectCollabIds = [];
let editingTodoId = null;
let currentPage = 'contacts';

const today = new Date().toISOString().split('T')[0];

// ===== API + Refresh =====

async function refresh() {
  await Promise.all([fetchContacts(), fetchStats(), fetchTodos(), fetchProjects()]);
  await syncCRMTodos();
  renderRecentlyAdded();
  if (currentPage === 'todos') renderTodos();
  if (currentPage === 'projects') renderProjects();
}

// ===== Page Navigation =====

function el(id) { return document.getElementById(id); }

function setPage(page) {
  currentPage = page;
  el('navContacts').classList.toggle('active', page === 'contacts');
  el('navTodos').classList.toggle('active', page === 'todos');
  el('navProjects')?.classList.toggle('active', page === 'projects');
  el('contactsPage').style.display = page === 'contacts' ? '' : 'none';
  el('todoPage').style.display = page === 'todos' ? '' : 'none';
  if (el('projectsPage')) el('projectsPage').style.display = page === 'projects' ? '' : 'none';
  el('headerImport').style.display = page === 'contacts' ? '' : 'none';
  el('headerExport').style.display = page === 'contacts' ? '' : 'none';
  el('headerAdd').style.display = page === 'contacts' ? '' : 'none';
  el('headerAddTask').style.display = page === 'todos' ? '' : 'none';
  if (el('headerAddProject')) el('headerAddProject').style.display = page === 'projects' ? '' : 'none';
  if (page === 'todos') renderTodos();
  if (page === 'projects') renderProjects();
}

async function fetchContacts() {
  const res = await fetch('/api/contacts');
  contacts = await res.json();
  renderContacts();
  // Refresh detail panel if open
  if (detailContactId) {
    const c = contacts.find(x => x.id === detailContactId);
    if (c) renderDetailPanel(c);
    else closeDetail();
  }
}

async function fetchStats() {
  const res = await fetch('/api/stats');
  const stats = await res.json();
  document.getElementById('statTotal').textContent = stats.total;
  document.getElementById('statDue').textContent = stats.due_today;

  const dueCard = document.getElementById('statDueCard');
  if (stats.due_today > 0) {
    dueCard.style.borderLeft = '3px solid var(--red)';
  } else {
    dueCard.style.borderLeft = '';
  }

  // Severity breakdown
  const sevEl = document.getElementById('statSeverity');
  const chips = [];
  if (stats.due_mild > 0) chips.push(`<span class="sev-chip mild">${stats.due_mild} mild</span>`);
  if (stats.due_moderate > 0) chips.push(`<span class="sev-chip moderate">${stats.due_moderate} moderate</span>`);
  if (stats.due_severe > 0) chips.push(`<span class="sev-chip severe">${stats.due_severe} severe</span>`);
  sevEl.innerHTML = chips.join('');
}

// ===== Recently Added =====

function renderRecentlyAdded() {
  const withDate = contacts.filter(c => c.created_at);
  const recent = [...withDate].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 5);
  const section = document.getElementById('recentSection');
  const strip = document.getElementById('recentStrip');

  if (recent.length === 0) {
    section.style.display = 'none';
    return;
  }

  section.style.display = 'block';
  strip.innerHTML = recent.map(c => {
    const initials = getInitials(c.name);
    const avatarClass = getAvatarClass(c);
    return `
      <div class="recent-mini-card" onclick="openDetail('${c.id}')" title="${escHtml(c.name)}">
        <div class="avatar ${avatarClass}" style="width:38px;height:38px;font-size:13px">${initials}</div>
        <div class="recent-mini-name">${escHtml(c.name.split(' ')[0])}</div>
      </div>
    `;
  }).join('');
}

// ===== Filter / Sort helpers =====

function getFilteredSorted() {
  const search = document.getElementById('searchInput').value.toLowerCase();

  let filtered = contacts.filter(c => {
    const matchesSearch =
      c.name.toLowerCase().includes(search) ||
      (c.email || '').toLowerCase().includes(search) ||
      (c.phone || '').toLowerCase().includes(search) ||
      (c.notes || '').toLowerCase().includes(search);

    if (!matchesSearch) return false;

    if (currentFilter === 'due') {
      return c.next_contact_reminder && c.next_contact_reminder <= today;
    }
    return true;
  });

  filtered.sort((a, b) => {
    const va = (a[currentSort] || '').toLowerCase();
    const vb = (b[currentSort] || '').toLowerCase();
    if (va < vb) return -sortDir;
    if (va > vb) return sortDir;
    return 0;
  });

  return filtered;
}

function setSort(col) {
  if (currentSort === col) {
    sortDir = -sortDir;
  } else {
    currentSort = col;
    sortDir = 1;
  }
  updateSortHeaders();
  renderContacts();
}

function updateSortHeaders() {
  ['name', 'last_contacted', 'next_contact_reminder'].forEach(col => {
    const th = document.getElementById(`th-${col}`);
    if (!th) return;
    const ind = th.querySelector('.sort-indicator');
    if (!ind) return;
    if (currentSort === col) {
      ind.textContent = sortDir === 1 ? ' ▲' : ' ▼';
      ind.classList.add('active');
      th.classList.add('sort-active');
    } else {
      ind.textContent = ' ⇅';
      ind.classList.remove('active');
      th.classList.remove('sort-active');
    }
  });
}

function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  btn.classList.add('active');
  renderContacts();
}

// ===== Table Rendering =====

function renderContacts() {
  renderTable();
  updateBulkBar();
  updateSortHeaders();
}

function renderTable() {
  const filtered = getFilteredSorted();
  const tbody = document.getElementById('contactBody');
  const empty = document.getElementById('emptyState');
  const table = document.getElementById('contactTable');

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    table.style.display = 'none';
    empty.style.display = 'block';
    return;
  }

  table.style.display = '';
  empty.style.display = 'none';

  tbody.innerHTML = filtered.map(c => {
    const sev = getOverdueSeverity(c);
    const rowClass = sev ? `row-${sev}` : '';
    const initials = getInitials(c.name);
    const avatarClass = getAvatarClass(c);
    const isSelected = selectedIds.has(c.id);

    const reminderCell = buildReminderCell(c);

    return `
      <tr class="${rowClass}" data-id="${c.id}" onclick="openDetail('${c.id}')">
        <td class="col-check" onclick="event.stopPropagation()">
          <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="toggleSelect('${c.id}', this)" />
        </td>
        <td>
          <div class="contact-name">
            <div class="avatar ${avatarClass}">${initials}</div>
            <span>${escHtml(c.name)}</span>
          </div>
        </td>
        <td>${c.company ? escHtml(c.company) : '<span class="text-muted">—</span>'}</td>
        <td>${renderTagChips(c.tags)}${(() => { const p = c.project_id && projects.find(x => x.id === c.project_id); return p ? `<span class="proj-task-badge">${escHtml(p.title)}</span>` : ''; })()}</td>
        <td>${c.last_contacted ? formatDate(c.last_contacted) : '<span class="text-muted">—</span>'}</td>
        <td>${reminderCell}</td>
        <td>
          <div class="action-btns">
            <button class="action-btn log" title="Log interaction" onclick="quickLog('${c.id}', event)">✓</button>
            ${sev ? `<button class="action-btn snooze" title="Snooze 1 week" onclick="snoozeContact('${c.id}', event)">z</button>` : ''}
            <button class="action-btn edit" title="Edit" onclick="openEdit('${c.id}', event)">✏️</button>
            <button class="action-btn delete" title="Delete" onclick="openDelete('${c.id}', '${escHtml(c.name)}', event)">🗑</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  // Sync select-all checkbox
  const allIds = filtered.map(c => c.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
  document.getElementById('selectAll').checked = allSelected;
}


function buildReminderCell(c) {
  if (!c.next_contact_reminder) return '<span class="text-muted">—</span>';
  const sev = getOverdueSeverity(c);
  if (sev) {
    return `<span class="due-badge due-${sev}"><span class="due-dot"></span>${formatDate(c.next_contact_reminder)}</span>`;
  }
  return formatDate(c.next_contact_reminder);
}


// ===== Detail Panel =====

function openDetail(id) {
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  detailContactId = id;
  renderDetailPanel(c);
  document.getElementById('detailPanel').classList.add('open');
  document.getElementById('detailBackdrop').classList.add('open');
  document.getElementById('dpEditBtn').onclick = () => { closeDetail(); openEdit(id); };
}

function closeDetail() {
  detailContactId = null;
  document.getElementById('detailPanel').classList.remove('open');
  document.getElementById('detailBackdrop').classList.remove('open');
}

function renderDetailPanel(c) {
  const initials = getInitials(c.name);
  const avatarClass = getAvatarClass(c);
  const sev = getOverdueSeverity(c);

  // Header
  const dpAvatar = document.getElementById('dpAvatar');
  dpAvatar.className = `detail-avatar ${avatarClass}`;
  dpAvatar.textContent = initials;

  document.getElementById('dpName').textContent = c.name;

  const badges = [];
  if (sev) badges.push(`<span class="due-badge due-${sev}">Overdue</span>`);
  document.getElementById('dpBadges').innerHTML = badges.join('');

  // Body
  const interactions = (c.interactions || []).slice().sort((a, b) => b.date.localeCompare(a.date));

  const linkedinVal = c.linkedin
    ? `<a href="${escHtml(c.linkedin)}" target="_blank" rel="noopener noreferrer" style="color:var(--accent)">${escHtml(c.linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//, '').replace(/\/$/, ''))}</a>`
    : '—';

  const infoRows = [
    { icon: '✉', label: 'Email', val: c.email ? `<a href="mailto:${escHtml(c.email)}" style="color:var(--accent)">${escHtml(c.email)}</a>` : '—' },
    { icon: '📞', label: 'Phone', val: c.phone ? escHtml(c.phone) : '—' },
    { icon: '🏢', label: 'Company', val: c.company ? escHtml(c.company) : '—' },
    { icon: '🔗', label: 'LinkedIn', val: linkedinVal },
    { icon: '🏷', label: 'Tags', val: c.tags ? renderTagChips(c.tags) : '—' },
    { icon: '◈', label: 'Project', val: (() => { const p = c.project_id && projects.find(x => x.id === c.project_id); return p ? `<span class="proj-task-badge">${escHtml(p.title)}</span>` : '—'; })() },
    { icon: '🕐', label: 'Last contact', val: c.last_contacted ? formatDate(c.last_contacted) : '—' },
    { icon: '🔔', label: 'Next reminder', val: c.next_contact_reminder ? formatDate(c.next_contact_reminder) : '—' },
    { icon: '🔁', label: 'Cadence', val: c.cadence_days ? `Every ${c.cadence_days} days` : '—' },
    { icon: '📅', label: 'Added', val: c.created_at ? formatDate(c.created_at) : '—' },
  ];

  const interactionsHtml = interactions.length === 0
    ? '<div class="no-interactions">No interactions logged yet</div>'
    : interactions.map(i => `
        <div class="interaction-entry">
          <div class="interaction-content">
            <div class="interaction-date">${formatDate(i.date)}</div>
            ${i.note ? `<div class="interaction-note">${escHtml(i.note)}</div>` : ''}
          </div>
          <button class="interaction-delete" title="Delete" onclick="deleteInteraction('${c.id}', '${i.id}')">×</button>
        </div>
      `).join('');

  document.getElementById('detailBody').innerHTML = `
    <div class="detail-section">
      <div class="detail-section-title">Contact Info</div>
      ${infoRows.map(r => `
        <div class="detail-info-row">
          <div class="detail-info-icon">${r.icon}</div>
          <div class="detail-info-label">${r.label}</div>
          <div class="detail-info-val">${r.val}</div>
        </div>
      `).join('')}
    </div>

    ${c.notes ? `
    <div class="detail-section">
      <div class="detail-section-title">Notes</div>
      <div class="detail-notes">${escHtml(c.notes)}</div>
    </div>
    ` : ''}

    <div class="detail-section">
      <div class="detail-section-title" style="display:flex;align-items:center;justify-content:space-between">
        <span>Log Interaction</span>
      </div>
      <div class="log-form" id="dpLogForm">
        <textarea id="dpLogNote" class="form-input" placeholder="Optional note…" rows="2"></textarea>
        <div class="log-form-actions">
          <button class="btn btn-success btn-sm" onclick="submitLog('${c.id}')">✓ Log Today</button>
          ${sev ? `<button class="btn btn-ghost btn-sm" onclick="snoozeContact('${c.id}')">⏱ Snooze 1 week</button>` : ''}
        </div>
      </div>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">
        Interaction History
        ${interactions.length > 0 ? `<span style="color:var(--text-muted);font-weight:400;text-transform:none;letter-spacing:0">(${interactions.length})</span>` : ''}
      </div>
      ${interactionsHtml}
    </div>
  `;
}

// ===== Snooze =====

async function snoozeContact(id, e) {
  if (e) e.stopPropagation();
  const res = await fetch(`/api/contacts/${id}/snooze`, { method: 'POST' });
  if (res.ok) await refresh();
}

// ===== Log Interaction =====

async function quickLog(id, e) {
  if (e) e.stopPropagation();
  const res = await fetch(`/api/contacts/${id}/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note: '' }),
  });
  if (res.ok) {
    await refresh();
  } else {
    alert('Error logging interaction.');
  }
}

async function submitLog(id) {
  const noteEl = document.getElementById('dpLogNote');
  const note = noteEl ? noteEl.value.trim() : '';
  const res = await fetch(`/api/contacts/${id}/interactions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  if (res.ok) {
    if (noteEl) noteEl.value = '';
    await refresh();
  } else {
    alert('Error logging interaction.');
  }
}

async function deleteInteraction(contactId, interactionId) {
  const res = await fetch(`/api/contacts/${contactId}/interactions/${interactionId}`, { method: 'DELETE' });
  if (res.ok) {
    await refresh();
  } else {
    alert('Error deleting interaction.');
  }
}

// ===== Bulk Actions =====

function toggleSelectAll(el) {
  const filtered = getFilteredSorted();
  if (el.checked) {
    filtered.forEach(c => selectedIds.add(c.id));
  } else {
    filtered.forEach(c => selectedIds.delete(c.id));
  }
  renderContacts();
  updateBulkBar();
}

function toggleSelect(id, el) {
  if (el.checked) {
    selectedIds.add(id);
  } else {
    selectedIds.delete(id);
  }
  updateBulkBar();
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  const count = selectedIds.size;
  if (count > 0) {
    bar.classList.add('visible');
    document.getElementById('bulkCount').textContent = `${count} selected`;
  } else {
    bar.classList.remove('visible');
  }
}

function clearSelection() {
  selectedIds.clear();
  renderContacts();
  updateBulkBar();
}

async function deleteSelected() {
  if (selectedIds.size === 0) return;
  const count = selectedIds.size;
  if (!confirm(`Delete ${count} contact${count > 1 ? 's' : ''}? This cannot be undone.`)) return;
  const res = await fetch('/api/contacts/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: [...selectedIds] }),
  });
  if (res.ok) {
    selectedIds.clear();
    await refresh();
  } else {
    alert('Error deleting contacts.');
  }
}

function exportSelected() {
  const filtered = getFilteredSorted();
  const selected = filtered.filter(c => selectedIds.has(c.id));
  if (selected.length === 0) return;
  exportToCSV(selected, 'selected_contacts.csv');
}

// ===== Import / Export =====

function exportContacts() {
  window.location.href = '/api/contacts/export';
}

function exportToCSV(data, filename) {
  const headers = ['id','name','email','phone','linkedin','company','tags','notes','last_contacted','next_contact_reminder','cadence_days','created_at'];
  const rows = data.map(c => headers.map(h => {
    const val = c[h] === null || c[h] === undefined ? '' : String(c[h]);
    return '"' + val.replace(/"/g, '""') + '"';
  }).join(','));
  const csv = [headers.join(','), ...rows].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadImportTemplate() {
  const headers = ['name','email','phone','linkedin','tags','notes','last_contacted','next_contact_reminder','cadence_days'];
  const example = ['Jane Smith','jane@example.com','+1 555 000 0001','https://linkedin.com/in/janesmith','investor, advisor','Met at conference','2025-03-01','2025-04-01','30'];
  const csv = [headers.join(','), example.map(v => `"${v}"`).join(',')].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'crm_import_template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function openHelp() {
  document.getElementById('helpOverlay').classList.add('open');
}

function closeHelp(event) {
  if (event && event.target !== document.getElementById('helpOverlay')) return;
  document.getElementById('helpOverlay').classList.remove('open');
}

function openImport() {
  document.getElementById('importStatus').textContent = '';
  document.getElementById('importStatus').className = 'import-status';
  document.getElementById('fileInput').value = '';
  document.getElementById('importOverlay').classList.add('open');
}

function closeImport(event) {
  if (event && event.target !== document.getElementById('importOverlay')) return;
  document.getElementById('importOverlay').classList.remove('open');
}

function dragOver(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.add('drag-over');
}

function dragLeave(_e) {
  document.getElementById('dropZone').classList.remove('drag-over');
}

function dropFile(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) importFile(file);
}

function handleFileInput(input) {
  if (input.files[0]) importFile(input.files[0]);
}

async function importFile(file) {
  const statusEl = document.getElementById('importStatus');
  statusEl.textContent = 'Importing…';
  statusEl.className = 'import-status';

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch('/api/contacts/import', { method: 'POST', body: formData });
    const data = await res.json();
    if (res.ok) {
      statusEl.textContent = `Imported ${data.imported} contact${data.imported !== 1 ? 's' : ''}${data.skipped > 0 ? `, skipped ${data.skipped}` : ''}.`;
      statusEl.className = 'import-status success';
      await refresh();
    } else {
      statusEl.textContent = 'Import failed: ' + (data.detail || 'Unknown error');
      statusEl.className = 'import-status error';
    }
  } catch (err) {
    statusEl.textContent = 'Import error: ' + err.message;
    statusEl.className = 'import-status error';
  }
}

// ===== Add / Edit Modal =====

function populateProjectSelect(selectId, selectedId) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const current = selectedId || '';
  sel.innerHTML = `<option value="">No project</option>` +
    projects.map(p => `<option value="${p.id}"${p.id === current ? ' selected' : ''}>${escHtml(p.title)}</option>`).join('');
}

function openModal() {
  document.getElementById('modalTitle').textContent = 'Add Contact';
  document.getElementById('submitBtn').textContent = 'Save Contact';
  document.getElementById('contactForm').reset();
  document.getElementById('contactId').value = '';
  populateProjectSelect('fproject', '');
  document.getElementById('modalOverlay').classList.add('open');
}

function openEdit(id, e) {
  if (e) e.stopPropagation();
  const c = contacts.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modalTitle').textContent = 'Edit Contact';
  document.getElementById('submitBtn').textContent = 'Update Contact';
  document.getElementById('contactId').value = c.id;
  document.getElementById('fname').value = c.name || '';
  document.getElementById('femail').value = c.email || '';
  document.getElementById('fphone').value = c.phone || '';
  document.getElementById('flinkedin').value = c.linkedin || '';
  document.getElementById('fcompany').value = c.company || '';
  document.getElementById('ftags').value = c.tags || '';
  document.getElementById('fcadence').value = c.cadence_days || '';
  document.getElementById('flast').value = c.last_contacted || '';
  document.getElementById('fnext').value = c.next_contact_reminder || '';
  document.getElementById('fnotes').value = c.notes || '';
  populateProjectSelect('fproject', c.project_id || '');
  document.getElementById('modalOverlay').classList.add('open');
}

function autoFillReminder() {
  const cadence = parseInt(document.getElementById('fcadence').value, 10);
  const nextEl = document.getElementById('fnext');
  if (!cadence || cadence < 1) return;
  const lastVal = document.getElementById('flast').value;
  // Require last_contacted — don't silently default to today
  if (!lastVal) return;
  const d = new Date(lastVal + 'T00:00:00');
  d.setDate(d.getDate() + cadence);
  // Use local date parts to avoid UTC offset shifting the day
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  nextEl.value = `${yyyy}-${mm}-${dd}`;
}

function closeModal(event) {
  if (event && event.target !== document.getElementById('modalOverlay')) return;
  document.getElementById('modalOverlay').classList.remove('open');
}

async function submitContact(e) {
  e.preventDefault();
  const id = document.getElementById('contactId').value;
  const cadenceVal = document.getElementById('fcadence').value;
  const payload = {
    name: document.getElementById('fname').value.trim(),
    email: document.getElementById('femail').value.trim(),
    phone: document.getElementById('fphone').value.trim(),
    linkedin: document.getElementById('flinkedin').value.trim(),
    company: document.getElementById('fcompany').value.trim(),
    tags: document.getElementById('ftags').value.trim(),
    cadence_days: cadenceVal ? parseInt(cadenceVal, 10) : null,
    last_contacted: document.getElementById('flast').value,
    next_contact_reminder: document.getElementById('fnext').value,
    notes: document.getElementById('fnotes').value.trim(),
    project_id: document.getElementById('fproject').value || null,
  };

  const url = id ? `/api/contacts/${id}` : '/api/contacts';
  const method = id ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.ok) {
    document.getElementById('modalOverlay').classList.remove('open');
    await refresh();
  } else if (res.status === 409) {
    const data = await res.json();
    alert(data.detail || 'A contact with this name already exists.');
  } else {
    alert('Error saving contact. Please try again.');
  }
}

// ===== Delete Modal =====

function openDelete(id, name, e) {
  if (e) e.stopPropagation();
  deleteTargetId = id;
  document.getElementById('deleteName').textContent = name;
  document.getElementById('deleteOverlay').classList.add('open');
}

function closeDelete(event) {
  if (event && event.target !== document.getElementById('deleteOverlay')) return;
  document.getElementById('deleteOverlay').classList.remove('open');
  deleteTargetId = null;
}

async function confirmDelete() {
  if (!deleteTargetId) return;
  const res = await fetch(`/api/contacts/${deleteTargetId}`, { method: 'DELETE' });
  if (res.ok) {
    document.getElementById('deleteOverlay').classList.remove('open');
    if (detailContactId === deleteTargetId) closeDetail();
    deleteTargetId = null;
    await refresh();
  } else {
    alert('Error deleting contact.');
  }
}


// ===== Helpers =====

function getOverdueSeverity(c) {
  if (!c.next_contact_reminder || c.next_contact_reminder > today) return null;
  const r = new Date(c.next_contact_reminder + 'T00:00:00');
  const t = new Date(today + 'T00:00:00');
  const daysOverdue = Math.floor((t - r) / 86400000);
  if (daysOverdue <= 7) return 'mild';
  if (daysOverdue <= 28) return 'moderate';
  return 'severe';
}


function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const date = new Date(Number(y), Number(m) - 1, Number(d));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

function renderTagChips(tags) {
  if (!tags) return '';
  return tags.split(',').map(t => t.trim()).filter(Boolean)
    .map(t => `<span class="tag-chip">${escHtml(t)}</span>`).join('');
}

function getInitials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

function getAvatarClass(c) {
  const colors = ['avatar-a', 'avatar-b', 'avatar-c', 'avatar-d', 'avatar-e', 'avatar-personal'];
  const code = (c.name || '').charCodeAt(0) || 0;
  return colors[code % colors.length];
}

// ===== Keyboard Shortcuts =====

document.addEventListener('click', e => {
  const dd = document.getElementById('collabDropdown');
  if (dd && !dd.contains(e.target) && e.target.id !== 'collabSearch') {
    dd.style.display = 'none';
  }
});

document.addEventListener('keydown', e => {
  const tag = document.activeElement.tagName.toLowerCase();
  const isInput = tag === 'input' || tag === 'textarea' || tag === 'select';

  if (e.key === 'Escape') {
    if (document.getElementById('modalOverlay').classList.contains('open')) {
      document.getElementById('modalOverlay').classList.remove('open');
    } else if (document.getElementById('deleteOverlay').classList.contains('open')) {
      document.getElementById('deleteOverlay').classList.remove('open');
    } else if (document.getElementById('importOverlay').classList.contains('open')) {
      document.getElementById('importOverlay').classList.remove('open');
    } else if (document.getElementById('helpOverlay').classList.contains('open')) {
      document.getElementById('helpOverlay').classList.remove('open');
    } else if (document.getElementById('projectModalOverlay').classList.contains('open')) {
      document.getElementById('projectModalOverlay').classList.remove('open');
    } else if (editingTodoId) {
      cancelTodoEdit();
    } else if (detailContactId) {
      closeDetail();
    }
    return;
  }

  if (isInput) return;

  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    if (currentPage === 'todos') showKanbanInput('todo');
    else if (currentPage === 'projects') openProjectModal();
    else openModal();
  }

  if (e.key === '/') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
    document.getElementById('searchInput').select();
  }
});

// ===== CRM → Todo Sync =====

async function syncCRMTodos() {
  const overdue = contacts.filter(c => c.next_contact_reminder && c.next_contact_reminder <= today);
  const crmTodos = todos.filter(t => t.contact_id);
  const overdueIds = new Set(overdue.map(c => c.id));
  const todoContactIds = new Set(crmTodos.map(t => t.contact_id));

  const ops = [];

  // Create todos for newly overdue contacts
  for (const c of overdue) {
    if (!todoContactIds.has(c.id)) {
      ops.push(fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: `Connect with ${c.name}`, status: 'todo', contact_id: c.id, project_id: c.project_id || null }),
      }));
    }
  }

  // Remove todos for contacts no longer overdue (leave completed ones in place)
  for (const t of crmTodos) {
    if (!overdueIds.has(t.contact_id) && t.status !== 'complete') {
      ops.push(fetch(`/api/todos/${t.id}`, { method: 'DELETE' }));
    }
  }

  if (ops.length > 0) {
    await Promise.all(ops);
    await fetchTodos();
  }
}

// ===== Todos / Kanban =====

let dragTodoId = null;
const KANBAN_COLS = ['todo', 'active', 'complete'];

async function fetchTodos() {
  const res = await fetch('/api/todos');
  const raw = await res.json();
  todos = raw.map(t => {
    // Migrate old schema
    if (!t.status) t.status = t.completed ? 'complete' : 'todo';
    // Migrate old 'doing'/'done' values
    if (t.status === 'doing') t.status = 'active';
    if (t.status === 'done') t.status = 'complete';
    return t;
  });
}

function renderTodos() {
  if (currentPage !== 'todos') return;
  const cols = { todo: [], active: [], complete: [] };
  todos.forEach(t => { if (cols[t.status]) cols[t.status].push(t); });

  KANBAN_COLS.forEach(status => {
    cols[status].sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity));
    document.getElementById(`count-${status}`).textContent = cols[status].length;
    document.getElementById(`cards-${status}`).innerHTML = cols[status].map(t => {
      // Edit mode
      if (editingTodoId === t.id) {
        const projectOptions = projects.map(p =>
          `<option value="${p.id}"${t.project_id === p.id ? ' selected' : ''}>${escHtml(p.title)}</option>`
        ).join('');
        return `
          <div class="kanban-card kanban-card-editing" data-id="${t.id}">
            <textarea class="kanban-textarea" id="edit-title-${t.id}" rows="2"
              onkeydown="if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();saveTodoEdit('${t.id}')}if(event.key==='Escape')cancelTodoEdit()"
            >${escHtml(t.title)}</textarea>
            <select class="kanban-edit-select" id="edit-project-${t.id}">
              <option value="">No project</option>
              ${projectOptions}
            </select>
            <div class="kanban-input-actions">
              <button class="btn btn-primary btn-sm" onclick="saveTodoEdit('${t.id}')">Save</button>
              <button class="kanban-input-cancel" onclick="cancelTodoEdit()">✕</button>
            </div>
          </div>
        `;
      }
      // Normal card
      const crmBadge = t.contact_id ? `<span class="crm-badge">CRM</span>` : '';
      const proj = t.project_id ? projects.find(p => p.id === t.project_id) : null;
      const projBadge = proj ? `<span class="proj-task-badge">${escHtml(proj.title)}</span>` : '';
      const badges = (crmBadge || projBadge) ? `<div class="kanban-card-badges">${crmBadge}${projBadge}</div>` : '';
      return `
        <div class="kanban-card" draggable="true" data-id="${t.id}"
             ondragstart="kanbanDragStart(event,'${t.id}')"
             ondragend="kanbanDragEnd(event)"
             ondragover="cardDragOver(event)"
             ondragleave="cardDragLeave(event)"
             ondrop="cardDrop(event,'${status}')">
          <div class="kanban-card-main">
            ${badges}
            <span class="kanban-card-title">${escHtml(t.title)}</span>
          </div>
          <div class="kanban-card-btns">
            <button class="kanban-card-edit" onclick="startTodoEdit('${t.id}')" title="Edit">✎</button>
            <button class="kanban-card-delete" onclick="deleteTodo('${t.id}')" title="Delete">✕</button>
          </div>
        </div>
      `;
    }).join('');
  });
}

// Add card UI
function showKanbanInput(status) {
  document.getElementById(`inputbox-${status}`).style.display = 'block';
  document.querySelector(`#addwrap-${status} .kanban-add-btn`)?.style.setProperty('display', 'none');
  document.getElementById(`input-${status}`).focus();
}

function hideKanbanInput(status) {
  document.getElementById(`inputbox-${status}`).style.display = 'none';
  document.querySelector(`#addwrap-${status} .kanban-add-btn`)?.style.setProperty('display', '');
  document.getElementById(`input-${status}`).value = '';
}

function kanbanInputKey(e, status) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); kanbanAddCard(status); }
  if (e.key === 'Escape') hideKanbanInput(status);
}

async function kanbanAddCard(status) {
  const title = document.getElementById(`input-${status}`).value.trim();
  if (!title) return;
  const res = await fetch('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, status }),
  });
  if (res.ok) {
    hideKanbanInput(status);
    await fetchTodos();
    renderTodos();
  }
}

async function moveTodo(id, status) {
  const t = todos.find(x => x.id === id);
  if (!t) return;
  if (t.status !== status) {
    await fetch(`/api/todos/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: t.title, status, contact_id: t.contact_id || null, project_id: t.project_id || null }),
    });
  }
  // Append to end of target column
  const colIds = todos
    .filter(x => x.id !== id && x.status === status)
    .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity))
    .map(x => x.id);
  colIds.push(id);
  await reorderTodos(colIds);
}

function startTodoEdit(id) {
  editingTodoId = id;
  renderTodos();
  const ta = document.getElementById(`edit-title-${id}`);
  if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

async function saveTodoEdit(id) {
  const t = todos.find(x => x.id === id);
  if (!t) return;
  const title = (document.getElementById(`edit-title-${id}`)?.value ?? '').trim();
  if (!title) return;
  const project_id = document.getElementById(`edit-project-${id}`)?.value || null;
  await fetch(`/api/todos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, status: t.status, contact_id: t.contact_id || null, project_id }),
  });
  editingTodoId = null;
  await fetchTodos();
  renderTodos();
}

function cancelTodoEdit() {
  editingTodoId = null;
  renderTodos();
}

async function deleteTodo(id) {
  const t = todos.find(x => x.id === id);
  if (t && t.contact_id) {
    // CRM task: snooze contact and move to complete rather than deleting
    await fetch(`/api/contacts/${t.contact_id}/snooze`, { method: 'POST' });
    await moveTodo(id, 'complete');
  } else {
    await fetch(`/api/todos/${id}`, { method: 'DELETE' });
    await fetchTodos();
    renderTodos();
  }
}

async function archiveColumn(status) {
  const toDelete = todos.filter(t => t.status === status);
  if (toDelete.length === 0) return;
  if (!confirm(`Archive all ${toDelete.length} item${toDelete.length > 1 ? 's' : ''} in this column?`)) return;
  // Snooze any linked contacts so CRM todos don't immediately reappear
  const snoozeOps = toDelete
    .filter(t => t.contact_id)
    .map(t => fetch(`/api/contacts/${t.contact_id}/snooze`, { method: 'POST' }));
  await Promise.all([
    ...snoozeOps,
    ...toDelete.map(t => fetch(`/api/todos/${t.id}`, { method: 'DELETE' })),
  ]);
  await fetchTodos();
  renderTodos();
}

// Drag and drop
function kanbanDragStart(event, id) {
  if (editingTodoId) { event.preventDefault(); return; }
  dragTodoId = id;
  event.dataTransfer.effectAllowed = 'move';
  setTimeout(() => event.target.classList.add('dragging'), 0);
}

function kanbanDragEnd(event) {
  event.target.classList.remove('dragging');
}

function kanbanDragOver(event) {
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  // Highlight only the cards area, not the whole col
  const col = event.currentTarget;
  if (!col.classList.contains('drag-over')) col.classList.add('drag-over');
}

function kanbanDragLeave(event) {
  // Only remove if leaving the column entirely
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('drag-over');
  }
}

function kanbanDrop(event, status) {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  if (dragTodoId) { moveTodo(dragTodoId, status); }
  dragTodoId = null;
}

function cardDragOver(event) {
  event.preventDefault();
  event.stopPropagation();
  const card = event.currentTarget;
  if (card.dataset.id === dragTodoId) return;
  const mid = card.getBoundingClientRect().top + card.getBoundingClientRect().height / 2;
  card.classList.toggle('drop-above', event.clientY < mid);
  card.classList.toggle('drop-below', event.clientY >= mid);
}

function cardDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('drop-above', 'drop-below');
  }
}

async function cardDrop(event, status) {
  event.preventDefault();
  event.stopPropagation();
  const targetCard = event.currentTarget;
  targetCard.classList.remove('drop-above', 'drop-below');
  if (!dragTodoId || dragTodoId === targetCard.dataset.id) { dragTodoId = null; return; }

  const insertBefore = event.clientY < targetCard.getBoundingClientRect().top + targetCard.getBoundingClientRect().height / 2;

  // Get current DOM order for this column
  const ids = [...targetCard.parentElement.querySelectorAll('.kanban-card')].map(el => el.dataset.id);
  // Remove dragged id from wherever it is
  const fi = ids.indexOf(dragTodoId);
  if (fi !== -1) ids.splice(fi, 1);
  // Insert relative to target
  const ti = ids.indexOf(targetCard.dataset.id);
  ids.splice(insertBefore ? ti : ti + 1, 0, dragTodoId);

  // If moving to a different column, update status first
  const dragged = todos.find(t => t.id === dragTodoId);
  if (dragged && dragged.status !== status) {
    await fetch(`/api/todos/${dragTodoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: dragged.title, status, contact_id: dragged.contact_id || null, project_id: dragged.project_id || null }),
    });
  }

  await reorderTodos(ids);
  dragTodoId = null;
}

async function reorderTodos(orderedIds) {
  await fetch('/api/todos/reorder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ordered_ids: orderedIds }),
  });
  await fetchTodos();
  renderTodos();
}

// ===== Projects =====

async function fetchProjects() {
  try {
    const res = await fetch('/api/projects');
    if (!res.ok) return;
    const data = await res.json();
    if (Array.isArray(data)) projects = data;
  } catch (e) { /* server not yet restarted */ }
}

function renderProjects() {
  if (currentPage !== 'projects') return;
  const grid = document.getElementById('projectsGrid');
  const empty = document.getElementById('projectsEmpty');
  if (!projects.length) {
    grid.innerHTML = '';
    empty.style.display = '';
    return;
  }
  empty.style.display = 'none';
  const statusOrder = { active: 0, on_hold: 1, completed: 2 };
  const sorted = [...projects].sort((a, b) => (statusOrder[a.status] ?? 9) - (statusOrder[b.status] ?? 9));
  grid.innerHTML = sorted.map(p => {
    const statusLabel = { active: 'Active', on_hold: 'On Hold', completed: 'Completed' }[p.status] || p.status;
    const statusKey = { active: 'active', on_hold: 'hold', completed: 'done' }[p.status] || '';

    const dateParts = [p.start_date && formatDate(p.start_date), p.end_date && formatDate(p.end_date)].filter(Boolean);
    const dateStr = dateParts.join(' → ');

    const collabIds = Array.isArray(p.collaborators) ? p.collaborators : [];
    const collabContacts = collabIds.map(id => contacts.find(c => c.id === id)).filter(Boolean);
    const MAX_VIS = 5;
    const visible = collabContacts.slice(0, MAX_VIS);
    const overflow = collabContacts.length - MAX_VIS;
    const collabHtml = collabContacts.length ? `
      <div class="proj-card-collabs">
        ${visible.map(c => `<div class="proj-collab-av ${getAvatarClass(c)}" title="${escHtml(c.name)}">${getInitials(c.name)}</div>`).join('')}
        ${overflow > 0 ? `<div class="proj-collab-av proj-collab-more">+${overflow}</div>` : ''}
      </div>` : '<div class="proj-card-collabs"></div>';

    return `
      <div class="proj-card proj-card-${p.status || 'active'}">
        <div class="proj-card-meta">
          <span class="proj-status-pip proj-pip-${statusKey}"></span>
          <span class="proj-status-lbl proj-lbl-${statusKey}">${statusLabel}</span>
          ${dateStr ? `<span class="proj-card-dates">${dateStr}</span>` : ''}
        </div>
        <div class="proj-card-title">${escHtml(p.title)}</div>
        ${p.description ? `<div class="proj-card-desc">${escHtml(p.description)}</div>` : ''}
        <div class="proj-card-footer">
          ${collabHtml}
          <div class="proj-card-btns">
            <button class="proj-icon-btn" onclick="openProjectModal('${p.id}')" title="Edit">✎</button>
            <button class="proj-icon-btn proj-icon-btn-del" onclick="deleteProject('${p.id}')" title="Delete">✕</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function openProjectModal(id) {
  editProjectId = id || null;
  const p = id ? projects.find(x => x.id === id) : null;
  document.getElementById('projectModalTitle').textContent = p ? 'Edit Project' : 'New Project';
  document.getElementById('pTitle').value = p ? p.title : '';
  document.getElementById('pDescription').value = p ? p.description || '' : '';
  document.getElementById('pStartDate').value = p ? p.start_date || '' : '';
  document.getElementById('pEndDate').value = p ? p.end_date || '' : '';
  document.getElementById('pStatus').value = p ? p.status || 'active' : 'active';
  projectCollabIds = p && Array.isArray(p.collaborators) ? [...p.collaborators] : [];
  renderCollabChips();
  document.getElementById('collabSearch').value = '';
  document.getElementById('collabDropdown').style.display = 'none';
  document.getElementById('projectModalOverlay').classList.add('open');
  document.getElementById('pTitle').focus();
}

function closeProjectModal(event) {
  if (event && event.target !== document.getElementById('projectModalOverlay')) return;
  document.getElementById('projectModalOverlay').classList.remove('open');
}

async function submitProject(event) {
  event.preventDefault();
  const payload = {
    title: document.getElementById('pTitle').value.trim(),
    description: document.getElementById('pDescription').value.trim(),
    start_date: document.getElementById('pStartDate').value,
    end_date: document.getElementById('pEndDate').value,
    collaborators: projectCollabIds,
    status: document.getElementById('pStatus').value,
  };
  if (!payload.title) return;
  const url = editProjectId ? `/api/projects/${editProjectId}` : '/api/projects';
  const method = editProjectId ? 'PUT' : 'POST';
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (res.ok) {
    document.getElementById('projectModalOverlay').classList.remove('open');
    await fetchProjects();
    renderProjects();
  }
}

async function deleteProject(id) {
  const p = projects.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
  await fetch(`/api/projects/${id}`, { method: 'DELETE' });
  await fetchProjects();
  renderProjects();
}

// ── Collaborator picker ──────────────────────────────────────────────────────

function searchCollabs(query) {
  const dropdown = document.getElementById('collabDropdown');
  if (!query.trim()) { dropdown.style.display = 'none'; return; }
  const q = query.toLowerCase();
  const matches = contacts
    .filter(c => !projectCollabIds.includes(c.id) && c.name.toLowerCase().includes(q))
    .slice(0, 6);
  if (!matches.length) { dropdown.style.display = 'none'; return; }
  dropdown.innerHTML = matches.map(c => `
    <div class="collab-option" onclick="addCollab('${c.id}')">
      <div class="avatar ${getAvatarClass(c)} collab-option-av">${getInitials(c.name)}</div>
      <span class="collab-option-name">${escHtml(c.name)}</span>
      ${c.company ? `<span class="collab-option-co">${escHtml(c.company)}</span>` : ''}
    </div>`).join('');
  dropdown.style.display = '';
}

function addCollab(contactId) {
  if (!projectCollabIds.includes(contactId)) projectCollabIds.push(contactId);
  renderCollabChips();
  document.getElementById('collabSearch').value = '';
  document.getElementById('collabDropdown').style.display = 'none';
  document.getElementById('collabSearch').focus();
}

function removeCollab(contactId) {
  projectCollabIds = projectCollabIds.filter(id => id !== contactId);
  renderCollabChips();
}

function renderCollabChips() {
  // Drop any IDs whose contacts have been deleted
  projectCollabIds = projectCollabIds.filter(id => contacts.find(x => x.id === id));
  const container = document.getElementById('collabSelected');
  if (!container) return;
  container.innerHTML = projectCollabIds.map(id => {
    const c = contacts.find(x => x.id === id);
    return `<div class="collab-chip">
      <div class="avatar ${getAvatarClass(c)} collab-chip-av">${getInitials(c.name)}</div>
      <span>${escHtml(c.name)}</span>
      <button type="button" class="collab-chip-rm" onclick="removeCollab('${id}')">×</button>
    </div>`;
  }).join('');
}

// ===== Field Hint Tooltips =====

const hintTooltip = document.getElementById('fieldHintTooltip');

document.querySelectorAll('.field-hint-icon').forEach(el => {
  el.addEventListener('mouseenter', e => {
    const hint = el.getAttribute('data-hint');
    if (!hint) return;
    hintTooltip.textContent = hint;
    hintTooltip.style.display = 'block';
    positionHintTooltip(e);
  });
  el.addEventListener('mousemove', positionHintTooltip);
  el.addEventListener('mouseleave', () => {
    hintTooltip.style.display = 'none';
  });
});

function positionHintTooltip(e) {
  const gap = 10;
  const tw = hintTooltip.offsetWidth;
  const th = hintTooltip.offsetHeight;
  let x = e.clientX + gap;
  let y = e.clientY + gap;
  if (x + tw > window.innerWidth - 8) x = e.clientX - tw - gap;
  if (y + th > window.innerHeight - 8) y = e.clientY - th - gap;
  hintTooltip.style.left = x + 'px';
  hintTooltip.style.top = y + 'px';
}

// ===== Init =====
document.getElementById('flast').setAttribute('max', today);
refresh();
