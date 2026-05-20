/**
 * app.js — RumahDrive
 * Logika utama UI: navigasi folder, render kartu, upload, hapus, preview.
 * Bergantung pada fungsi di api.js yang dimuat sebelum file ini.
 */

/* ================================================================== */
/*  STATE                                                              */
/* ================================================================== */
const state = {
  currentPath: '/',
  items: [],         // array item dari API
  viewMode: 'grid',  // 'grid' | 'list'
  pendingDelete: null, // { id, name }
};

/* ================================================================== */
/*  ELEMEN DOM                                                         */
/* ================================================================== */
const $ = (sel) => document.querySelector(sel);

const el = {
  fileGrid:          $('#fileGrid'),
  skeletonGrid:      $('#skeletonGrid'),
  emptyState:        $('#emptyState'),
  errorState:        $('#errorState'),
  errorMessage:      $('#errorMessage'),
  breadcrumb:        $('#breadcrumb'),
  storageBadge:      $('#storageBadge').querySelector('.storage-label'),

  btnUpload:         $('#btnUpload'),
  fileInput:         $('#fileInput'),
  fabUpload:         $('#fabUpload'),
  btnNewFolder:      $('#btnNewFolder'),
  btnViewToggle:     $('#btnViewToggle'),
  btnRefresh:        $('#btnRefresh'),
  btnRetry:          $('#btnRetry'),

  uploadProgressArea: $('#uploadProgressArea'),
  uploadProgressList: $('#uploadProgressList'),
  btnCancelAll:      $('#btnCancelAll'),

  dropOverlay:       $('#dropOverlay'),

  // Modal Folder
  modalNewFolder:    $('#modalNewFolder'),
  folderNameInput:   $('#folderNameInput'),
  folderNameError:   $('#folderNameError'),
  btnConfirmFolder:  $('#btnConfirmFolder'),
  btnCancelFolder:   $('#btnCancelFolder'),

  // Modal Hapus
  modalDelete:       $('#modalDelete'),
  deleteItemName:    $('#deleteItemName'),
  btnConfirmDelete:  $('#btnConfirmDelete'),
  btnCancelDelete:   $('#btnCancelDelete'),

  // Modal Preview
  modalPreview:      $('#modalPreview'),
  previewFilename:   $('#previewFilename'),
  previewBody:       $('#previewBody'),
  btnClosePreview:   $('#btnClosePreview'),
  btnDownloadPreview: $('#btnDownloadPreview'),

  toastContainer:    $('#toastContainer'),
};

/* ================================================================== */
/*  UTILITAS                                                           */
/* ================================================================== */

/** Format bytes ke string mudah dibaca */
function formatSize(bytes) {
  if (bytes == null) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

/** Pilih emoji ikon berdasarkan mime_type atau tipe item */
function getIcon(item) {
  if (item.type === 'folder') return '📁';
  const m = item.mime_type || '';
  if (m.startsWith('image/'))       return '🖼️';
  if (m.startsWith('video/'))       return '🎬';
  if (m.startsWith('audio/'))       return '🎵';
  if (m === 'application/pdf')      return '📄';
  if (m.includes('word') || m.includes('document')) return '📝';
  if (m.includes('sheet') || m.includes('excel'))   return '📊';
  if (m.includes('zip') || m.includes('compressed') || m.includes('rar')) return '🗜️';
  if (m.startsWith('text/'))        return '📃';
  return '📦';
}

/** Apakah file bisa dipreview di browser? */
function isPreviewable(item) {
  const m = item.mime_type || '';
  return m.startsWith('image/') || m.startsWith('video/') || m.startsWith('audio/') || m === 'application/pdf';
}

/** Format tanggal singkat */
function formatDate(isoStr) {
  if (!isoStr) return '';
  return new Date(isoStr).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ================================================================== */
/*  TOAST                                                              */
/* ================================================================== */
function showToast(msg, type = 'info', durationMs = 3000) {
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${msg}</span>`;
  el.toastContainer.prepend(toast);

  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, durationMs);
}

/* ================================================================== */
/*  RENDER                                                             */
/* ================================================================== */

function showSkeleton() {
  el.skeletonGrid.hidden = false;
  el.fileGrid.hidden = true;
  el.emptyState.hidden = true;
  el.errorState.hidden = true;
}

function showError(msg) {
  el.skeletonGrid.hidden = true;
  el.fileGrid.hidden = true;
  el.emptyState.hidden = true;
  el.errorState.hidden = false;
  el.errorMessage.textContent = msg || 'Pastikan server FastAPI sudah berjalan.';
}

function renderItems(items) {
  el.skeletonGrid.hidden = true;
  el.errorState.hidden = true;

  if (!items.length) {
    el.fileGrid.hidden = true;
    el.emptyState.hidden = false;
    return;
  }

  el.emptyState.hidden = true;
  el.fileGrid.hidden = false;
  el.fileGrid.innerHTML = '';

  // Urutkan: folder dulu, lalu file A-Z
  const sorted = [...items].sort((a, b) => {
    if (a.type === b.type) return a.name.localeCompare(b.name, 'id');
    return a.type === 'folder' ? -1 : 1;
  });

  sorted.forEach((item, idx) => {
    const card = document.createElement('div');
    card.className = 'file-card';
    card.style.animationDelay = `${idx * 30}ms`;
    card.dataset.id = item.id;
    card.dataset.type = item.type;

    // Thumbnail gambar (jika ada)
    const iconHtml = item.thumbnail_url
      ? `<img src="${item.thumbnail_url}" class="file-icon" alt="${item.name}" style="width:64px;height:64px;object-fit:cover;border-radius:8px;" loading="lazy" />`
      : `<span class="file-icon">${getIcon(item)}</span>`;

    card.innerHTML = `
      ${iconHtml}
      <span class="file-name" title="${item.name}">${item.name}</span>
      <span class="file-meta">${item.type === 'folder' ? 'Folder' : formatSize(item.size_bytes)}</span>
      <div class="file-card-actions">
        ${item.type === 'file' ? `<button class="btn-card-action download" data-id="${item.id}" title="Download" aria-label="Download ${item.name}">⬇</button>` : ''}
        <button class="btn-card-action delete" data-id="${item.id}" data-name="${item.name}" title="Hapus" aria-label="Hapus ${item.name}">🗑</button>
      </div>
    `;

    // Klik utama: buka folder atau preview file
    card.addEventListener('click', (e) => {
      // Jangan trigger jika klik tombol aksi
      if (e.target.closest('.file-card-actions')) return;
      if (item.type === 'folder') {
        navigateTo(item.path);
      } else {
        openPreview(item);
      }
    });

    // Tombol download
    const btnDl = card.querySelector('.btn-card-action.download');
    if (btnDl) {
      btnDl.addEventListener('click', (e) => {
        e.stopPropagation();
        triggerDownload(item);
      });
    }

    // Tombol hapus
    const btnDel = card.querySelector('.btn-card-action.delete');
    btnDel.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteModal(item);
    });

    el.fileGrid.appendChild(card);
  });
}

/* ================================================================== */
/*  NAVIGASI FOLDER                                                    */
/* ================================================================== */

function navigateTo(path) {
  state.currentPath = path;
  updateBreadcrumb(path);
  loadFiles(path);
}

function updateBreadcrumb(path) {
  el.breadcrumb.innerHTML = '';

  const parts = path.split('/').filter(Boolean);
  const crumbs = [{ label: '📁 Beranda', path: '/' }];
  parts.forEach((part, i) => {
    crumbs.push({ label: part, path: '/' + parts.slice(0, i + 1).join('/') });
  });

  crumbs.forEach((crumb, i) => {
    const btn = document.createElement('button');
    btn.className = 'crumb' + (i === crumbs.length - 1 ? ' active' : '');
    btn.dataset.path = crumb.path;
    btn.textContent = crumb.label;
    btn.addEventListener('click', () => {
      if (crumb.path !== state.currentPath) navigateTo(crumb.path);
    });
    el.breadcrumb.appendChild(btn);
  });
}

/* ================================================================== */
/*  MUAT FILE (memanggil api.js)                                       */
/* ================================================================== */

async function loadFiles(path = state.currentPath) {
  showSkeleton();
  try {
    const data = await apiListFiles(path);
    state.items = data.items || [];
    renderItems(state.items);
    updateStorageBadge(data.used_size_bytes, data.total_size_bytes);
  } catch (err) {
    console.error('[RumahDrive] loadFiles error:', err);
    showError(err.message);
  }
}

/* ================================================================== */
/*  STORAGE BADGE                                                      */
/* ================================================================== */

function updateStorageBadge(used, total) {
  if (used == null || total == null) return;
  const pct = total > 0 ? Math.round((used / total) * 100) : 0;
  el.storageBadge.textContent = `${formatSize(used)} / ${formatSize(total)} (${pct}%)`;
}

async function loadStorageInfo() {
  try {
    const info = await apiGetStorageInfo();
    updateStorageBadge(info.used_bytes, info.total_bytes);
  } catch (_) { /* Tidak kritis */ }
}

/* ================================================================== */
/*  UPLOAD FILE                                                        */
/* ================================================================== */

async function handleFileUpload(files) {
  if (!files || files.length === 0) return;

  el.uploadProgressArea.hidden = false;

  const uploadTasks = Array.from(files).map((file) => {
    // Buat item progress
    const item = document.createElement('div');
    item.className = 'progress-item';
    item.innerHTML = `
      <span class="progress-item-name" title="${file.name}">${file.name}</span>
      <div class="progress-bar-wrap"><div class="progress-bar-fill" style="width:0%"></div></div>
      <span class="progress-status">0%</span>
    `;
    el.uploadProgressList.appendChild(item);

    const barFill = item.querySelector('.progress-bar-fill');
    const statusEl = item.querySelector('.progress-status');

    return apiUploadFile(
      file,
      state.currentPath,
      (pct) => {
        barFill.style.width = `${pct}%`;
        statusEl.textContent = `${pct}%`;
      }
    )
      .then(() => {
        barFill.style.width = '100%';
        statusEl.textContent = '✓';
        statusEl.classList.add('done');
      })
      .catch((err) => {
        statusEl.textContent = '✗';
        statusEl.classList.add('error');
        console.error(`[Upload] ${file.name}:`, err.message);
        return Promise.resolve(); // lanjutkan upload lain
      });
  });

  await Promise.all(uploadTasks);
  showToast(`${files.length} file diproses.`, 'success');

  // Refresh list
  await loadFiles();

  // Tutup progress setelah 2 detik
  setTimeout(() => {
    el.uploadProgressArea.hidden = true;
    el.uploadProgressList.innerHTML = '';
  }, 2000);
}

/* ================================================================== */
/*  BUAT FOLDER                                                        */
/* ================================================================== */

function openNewFolderModal() {
  el.folderNameInput.value = '';
  el.folderNameError.hidden = true;
  el.folderNameInput.classList.remove('error');
  el.modalNewFolder.hidden = false;
  setTimeout(() => el.folderNameInput.focus(), 50);
}

function closeNewFolderModal() {
  el.modalNewFolder.hidden = true;
}

async function confirmCreateFolder() {
  const name = el.folderNameInput.value.trim();

  // Validasi nama folder
  if (!name) {
    el.folderNameError.textContent = 'Nama folder tidak boleh kosong.';
    el.folderNameError.hidden = false;
    el.folderNameInput.classList.add('error');
    return;
  }
  if (/[<>:"/\\|?*]/.test(name)) {
    el.folderNameError.textContent = 'Nama mengandung karakter tidak valid.';
    el.folderNameError.hidden = false;
    el.folderNameInput.classList.add('error');
    return;
  }

  el.btnConfirmFolder.disabled = true;
  el.btnConfirmFolder.textContent = '…';

  try {
    await apiCreateFolder(name, state.currentPath);
    closeNewFolderModal();
    showToast(`Folder "${name}" dibuat.`, 'success');
    await loadFiles();
  } catch (err) {
    el.folderNameError.textContent = err.message;
    el.folderNameError.hidden = false;
  } finally {
    el.btnConfirmFolder.disabled = false;
    el.btnConfirmFolder.textContent = 'Buat';
  }
}

/* ================================================================== */
/*  HAPUS ITEM                                                         */
/* ================================================================== */

function openDeleteModal(item) {
  state.pendingDelete = { id: item.id, name: item.name };
  el.deleteItemName.textContent = `"${item.name}"`;
  el.modalDelete.hidden = false;
}

function closeDeleteModal() {
  el.modalDelete.hidden = true;
  state.pendingDelete = null;
}

async function confirmDelete() {
  if (!state.pendingDelete) return;
  const { id, name } = state.pendingDelete;

  el.btnConfirmDelete.disabled = true;
  el.btnConfirmDelete.textContent = '…';

  try {
    await apiDeleteItem(id);
    closeDeleteModal();
    showToast(`"${name}" berhasil dihapus.`, 'success');
    await loadFiles();
  } catch (err) {
    showToast(`Gagal menghapus: ${err.message}`, 'error');
  } finally {
    el.btnConfirmDelete.disabled = false;
    el.btnConfirmDelete.textContent = 'Hapus';
  }
}

/* ================================================================== */
/*  DOWNLOAD                                                           */
/* ================================================================== */

function triggerDownload(item) {
  const url = apiDownloadUrl(item.id);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ================================================================== */
/*  PREVIEW FILE                                                       */
/* ================================================================== */

function openPreview(item) {
  el.previewFilename.textContent = item.name;
  el.btnDownloadPreview.href = apiDownloadUrl(item.id);
  el.btnDownloadPreview.download = item.name;
  el.previewBody.innerHTML = '';

  const m = item.mime_type || '';
  const src = apiDownloadUrl(item.id);

  if (m.startsWith('image/')) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = item.name;
    el.previewBody.appendChild(img);

  } else if (m.startsWith('video/')) {
    const vid = document.createElement('video');
    vid.src = src;
    vid.controls = true;
    vid.autoplay = false;
    el.previewBody.appendChild(vid);

  } else if (m.startsWith('audio/')) {
    const aud = document.createElement('audio');
    aud.src = src;
    aud.controls = true;
    el.previewBody.appendChild(aud);

  } else if (m === 'application/pdf') {
    const iframe = document.createElement('iframe');
    iframe.src = src;
    iframe.style.cssText = 'width:100%;height:60dvh;border:none;border-radius:8px;';
    el.previewBody.appendChild(iframe);

  } else {
    el.previewBody.innerHTML = `
      <div class="preview-fallback">
        <span class="big-icon">${getIcon(item)}</span>
        <p>Preview tidak tersedia untuk tipe ini.</p>
        <p style="font-size:.75rem;margin-top:4px">${m || 'Unknown type'}</p>
      </div>`;
  }

  el.modalPreview.hidden = false;
}

function closePreview() {
  el.modalPreview.hidden = true;
  // Hentikan video/audio jika masih play
  const vid = el.previewBody.querySelector('video, audio');
  if (vid) { vid.pause(); vid.src = ''; }
  el.previewBody.innerHTML = '';
}

/* ================================================================== */
/*  VIEW TOGGLE (Grid ↔ List)                                         */
/* ================================================================== */

function toggleViewMode() {
  state.viewMode = state.viewMode === 'grid' ? 'list' : 'grid';
  el.fileGrid.classList.toggle('list-view', state.viewMode === 'list');
  el.btnViewToggle.textContent = state.viewMode === 'grid' ? '⊞' : '☰';
}

/* ================================================================== */
/*  DRAG & DROP                                                        */
/* ================================================================== */

let dragCounter = 0;

function isDraggingFiles(e) {
  if (!e.dataTransfer) return false;
  return Array.from(e.dataTransfer.types).includes('Files');
}

document.addEventListener('dragenter', (e) => {
  e.preventDefault();
  if (!isDraggingFiles(e)) return;
  dragCounter++;
  el.dropOverlay.classList.add('visible');
});

document.addEventListener('dragleave', (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter <= 0) {
    dragCounter = 0;
    el.dropOverlay.classList.remove('visible');
  }
});

document.addEventListener('dragover', (e) => e.preventDefault());

document.addEventListener('drop', (e) => {
  e.preventDefault();
  dragCounter = 0;
  el.dropOverlay.classList.remove('visible');
  const files = e.dataTransfer.files;
  if (files.length) handleFileUpload(files);
});

/* ================================================================== */
/*  EVENT LISTENERS                                                    */
/* ================================================================== */

// Upload via toolbar
el.btnUpload.addEventListener('click', () => el.fileInput.click());
el.fabUpload.addEventListener('click', () => el.fileInput.click());
el.fileInput.addEventListener('change', (e) => {
  if (e.target.files.length) handleFileUpload(e.target.files);
  e.target.value = ''; // reset agar file sama bisa diupload ulang
});

// Buat folder
el.btnNewFolder.addEventListener('click', openNewFolderModal);
el.btnConfirmFolder.addEventListener('click', confirmCreateFolder);
el.btnCancelFolder.addEventListener('click', closeNewFolderModal);
el.folderNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmCreateFolder();
  if (e.key === 'Escape') closeNewFolderModal();
});

// Hapus
el.btnConfirmDelete.addEventListener('click', confirmDelete);
el.btnCancelDelete.addEventListener('click', closeDeleteModal);

// Preview
el.btnClosePreview.addEventListener('click', closePreview);
el.modalPreview.addEventListener('click', (e) => { if (e.target === el.modalPreview) closePreview(); });

// Tutup modal dengan klik backdrop
el.modalNewFolder.addEventListener('click', (e) => { if (e.target === el.modalNewFolder) closeNewFolderModal(); });
el.modalDelete.addEventListener('click', (e) => { if (e.target === el.modalDelete) closeDeleteModal(); });

// Tutup modal dengan Escape
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!el.modalNewFolder.hidden) closeNewFolderModal();
  if (!el.modalDelete.hidden) closeDeleteModal();
  if (!el.modalPreview.hidden) closePreview();
});

// Refresh & retry
el.btnRefresh.addEventListener('click', () => loadFiles());
el.btnRetry.addEventListener('click', () => loadFiles());

// Tutup progress bar
el.btnCancelAll.addEventListener('click', () => {
  el.uploadProgressArea.hidden = true;
  el.uploadProgressList.innerHTML = '';
});

// Toggle view
el.btnViewToggle.addEventListener('click', toggleViewMode);

/* ================================================================== */
/*  INIT                                                               */
/* ================================================================== */

(async function init() {
  updateBreadcrumb('/');
  await loadFiles('/');
  await loadStorageInfo(); // async, tidak menunggu
})();