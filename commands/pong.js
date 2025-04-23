import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("pong")
    .setDescription("Replies with Pong!"),
  async execute(interaction) {
    await interaction.reply("Pongg");
  },
};
