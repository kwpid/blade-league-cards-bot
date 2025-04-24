import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, ActivityType, EmbedBuilder, REST, Routes } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';
import { calculateCardValue, calculatePackPrice } from './utils/economy.js';

// Setup __dirname for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load config.json
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Verify environment variables
const requiredEnvVars = ['TOKEN', 'CLIENT_ID', 'GUILD_ID', 'DATABASE_URL'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

// Log Dev Mode status
console.log(`🧪 Dev Mode is ${config.devMode ? 'ENABLED (Admin-only)' : 'DISABLED (Public)'}`);
console.log(`💰 Current ROI: ${(config.roiPercentage * 100).toFixed(0)}%`);

// Create Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Discord REST setup
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000
});

// Load data files
const loadJSON = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const cardsData = loadJSON('data/cards.json');
const shopData = {
  ...loadJSON('data/shopItems.json'),
  roiPercentage: config.roiPercentage
};

// Database initialization
async function initDB() {
  let retries = 5;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT NOW()');
        console.log('✅ Database connection successful');

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

        console.log('✅ Database tables verified');
        return;
      } finally {
        client.release();
      }
    } catch (err) {
      retries--;
      console.error(`❌ Database connection failed (${retries} retries left):`, err);
      if (retries === 0) throw new Error('Failed to connect to database after multiple attempts');
      await new Promise(res => setTimeout(res, 5000));
    }
  }
}

// Command handling
async function loadCommands() {
  const commands = {};
  const commandFiles = fs.readdirSync(path.join(__dirname, 'commands'))
    .filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    try {
      const { default: command } = await import(`./commands/${file}`);
      if (command?.data) {
        commands[command.data.name] = command;
        console.log(`📦 Loaded command: ${command.data.name}`);
      }
    } catch (err) {
      console.error(`❌ Error loading command ${file}:`, err);
    }
  }
  return commands;
}

async function registerCommands(commands) {
  try {
    console.log('🔍 Starting command registration process...');
    
    // Prepare commands data
    const commandsArray = Object.values(commands)
      .filter(cmd => cmd?.data)
      .map(cmd => cmd.data.toJSON());

    if (commandsArray.length === 0) {
      throw new Error('No valid commands to register');
    }

    console.log('📡 Registering guild commands...');
    const data = await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: commandsArray }
    );
    
    console.log(`✅ Successfully registered ${data.length} guild commands`);
    console.log('📋 Registered commands:', data.map(c => c.name));
    return true;
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
    throw error;
  }
}

async function verifyDatabaseStructure() {
  const client = await pool.connect();
  try {
    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='user_balances' AND column_name='last_daily_claim'
    `);

    if (checkRes.rows.length === 0) {
      console.log('🔧 Adding missing last_daily_claim column...');
      await client.query(`
        ALTER TABLE user_balances 
        ADD COLUMN last_daily_claim TIMESTAMP WITH TIME ZONE
      `);
      console.log('✅ Database structure updated successfully');
    }
  } catch (error) {
    console.error('❌ Database verification failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Bot startup
async function startBot() {
  try {
    console.log('🚀 Starting bot initialization...');
    await initDB();
    const commands = await loadCommands();

    client.once('ready', async () => {
      console.log(`🤖 Logged in as ${client.user.tag}`);
      
      // Wait a brief moment to ensure everything is connected
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        // Verify database first
        await verifyDatabaseStructure();
        
        // Register commands (will only update if needed)
        await registerCommands(commands);
        
        // Set bot presence
        client.user.setPresence({
          activities: [{
            name: `${config.devMode ? 'DEV MODE' : 'TCG Cards'} | ROI: ${(config.roiPercentage * 100).toFixed(0)}%`,
            type: ActivityType.Playing
          }],
          status: 'online'
        });
        
        console.log('🎉 Bot is fully initialized!');
      } catch (error) {
        console.error('💥 Failed during ready handler:', error);
      }
    });

    client.on('interactionCreate', async interaction => {
      if (interaction.isCommand()) {
        // Debug commands
        if (interaction.commandName === 'debug-refresh') {
          if (!interaction.memberPermissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Admin only command', ephemeral: true });
          }
          try {
            const commands = await loadCommands();
            await registerCommands(commands);
            await verifyDatabaseStructure();
            return interaction.reply({ 
              content: `✅ Successfully refreshed ${Object.keys(commands).length} commands and verified database!`, 
              ephemeral: true 
            });
          } catch (error) {
            return interaction.reply({ 
              content: `❌ Failed to refresh: ${error.message}`, 
              ephemeral: true 
            });
          }
        }

        // Normal command handling
        const command = commands[interaction.commandName];
        if (!command) return;

        if (config.devMode && !interaction.memberPermissions.has('Administrator')) {
          return interaction.reply({
            content: '🧪 Bot is in **Dev Mode**. Commands are restricted to admins.',
            ephemeral: true
          });
        }

        try {
          await command.execute(interaction, pool, { 
            cardsData, 
            shopData,
            calculateCardValue,
            calculatePackPrice,
            config
          });
        } catch (error) {
          console.error(`❌ Error executing ${interaction.commandName}:`, error);
          const errorMessage = error.code === '42703' 
            ? "❌ Database needs update! Use `/debug-refresh` as admin to fix."
            : '❌ Command failed';
          
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        }
      } else if (interaction.isStringSelectMenu()) {
        // Handle select menu interactions
        try {
          if (interaction.customId === 'inventory_filter') {
            const type = interaction.message.embeds[0].title.includes('Packs') ? 'packs' : 'cards';
            const inventoryCommand = commands['inventory'];
            
            if (!inventoryCommand) {
              throw new Error('Inventory command not found');
            }

            const options = {
              getString: (name) => {
                if (name === 'type') return type;
                if (name === 'rarity') return interaction.values[0] === 'all' ? null : interaction.values[0];
                return null;
              },
              getInteger: (name) => (name === 'page' ? 1 : null)
            };

            await inventoryCommand.execute({
              ...interaction,
              options,
              user: interaction.user
            }, pool, { cardsData, shopData });
            
            await interaction.deferUpdate();
          }
        } catch (error) {
          console.error('❌ Error handling select menu interaction:', error);
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: '❌ Filter operation failed', ephemeral: true });
          } else {
            await interaction.reply({ content: '❌ Filter operation failed', ephemeral: true });
          }
        }
      }
    });

    // Error handling
    process.on('unhandledRejection', error => {
      console.error('Unhandled promise rejection:', error);
    });

    await client.login(process.env.TOKEN);
    console.log('🔌 Bot is connecting to Discord...');

  } catch (error) {
    console.error('💥 Fatal error during bot startup:', error);
    process.exit(1);
  }
}

// Start the bot
startBot().catch(error => {
  console.error('💥 Fatal error during startup:', error);
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
