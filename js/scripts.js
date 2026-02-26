// =============================
// API CONFIG 11
// =============================
const API_BASE = "https://semioratorical-unbreakably-dacia.ngrok-free.dev/Thorix/storage";
const API_AUTH = "https://semioratorical-unbreakably-dacia.ngrok-free.dev/Thorix/authy";

let storageStats = { unit: "Bita", rom: 0, max: 1 }; // Nilai default

// =============================
// API SERVICE (FIXED)
// =============================
const Api = {
  async capacity() {
    const response = await fetch(`${API_BASE}/capacity`, {
      method: "GET",
      credentials: "include",
    })
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

    const getData = await response.json();
    storageStats = getData;
  },

  async storage(subpath) {
    // subpath harus di-encode jika mengandung spasi/karakter khusus loadFiles
    const response = await fetch(`${API_BASE}/browse/${encodeURIComponent(subpath)}`, {
      method: "GET",
      credentials: "include",
    });
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    return await response.json();
  },

  async create(current_path, folder_name) { // Typo fix: folder_name
    // Karena Backend pakai Form(...), kita kirim pakai FormData
    const formData = new FormData();
    formData.append("path", current_path);
    formData.append("folder_name", folder_name);

    const response = await fetch(`${API_BASE}/create-folder`, {
      method: "POST",
      credentials: "include",
      // JANGAN SET HEADERS JSON!
      body: formData
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || "Gagal membuat folder");
    }
    return await response.json();
  },

  async rename(current_path, name, new_name) {
    // Karena Backend pakai Form(...), kita kirim pakai FormData
    const formData = new FormData();
    formData.append("name", name);
    formData.append("rename", new_name);

    const response = await fetch(`${API_BASE}/rename/${encodeURIComponent(current_path)}`, {
      method: "POST",
      credentials: "include",
      body: formData
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.detail || "Gagal mengganti nama");
    }
    return await response.json();
  },

  async upload(formData) {
    const response = await fetch(`${API_BASE}/upload-file`, {
      method: "POST",
      credentials: "include",
      body: formData
    });
    return await response.json();
  },

  // FIXED: Menambahkan parameter subpath yang sebelumnya hilang
  async view(subpath) {
    const type = subpath.split('.').pop().toLowerCase();
    const fileUrl = `${API_BASE}/view/${encodeURIComponent(subpath)}`;
    // window.open(fileUrl, '_blank');
    const previewModal = document.getElementById('previewModal');
    const previewBody = document.getElementById('previewBody');
    const previewTitle = document.getElementById('previewTitle');

    // Tampilkan Modal & Reset Konten
    previewModal.classList.add('show');
    previewTitle.textContent = subpath.split('/').pop();
    previewBody.innerHTML = '<div style="text-align:center; padding:50px;">⏳ Sedang memuat konten...</div>';

    try {
      const response = await fetch(fileUrl, { credentials: "include" });
      const arrayBuffer = await response.arrayBuffer();

      if (type === 'docx') {
        // Render Word ke HTML
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        previewBody.innerHTML = `<div class="docx-render">${result.value}</div>`;
      }
      else if (type === 'xlsx' || type === 'xls') {
        // Render Excel ke Tabel
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const htmlTable = XLSX.utils.sheet_to_html(firstSheet);
        previewBody.innerHTML = `<div class="table-responsive">${htmlTable}</div>`;
      }
      else if (type === 'pptx') {
        const previewBody = document.getElementById('previewBody');
        previewBody.innerHTML = '<div id="pptx-render"></div>';

        setTimeout(() => {
          if (typeof $.fn.pptxToHtml === "function") {
            $("#pptx-render").pptxToHtml({
              pptxFileUrl: fileUrl, // Menggunakan URL dari FastAPI kamu
              fileInputId: null,
              slidesScale: "50%", // Sesuaikan skala agar pas di layar laptop 32-bit
              slideMode: true,
              keyBoardShortCut: true,
              mediaProcess: true,
              renderOrder: [1, 2, 3], // Urutan render elemen slide
              errorText: "Gagal memproses presentasi",
              processText: "Sedang merender slide...",
            })
          } else {
            previewBody.innerHTML = '<div style="color:red; text-align:center;">❌ Library PPTXjs belum siap. Silakan refresh.</div>';
          }
        }, 300);
      } else {
        // Jika format lain (seperti PDF atau Gambar), buka di tab baru saja
        closeModal('previewModal');
        window.open(fileUrl, '_blank');
      }
    } catch (err) {
      previewBody.innerHTML = `<div style="color:red; text-align:center;">❌ Gagal memuat file: ${err.message}</div>`;
    }
  },

  async download(subpath) {
    // Biasanya download tidak menggunakan response.json(), 
    // tapi langsung mengarahkan window.location atau blob.
    window.open(`${API_BASE}/download/${encodeURIComponent(subpath)}`, '_blank');
  },

  async delete(subpath) {
    const response = await fetch(`${API_BASE}/delete/${encodeURIComponent(subpath)}`, {
      method: "DELETE",
      credentials: "include"
    });
    if (!response.ok) throw new Error("Gagal menghapus file"); // Tambahkan ini
    return await response.json();
  }
};

async function getUserEmail() {
  try {
    const response = await fetch(`${API_AUTH}/me`, {
      method: "GET",
      credentials: "include"
    })

    if (!response.ok) throw new Error("Gagal menemukan user"); // Tambahkan ini

    return await response.json()
  } catch (error) {
    console.error("Error di root:", error.message);
    return null; // Penting: Kembalikan nilai agar fungsi pemanggil tidak bingung
  }
}

let files = [];

// =============================
// LOGIC IMPROVEMENTS
// =============================
// Tambahkan state global untuk path

let ROOT_PATH = "";
let currentPath = ROOT_PATH;

async function root() {
  const userData = await getUserEmail();
  ROOT_PATH = userData.email;
  currentPath = ROOT_PATH;
}


async function loadFiles(path = ROOT_PATH) {
  try {
    currentPath = path; // Update state path saat ini
    const data = await Api.storage(path);

    if (data && Array.isArray(data.items)) {
      files = data.items.map((item, i) => {
        const ext = item.is_dir ? 'folder' : (item.name.split('.').pop().toLowerCase() || 'file');
        return {
          id: i + 1,
          name: item.name,
          type: item.is_dir ? 'folder' : ext,
          size: item.size || 0,
          date: item.modified || '-',
          starred: false,
          trash: false,
          parent: `${path}/${item.name}` // Simpan full path untuk API
        };
      });
      render();
    }
  } catch (error) {
    console.error("Gagal load data:", error);
    showToast("Gagal terhubung ke server", "error");
    files = [];
    render();
  }
}

// ============================
// DATA
// ============================
let currentView = 'grid';
let currentNav = 'root';
let currentFolder = null;
let selectedIds = new Set();
let contextTarget = null;
let sortField = 'name';
let sortAsc = true;
let searchQuery = '';
let filterType = null;
let clipboard = null;
let idCounter = 100;

const typeFilter = {
  image: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'],
  video: ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv'],
  doc: ['pdf', 'doc', 'docx', 'txt', 'xls', 'xlsx', 'ppt', 'pptx', 'md', 'csv'],
  zip: ['zip', 'rar', 'tar', 'gz', '7z']
};

const fileIcons = {
  folder: '📁',
  jpg: '🖼️', jpeg: '🖼️', png: '🖼️', gif: '🖼️', webp: '🖼️', svg: '🖼️', bmp: '🖼️',
  mp4: '🎬', mkv: '🎬', avi: '🎬', mov: '🎬', wmv: '🎬',
  pdf: '📕', doc: '📝', docx: '📝', txt: '📄', md: '📄',
  xls: '📊', xlsx: '📊', csv: '📊',
  ppt: '📊', pptx: '📊',
  zip: '📦', rar: '📦', tar: '📦', gz: '📦', '7z': '📦',
  mp3: '🎵', wav: '🎵', flac: '🎵',
  js: '⚡', html: '🌐', css: '🎨', py: '🐍', json: '📋',
  default: '📄'
};

// ============================
// UTILS
// ============================
function formatSize(bytes) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  return (bytes / 1024 / 1024 / 1024).toFixed(1) + ' GB';
}

function getExt(name) {
  const parts = name.split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function getIcon(file) {
  if (file.type === 'folder') return fileIcons.folder;
  const ext = getExt(file.name);
  return fileIcons[ext] || fileIcons[file.type] || fileIcons.default;
}

function getTagClass(file) {
  if (file.type === 'folder') return 'tag-folder';
  const ext = getExt(file.name);
  if (typeFilter.image.includes(ext)) return 'tag-img';
  if (typeFilter.video.includes(ext)) return 'tag-vid';
  if (typeFilter.doc.includes(ext)) return 'tag-doc';
  if (typeFilter.zip.includes(ext)) return 'tag-zip';
  return 'tag-other';
}

function getTagLabel(file) {
  if (file.type === 'folder') return 'Folder';
  const ext = getExt(file.name);
  if (typeFilter.image.includes(ext)) return 'Gambar';
  if (typeFilter.video.includes(ext)) return 'Video';
  if (typeFilter.doc.includes(ext)) return 'Dokumen';
  if (typeFilter.zip.includes(ext)) return 'Arsip';
  return ext.toUpperCase() || 'File';
}

function showToast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function getVisibleFiles() {
  let result = files.filter(f => !f.trash);

  if (currentNav === 'starred') {
    result = result.filter(f => f.starred);
  } else if (currentNav === 'trash') {
    result = result.sort((a, b) => b.date.localeCompare(a.date));
    // result = files.filter(f => f.trash);
  } else if (currentNav === 'recent') {
    result = result.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
    return result;
  } else if (filterType) {
    result = result.filter(f => {
      if (f.type === 'folder') return false;
      const ext = getExt(f.name);
      return typeFilter[filterType]?.includes(ext);
    });
    // Hapus filter parent di sini jika API sudah mengembalikan data folder yang benar
  }
  // HAPUS blok ELSE yang memfilter f.parent === currentFolder
  // Karena data yang di-load oleh loadFiles sudah merupakan isi dari folder aktif

  // Filter pencarian tetap dipertahankan
  if (searchQuery) {
    result = result.filter(f => f.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  // Logika sorting...
  result.sort((a, b) => {
    if (a.type === 'folder' && b.type !== 'folder') return -1;
    if (a.type !== 'folder' && b.type === 'folder') return 1;
    let va = sortField === 'name' ? a.name : sortField === 'date' ? a.date : a.size;
    let vb = sortField === 'name' ? b.name : sortField === 'date' ? b.date : b.size;
    if (va < vb) return sortAsc ? -1 : 1;
    if (va > vb) return sortAsc ? 1 : -1;
    return 0;
  });

  return result;
}

// ============================
// RENDER
// ============================
function render() {
  const visible = getVisibleFiles();
  const container = document.getElementById('fileContainer');
  const emptyState = document.getElementById('emptyState');

  // Update counts
  document.getElementById('totalBadge').textContent = files.filter(f => !f.trash).length;
  const trashCount = files.filter(f => f.trash).length;
  const trashBadge = document.getElementById('trashBadge');
  trashBadge.textContent = trashCount;
  trashBadge.style.display = trashCount > 0 ? '' : 'none';
  document.getElementById('itemCount').textContent = `${visible.length} item`;

  // Storage
  const pct = Math.min((storageStats.rom / storageStats.max) * 100, 100);
  document.getElementById('storageFill').style.width = isNaN(pct) ? '0%' : pct + '%';
  document.getElementById('storageText').textContent = `${formatSize(storageStats.rom)} / ${formatSize(storageStats.max)}`;
  document.getElementById('storageFreeText').textContent = `${formatSize(storageStats.max - storageStats.rom)} tersedia`;

  // Selected status
  const selCount = selectedIds.size;
  document.getElementById('selectedStatus').textContent = selCount > 0 ? `${selCount} item dipilih` : 'Tidak ada yang dipilih';
  document.getElementById('deleteSelectedBtn').style.display = selCount > 0 ? '' : 'none';
  document.getElementById('moveSelectedBtn').style.display = selCount > 0 ? '' : 'none';

  if (visible.length === 0) {
    container.innerHTML = '';
    emptyState.style.display = 'flex';
    container.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    container.style.display = '';

    if (currentView === 'grid') {
      container.className = 'file-grid';
      container.innerHTML = visible.map((f, i) => `
        <div class="file-card ${f.type === 'folder' ? 'folder' : ''} ${selectedIds.has(f.id) ? 'selected' : ''}"
          data-id="${f.id}"
          ondblclick="handleDblClick(${f.id})"
          onclick="handleClick(event, ${f.id})"
          oncontextmenu="handleCtxMenu(event, ${f.id})"
          style="animation-delay:${i * 0.04}s"
        >
          <div class="file-check">✓</div>
          <div class="file-icon">${getIcon(f)}</div>
          <div class="file-name" title="${f.name}">${f.name}</div>
          <div class="file-size">${f.type === 'folder' ? '—' : formatSize(f.size)}</div>
        </div>
      `).join('');
    } else {
      container.className = 'file-list';
      container.innerHTML = `
        <div class="list-header">
          <div></div>
          <div class="col-name" onclick="sortBy('name')">Nama</div>
          <div>Tipe</div>
          <div>Tanggal</div>
          <div class="col-size">Ukuran</div>
        </div>
        ${visible.map((f, i) => `
          <div class="file-row ${selectedIds.has(f.id) ? 'selected' : ''}"
            data-id="${f.id}"
            ondblclick="handleDblClick(${f.id})"
            onclick="handleClick(event, ${f.id})"
            oncontextmenu="handleCtxMenu(event, ${f.id})"
            style="animation-delay:${i * 0.03}s"
          >
            <div class="row-icon">${getIcon(f)}</div>
            <div class="row-name">${f.name}${f.starred ? ' ⭐' : ''}</div>
            <div class="row-type"><span class="tag ${getTagClass(f)}">${getTagLabel(f)}</span></div>
            <div class="row-date">${f.date}</div>
            <div class="row-size">${f.type === 'folder' ? '—' : formatSize(f.size)}</div>
          </div>
        `).join('')}
      `;
    }
  }

  updateBreadcrumb();
}

// Perbaikan fungsi breadcrumb agar lebih dinamis
function updateBreadcrumb() {
  const bc = document.getElementById('breadcrumb');
  const parts = currentPath.split('/');

  let html = '';
  let cumulativePath = '';

  parts.forEach((part, index) => {
    cumulativePath += (index === 0 ? part : '/' + part);
    const isLast = index === parts.length - 1;

    if (index === 0) {
      html += `<span class="crumb" onclick="loadFiles('${ROOT_PATH}')">🏠 Home</span>`;
    } else {
      html += ` <span class="separator">/</span> `;
      if (isLast) {
        html += `<span class="crumb current">${part}</span>`;
      } else {
        // Bungkus dalam closure atau string template untuk menghindari masalah scope
        html += `<span class="crumb" onclick="loadFiles('${cumulativePath}')">${part}</span>`;
      }
    }
  });

  bc.innerHTML = html;
}

// ============================
// NAVIGATION
// ============================
function navigate(nav) {
  if (nav === "root") loadFiles(ROOT_PATH);
  if (nav === "trash") loadFiles(".trash");

  currentNav = nav;
  filterType = null;
  currentFolder = null;
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  selectedIds.clear();
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-nav="${nav}"]`)?.classList.add('active');
  document.getElementById('statusText').textContent = nav === 'trash' ? 'Tampilan Sampah' : nav === 'starred' ? 'Favorit' : nav === 'recent' ? 'File Terbaru' : 'Semua File';
  render();
}

function filterByType(type) {
  filterType = type;
  currentNav = type;
  currentFolder = null;
  selectedIds.clear();
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  document.querySelector(`[data-nav="${type}"]`)?.classList.add('active');
  document.getElementById('statusText').textContent = 'Filter: ' + type;
  render();
}

function handleDblClick(id) {
  const file = files.find(f => f.id === id);
  if (!file) return;

  if (file.type === 'folder') {
    // Gunakan full path yang disimpan di properti 'parent'
    loadFiles(file.parent);
    selectedIds.clear();
    showToast(`Membuka: ${file.name}`);
  } else {
    // Logika untuk view/download file
    Api.view(file.parent);
  }
}

// Helper untuk membangun string path dari breadcrumb
function getCurrentPath() {
  return currentPath
}

function handleClick(e, id) {
  if (e.ctrlKey || e.metaKey) {
    // Ctrl+klik = toggle select
    if (selectedIds.has(id)) selectedIds.delete(id);
    else selectedIds.add(id);
    render();
  } else if (e.shiftKey) {
    // Shift+klik = range select
    const visible = getVisibleFiles();
    const ids = visible.map(f => f.id);
    const last = [...selectedIds].pop();
    const a = ids.indexOf(last), b = ids.indexOf(id);
    if (a >= 0 && b >= 0) {
      const [s, end] = [Math.min(a, b), Math.max(a, b)];
      ids.slice(s, end + 1).forEach(i => selectedIds.add(i));
    } else {
      selectedIds.add(id);
    }
    render();
  } else {
    // Klik biasa = langsung buka
    selectedIds.clear();
    handleDblClick(id);
  }
}

// ============================
// SORT & SEARCH
// ============================
function sortBy(field) {
  if (sortField === field) sortAsc = !sortAsc;
  else { sortField = field; sortAsc = true; }
  document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
  const labels = { name: 'Nama', date: 'Tanggal', size: 'Ukuran' };
  document.getElementById(`sort${field.charAt(0).toUpperCase() + field.slice(1)}`).textContent = labels[field] + (sortAsc ? ' ↑' : ' ↓');
  document.getElementById(`sort${field.charAt(0).toUpperCase() + field.slice(1)}`).classList.add('active');
  render();
}

function handleSearch(q) {
  searchQuery = q;
  render();
}

function setView(v) {
  currentView = v;
  document.getElementById('gridBtn').classList.toggle('active', v === 'grid');
  document.getElementById('listBtn').classList.toggle('active', v === 'list');
  render();
}

// ============================
// CONTEXT MENU
// ============================
function handleCtxMenu(e, id) {
  e.preventDefault();
  e.stopPropagation();
  if (!selectedIds.has(id)) {
    selectedIds.clear();
    selectedIds.add(id);
    render();
  }
  contextTarget = id;
  const menu = document.getElementById('contextMenu');
  menu.classList.add('show');
  const x = Math.min(e.clientX, window.innerWidth - 180);
  const y = Math.min(e.clientY, window.innerHeight - 240);
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

document.addEventListener('click', () => {
  document.getElementById('contextMenu').classList.remove('show');
});

function ctxOpen() {
  if (contextTarget) handleDblClick(contextTarget);
}

function ctxRename() {
  const file = files.find(f => f.id === contextTarget);
  if (!file) return;
  document.getElementById('renameInput').value = file.name;
  document.getElementById('renameModal').classList.add('show');
}

async function doRename() {
  const file = files.find(f => f.id === contextTarget);
  const newName = document.getElementById('renameInput').value.trim();
  if (!newName || !file) return;

  out = await Api.rename(currentPath, file.name, newName)
  file.name = newName;
  closeModal('renameModal');
  showToast(out.message);
  render();
}

function ctxStar() {
  const file = files.find(f => f.id === contextTarget);
  if (!file) return;
  file.starred = !file.starred;
  showToast(file.starred ? `⭐ Ditambah ke Favorit` : `Dihapus dari Favorit`);
  render();
}

function ctxCopy() {
  const file = files.find(f => f.id === contextTarget);
  if (!file) return;
  clipboard = { ...file };
  showToast(`📋 Disalin: ${file.name}`);
}

async function ctxDownload() {
  // 1. Cari data file berdasarkan ID yang tersimpan di contextTarget
  const file = files.find(f => f.id === contextTarget);

  if (!file) return;

  // 2. Validasi: Biasanya folder tidak bisa diunduh langsung tanpa di-zip
  if (file.type === 'folder') {
    showToast("Folder tidak bisa diunduh langsung", "warning");
    return;
  }

  showToast(`↓ Mengunduh: ${file.name}`);

  try {
    // 3. Panggil fungsi Api.download dengan parameter path lengkap (file.parent)
    // Di scripts.js Anda, file.parent berisi `${path}/${item.name}`
    await Api.download(file.parent);
  } catch (error) {
    console.error("Download error:", error);
    showToast("Gagal mengunduh file", "error");
  }
}

function ctxDetail() {
  const file = files.find(f => f.id === contextTarget);
  if (!file) return;
  document.getElementById('detailName').textContent = getIcon(file) + ' ' + file.name;
  document.getElementById('detailContent').innerHTML = `
    <div>📁 Tipe: <span style="color:var(--text)">${file.type === 'folder' ? 'Folder' : getTagLabel(file)}</span></div>
    <div>📦 Ukuran: <span style="color:var(--text)">${formatSize(file.size)}</span></div>
    <div>📅 Tanggal: <span style="color:var(--text)">${file.date}</span></div>
    <div>⭐ Favorit: <span style="color:var(--text)">${file.starred ? 'Ya' : 'Tidak'}</span></div>
    <div>🔑 ID: <span style="color:var(--text)">#${file.id}</span></div>
  `;
  document.getElementById('detailModal').classList.add('show');
}

async function ctxDelete() {
  const idsToDelete = [...selectedIds];

  for (const id of idsToDelete) {
    const file = files.find(f => f.id === id);
    if (file) {
      try {
        // Path lengkap yang dikirim ke API
        const fullPath = file.parent;
        await Api.delete(fullPath);
      } catch (err) {
        console.error("Gagal menghapus:", err);
      }
    }
  }

  showToast(`${selectedIds.size} item dihapus`);
  selectedIds.clear();

  await Api.capacity()
  loadFiles(currentPath); // Refresh data
}

// ============================
// ACTIONS
// ============================
function deleteSelected() {
  if (selectedIds.size === 0) return;
  ctxDelete();
}

function openMoveModal() {
  const folders = files.filter(f => f.type === 'folder' && !f.trash);
  const sel = document.getElementById('moveTarget');
  sel.innerHTML = `<option value="">— Akar (Home) —</option>` +
    folders.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  document.getElementById('moveModal').classList.add('show');
}

function doMove() {
  const target = document.getElementById('moveTarget').value;
  const targetId = target === '' ? null : parseInt(target);
  [...selectedIds].forEach(id => {
    const file = files.find(f => f.id === id);
    if (file) file.parent = targetId;
  });
  showToast(`📁 Dipindah ${selectedIds.size} item`);
  selectedIds.clear();
  closeModal('moveModal');
  render();
}

function openNewFolderModal() {
  document.getElementById('folderNameInput').value = '';
  document.getElementById('newFolderModal').classList.add('show');
  setTimeout(() => document.getElementById('folderNameInput').focus(), 100);
}

// Perbaikan fungsi Create Folder agar kirim ke API
async function createFolder() {
  const input = document.getElementById('folderNameInput');
  const name = input.value.trim();

  if (!name) {
    showToast("Nama folder tidak boleh kosong", "error");
    return;
  }

  try {
    // currentPath harus variabel global yang menampung posisi folder saat ini
    await Api.create(currentPath, name);

    // Reset input dan tutup modal
    input.value = '';
    closeModal('newFolderModal');

    // Refresh list file
    await loadFiles(currentPath);
    showToast(`📁 Folder "${name}" berhasil dibuat`);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function openUploadModal() {
  document.getElementById('uploadModal').classList.add('show');
}

// Membuka jendela pilih file saat drop zone diklik
function triggerFileInput() {
  document.getElementById('fileInput').click();
}

async function handleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);
  // Pastikan currentPath didefinisikan secara global atau dipassing
  formData.append('path', typeof currentPath !== 'undefined' ? currentPath : "");

  try {
    const result = await Api.upload(formData);
    showToast(`Berhasil mengunggah ${result.filename}`);
    await Api.capacity()

    // Pastikan fungsi-fungsi ini dipanggil DI DALAM try block setelah upload sukses
    if (typeof loadFiles === 'function') loadFiles(currentPath);
    closeModal('uploadModal');
    input.value = ''; // Reset input file

  } catch (err) {
    console.error(err);
    showToast(err.message, 'error');
  }
}

// Menangani visual saat file ditarik masuk ke area
function handleDragOver(event) {
  event.preventDefault(); // Wajib agar drop bisa berfungsi
  const dropZone = document.getElementById('dropZone');
  dropZone.classList.add('dz-active'); // Tambahkan class CSS untuk feedback
}

// Menangani visual saat file ditarik keluar area tanpa dilepas
function handleDragLeave(event) {
  const dropZone = document.getElementById('dropZone');
  dropZone.classList.remove('dz-active');
}

// Menangani saat file dilepas (drop)
async function handleDrop(event) {
  event.preventDefault();
  const dropZone = document.getElementById('dropZone');
  dropZone.classList.remove('dz-active');

  const files = event.dataTransfer.files;
  if (files.length > 0) {
    // Kita kirim file pertama (sesuai input tunggal di backend)
    const inputMock = { files: files };
    handleFileSelect(inputMock);
  }
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', function (e) {
    if (e.target === this) closeModal(this.id);
  });
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
    document.getElementById('contextMenu').classList.remove('show');
    selectedIds.clear();
    render();
  }
  if (e.key === 'Delete' && selectedIds.size > 0) deleteSelected();
  if (e.key === 'Enter' && document.getElementById('newFolderModal').classList.contains('show')) createFolder();
  if (e.key === 'Enter' && document.getElementById('renameModal').classList.contains('show')) doRename();
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault();
    getVisibleFiles().forEach(f => selectedIds.add(f.id));
    render();
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    document.getElementById('searchInput').focus();
  }
});


// ================================================
// MOBILE FUNCTIONS
// ================================================

function isMobile() {
  return window.innerWidth <= 768;
}

// ---- Sidebar drawer ----
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
  document.getElementById('sidebarOverlay').classList.toggle('show');
}

function closeSidebar() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('sidebarOverlay');

  // Hanya jalankan classList jika elemennya benar-benar ada
  if (sidebar) {
    sidebar.classList.remove('open');
  } else {
    console.warn("Elemen #sidebar tidak ditemukan di DOM");
  }

  if (overlay) {
    overlay.classList.remove('show');
  }
}

// ---- FAB ----
let _fabOpen = false;
function toggleFab() {
  _fabOpen = !_fabOpen;
  document.getElementById('mobileFab').classList.toggle('fab-open', _fabOpen);
}
function closeFab() {
  _fabOpen = false;
  document.getElementById('mobileFab').classList.remove('fab-open');
}

// ---- Mobile navigation ----
function mobileNav(nav) {
  // Reset semua icon aktif di mobile nav
  document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));

  const el = document.getElementById('mn-' + nav);
  if (el) el.classList.add('active');

  // Tutup sidebar jika sedang terbuka (khusus mobile)
  closeSidebar();

  // Jalankan navigasi utama
  navigate(nav);
}

function mobileCat(type) {
  document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
  const el = document.getElementById('mn-' + type);
  if (el) el.classList.add('active');
  closeSidebar();
  filterByType(type);
}

// ---- Bottom Sheet ----
let _sheetTarget = null;

function openSheet(id) {
  _sheetTarget = id;
  contextTarget = id;
  const file = files.find(f => f.id === id);
  if (!file) return;
  document.getElementById('sheetIcon').textContent = getIcon(file);
  document.getElementById('sheetName').textContent = file.name;
  document.getElementById('sheetSize').textContent =
    file.type === 'folder' ? 'Folder' : formatSize(file.size);
  document.getElementById('mobileBottomSheet').classList.add('show');
  document.getElementById('sheetOverlay').classList.add('show');
}

function closeSheet() {
  document.getElementById('mobileBottomSheet').classList.remove('show');
  document.getElementById('sheetOverlay').classList.remove('show');
  _sheetTarget = null;
}

function sheetAction(action) {
  setTimeout(() => {
    if (action === 'open') ctxOpen();
    else if (action === 'star') ctxStar();
    else if (action === 'rename') ctxRename();
    else if (action === 'detail') ctxDetail();
    else if (action === 'copy') ctxCopy();
    else if (action === 'download') ctxDownload();
    else if (action === 'move') {
      if (_sheetTarget) selectedIds.add(_sheetTarget);
      openMoveModal();
    }
    else if (action === 'delete') {
      if (_sheetTarget) selectedIds.add(_sheetTarget);
      ctxDelete();
    }

    closeSheet();
  }, 220);
}

// ---- Sync mobile badges ----
// const _origRenderMobile = render;
function RenderMobile() {
  render()
  // Trash badge di bottom nav
  const trashCount = files.filter(f => f.trash).length;
  const mnBadge = document.getElementById('mnTrashBadge');
  if (mnBadge) {
    mnBadge.textContent = trashCount;
    mnBadge.style.display = trashCount > 0 ? '' : 'none';
  }
}

// ---- Override handleCtxMenu: mobile → bottom sheet ----
function HandleCtxMenuMobile(e, id) {
  e.preventDefault();
  if (isMobile()) {
    contextTarget = id;
    openSheet(id);
  } else {
    handleCtxMenu(e, id);
  }
}

// ---- Long press untuk bottom sheet ----
let _longPressTimer = null;
document.addEventListener('touchstart', (e) => {
  const card = e.target.closest('[data-id]');
  if (!card) return;
  _longPressTimer = setTimeout(() => {
    navigator.vibrate && navigator.vibrate(40);
    openSheet(parseInt(card.dataset.id));
  }, 500);
}, { passive: true });
document.addEventListener('touchend', () => clearTimeout(_longPressTimer));
document.addEventListener('touchmove', () => clearTimeout(_longPressTimer), { passive: true });

// ---- Tutup FAB kalau tap di luar ----
document.addEventListener('touchstart', (e) => {
  if (_fabOpen && !e.target.closest('.mobile-fab')) closeFab();
}, { passive: true });

// ---- Swipe kanan dari tepi → buka sidebar ----
let _swipeStartX = 0;
document.addEventListener('touchstart', (e) => {
  _swipeStartX = e.touches[0].clientX;
}, { passive: true });
document.addEventListener('touchend', (e) => {
  const dx = e.changedTouches[0].clientX - _swipeStartX;
  const sb = document.getElementById('sidebar');
  if (_swipeStartX < 30 && dx > 60) toggleSidebar();
  if (sb && sb.classList.contains('open') && dx < -60) closeSidebar();
}, { passive: true });

// ---- Sync mobile search input ----
const mobileSearchEl = document.getElementById('mobileSearchInput');
if (mobileSearchEl) {
  mobileSearchEl.addEventListener('input', (e) => handleSearch(e.target.value));
}

// 1. Shadowing untuk Render
const baseRender = render; // Simpan fungsi asli Semester 1
render = function () {
  baseRender(); // Jalankan render standar

  // Tambahkan logika update badge mobile
  const trashCount = files.filter(f => f.trash).length;
  const mnBadge = document.getElementById('mnTrashBadge');
  if (mnBadge) {
    mnBadge.textContent = trashCount;
    mnBadge.style.display = trashCount > 0 ? '' : 'none';
  }
};

// 2. Shadowing untuk Context Menu
const baseHandleCtxMenu = handleCtxMenu;
handleCtxMenu = function (e, id) {
  if (isMobile()) {
    e.preventDefault();
    contextTarget = id;
    openSheet(id); // Buka Bottom Sheet di mobile
  } else {
    baseHandleCtxMenu(e, id); // Buka menu klik kanan biasa di desktop
  }
};

// ============================
// INIT
// ============================
async function startApp() {
  try {
    // TAMBAHKAN await di sini!
    await root();

    await Api.capacity()
    // Sekarang ROOT_PATH sudah pasti terisi email user
    await loadFiles(ROOT_PATH);

    const mediaQuery = window.matchMedia('(min-width: 768px)');
    function handleTabletChange(e) {
      if (e.matches) {
        // Program dijalankan jika layar 768px atau lebih
        showToast('💡 Ctrl+A pilih semua, Del hapus, Ctrl+F cari');
      }
    }

    // Jalankan saat load pertama kali
    handleTabletChange(mediaQuery);

    // Pantau perubahan ukuran layar secara real-time
    mediaQuery.addEventListener('change', handleTabletChange);
  } catch (err) {
    console.error("Gagal inisialisasi aplikasi:", err);
  }
}

startApp();

// ================================================
// EXPOSE TO GLOBAL (Penting untuk onclick HTML)
// ================================================
Object.assign(window, {
  // Navigasi & Filter
  navigate,
  filterByType,
  mobileNav,
  mobileCat,

  // Actions
  createFolder,
  openNewFolderModal,
  openUploadModal,
  handleFileSelect,
  triggerFileInput,
  closeModal,

  // File & Folder Logic
  handleDblClick,
  handleClick,
  handleCtxMenu,

  // Context Menu Actions
  ctxOpen,
  ctxRename,
  ctxStar,
  ctxCopy,
  ctxDownload,
  ctxDetail,
  ctxDelete,
  doRename,

  // UI Controls
  toggleSidebar,
  closeSidebar,
  toggleFab,
  closeFab,
  sheetAction,
  closeSheet,
  setView,
  sortBy,
  handleSearch,

  // Drag n Drop
  handleDragOver,
  handleDragLeave,
  handleDrop
});
