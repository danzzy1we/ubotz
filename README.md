# Telegram Userbot - Share Pesan ke Semua Grup (dengan Loader GitHub)

Userbot Node.js (GramJS) — login pakai akun Telegram sendiri (bukan bot token), kode disimpan di
GitHub dan otomatis ter-update tiap restart via `loader.js`.

## Struktur

```
(root Pterodactyl)
├── loader.js          <- diinstall via npm, dijalankan lewat "npm start"
├── package.json        <- berisi script "start": "node loader.js"
├── .env                <- API_ID/API_HASH (persisten, tidak ikut ke-reset)
├── session/             <- data login (persisten, JANGAN pernah di-share/commit)
├── blacklist.json        <- daftar grup blacklist (persisten)
├── config.json            <- setting cooldown (persisten)
└── app/                    <- HASIL clone dari GitHub, auto ter-update tiap restart
    ├── index.js
    ├── auth.js
    ├── package.json
    └── ...
```

`loader.js` otomatis:
1. Clone repo GitHub kamu ke folder `app/` (pertama kali) atau `git pull` (restart berikutnya)
2. Symlink `.env`, `session/`, `blacklist.json`, `config.json` dari root ke dalam `app/`, supaya
   data itu **tidak pernah hilang/ter-reset** meskipun kode di GitHub berubah.
3. `npm install` otomatis.
4. Jalankan `node index.js` dari dalam `app/`.

## Setup Repo GitHub

1. Push semua file bot (`index.js`, `auth.js`, `package.json`, `.env.example`, `README.md`, dst)
   ke repo kamu, **kecuali** `session/`, `blacklist.json`, `config.json` (sudah di-`.gitignore`).
2. Pastikan branch default sesuai (default loader: `main`).

## Setup di Pterodactyl

### 1. Upload `loader.js` dan `package.json` ke root server
Cuma dua file ini yang perlu diupload manual. Semua kode bot lainnya di-download otomatis dari GitHub oleh loader.

### 2. (Opsional) Set repo/branch custom
Kalau mau override tanpa edit `loader.js`, isi environment variable di tab **Startup**:
```
GIT_REPO_URL=https://github.com/danzzy1we/ubots.git
GIT_BRANCH=main
```
Kalau tidak diisi, loader pakai default yang sudah ditulis di dalam `loader.js`.

### 3. Startup Command
```
npm start
```

### 4. Jalankan pertama kali
Klik **Start**. Loader akan:
- Clone repo (`git clone`)
- Membuat `.env` otomatis dari `.env.example` di repo (isinya kosong) kalau belum ada
- `npm install`
- Coba jalankan bot → berhenti karena `API_ID`/`API_HASH` masih kosong

### 5. Isi `.env`
Buka file `.env` di **root** (sejajar dengan `loader.js`, BUKAN di dalam folder `app/`), isi:
```
API_ID=xxxxxx
API_HASH=xxxxxxxxxxxxxxxxxxxxxxxx
```
Simpan, lalu **Start** ulang.

### 6. Login (interaktif via console)
Prompt nomor HP → password 2FA (opsional) → kode OTP, jawab lewat kotak "Type a command..." di
console Pterodactyl, seperti biasa. Session tersimpan di folder **`session/`** di root — permanen,
tidak akan hilang meskipun kode di GitHub sering diupdate.

## Update kode
Push perubahan ke GitHub → **restart** server di Pterodactyl → loader otomatis `git pull` dan
jalankan versi terbaru. Tidak perlu upload manual atau login ulang.

## Command Bot
- `.jpm` — reply pesan apapun, share ke semua grup (skip blacklist)
- `.bl` / `.unbl` — blacklist / un-blacklist grup saat ini
- `.bllist` — lihat daftar blacklist
- `.cd <detik>` — atur cooldown, contoh `.cd 1`, `.cd 0.1`
- `.menu` — lihat semua command

## Pairing ulang / ganti akun
Stop server → hapus folder **`session/`** di root → Start lagi → login ulang dari awal.
Tidak akan mempengaruhi kode di `app/`.

## Catatan keamanan
- **`session/` JANGAN PERNAH di-commit ke GitHub** — itu setara password akun Telegram kamu. Sudah ada di `.gitignore`, tapi tetap cek manual sebelum push kalau ragu.
- **`.env` JANGAN PERNAH di-commit ke GitHub** — berisi API_ID/API_HASH kamu. Sudah ada di `.gitignore`, tapi tetap cek manual sebelum push kalau ragu. Kalau terlanjur ke-commit, generate ulang API_ID/API_HASH baru di my.telegram.org dan hapus dari histori repo (paling gampang: hapus & buat ulang repo).
- Userbot ini pakai akun pribadi — mass-forward berlebihan berisiko kena limit/flag dari Telegram ke akun kamu sendiri.
