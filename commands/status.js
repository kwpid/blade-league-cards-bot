import { SlashCommandBuilder } from 'discord.js';
import config from '../config.json' assert { type: 'json' };

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
