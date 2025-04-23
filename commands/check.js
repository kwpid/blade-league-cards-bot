import { SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("check")
    .setDescription("Checks a user's info by mention or ID")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("Select a user")
        .setRequired(false))
    .addStringOption(option =>
      option.setName("userid")
        .setDescription("Or enter a user ID")
        .setRequired(false)),

  async execute(interaction) {
    const userOption = interaction.options.getUser("user");
    const userIdOption = interaction.options.getString("userid");

    let userToCheck;

    if (userOption) {
      userToCheck = userOption;
    } else if (userIdOption) {
      try {
        userToCheck = await interaction.client.users.fetch(userIdOption);
      } catch (err) {
        return interaction.reply({ content: "Couldn't find a user with that ID.", ephemeral: true });
      }
    } else {
      return interaction.reply({ content: "Please provide a user or user ID.", ephemeral: true });
    }

    // Example reply
    await interaction.reply(`Checking user: ${userToCheck.tag} (ID: ${userToCheck.id})`);
  },
};
