import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Set a user's star balance (Admin only)")
    .addStringOption((option) =>
      option
        .setName("value")
        .setDescription("The value type to set")
        .setRequired(true)
        .addChoices({ name: "stars", value: "stars" }),
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to modify")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("The amount to set")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, pool) {
    const value = interaction.options.getString("value");
    const targetUser = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: "❌ You don't have permission to use this command!",
        ephemeral: true,
      });
    }

    if (value === "stars") {
      await pool.query(
        `INSERT INTO user_balances (user_id, balance)
         VALUES ($1, $2)
         ON CONFLICT (user_id) 
         DO UPDATE SET balance = $2, last_updated = NOW()`,
        [targetUser.id, amount]
      );
      
      await interaction.reply({
        content: `✅ Set ${targetUser.username}'s stars to ⭐ ${amount}`,
        ephemeral: true,
      });
    }
  }
};
