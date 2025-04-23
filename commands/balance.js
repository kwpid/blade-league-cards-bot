// balance.js
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getBalance } from "../firebase.js";

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
    try {
      // Defer reply to give more time for Firebase operation
      await interaction.deferReply();
      
      const targetUser = interaction.options.getUser("user") || interaction.user;
      const balance = await getBalance(targetUser.id);
      
      if (balance === undefined || balance === null) {
        throw new Error("Failed to retrieve balance");
      }

      const formatted = formatStars(balance);

      const embed = new EmbedBuilder()
        .setColor(0xffd700)
        .setTitle("⭐ Star Balance")
        .setDescription(`${targetUser.id === interaction.user.id ? "You have" : `${targetUser.username} has`} **⭐ ${formatted} stars!**`)
        .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
        .setFooter({ text: "Blade League Cards" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error("Error in balance command:", error);
      
      // Try to edit the deferred reply if it exists
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: "❌ There was an error checking your balance. Please try again later.",
        });
      } else {
        await interaction.reply({
          content: "❌ There was an error checking your balance. Please try again later.",
          ephemeral: true
        });
      }
    }
  },
};
