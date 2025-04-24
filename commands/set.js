import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('set')
    .setDescription('Set a user’s star balance (Admin only)')
    .addStringOption(option =>
      option.setName('value')
        .setDescription('What to set')
        .setRequired(true)
        .addChoices({ name: 'Stars', value: 'stars' }))
    .addUserOption(option =>
      option.setName('user')
        .setDescription('User to modify')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('amount')
        .setDescription('Amount to set')
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction, pool) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ You need admin permissions.', ephemeral: true });
    }

    const value = interaction.options.getString('value');
    const targetUser = interaction.options.getUser('user');
    const amount = interaction.options.getInteger('amount');

    if (value === 'stars') {
      await pool.query(`
        INSERT INTO user_balances (user_id, balance)
        VALUES ($1, $2)
        ON CONFLICT (user_id) DO UPDATE SET balance = $2, last_updated = NOW()
      `, [targetUser.id, amount]);

      return interaction.reply({
        content: `✅ Set ${targetUser.username}'s stars to ⭐ ${amount}`,
        ephemeral: true
      });
    }
  }
};
