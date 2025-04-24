import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';

// Basic setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Load data files
const loadJSON = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const cardsData = loadJSON('data/cards.json');
const shopData = loadJSON('data/shopItems.json');

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

// Initialize database and test mode table
async function initDB() {
  const client = await pool.connect();
  try {
    await client.query('SELECT NOW()');
    console.log('Database connection successful');

    await client.query(`
      CREATE TABLE IF NOT EXISTS bot_settings (
        setting_key TEXT PRIMARY KEY,
        setting_value TEXT NOT NULL
      )
    `);

    // Ensure test_mode is initialized
    const res = await client.query(`SELECT * FROM bot_settings WHERE setting_key = 'test_mode'`);
    if (res.rowCount === 0) {
      await client.query(`INSERT INTO bot_settings (setting_key, setting_value) VALUES ('test_mode', 'false')`);
    }

    console.log('Database tables verified');
  } catch (err) {
    console.error('Error initializing database:', err);
    process.exit(1);
  } finally {
    client.release();
  }
}

// Load slash commands
async function loadCommands() {
  const commands = {};
  const commandFiles = fs.readdirSync(path.join(__dirname, 'commands'))
    .filter(file => file.endsWith('.js'));

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

// Register slash commands per guild (instant sync)
async function registerCommands(commands) {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const commandArray = Object.values(commands).map(cmd => cmd.data.toJSON());

  try {
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commandArray }
    );
    console.log('Slash commands registered (guild)');
  } catch (err) {
    console.error('Failed to register slash commands:', err);
  }
}

// Main bot logic
async function startBot() {
  try {
    console.log('Starting bot initialization...');
    await initDB();

    const commands = await loadCommands();
    await registerCommands(commands);

    client.once('ready', () => {
      console.log(`Logged in as ${client.user.tag}`);
    });

    client.on('interactionCreate', async interaction => {
      if (!interaction.isCommand()) return;
      const command = commands[interaction.commandName];
      if (!command) return;

      try {
        const isAdmin = interaction.member.permissions.has('Administrator');

        // Check test mode status
        const result = await pool.query(`SELECT setting_value FROM bot_settings WHERE setting_key = 'test_mode'`);
        const testMode = result.rows[0]?.setting_value === 'true';

        if (testMode && !isAdmin && interaction.commandName !== 'testmode') {
          return await interaction.reply({
            content: '🚫 The bot is currently in test mode. Only admins can use commands.',
            ephemeral: true
          });
        }

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
    console.error('Fatal error during startup:', error);
    process.exit(1);
  }
}

startBot();

// Export for commands
export { pool, cardsData, shopData };
