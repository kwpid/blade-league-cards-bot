import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getUserData } from "../firestoreHelpers.js";

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
    const userData = await getUserData(targetUser.id);
    const formatted = formatStars(userData.balance);

    const embed = new EmbedBuilder()
      .setColor(0xffd700)
      .setTitle("⭐ Star Balance")
      .setDescription(`${targetUser.id === interaction.user.id ? "You have" : `${targetUser.username} has`} **⭐ ${formatted} stars!**`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
