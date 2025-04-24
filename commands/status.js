import { SlashCommandBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Load config manually (compatible with ES modules)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../config.json'), 'utf8'));

export default {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Shows the current bot status (dev mode or not).'),

  async execute(interaction) {
    const status = config.devMode
      ? '🧪 The bot is currently in **Dev Mode**. Only admins can use commands.'
      : '✅ The bot is currently in **Public Mode**. All users can use commands.';

    await interaction.reply({ content: status, ephemeral: true });
  }
};
