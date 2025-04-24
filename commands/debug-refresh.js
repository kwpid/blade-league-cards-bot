import { SlashCommandBuilder } from 'discord.js';
import { REST, Routes } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

// Setup __dirname for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default {
  data: new SlashCommandBuilder()
    .setName('debug-refresh')
    .setDescription('🔧 Admin-only: Refresh slash commands and verify the database'),

  async execute(interaction, pool) {
    if (!interaction.memberPermissions.has('Administrator')) {
      return interaction.reply({ content: '❌ This command is restricted to server admins.', ephemeral: true });
    }

    try {
      // Defer the reply since this might take a while
      await interaction.deferReply({ ephemeral: true });

      // Load all commands fresh
      const commands = {};
      const commandFiles = fs.readdirSync(path.join(__dirname, '../commands'))
        .filter(file => file.endsWith('.js'));

      for (const file of commandFiles) {
        try {
          const { default: command } = await import(`../commands/${file}`);
          if (command?.data) {
            commands[command.data.name] = command;
          }
        } catch (err) {
          console.error(`Error loading command ${file}:`, err);
        }
      }

      // Register commands with Discord
      const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
      const commandsArray = Object.values(commands).map(cmd => cmd.data.toJSON());

      // Clear existing commands
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: [] }
      );

      // Register new commands
      const data = await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commandsArray }
      );

      // Verify database structure
      const client = await pool.connect();
      try {
        await client.query('SELECT NOW()'); // Simple connection test
        // Add any other database verification queries here
      } finally {
        client.release();
      }

      await interaction.editReply({
        content: `✅ Successfully refreshed ${data.length} commands and verified database!\n\nNew commands: ${data.map(c => c.name).join(', ')}`,
      });
    } catch (error) {
      console.error('Debug refresh failed:', error);
      await interaction.editReply({
        content: `❌ Failed to refresh: ${error.message}`,
      });
    }
  }
};
