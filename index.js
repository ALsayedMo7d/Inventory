const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
require("dotenv").config();
const keep_alive = require('./keep_alive.js')

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const TOKEN = process.env.TOKEN;
const DATA_FILE = "./data.json";
const DISPLAY_MESSAGE_FILE = "./displayMessageId.json";
const ADMIN_CHANNEL_ID = "1397949485669159172";
const DISPLAY_CHANNEL_ID = "1397385606723539126";

if (!fs.existsSync(DATA_FILE)) {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(
      {
        guns: {},
        armor: 0,
        ammo: {},
      },
      null,
      2,
    ),
  );
}

if (!fs.existsSync(DISPLAY_MESSAGE_FILE)) {
  fs.writeFileSync(DISPLAY_MESSAGE_FILE, JSON.stringify({ id: null }, null, 2));
}

function loadDisplayMessageId() {
  return JSON.parse(fs.readFileSync(DISPLAY_MESSAGE_FILE, "utf8")).id;
}

function saveDisplayMessageId(id) {
  fs.writeFileSync(DISPLAY_MESSAGE_FILE, JSON.stringify({ id }, null, 2));
}

function loadData() {
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

function formatDisplay(data) {
  const formatSection = (title, items) => {
    if (!items || Object.keys(items).length === 0) return `**${title}**\nNone`;
    return (
      `**${title}**\n` +
      Object.entries(items)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, val]) => `• ${capitalize(key)} → \`${val}\``)
        .join("\n")
    );
  };

  return [
    formatSection("🔫 Guns", data.guns),
    `**🛡️ Armor**\n\`${data.armor}\``,
    formatSection("💥 Ammo", data.ammo),
  ].join("\n\n");
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function ensureDisplayMessage() {
  const channel = await client.channels.fetch(DISPLAY_CHANNEL_ID);
  let messageId = loadDisplayMessageId();

  if (messageId) {
    try {
      const message = await channel.messages.fetch(messageId);
      return message;
    } catch (error) {
      console.log("Message not found, creating new display message.");
    }
  }

  const newMessage = await channel.send("Initializing inventory...");
  saveDisplayMessageId(newMessage.id);
  return newMessage;
}

async function updateDisplayMessage() {
  const channel = await client.channels.fetch(DISPLAY_CHANNEL_ID);
  let messageId = loadDisplayMessageId();
  let message;

  if (messageId) {
    try {
      message = await channel.messages.fetch(messageId);
    } catch {
      message = await ensureDisplayMessage();
    }
  } else {
    message = await ensureDisplayMessage();
  }

  const data = loadData();
  await message.edit(formatDisplay(data));
}

async function logChange(user, type, item, before, after, amount) {
  const channel = await client.channels.fetch(ADMIN_CHANNEL_ID);
  const now = new Date().toLocaleString();
  await channel.send(
    `📢 **Inventory Update**\n` +
      `**Type:** ${type}\n` +
      `**Item:** ${capitalize(item)}\n` +
      `**Before:** ${before}\n` +
      `**After:** ${after}\n` +
      `**Amount:** ${amount}\n` +
      `**By:** ${user}\n` +
      `**Time:** ${now}`,
  );
}

function findMatchingKey(obj, key) {
  return Object.keys(obj).find((k) => k.toLowerCase() === key.toLowerCase());
}

client.on("messageCreate", async (msg) => {
  if (!msg.content.startsWith("~") || msg.author.bot) return;

  const args = msg.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const data = loadData();

  if (["itakeguns", "iaddguns"].includes(command)) {
    const amount = parseInt(args[0]);
    const gunNameInput = args.slice(1).join(" ");
    const matchedKey = findMatchingKey(data.guns, gunNameInput);

    if (!matchedKey) return msg.reply("❌ Gun not found.");
    const before = data.guns[matchedKey];
    const isAdd = command === "iaddguns";

    data.guns[matchedKey] = isAdd
      ? before + amount
      : Math.max(0, before - amount);

    saveData(data);
    await updateDisplayMessage();
    await logChange(
      msg.author.username,
      "Gun",
      matchedKey,
      before,
      data.guns[matchedKey],
      amount,
    );
    msg.reply(`✅ ${isAdd ? "Added" : "Removed"} ${amount} ${matchedKey}`);
  } else if (["iaddarmor", "itakearmor"].includes(command)) {
    const amount = parseInt(args[0]);
    const isAdd = command === "iaddarmor";
    const before = data.armor;

    data.armor = isAdd ? before + amount : Math.max(0, before - amount);

    saveData(data);
    await updateDisplayMessage();
    await logChange(
      msg.author.username,
      "Armor",
      "armor",
      before,
      data.armor,
      amount,
    );
    msg.reply(`✅ ${isAdd ? "Added" : "Removed"} ${amount} armor`);
  } else if (["iaddammo", "itakeammo"].includes(command)) {
    const amount = parseInt(args[0]);
    const ammoTypeInput = args[1];
    const matchedKey = findMatchingKey(data.ammo, ammoTypeInput);

    if (!matchedKey) return msg.reply("❌ Ammo type not found.");
    const before = data.ammo[matchedKey];
    const isAdd = command === "iaddammo";

    data.ammo[matchedKey] = isAdd
      ? before + amount
      : Math.max(0, before - amount);

    saveData(data);
    await updateDisplayMessage();
    await logChange(
      msg.author.username,
      "Ammo",
      matchedKey,
      before,
      data.ammo[matchedKey],
      amount,
    );
    msg.reply(`✅ ${isAdd ? "Added" : "Removed"} ${amount} ${matchedKey}`);
  }
});

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await ensureDisplayMessage();
  await updateDisplayMessage();
});

if (!TOKEN) {
  console.error(
    "❌ TOKEN not found. Make sure to set it in environment variables.",
  );
} else {
  client.login(TOKEN).catch((err) => {
    console.error("❌ Login failed:", err.message);
  });
}
