import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { query } from '../db.js';

export default {
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Set a user's star balance (Admin only)")
    .addUserOption(option =>
      option.setName("user")
        .setDescription("The user to modify")
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName("amount")
        .setDescription("The amount to set")
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ 
        content: "❌ Administrator permission required!", 
        ephemeral: true 
      });
    }
    
    const targetUser = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    
    await query(
      'INSERT INTO user_balances (user_id, balance) VALUES ($1, $2) ' +
      'ON CONFLICT (user_id) DO UPDATE SET balance = $2',
      [targetUser.id, amount]
    );
    
    await interaction.reply({
      content: `✅ Set ${targetUser.username}'s balance to ${amount} stars.`,
      ephemeral: true
    });
  },
};
