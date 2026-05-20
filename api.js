/**
 * api.js — RumahDrive
 * Semua fungsi fetch ke FastAPI backend.
 * Impor oleh app.js (tag <script> di index.html).
 */

const API_BASE = 'http://192.168.1.4:80/thorix'; // Ganti jika FastAPI berjalan di port berbeda, misal 'http://192.168.1.10:8000/api'

/* ------------------------------------------------------------------ */
/*  Helper: bungkus fetch + error handling seragam                     */
/* ------------------------------------------------------------------ */
async function apiFetch(path, options = {}) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, options);

  if (!res.ok) {
    let errMsg = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      errMsg = errBody.detail || errBody.message || errMsg;
    } catch (_) { /* biarkan errMsg default */ }
    throw new Error(errMsg);
  }

  // Untuk response 204 No Content (contoh: hapus), kembalikan null
  if (res.status === 204) return null;

  return res.json();
}

/* ================================================================== */
/*  1. LIST FILE & FOLDER                                              */
/*  GET /api/files?path=/                                              */
/* ================================================================== */
/**
 * Mendapatkan daftar file & folder di path tertentu.
 * @param {string} folderPath - misal "/" atau "/Foto/Liburan"
 * @returns {Promise<ListResponse>}
 */
async function apiListFiles(folderPath = '/') {
  const params = new URLSearchParams({ path: folderPath }).toString();
  return apiFetch(`/files?${params}`);
}

/*
  ── TANPA DATABASE: cara generate "id" di FastAPI ──────────────────
  Karena tidak pakai DB, tidak ada UUID. Gunakan path file/folder
  yang di-encode base64 sebagai ID:

    import base64
    def path_to_id(path: str) -> str:
        return base64.urlsafe_b64encode(path.encode()).decode()

    def id_to_path(item_id: str) -> str:
        return base64.urlsafe_b64decode(item_id.encode()).decode()

  Contoh:
    "/Foto/Liburan Bali"  →  "L0ZvdG8vTGlidXJhbiBCYWxp"
    "/Foto/pantai.jpg"    →  "L0ZvdG8vcGFudGFpLmpwZw=="

  Cara baca metadata file tanpa DB:
    stat = path.stat()
    size_bytes  = stat.st_size
    modified_at = datetime.fromtimestamp(stat.st_mtime)
    created_at  = datetime.fromtimestamp(stat.st_ctime)
    mime_type   = mimetypes.guess_type(path.name)[0]
  ────────────────────────────────────────────────────────────────────

  Contoh JSON response yang DIHARAPKAN dari FastAPI:
  {
    "current_path": "/Foto",
    "total_size_bytes": 1073741824,
    "used_size_bytes": 314572800,
    "items": [
      {
        "id": "L0ZvdG8vTGlidXJhbiBCYWxp",
        "name": "Liburan Bali",
        "type": "folder",
        "path": "/Foto/Liburan Bali",
        "size_bytes": 0,
        "created_at": "2025-06-01T10:00:00Z",
        "modified_at": "2025-06-15T08:30:00Z",
        "mime_type": null,
        "thumbnail_url": null
      },
      {
        "id": "L0ZvdG8vcGFudGFpLmpwZw==",
        "name": "pantai.jpg",
        "type": "file",
        "path": "/Foto/pantai.jpg",
        "size_bytes": 2457600,
        "created_at": "2025-06-15T09:12:00Z",
        "modified_at": "2025-06-15T09:12:00Z",
        "mime_type": "image/jpeg",
        "thumbnail_url": "/api/files/L0ZvdG8vcGFudGFpLmpwZw==/thumbnail"
      }
    ]
  }
*/

/* ================================================================== */
/*  2. UPLOAD FILE                                                     */
/*  POST /api/files/upload                                             */
/* ================================================================== */
/**
 * Upload satu file ke folder tertentu.
 * Menggunakan XMLHttpRequest agar bisa melacak progress.
 * @param {File} file - objek File dari input[type=file]
 * @param {string} folderPath - tujuan folder di server
 * @param {function} onProgress - callback(percent: number)
 * @returns {Promise<FileItem>}
 */
function apiUploadFile(file, folderPath, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);
    formData.append('path', folderPath);

    xhr.open('POST', `${API_BASE}/files/upload`);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable && onProgress) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch (_) {
          resolve(null);
        }
      } else {
        let msg = `HTTP ${xhr.status}`;
        try { msg = JSON.parse(xhr.responseText).detail || msg; } catch (_) {}
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Upload gagal (network error)')));
    xhr.addEventListener('abort', () => reject(new Error('Upload dibatalkan')));

    xhr.send(formData);
  });
}

/*
  Contoh JSON response upload:
  ────────────────────────────
  {
    "id": "ghi789",
    "name": "video_ulang_tahun.mp4",
    "type": "file",
    "path": "/Video/video_ulang_tahun.mp4",
    "size_bytes": 52428800,
    "created_at": "2025-07-01T14:22:00Z",
    "modified_at": "2025-07-01T14:22:00Z",
    "mime_type": "video/mp4",
    "thumbnail_url": null
  }
*/

/* ================================================================== */
/*  3a. BUAT FOLDER BARU                                               */
/*  POST /api/folders                                                  */
/* ================================================================== */
/**
 * Membuat folder baru.
 * @param {string} folderName  - nama folder
 * @param {string} parentPath  - lokasi parent, misal "/"
 * @returns {Promise<FolderItem>}
 */
async function apiCreateFolder(folderName, parentPath = '/') {
  return apiFetch('/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, parent_path: parentPath }),
  });
}

/*
  Body DIKIRIM:   { "name": "Dokumen Sekolah", "parent_path": "/Anak" }

  Response 201:
  {
    "id": "jkl012",
    "name": "Dokumen Sekolah",
    "type": "folder",
    "path": "/Anak/Dokumen Sekolah",
    "size_bytes": 0,
    "created_at": "2025-07-01T15:00:00Z",
    "modified_at": "2025-07-01T15:00:00Z",
    "mime_type": null,
    "thumbnail_url": null
  }
*/

/* ================================================================== */
/*  3b. DETAIL / INFO FOLDER                                           */
/*  GET /api/folders/{id}                                              */
/* ================================================================== */
/**
 * Mendapatkan metadata sebuah folder (nama, path, ukuran total isi, dll).
 * Berbeda dengan apiListFiles yang mengembalikan ISI folder,
 * endpoint ini hanya mengembalikan info tentang folder itu sendiri.
 * @param {string} folderId
 * @returns {Promise<FolderDetail>}
 */
async function apiGetFolder(folderId) {
  return apiFetch(`/folders/${encodeURIComponent(folderId)}`);
}

/*
  Response 200:
  {
    "id": "jkl012",
    "name": "Dokumen Sekolah",
    "type": "folder",
    "path": "/Anak/Dokumen Sekolah",
    "parent_path": "/Anak",
    "size_bytes": 10485760,
    "item_count": 7,
    "created_at": "2025-07-01T15:00:00Z",
    "modified_at": "2025-07-02T09:00:00Z",
    "mime_type": null,
    "thumbnail_url": null
  }

  Field tambahan dibanding FileItem biasa:
  - "parent_path"  : path folder induknya
  - "item_count"   : jumlah total item di dalam folder (rekursif atau tidak, terserah)
*/

/* ================================================================== */
/*  3c. RENAME FOLDER                                                  */
/*  PATCH /api/folders/{id}                                            */
/* ================================================================== */
/**
 * Mengganti nama folder.
 * @param {string} folderId   - ID folder yang akan diganti namanya
 * @param {string} newName    - nama baru
 * @returns {Promise<FolderItem>}
 */
async function apiRenameFolder(folderId, newName) {
  return apiFetch(`/folders/${encodeURIComponent(folderId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
}

/*
  Body DIKIRIM:   { "name": "Dokumen Sekolah 2025" }

  Response 200:  FolderItem dengan nama & path yang sudah diperbarui.
  {
    "id": "jkl012",
    "name": "Dokumen Sekolah 2025",
    "type": "folder",
    "path": "/Anak/Dokumen Sekolah 2025",
    ...
  }

  Response 409:  { "detail": "Nama folder sudah dipakai di lokasi ini." }
*/

/* ================================================================== */
/*  3d. PINDAHKAN FOLDER (opsional / bonus)                            */
/*  PATCH /api/folders/{id}/move                                       */
/* ================================================================== */
/**
 * Memindahkan folder ke parent path yang berbeda.
 * @param {string} folderId      - ID folder yang dipindah
 * @param {string} newParentPath - path tujuan, misal "/Arsip"
 * @returns {Promise<FolderItem>} 
 */
async function apimoveFolder(folderId, newParentPath) {
  return apiFetch(`/folders/${encodeURIComponent(folderId)}/move`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_parent_path: newParentPath }),
  });
}

/*
  Body DIKIRIM:   { "new_parent_path": "/Arsip" }

  Response 200:  FolderItem dengan path baru.
*/

/* ================================================================== */
/*  3e. HAPUS FOLDER                                                   */
/*  DELETE /api/folders/{id}                                           */
/* ================================================================== */
/**
 * Menghapus folder beserta seluruh isinya (rekursif).
 * Sama seperti apiDeleteItem() tapi endpoint khusus folder.
 *
 * Catatan: kamu bisa juga memakai endpoint DELETE /api/files/{id}
 * untuk keduanya (file & folder) — tergantung desain FastAPI-mu.
 * Fungsi ini disediakan jika kamu memisahkan endpoint folder & file.
 *
 * @param {string} folderId
 * @returns {Promise<null>}  - 204 No Content
 */
async function apiDeleteFolder(folderId) {
  return apiFetch(`/folders/${encodeURIComponent(folderId)}`, { method: 'DELETE' });
}

/*
  Response 204:  body kosong, hapus berhasil.
  Response 404:  { "detail": "Folder tidak ditemukan." }

  ⚠️  PERINGATAN untuk FastAPI kamu:
  Hapus folder bersifat DESTRUKTIF — semua file & subfolder di dalamnya
  ikut terhapus. Pastikan kamu sudah menampilkan konfirmasi di UI
  (modal hapus sudah ada di app.js) sebelum memanggil endpoint ini.
*/

/* ================================================================== */
/*  3b. RENAME FOLDER (atau file)                                      */
/*  PATCH /api/files/{id}                                              */
/* ================================================================== */
/**
 * Mengubah nama folder atau file.
 * @param {string} itemId   - ID item yang akan direname
 * @param {string} newName  - nama baru
 * @returns {Promise<FileItem|FolderItem>}
 */
async function apiRenameItem(itemId, newName) {
  return apiFetch(`/files/${encodeURIComponent(itemId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
}

/*
  Body yang DIKIRIM ke FastAPI:
  ─────────────────────────────
  { "name": "Nama Baru" }

  Contoh JSON response (item yang sudah diupdate):
  ─────────────────────────────────────────────────
  {
    "id": "jkl012",
    "name": "Nama Baru",
    "type": "folder",
    "path": "/Anak/Nama Baru",
    "size_bytes": 0,
    "created_at": "2025-07-01T15:00:00Z",
    "modified_at": "2025-07-02T09:00:00Z",
    "mime_type": null,
    "thumbnail_url": null
  }

  Error 409 jika nama sudah dipakai:
  { "detail": "Nama sudah digunakan di folder ini." }
*/

/* ================================================================== */
/*  4. HAPUS FILE ATAU FOLDER                                          */
/*  DELETE /api/files/{id}                                             */
/* ================================================================== */
/**
 * Hapus file atau folder berdasarkan ID.
 * @param {string} itemId - ID item
 * @returns {Promise<null>} - 204 No Content
 */
async function apiDeleteItem(itemId) {
  return apiFetch(`/files/${encodeURIComponent(itemId)}`, { method: 'DELETE' });
}

/* ================================================================== */
/*  5. DOWNLOAD FILE                                                   */
/*  GET /api/files/{id}/download                                       */
/* ================================================================== */
/**
 * Mengembalikan URL download yang langsung bisa dipakai di <a href>.
 * Tidak perlu fetch async — cukup arahkan browser ke URL ini.
 * @param {string} itemId
 * @returns {string} URL download
 */
function apiDownloadUrl(itemId) {
  return `${API_BASE}/files/${encodeURIComponent(itemId)}/download`;
}

/* ================================================================== */
/*  6. INFO STORAGE                                                    */
/*  GET /api/storage/info                                              */
/* ================================================================== */
/**
 * Mendapatkan informasi kapasitas storage keseluruhan.
 * @returns {Promise<StorageInfo>}
 */
async function apiGetStorageInfo() {
  return apiFetch('/storage/info');
}

/*
  Contoh JSON response:
  ─────────────────────
  {
    "total_bytes": 107374182400,
    "used_bytes":  23622320128,
    "free_bytes":  83751862272
  }
*/