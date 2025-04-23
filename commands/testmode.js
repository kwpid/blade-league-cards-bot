import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../data/config.json');

export default {
  data: new SlashCommandBuilder()
    .setName("testmode")
    .setDescription("Toggle test mode (admin only)")
    .addBooleanOption(option =>
      option.setName("enabled")
        .setDescription("Whether to enable test mode")
        .setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const enabled = interaction.options.getBoolean("enabled");
    
    let config = {};
    try {
      config = JSON.parse(await fs.readFile(configPath, 'utf8'));
    } catch {
      config = { testMode: false };
    }
    
    config.testMode = enabled;
    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
    
    await interaction.reply({
      content: `✅ Test mode has been ${enabled ? 'enabled' : 'disabled'}.`,
      ephemeral: true
    });
  },
};
