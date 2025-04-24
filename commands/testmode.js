import { SlashCommandBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('testmode')
    .setDescription('[ADMIN] Enable/disable bot testing mode')
    .addBooleanOption(option =>
      option.setName('enabled')
        .setDescription('Set test mode status')
        .setRequired(true))
    .setDefaultMemberPermissions(0x8), // ADMINISTRATOR permission flag

  async execute(interaction, pool) {
    const enabled = interaction.options.getBoolean('enabled');
    
    // Store test mode status in database
    await pool.query(
      `INSERT INTO bot_settings (setting_name, setting_value)
       VALUES ('test_mode', $1)
       ON CONFLICT (setting_name)
       DO UPDATE SET setting_value = $1`,
      [enabled]
    );

    await interaction.reply({
      content: `✅ Test mode ${enabled ? 'ENABLED' : 'DISABLED'}. ${enabled ? 'Only admins can use commands.' : 'All users can access commands.'}`,
      flags: "Ephemeral"
    });
  }
};
