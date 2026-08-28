// Login interaktif via console Pterodactyl.
// Session disimpan sebagai FILE di folder ./session (bukan di .env).
// Kalau nomor/akun bermasalah, tinggal hapus folder "session" lalu restart untuk pairing ulang.

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { TelegramClient } = require("telegram");
const { StoreSession } = require("telegram/sessions");

const SESSION_DIR = path.join(__dirname, "session");

function sessionExists() {
  // StoreSession nulis file-file kecil di dalam folder ini setelah login sukses.
  // Anggap "belum login" kalau foldernya belum ada / masih kosong.
  if (!fs.existsSync(SESSION_DIR)) return false;
  const files = fs.readdirSync(SESSION_DIR);
  return files.length > 0;
}

let rl = null;
function getRl() {
  if (!rl) rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return rl;
}

function ask(question) {
  return new Promise((resolve) => {
    console.log(`\n>>> ${question}`);
    process.stdout.write("Ketik jawaban lalu Enter: ");
    getRl().question("", (answer) => {
      resolve(answer.trim());
    });
  });
}

async function askPhoneNumber() {
  while (true) {
    const phone = await ask("Masukkan Nomor HP (format: +6281234567890)");
    if (/^\+\d{8,15}$/.test(phone)) return phone;
    console.log('❌ Format salah. Harus diawali "+" dan kode negara, contoh: +6281234567890. Coba lagi.');
  }
}

async function askPassword2FA() {
  return await ask("Masukkan Password 2FA (kosongkan lalu Enter kalau akun tidak pakai 2FA)");
}

async function askOtpCode() {
  return await ask("Masukkan Kode OTP dari Telegram");
}

// Return TelegramClient yang sudah login & connected, siap dipakai langsung.
async function getLoggedInClient(apiId, apiHash) {
  if (!fs.existsSync(SESSION_DIR)) fs.mkdirSync(SESSION_DIR, { recursive: true });

  const session = new StoreSession(SESSION_DIR);
  const client = new TelegramClient(session, apiId, apiHash, {
    connectionRetries: 5,
  });

  const alreadyLoggedIn = sessionExists();

  if (alreadyLoggedIn) {
    await client.connect();
    return client;
  }

  console.log("\n========================================");
  console.log("   LOGIN USERBOT TELEGRAM DIPERLUKAN");
  console.log("========================================");
  console.log("Jawab pertanyaan lewat kotak 'Type a command...' di console ini, lalu tekan Enter.\n");

  await client.start({
    phoneNumber: askPhoneNumber,
    password: askPassword2FA,
    phoneCode: askOtpCode,
    onError: (err) => {
      console.log("\n⚠️  Login error:", err.message || err);
      console.log("   (akan ditanya ulang otomatis kalau ini error input)\n");
    },
  });

  if (rl) rl.close();
  session.save(); // pastikan tertulis ke folder ./session

  console.log("\n✅ Login berhasil! Session disimpan di folder ./session");
  console.log('   (kalau perlu pairing ulang, tinggal hapus folder "session" lalu restart)');
  console.log("   Userbot lanjut jalan...\n");

  return client;
}

module.exports = { getLoggedInClient, SESSION_DIR };
