import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('testmode')
    .setDescription('Toggle test mode (admin only)')
    .addBooleanOption(opt =>
      opt.setName('enable')
         .setDescription('Enable or disable test mode')
         .setRequired(true)
    ),

  async execute(interaction, pool) {
    const isAdmin = interaction.memberPermissions?.has('Administrator');
    if (!isAdmin) {
      return interaction.reply({ content: '❌ You must be an admin to use this command.', ephemeral: true });
    }

    const enable = interaction.options.getBoolean('enable');
    try {
      await pool.query(`UPDATE bot_settings SET test_mode = $1`, [enable]);
      return interaction.reply({
        content: `✅ Test mode has been **${enable ? 'enabled' : 'disabled'}**.`,
        ephemeral: true
      });
    } catch (err) {
      console.error(err);
      return interaction.reply({ content: '❌ Failed to update test mode.', ephemeral: true });
    }
  }
};
