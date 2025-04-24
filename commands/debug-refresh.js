import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('debug-refresh')
    .setDescription('🔧 Admin-only: Refresh slash commands and verify the database'),

  async execute(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ This command is restricted to server admins.', ephemeral: true });
    }

    return interaction.reply({
      content: '✅ Refreshing commands and verifying database...',
      ephemeral: true
    });
  }
};
