import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your or another user's star balance")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("The user to check balance for")
        .setRequired(false)),

  async execute(interaction, pool) {
    const targetUser = interaction.options.getUser("user") || interaction.user;
    
    // Get balance from database with proper default
    const res = await pool.query(
      `INSERT INTO user_balances (user_id, balance)
       VALUES ($1, 100)
       ON CONFLICT (user_id) 
       DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING balance`,
      [targetUser.id]
    );
    
    const balance = res.rows[0].balance;
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
