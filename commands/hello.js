import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("hello")
    .setDescription("Greets the user with a hello message"),

  async execute(interaction) {
    await interaction.reply(`👋 Hello <@${interaction.user.id}>, what can I help you with?`);
  },
};
