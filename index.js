import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, EmbedBuilder } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';

// Basic setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Load data files
const loadJSON = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const cardsData = loadJSON('data/cards.json');
const shopData = loadJSON('data/shopItems.json');
const config = loadJSON('config.json'); // Load config

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

// Database initialization with retry logic
async function initDB() {
  let retries = 5;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT NOW()');
        console.log('Database connection successful');

        // Create tables
        await client.query(`
          CREATE TABLE IF NOT EXISTS user_balances (
            user_id VARCHAR(20) PRIMARY KEY,
            balance INTEGER NOT NULL DEFAULT 100,
            last_updated TIMESTAMP DEFAULT NOW()
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS user_packs (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(20) NOT NULL,
            pack_id INTEGER NOT NULL,
            pack_name VARCHAR(100) NOT NULL,
            pack_description TEXT,
            pack_price INTEGER,
            purchase_date TIMESTAMP DEFAULT NOW(),
            opened BOOLEAN DEFAULT FALSE,
            FOREIGN KEY (user_id) REFERENCES user_balances(user_id) ON DELETE CASCADE
          )
        `);

        await client.query(`
          CREATE TABLE IF NOT EXISTS user_cards (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(20) NOT NULL,
            card_id INTEGER NOT NULL,
            card_name VARCHAR(100) NOT NULL,
            rarity VARCHAR(20) NOT NULL,
            variant VARCHAR(20) DEFAULT 'normal',
            stats_off INTEGER NOT NULL,
            stats_def INTEGER NOT NULL,
            stats_abl INTEGER NOT NULL,
            stats_mch INTEGER NOT NULL,
            value INTEGER NOT NULL,
            obtained_date TIMESTAMP DEFAULT NOW(),
            FOREIGN KEY (user_id) REFERENCES user_balances(user_id) ON DELETE CASCADE
          )
        `);

        console.log('Database tables verified');
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      retries--;
      console.error(`Database connection failed (${retries} retries left):`, err);
      if (retries === 0) {
        throw new Error('Failed to connect to database after multiple attempts');
      }
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

// Command loader
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

// Main bot function
async function startBot() {
  try {
    console.log('Starting bot initialization...');

    // Initialize database
    await initDB();

    // Load commands
    const commands = await loadCommands();

    // Client ready event
    client.once('ready', () => {
      console.log(`Logged in as ${client.user.tag}`);
    });

    // Command handler
    client.on('interactionCreate', async interaction => {
      if (!interaction.isCommand()) return;

      // Dev Mode check
      if (config.devMode && !interaction.memberPermissions.has('Administrator')) {
        return interaction.reply({
          content: '🚧 Bot is in Dev Mode. Commands are currently admin-only.',
          ephemeral: true
        });
      }

      const command = commands[interaction.commandName];
      if (!command) return;

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

    // Login
    await client.login(process.env.TOKEN);
    console.log('Bot is now running!');
  } catch (error) {
    console.error('Fatal error during bot startup:', error);
    process.exit(1);
  }
}

// Start
startBot();

// Export
export { pool, cardsData, shopData };
