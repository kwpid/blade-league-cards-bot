import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '../data/userBalances.json');

async function ensureDataFile() {
  try {
    await fs.access(dataPath);
  } catch {
    await fs.mkdir(path.dirname(dataPath), { recursive: true });
    await fs.writeFile(dataPath, '{}');
  }
}

async function getBalance(userId) {
  await ensureDataFile();
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  return data[userId] || 100;
}

function formatStars(number) {
  if (number < 1000) return number.toString();
  const units = ["", "K", "M", "B", "T"];
  let unitIndex = 0;
  while (number >= 1000 && unitIndex < units.length - 1) {
    number /= 1000;
    unitIndex++;
  }
  return `${number.toFixed(2)}${units[unitIndex]}`;
}

export default {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your or another user's star balance")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("The user to check balance for")
        .setRequired(false)),

  async execute(interaction) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    const balance = await getBalance(targetUser.id);
    const formatted = formatStars(balance);

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("⭐ Star Balance")
      .setDescription(`${targetUser.id === interaction.user.id ? "You have" : `${targetUser.username} has`} **⭐ ${formatted} stars!**`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
}
