import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, ActivityType, EmbedBuilder, REST, Routes } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';
import { calculateCardValue, calculatePackPrice } from './utils/economy.js';

// Setup __dirname for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load config
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Environment validation
const requiredEnvVars = ['TOKEN', 'CLIENT_ID', 'GUILD_ID', 'DATABASE_URL'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Discord client setup
const client = new Client({ 
  intents: [GatewayIntentBits.Guilds],
  presence: {
    status: 'online',
    activities: [{
      name: `${config.devMode ? 'DEV MODE' : 'TCG Cards'} | ROI: ${(config.roiPercentage * 100).toFixed(0)}%`,
      type: ActivityType.Playing
    }]
  }
});

// REST client setup
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

// Data loading
const loadJSON = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const cardsData = loadJSON('data/cards.json');
const shopData = {
  ...loadJSON('data/shopItems.json'),
  roiPercentage: config.roiPercentage
};

// Command loader with better error handling
async function loadCommands() {
  const commands = new Map();
  const commandPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const filePath = path.join(commandPath, file);
    try {
      const { default: command } = await import(filePath);
      if (!command?.data?.name) {
        console.warn(`⚠️ Skipping ${file} - missing command data`);
        continue;
      }
      commands.set(command.data.name, command);
      console.log(`📦 Loaded command: ${command.data.name}`);
    } catch (error) {
      console.error(`❌ Failed to load command ${file}:`, error);
    }
  }

  // Add debug command
  commands.set('debug-refresh', {
    data: {
      name: 'debug-refresh',
      description: 'Refresh bot commands (Admin only)',
      toJSON: () => ({ name: 'debug-refresh', description: 'Refresh bot commands (Admin only)' })
    },
    execute: handleDebugRefresh
  });

  console.log(`✅ Loaded ${commands.size} commands`);
  return commands;
}

// Modern command registration with proper rate limit handling
async function registerGuildCommands(commands) {
  if (!commands.size) {
    throw new Error('No commands to register');
  }

  const commandData = Array.from(commands.values())
    .map(cmd => cmd.data.toJSON())
    .filter(Boolean);

  console.log('🔄 Starting command registration...');
  console.log('📋 Commands to register:', commandData.map(c => c.name));

  try {
    // Clear existing commands first
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: [] }
    );
    console.log('🗑️ Cleared existing commands');

    // Register new commands with exponential backoff
    let attempts = 0;
    const maxAttempts = 3;
    let delay = 5000; // Start with 5 second delay

    while (attempts < maxAttempts) {
      try {
        const data = await rest.put(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
          { body: commandData }
        );
        console.log(`✅ Successfully registered ${data.length} commands`);
        return true;
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) throw error;
        
        console.warn(`⚠️ Attempt ${attempts} failed, retrying in ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  } catch (error) {
    console.error('❌ Command registration failed:', error);
    if (error.code === 50001) console.error('⚠️ Missing "applications.commands" scope');
    if (error.code === 50013) console.error('⚠️ Missing permissions');
    throw error;
  }
}

// Database initialization with all tables
async function initDatabase() {
  const dbClient = await pool.connect();
  try {
    // Test connection
    await dbClient.query('SELECT NOW()');
    console.log('✅ Database connection successful');

    await dbClient.query('BEGIN');

    // Create all tables with proper relationships
    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS user_balances (
        user_id VARCHAR(20) PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 100,
        last_updated TIMESTAMP DEFAULT NOW(),
        last_daily_claim TIMESTAMP WITH TIME ZONE
      )
    `);

    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS user_packs (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(20) NOT NULL,
        pack_id INTEGER NOT NULL,
        pack_name VARCHAR(100) NOT NULL,
        pack_description TEXT,
        pack_price INTEGER,
        purchase_date TIMESTAMP DEFAULT NOW(),
        opened BOOLEAN DEFAULT FALSE,
        is_limited BOOLEAN DEFAULT FALSE,
        FOREIGN KEY (user_id) REFERENCES user_balances(user_id) ON DELETE CASCADE
      )
    `);

    await dbClient.query(`
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
        tags TEXT[] DEFAULT '{}'::TEXT[],
        FOREIGN KEY (user_id) REFERENCES user_balances(user_id) ON DELETE CASCADE
      )
    `);

    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS user_titles (
        user_id VARCHAR(20) NOT NULL,
        title_name VARCHAR(100) NOT NULL,
        equipped BOOLEAN DEFAULT FALSE,
        obtained_date TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, title_name),
        FOREIGN KEY (user_id) REFERENCES user_balances(user_id) ON DELETE CASCADE
      )
    `);

    await dbClient.query(`
      CREATE TABLE IF NOT EXISTS user_stats (
        user_id VARCHAR(20) PRIMARY KEY,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        mmr INTEGER DEFAULT 1000,
        xp INTEGER DEFAULT 0,
        level INTEGER DEFAULT 1,
        FOREIGN KEY (user_id) REFERENCES user_balances(user_id) ON DELETE CASCADE
      )
    `);

    await dbClient.query('COMMIT');
    console.log('✅ All database tables verified/created');
  } catch (error) {
    await dbClient.query('ROLLBACK');
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    dbClient.release();
  }
}

// Debug command handler
async function handleDebugRefresh(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({ content: '❌ Admin only command', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const commands = await loadCommands();
    await registerGuildCommands(commands);
    await interaction.editReply('✅ Commands refreshed successfully');
  } catch (error) {
    console.error('Debug refresh failed:', error);
    await interaction.editReply(`❌ Failed to refresh: ${error.message}`);
  }
}

// Bot startup sequence
async function startBot() {
  try {
    console.log('🚀 Starting bot initialization...');
    
    // Initialize systems
    await initDatabase();
    commands = await loadCommands();

    // Event handlers
    client.once('ready', async () => {
      console.log(`🤖 Logged in as ${client.user.tag}`);
      
      try {
        await registerGuildCommands(commands);
        console.log('🎉 Bot is ready!');
      } catch (error) {
        console.error('💥 Failed during ready:', error);
        process.exit(1);
      }
    });

    client.on('interactionCreate', async interaction => {
      if (!interaction.isChatInputCommand()) return;

      const command = commands.get(interaction.commandName);
      if (!command) return;

      // Dev mode check
      if (config.devMode && !interaction.memberPermissions.has('Administrator')) {
        return interaction.reply({
          content: '🧪 Bot is in **Dev Mode**. Commands are admin-only.',
          ephemeral: true
        });
      }

      try {
        await command.execute(interaction, {
          pool,
          cardsData,
          shopData,
          calculateCardValue,
          calculatePackPrice,
          config
        });
      } catch (error) {
        console.error(`❌ Error executing ${interaction.commandName}:`, error);
        
        const errorResponse = interaction.deferred || interaction.replied
          ? interaction.editReply.bind(interaction)
          : interaction.reply.bind(interaction);
          
        await errorResponse({
          content: '❌ Command failed',
          embeds: [
            new EmbedBuilder()
              .setColor(0xFF0000)
              .setDescription(`\`\`\`${error.message}\`\`\``)
          ],
          ephemeral: true
        });
      }
    });

    // Error handling
    process.on('unhandledRejection', error => {
      console.error('Unhandled rejection:', error);
    });

    // Start the bot
    await client.login(process.env.TOKEN);
    
  } catch (error) {
    console.error('💥 Fatal startup error:', error);
    process.exit(1);
  }
}

// Global command cache
let commands = new Map();

// Start the bot
startBot().catch(error => {
  console.error('💥 Fatal error:', error);
  process.exit(1);
});

export { 
  pool,
  cardsData,
  shopData,
  calculateCardValue,
  calculatePackPrice,
  config
};
