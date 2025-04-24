import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';

// Setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const loadJSON = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const cardsData = loadJSON('data/cards.json');
const shopData = loadJSON('data/shopItems.json');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

// Initialize database and create table for test mode
async function initializeDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS bot_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL
      )
    `);

    // Initialize test_mode setting if not present
    await client.query(`
      INSERT INTO bot_settings (setting_key, setting_value)
      VALUES ('test_mode', 'false')
      ON CONFLICT (setting_key) DO NOTHING
    `);

    console.log('Database initialized successfully');
  } finally {
    client.release();
  }
}

// Load command files from /commands
async function loadCommands() {
  const commands = {};
  const commandFiles = fs.readdirSync(path.join(__dirname, 'commands')).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    try {
      const { default: command } = await import(`./commands/${file}`);
      if (command?.data) {
        commands[command.data.name] = command;
        console.log(`Loaded command: ${command.data.name}`);
      }
    } catch (err) {
      console.error(`Error loading command ${file}:`, err);
    }
  }
  return commands;
}

// Check if test mode is enabled
async function isTestModeEnabled() {
  try {
    const res = await pool.query(`SELECT setting_value FROM bot_settings WHERE setting_key = 'test_mode'`);
    return res.rows[0]?.setting_value === 'true';
  } catch (err) {
    console.error('Failed to check test mode:', err);
    return false;
  }
}

// Main bot function
async function startBot() {
  try {
    console.log('Starting bot initialization...');

    await initializeDatabase();
    const commands = await loadCommands();

    client.once('ready', () => {
      console.log(`Logged in as ${client.user.tag}`);
    });

    client.on('interactionCreate', async interaction => {
      if (!interaction.isCommand()) return;

      const command = commands[interaction.commandName];
      if (!command) return;

      const isTestMode = await isTestModeEnabled();
      const isAdmin = interaction.member?.permissions?.has('Administrator');

      if (isTestMode && !isAdmin && interaction.commandName !== 'testmode') {
        return interaction.reply({
          content: '🚧 The bot is currently in test mode. Only admins can use commands.',
          ephemeral: true
        });
      }

      try {
        await command.execute(interaction, pool, { cardsData, shopData });
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: '❌ Command failed', ephemeral: true });
        } else {
          await interaction.reply({ content: '❌ Command failed', ephemeral: true });
        }
      }
    });

    await client.login(process.env.TOKEN);
    console.log('Bot is now running!');
  } catch (error) {
    console.error('Fatal error during bot startup:', error);
    process.exit(1);
  }
}

startBot();

export { pool, cardsData, shopData };
