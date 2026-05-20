# 📋 Kontrak API — RumahDrive
> Blueprint endpoint FastAPI yang harus kamu buat agar cocok dengan `app.js` & `api.js`.
> **Arsitektur: Pure Filesystem — tanpa database.**

---

## 🗂️ Arsitektur Filesystem

### Struktur Folder di Server
```
/home/user/rumahdrive/        ← STORAGE_ROOT (atur di config FastAPI)
├── Foto/
│   ├── pantai.jpg
│   └── Liburan Bali/
│       └── video.mp4
├── Dokumen/
│   └── rapor.pdf
└── Video/
```

### Cara Kerja "ID" Item (Tanpa Database)
Karena tidak ada database, tidak ada UUID. **ID = path virtual yang di-encode base64url:**

```python
import base64

STORAGE_ROOT = "/home/user/rumahdrive"

def path_to_id(virtual_path: str) -> str:
    """"/Foto/pantai.jpg" → "L0ZvdG8vcGFudGFpLmpwZw=="""
    return base64.urlsafe_b64encode(virtual_path.encode()).decode()

def id_to_path(item_id: str) -> str:
    """"L0ZvdG8vcGFudGFpLmpwZw==" → "/Foto/pantai.jpg"""
    return base64.urlsafe_b64decode(item_id.encode()).decode()

def virtual_to_real(virtual_path: str) -> Path:
    """Path logis → path fisik di disk."""
    # strip leading slash, gabung dengan STORAGE_ROOT
    clean = virtual_path.lstrip("/")
    real = Path(STORAGE_ROOT) / clean
    # KEAMANAN: pastikan tidak ada path traversal (../../etc/passwd)
    real.resolve().relative_to(Path(STORAGE_ROOT).resolve())
    return real
```

### Cara Baca Metadata File (Tanpa Database)
```python
import mimetypes
from pathlib import Path
from datetime import datetime

def file_to_item(real_path: Path, virtual_path: str) -> dict:
    stat = real_path.stat()
    is_folder = real_path.is_dir()
    mime = None if is_folder else mimetypes.guess_type(real_path.name)[0]
    item_id = path_to_id(virtual_path)
    return {
        "id":           item_id,
        "name":         real_path.name,
        "type":         "folder" if is_folder else "file",
        "path":         virtual_path,
        "size_bytes":   0 if is_folder else stat.st_size,
        "created_at":   datetime.fromtimestamp(stat.st_ctime).isoformat() + "Z",
        "modified_at":  datetime.fromtimestamp(stat.st_mtime).isoformat() + "Z",
        "mime_type":    mime,
        "thumbnail_url": f"/api/files/{item_id}/thumbnail" if mime and mime.startswith("image/") else None,
    }
```

---

## Base URL
```
http://<IP-LOKAL>:8000/api
```
Contoh: `http://192.168.1.10:8000/api`

---

## Ringkasan Endpoint

| # | Method   | Endpoint                        | Fungsi                          |
|---|----------|---------------------------------|---------------------------------|
| 1 | `GET`    | `/api/files`                    | List file & folder              |
| 2 | `POST`   | `/api/files/upload`             | Upload file                     |
| 3 | `DELETE` | `/api/files/{id}`               | Hapus file                      |
| 4 | `GET`    | `/api/files/{id}/download`      | Download file                   |
| 5 | `GET`    | `/api/files/{id}/thumbnail`     | Thumbnail gambar (opsional)     |
| 6 | `POST`   | `/api/folders`                  | Buat folder baru                |
| 7 | `GET`    | `/api/folders/{id}`             | Detail / info sebuah folder     |
| 8 | `PATCH`  | `/api/folders/{id}`             | Rename folder                   |
| 9 | `PATCH`  | `/api/folders/{id}/move`        | Pindahkan folder *(opsional)*   |
| 10| `DELETE` | `/api/folders/{id}`             | Hapus folder (rekursif)         |
| 11| `GET`    | `/api/storage/info`             | Info kapasitas storage          |

---

## Detail Endpoint

---

### 1. `GET /api/files` — List File & Folder

**Query Parameter:**

| Parameter | Tipe   | Wajib | Keterangan                     |
|-----------|--------|-------|--------------------------------|
| `path`    | string | Ya    | Path folder, misal `/` atau `/Foto/Liburan` |

**Contoh request:**
```
GET /api/files?path=/Foto
```

**Response `200 OK`:**
```json
{
  "current_path": "/Foto",
  "total_size_bytes": 107374182400,
  "used_size_bytes": 23622320128,
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
```

> `id` = path virtual di-encode base64url. Decode di FastAPI dengan `id_to_path(id)` untuk dapat path aslinya.

**Implementasi FastAPI (filesystem):**
```python
import os, mimetypes, shutil, base64
from pathlib import Path
from datetime import datetime
from fastapi import HTTPException

STORAGE_ROOT = Path("/home/user/rumahdrive")

@app.get("/api/files")
def list_files(path: str = "/"):
    real_dir = virtual_to_real(path)
    if not real_dir.exists() or not real_dir.is_dir():
        raise HTTPException(404, "Folder tidak ditemukan")

    items = []
    for entry in sorted(real_dir.iterdir(), key=lambda e: (e.is_file(), e.name.lower())):
        vpath = path.rstrip("/") + "/" + entry.name
        items.append(file_to_item(entry, vpath))

    disk = shutil.disk_usage(STORAGE_ROOT)
    return {
        "current_path": path,
        "total_size_bytes": disk.total,
        "used_size_bytes": disk.used,
        "items": items,
    }
```

---

### 2. `POST /api/files/upload` — Upload File

**Request:** `multipart/form-data`

| Field  | Tipe   | Wajib | Keterangan                     |
|--------|--------|-------|--------------------------------|
| `file` | File   | Ya    | File yang diupload             |
| `path` | string | Ya    | Folder tujuan, misal `/Foto`   |

**Response `201 Created`:**
```json
{
  "id": "L1ZpZGVvL3ZpZGVvX3VsYW5nX3RhaHVuLm1wNA==",
  "name": "video_ulang_tahun.mp4",
  "type": "file",
  "path": "/Video/video_ulang_tahun.mp4",
  "size_bytes": 52428800,
  "created_at": "2025-07-01T14:22:00Z",
  "modified_at": "2025-07-01T14:22:00Z",
  "mime_type": "video/mp4",
  "thumbnail_url": null
}
```

**Implementasi FastAPI (filesystem):**
```python
from fastapi import UploadFile, Form
import shutil

@app.post("/api/files/upload", status_code=201)
async def upload_file(file: UploadFile, path: str = Form(...)):
    real_dir = virtual_to_real(path)
    if not real_dir.exists():
        raise HTTPException(404, "Folder tujuan tidak ditemukan")

    dest = real_dir / file.filename
    if dest.exists():
        raise HTTPException(409, f"File '{file.filename}' sudah ada")

    with dest.open("wb") as f:
        shutil.copyfileobj(file.file, f)

    vpath = path.rstrip("/") + "/" + file.filename
    return file_to_item(dest, vpath)
```

---

### 3. `DELETE /api/files/{id}` — Hapus File

**Response `204 No Content`** — body kosong.

**Implementasi FastAPI (filesystem):**
```python
@app.delete("/api/files/{item_id}", status_code=204)
def delete_file(item_id: str):
    vpath = id_to_path(item_id)
    real = virtual_to_real(vpath)
    if not real.exists() or not real.is_file():
        raise HTTPException(404, "File tidak ditemukan")
    real.unlink()
```

---

### 4. `GET /api/files/{id}/download` — Download File

**Response:** Binary stream file.

**Implementasi FastAPI (filesystem):**
```python
from fastapi.responses import FileResponse

@app.get("/api/files/{item_id}/download")
def download_file(item_id: str):
    vpath = id_to_path(item_id)
    real = virtual_to_real(vpath)
    if not real.exists() or not real.is_file():
        raise HTTPException(404, "File tidak ditemukan")
    return FileResponse(real, filename=real.name)
```

---

### 5. `GET /api/files/{id}/thumbnail` — Thumbnail *(Opsional)*

Gambar kecil (maks 256×256 px) untuk preview di grid.

**Implementasi FastAPI (filesystem):**
```python
from PIL import Image
from fastapi.responses import StreamingResponse
import io

@app.get("/api/files/{item_id}/thumbnail")
def get_thumbnail(item_id: str):
    vpath = id_to_path(item_id)
    real = virtual_to_real(vpath)
    if not real.exists():
        raise HTTPException(404, "File tidak ditemukan")
    img = Image.open(real)
    img.thumbnail((256, 256))
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=75)
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/jpeg")
```

> Install Pillow dulu: `pip install Pillow`

---

### 6. `POST /api/folders` — Buat Folder Baru

**Request Body:** `application/json`
```json
{ "name": "Dokumen Sekolah", "parent_path": "/Anak" }
```

**Response `201 Created`:**
```json
{
  "id": "L0FuYWsvRG9rdW1lbiBTZWtvbGFo",
  "name": "Dokumen Sekolah",
  "type": "folder",
  "path": "/Anak/Dokumen Sekolah",
  "size_bytes": 0,
  "created_at": "2025-07-01T15:00:00Z",
  "modified_at": "2025-07-01T15:00:00Z",
  "mime_type": null,
  "thumbnail_url": null
}
```

**Response `409 Conflict`:** `{ "detail": "Folder dengan nama ini sudah ada." }`

**Implementasi FastAPI (filesystem):**
```python
@app.post("/api/folders", status_code=201)
def create_folder(body: CreateFolderRequest):
    vpath = body.parent_path.rstrip("/") + "/" + body.name
    real = virtual_to_real(vpath)
    if real.exists():
        raise HTTPException(409, "Folder dengan nama ini sudah ada")
    real.mkdir(parents=False)
    return file_to_item(real, vpath)
```

---

### 7. `GET /api/folders/{id}` — Detail Folder

Metadata folder itu sendiri — bukan isinya.

**Response `200 OK`:**
```json
{
  "id": "L0FuYWsvRG9rdW1lbiBTZWtvbGFo",
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
```

**Implementasi FastAPI (filesystem):**
```python
@app.get("/api/folders/{folder_id}")
def get_folder(folder_id: str):
    vpath = id_to_path(folder_id)
    real = virtual_to_real(vpath)
    if not real.exists() or not real.is_dir():
        raise HTTPException(404, "Folder tidak ditemukan")

    # Hitung ukuran total isi folder
    total_size = sum(f.stat().st_size for f in real.rglob("*") if f.is_file())
    item_count = sum(1 for _ in real.iterdir())

    item = file_to_item(real, vpath)
    item["parent_path"] = "/" + "/".join(vpath.strip("/").split("/")[:-1])
    item["size_bytes"] = total_size
    item["item_count"] = item_count
    return item
```

---

### 8. `PATCH /api/folders/{id}` — Rename Folder

**Request Body:** `application/json`
```json
{ "name": "Dokumen Sekolah 2025" }
```

**Response `200 OK`:** FolderItem dengan `name` dan `path` yang sudah diperbarui, termasuk `id` baru (karena path berubah).

**Implementasi FastAPI (filesystem):**
```python
@app.patch("/api/folders/{folder_id}")
def rename_folder(folder_id: str, body: RenameFolderRequest):
    vpath = id_to_path(folder_id)
    real = virtual_to_real(vpath)
    if not real.exists():
        raise HTTPException(404, "Folder tidak ditemukan")

    new_real = real.parent / body.name
    if new_real.exists():
        raise HTTPException(409, "Nama sudah dipakai di lokasi ini")

    real.rename(new_real)

    # Buat vpath baru dan ID baru (path berubah = ID berubah)
    parent_vpath = "/" + "/".join(vpath.strip("/").split("/")[:-1])
    new_vpath = parent_vpath.rstrip("/") + "/" + body.name
    return file_to_item(new_real, new_vpath)
```

> ⚠️ Setelah rename, `id` di frontend berubah. `app.js` akan refresh daftar file otomatis setelah operasi ini.

---

### 9. `PATCH /api/folders/{id}/move` — Pindahkan Folder *(Opsional)*

**Request Body:** `application/json`
```json
{ "new_parent_path": "/Arsip" }
```

**Response `200 OK`:** FolderItem dengan `path` dan `id` baru.

**Implementasi FastAPI (filesystem):**
```python
@app.patch("/api/folders/{folder_id}/move")
def move_folder(folder_id: str, body: MoveFolderRequest):
    vpath = id_to_path(folder_id)
    real = virtual_to_real(vpath)
    if not real.exists():
        raise HTTPException(404, "Folder tidak ditemukan")

    dest_dir = virtual_to_real(body.new_parent_path)
    dest = dest_dir / real.name
    if dest.exists():
        raise HTTPException(409, "Folder dengan nama sama sudah ada di tujuan")

    shutil.move(str(real), str(dest))

    new_vpath = body.new_parent_path.rstrip("/") + "/" + real.name
    return file_to_item(dest, new_vpath)
```

---

### 10. `DELETE /api/folders/{id}` — Hapus Folder

Menghapus folder **beserta seluruh isinya secara rekursif**.

**Response `204 No Content`** — body kosong.

**Response `404 Not Found`:** `{ "detail": "Folder tidak ditemukan." }`

**Implementasi FastAPI (filesystem):**
```python
@app.delete("/api/folders/{folder_id}", status_code=204)
def delete_folder(folder_id: str):
    vpath = id_to_path(folder_id)
    real = virtual_to_real(vpath)
    if not real.exists() or not real.is_dir():
        raise HTTPException(404, "Folder tidak ditemukan")
    shutil.rmtree(real)   # hapus rekursif beserta isinya
```

> ⚠️ **DESTRUKTIF** — `shutil.rmtree()` tidak bisa di-undo. Frontend sudah menampilkan modal konfirmasi sebelum memanggil endpoint ini.

---

### Menyatukan endpoint file & folder? (Pilihan Desain)

Kamu punya **2 pilihan** saat implementasi di FastAPI:

| Pilihan | Kelebihan | Kekurangan |
|---|---|---|
| **A. Pisah** `/api/files/...` dan `/api/folders/...` | Lebih eksplisit, mudah dibaca | Lebih banyak endpoint |
| **B. Gabung** `/api/items/{id}` untuk semua | Lebih ringkas | Logic di server lebih kompleks |

`api.js` sudah menggunakan **Pilihan A** (pisah). Jika kamu ingin Pilihan B, cukup ubah URL di fungsi-fungsi `apiDeleteFolder`, `apiRenameFolder`, dll agar mengarah ke `/api/items/{id}`.

---

### 11. `GET /api/storage/info` — Info Kapasitas Storage

**Response `200 OK`:**
```json
{
  "total_bytes": 107374182400,
  "used_bytes":  23622320128,
  "free_bytes":  83751862272
}
```

**Implementasi FastAPI (filesystem):**
```python
import shutil

@app.get("/api/storage/info")
def storage_info():
    disk = shutil.disk_usage(STORAGE_ROOT)
    return {
        "total_bytes": disk.total,
        "used_bytes":  disk.used,
        "free_bytes":  disk.free,
    }
```

---

## Penanganan Error Standar

Semua endpoint kembalikan format error seragam:

```json
{ "detail": "Pesan error yang jelas di sini." }
```

FastAPI sudah otomatis menggunakan format ini — cukup gunakan `HTTPException`:

```python
from fastapi import HTTPException
raise HTTPException(status_code=404, detail="Item tidak ditemukan.")
```

---

## CORS (Penting!)

Tambahkan di `main.py` agar frontend bisa mengakses API:

```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # aman untuk jaringan rumah
    allow_methods=["*"],
    allow_headers=["*"],
)
```

---

## Skema Pydantic (Referensi)

```python
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class FileItem(BaseModel):
    id: str
    name: str
    type: str                        # "file" | "folder"
    path: str
    size_bytes: int
    created_at: datetime
    modified_at: datetime
    mime_type: Optional[str] = None
    thumbnail_url: Optional[str] = None

class FolderDetail(FileItem):
    parent_path: str
    item_count: int

class ListResponse(BaseModel):
    current_path: str
    total_size_bytes: int
    used_size_bytes: int
    items: list[FileItem]

class CreateFolderRequest(BaseModel):
    name: str
    parent_path: str

class RenameFolderRequest(BaseModel):
    name: str

class MoveFolderRequest(BaseModel):
    new_parent_path: str

class StorageInfo(BaseModel):
    total_bytes: int
    used_bytes: int
    free_bytes: int
```

## Library Python yang Dibutuhkan

```bash
pip install fastapi uvicorn python-multipart Pillow
```

| Library | Kegunaan |
|---|---|
| `fastapi` | Framework API |
| `uvicorn` | Server ASGI untuk menjalankan FastAPI |
| `python-multipart` | Wajib untuk `UploadFile` / form data |
| `Pillow` | Generate thumbnail gambar *(opsional)* |