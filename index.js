require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { NewMessage } = require("telegram/events");
const { Api } = require("telegram");
const { getLoggedInClient } = require("./auth");

const apiId = parseInt(process.env.API_ID);
const apiHash = process.env.API_HASH;
const PREFIX = process.env.PREFIX || ".";
const DEFAULT_DELAY_MS = 1500; // default 1.5 detik kalau belum pernah diset .cd

const BLACKLIST_FILE = path.join(__dirname, "blacklist.json");
const CONFIG_FILE = path.join(__dirname, "config.json");

// ---------- Util blacklist ----------
function loadBlacklist() {
  try {
    if (!fs.existsSync(BLACKLIST_FILE)) return [];
    const raw = fs.readFileSync(BLACKLIST_FILE, "utf-8");
    return JSON.parse(raw);
  } catch (e) {
    console.error("Gagal baca blacklist.json:", e.message);
    return [];
  }
}

function saveBlacklist(list) {
  fs.writeFileSync(BLACKLIST_FILE, JSON.stringify(list, null, 2));
}

// ---------- Util config (cooldown persisten) ----------
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return { cooldownMs: DEFAULT_DELAY_MS };
    const raw = fs.readFileSync(CONFIG_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed.cooldownMs || parsed.cooldownMs < 0) parsed.cooldownMs = DEFAULT_DELAY_MS;
    return parsed;
  } catch (e) {
    console.error("Gagal baca config.json:", e.message);
    return { cooldownMs: DEFAULT_DELAY_MS };
  }
}

function saveConfig(config) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

function getCooldownMs() {
  return loadConfig().cooldownMs;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------- Styling helper (HTML parse mode Telegram) ----------
function box(title, bodyLines) {
  const body = Array.isArray(bodyLines) ? bodyLines.join("\n") : bodyLines;
  return `<b>${title}</b>\n<blockquote>${body}</blockquote>`;
}

async function editStyled(message, html) {
  await message.edit({ text: html, parseMode: "html" });
}

// ---------- Main ----------
if (!apiId || !apiHash) {
  console.log("❌ Pastikan API_ID dan API_HASH sudah diisi di .env");
  process.exit(1);
}

let client;

(async () => {
  client = await getLoggedInClient(apiId, apiHash);
  const me = await client.getMe();
  console.log(`✅ Userbot aktif sebagai: ${me.firstName} (@${me.username || "-"})`);
  console.log(`Prefix command: ${PREFIX}`);
  console.log(`Cooldown share: ${getCooldownMs()}ms`);

  client.addEventHandler(async (event) => {
    try {
      const message = event.message;
      if (!message || !message.out) return; // hanya proses pesan dari akun sendiri
      const text = message.message || "";
      if (!text.startsWith(PREFIX)) return;

      const args = text.slice(PREFIX.length).trim().split(/\s+/);
      const cmd = (args.shift() || "").toLowerCase();
      const chatId = event.chatId ? event.chatId.toString() : null;

      if (cmd === "jpm" || cmd === "sh" || cmd === "share") {
        await handleShare(message, event);
      } else if (cmd === "bl") {
        await handleBlacklist(message, chatId, true);
      } else if (cmd === "unbl") {
        await handleBlacklist(message, chatId, false);
      } else if (cmd === "bllist") {
        await handleListBlacklist(message);
      } else if (cmd === "cd" || cmd === "cooldown") {
        await handleCooldown(message, args);
      } else if (cmd === "menu" || cmd === "help") {
        await handleMenu(message);
      }
    } catch (err) {
      console.error("Error handler:", err);
    }
  }, new NewMessage({}));
})();

// ---------- Handlers ----------

async function handleShare(message, event) {
  const replied = await message.getReplyMessage();
  if (!replied) {
    await editStyled(
      message,
      box("❌ GAGAL SHARE", "Reply pesan (teks/foto/video/dokumen apapun) yang mau di-share, lalu ketik <code>" + PREFIX + "jpm</code>")
    );
    return;
  }

  const cooldownMs = getCooldownMs();

  await editStyled(message, box("⏳ MEMPROSES", "Mengambil daftar grup..."));

  const dialogs = await client.getDialogs({});
  const groups = dialogs.filter((d) => d.isGroup || (d.isChannel && d.entity?.megagroup));

  const blacklist = loadBlacklist();

  const targets = groups.filter((d) => {
    const id = d.id.toString();
    return !blacklist.includes(id);
  });

  if (targets.length === 0) {
    await editStyled(message, box("❌ TIDAK ADA TARGET", "Semua grup ke-blacklist atau kamu belum join grup apapun."));
    return;
  }

  let success = 0;
  let failed = 0;

  await editStyled(
    message,
    box("⏳ MENGIRIM", [
      `Target: <code>${targets.length}</code> grup`,
      `Skip (blacklist): <code>${blacklist.length}</code> grup`,
      `Cooldown: <code>${(cooldownMs / 1000).toFixed(cooldownMs % 1000 === 0 ? 0 : 1)}s</code> per grup`,
    ])
  );

  for (const dialog of targets) {
    try {
      await client.forwardMessages(dialog.entity, {
        messages: [replied.id],
        fromPeer: replied.chatId || replied.peerId,
      });
      success++;
    } catch (err) {
      console.error(`Gagal kirim ke ${dialog.title || dialog.id}:`, err.message);
      failed++;
    }
    if (cooldownMs > 0) await sleep(cooldownMs);
  }

  await editStyled(
    message,
    box("✅ SELESAI SHARE", [
      `Berhasil : <code>${success}</code> grup`,
      `Gagal    : <code>${failed}</code> grup`,
      `Di-skip  : <code>${blacklist.length}</code> grup (blacklist)`,
    ])
  );
}

async function handleBlacklist(message, chatId, add) {
  if (!chatId) {
    await editStyled(message, box("❌ GAGAL", "Command ini cuma bisa dipakai di dalam grup."));
    return;
  }

  const chat = await message.getChat();
  const isGroup = chat && (chat.className === "Chat" || chat.className === "Channel");
  if (!isGroup) {
    await editStyled(message, box("❌ GAGAL", "Command ini cuma bisa dipakai di dalam grup, bukan di chat pribadi."));
    return;
  }

  let blacklist = loadBlacklist();
  const chatName = chat.title || chatId;

  if (add) {
    if (blacklist.includes(chatId)) {
      await editStyled(message, box("⚠️ SUDAH ADA", `Grup <b>${chatName}</b> sudah ada di blacklist.`));
      return;
    }
    blacklist.push(chatId);
    saveBlacklist(blacklist);
    await editStyled(
      message,
      box("✅ BLACKLIST DITAMBAHKAN", `Grup <b>${chatName}</b> akan di-skip saat <code>${PREFIX}jpm</code>.`)
    );
  } else {
    if (!blacklist.includes(chatId)) {
      await editStyled(message, box("⚠️ TIDAK ADA", `Grup <b>${chatName}</b> tidak ada di blacklist.`));
      return;
    }
    blacklist = blacklist.filter((id) => id !== chatId);
    saveBlacklist(blacklist);
    await editStyled(
      message,
      box("✅ BLACKLIST DIHAPUS", `Grup <b>${chatName}</b> akan ikut ke-share lagi saat <code>${PREFIX}jpm</code>.`)
    );
  }
}

async function handleCooldown(message, args) {
  const config = loadConfig();

  if (args.length === 0) {
    const current = config.cooldownMs / 1000;
    await editStyled(
      message,
      box("🕐 COOLDOWN SAAT INI", [
        `<code>${current}</code> detik per grup`,
        ``,
        `Ganti dengan: <code>${PREFIX}cd 1</code> (1 detik)`,
        `atau: <code>${PREFIX}cd 0.1</code> (0.1 detik)`,
      ])
    );
    return;
  }

  const raw = args[0].replace(",", ".");
  const seconds = parseFloat(raw);

  if (isNaN(seconds) || seconds < 0) {
    await editStyled(
      message,
      box("❌ NILAI TIDAK VALID", `Contoh pemakaian: <code>${PREFIX}cd 1</code> atau <code>${PREFIX}cd 0.1</code>`)
    );
    return;
  }

  if (seconds > 60) {
    await editStyled(message, box("❌ TERLALU BESAR", "Maksimal cooldown 60 detik."));
    return;
  }

  const ms = Math.round(seconds * 1000);
  config.cooldownMs = ms;
  saveConfig(config);

  await editStyled(
    message,
    box("✅ COOLDOWN DIUBAH", [
      `Cooldown baru: <code>${seconds}</code> detik per grup`,
      `Berlaku otomatis untuk <code>${PREFIX}jpm</code> berikutnya.`,
    ])
  );
}

async function handleMenu(message) {
  const cooldown = getCooldownMs() / 1000;
  const menu =
    `<b>✦ USERBOT SHARE — MENU ✦</b>\n\n` +
    `<blockquote>` +
    `┏━━━━━━━━━━━━━━━━━━\n` +
    `┃ 📤 <b>${PREFIX}jpm</b>\n` +
    `┃ ↳ Reply pesan apapun lalu ketik ini\n` +
    `┃ ↳ untuk share ke semua grup\n` +
    `┣━━━━━━━━━━━━━━━━━━\n` +
    `┃ 🚫 <b>${PREFIX}bl</b>\n` +
    `┃ ↳ Blacklist grup ini (di-skip saat share)\n` +
    `┣━━━━━━━━━━━━━━━━━━\n` +
    `┃ ✅ <b>${PREFIX}unbl</b>\n` +
    `┃ ↳ Hapus grup ini dari blacklist\n` +
    `┣━━━━━━━━━━━━━━━━━━\n` +
    `┃ 📋 <b>${PREFIX}bllist</b>\n` +
    `┃ ↳ Lihat semua grup yang di-blacklist\n` +
    `┣━━━━━━━━━━━━━━━━━━\n` +
    `┃ 🕐 <b>${PREFIX}cd</b> <code>&lt;detik&gt;</code>\n` +
    `┃ ↳ Atur jeda antar kirim, contoh:\n` +
    `┃ ↳ <code>${PREFIX}cd 1</code> atau <code>${PREFIX}cd 0.1</code>\n` +
    `┃ ↳ Saat ini: <code>${cooldown}s</code>\n` +
    `┣━━━━━━━━━━━━━━━━━━\n` +
    `┃ 📖 <b>${PREFIX}menu</b>\n` +
    `┃ ↳ Tampilkan menu ini\n` +
    `┗━━━━━━━━━━━━━━━━━━` +
    `</blockquote>`;

  await editStyled(message, menu);
}

async function handleListBlacklist(message) {
  const blacklist = loadBlacklist();
  if (blacklist.length === 0) {
    await editStyled(message, box("📋 BLACKLIST", "Kosong — belum ada grup yang di-blacklist."));
    return;
  }

  const lines = [];
  for (const id of blacklist) {
    try {
      const entity = await client.getEntity(BigInt(id));
      lines.push(`• ${entity.title || id}`);
    } catch {
      lines.push(`• ${id} <i>(tidak ditemukan/sudah keluar)</i>`);
    }
  }

  await editStyled(message, box(`📋 BLACKLIST (${blacklist.length} grup)`, lines));
}

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});
