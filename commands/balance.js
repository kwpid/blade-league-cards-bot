import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { query } from '../db.js';

async function getBalance(userId) {
  const res = await query(
    `INSERT INTO user_balances (user_id, balance) 
     VALUES ($1, 100) 
     ON CONFLICT (user_id) 
     DO UPDATE SET balance = user_balances.balance 
     RETURNING balance`,
    [userId]
  );
  return res.rows[0].balance;
}

async function setBalance(userId, amount) {
  await query(
    'UPDATE user_balances SET balance = $1 WHERE user_id = $2',
    [amount, userId]
  );
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
};
