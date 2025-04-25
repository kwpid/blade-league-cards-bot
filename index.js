import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { 
  Client, 
  GatewayIntentBits, 
  ActivityType, 
  EmbedBuilder, 
  REST, 
  Routes, 
  SlashCommandBuilder, 
  PermissionsBitField,
  Collection
} from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';
import { calculateCardValue, calculatePackPrice } from './utils/economy.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration loading
function loadConfig() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    if (typeof config.devMode !== 'boolean') {
      throw new Error('config.devMode must be a boolean');
    }
    if (typeof config.roiPercentage !== 'number' || config.roiPercentage < 0) {
      throw new Error('config.roiPercentage must be a positive number');
    }
    
    return config;
  } catch (error) {
    console.error('❌ Failed to load config.json:', error);
    process.exit(1);
  }
}

const config = loadConfig();

// Data loading with caching
const dataCache = new Map();

function loadDataWithCache(filePath) {
  if (dataCache.has(filePath)) {
    return dataCache.get(filePath);
  }
  
  try {
    const fullPath = path.join(__dirname, filePath);
    const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
    dataCache.set(filePath, data);
    return data;
  } catch (error) {
    console.error(`❌ Failed to load data file ${filePath}:`, error);
    process.exit(1);
  }
}

// Shared data exports
export const cardsData = loadDataWithCache('data/cards.json');
export const shopData = {
  ...loadDataWithCache('data/shopItems.json'),
  roiPercentage: config.roiPercentage
};
export { calculateCardValue, calculatePackPrice };

// Environment validation
function validateEnvironment() {
  console.log('🔍 Verifying environment variables...');
  
  const requiredEnvVars = {
    TOKEN: {
      description: 'Discord bot token',
      validate: val => val && val.length > 50
    },
    CLIENT_ID: {
      description: 'Discord application client ID',
      validate: val => /^\d+$/.test(val)
    },
    GUILD_ID: {
      description: 'Primary guild/server ID',
      validate: val => /^\d+$/.test(val)
    },
    DATABASE_URL: {
      description: 'PostgreSQL connection URL',
      validate: val => val && (val.startsWith('postgres://') || val.startsWith('postgresql://'))
    }
  };

  let valid = true;
  for (const [varName, { description, validate }] of Object.entries(requiredEnvVars)) {
    const value = process.env[varName];
    
    if (!value) {
      console.error(`❌ Missing ${varName}: ${description}`);
      valid = false;
      continue;
    }
    
    if (!validate(value)) {
      console.error(`❌ Invalid ${varName}: ${value} (${description})`);
      valid = false;
    } else {
      console.log(`✅ ${varName}: ${varName === 'TOKEN' ? '***REDACTED***' : value}`);
    }
  }

  if (!valid) {
    process.exit(1);
  }

  console.log(`🧪 Dev Mode: ${config.devMode ? 'ON (Admin-only)' : 'OFF (Public)'}`);
  console.log(`💰 ROI Percentage: ${(config.roiPercentage * 100).toFixed(0)}%`);
}

validateEnvironment();

// Discord client setup
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  presence: {
    status: 'online',
    activities: [{
      name: `${config.devMode ? 'DEV MODE' : 'TCG Cards'} | ROI: ${(config.roiPercentage * 100).toFixed(0)}%`,
      type: ActivityType.Playing
    }]
  }
});

// Database setup with initialization
const pool = new Pool({
  connectionString: process.env.DATABASE_URL.replace('postgresql://', 'postgres://'),
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false 
  } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
  min: 2
});

// Initialize database tables
async function initializeDatabase() {
  let client;
  try {
    client = await pool.connect();
    console.log('🔌 Connected to database');

    // Create tables if they don't exist
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_balances (
        user_id VARCHAR(20) PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 100,
        last_updated TIMESTAMP DEFAULT NOW(),
        last_daily_claim TIMESTAMP WITH TIME ZONE
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
        is_limited BOOLEAN DEFAULT FALSE,
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
        tags TEXT[] DEFAULT '{}'::TEXT[],
        FOREIGN KEY (user_id) REFERENCES user_balances(user_id) ON DELETE CASCADE
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS user_titles (
        user_id VARCHAR(20) NOT NULL,
        title_name VARCHAR(100) NOT NULL,
        equipped BOOLEAN DEFAULT FALSE,
        obtained_date TIMESTAMP DEFAULT NOW(),
        PRIMARY KEY (user_id, title_name),
        FOREIGN KEY (user_id) REFERENCES user_balances(user_id) ON DELETE CASCADE
      )
    `);

    await client.query(`
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

    await client.query('COMMIT');
    console.log('✅ Database tables initialized');

  } catch (error) {
    await client?.query('ROLLBACK');
    console.error('❌ Database initialization failed:', error);
    throw error;
  } finally {
    client?.release();
  }
}

// Command loader
async function loadCommands() {
  const commands = new Collection();
  const commandPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandPath).filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const commandName = file.replace('.js', '');
    try {
      const { default: command } = await import(`file://${path.join(commandPath, file).replace(/\\/g, '/')}`);
      
      if (!command?.data || typeof command.execute !== 'function') {
        console.warn(`⚠️ Skipping ${commandName}: Invalid command structure`);
        continue;
      }

      commands.set(command.data.name, command);
      console.log(`📦 Loaded command: ${command.data.name}`);
    } catch (error) {
      console.error(`❌ Failed to load command ${commandName}:`, error);
    }
  }

  // Add system commands
  const systemCommands = {
    'reload-commands': {
      data: new SlashCommandBuilder()
        .setName('reload-commands')
        .setDescription('Reload all commands (admin only)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
      execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        try {
          const commands = await loadCommands();
          await registerGuildCommands(commands);
          await interaction.editReply(`✅ Reloaded ${commands.size} commands!`);
        } catch (error) {
          await interaction.editReply(`❌ Failed to reload commands: ${error.message}`);
        }
      }
    }
  };

  for (const [name, command] of Object.entries(systemCommands)) {
    commands.set(name, command);
    console.log(`📦 Loaded system command: ${name}`);
  }

  console.log(`✅ Loaded ${commands.size} commands`);
  return commands;
}

// Command registration
async function registerGuildCommands(commands) {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  try {
    const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());
    console.log(`🔄 Registering ${commandData.length} commands...`);

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commandData }
    );

    console.log('✅ Commands registered successfully');
  } catch (error) {
    console.error('❌ Command registration failed:', error);
    throw error;
  }
}

// Event handlers
function setupEventHandlers(commands) {
  client.once('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag}`);
    try {
      await registerGuildCommands(commands);
      console.log('🎉 Bot is ready!');
    } catch (error) {
      console.error('⚠️ Command registration failed:', error);
    }
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) return;

    try {
      await command.execute(interaction, pool, { config });
    } catch (error) {
      console.error(`❌ Error executing ${interaction.commandName}:`, error);
      const response = { content: '❌ An error occurred', ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(response);
      } else {
        await interaction.reply(response);
      }
    }
  });

  process.on('unhandledRejection', error => {
    console.error('⚠️ Unhandled rejection:', error);
  });
}

// Startup sequence
async function startBot() {
  try {
    await initializeDatabase();
    const commands = await loadCommands();
    setupEventHandlers(commands);
    await client.login(process.env.TOKEN);
  } catch (error) {
    console.error('💥 Fatal error during startup:', error);
    process.exit(1);
  }
}

startBot();
