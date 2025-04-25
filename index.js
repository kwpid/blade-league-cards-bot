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

// Command loader with better error handling and caching
async function loadCommands() {
  const commands = new Map();
  const commandPath = path.join(__dirname, 'commands');
  
  try {
    const commandFiles = fs.readdirSync(commandPath).filter(file => file.endsWith('.js'));
    console.log(`🔍 Found ${commandFiles.length} command files`);

    for (const file of commandFiles) {
      const filePath = path.join(commandPath, file);
      try {
        const { default: command } = await import(filePath);
        if (!command?.data?.name) {
          console.warn(`⚠️ Skipping ${file} - missing command data`);
          continue;
        }
        
        // Validate required command structure
        if (typeof command.execute !== 'function') {
          console.warn(`⚠️ Skipping ${command.data.name} - missing execute function`);
          continue;
        }

        commands.set(command.data.name, command);
        console.log(`📦 Loaded command: ${command.data.name}`);
      } catch (error) {
        console.error(`❌ Failed to load command ${file}:`, error);
      }
    }

    // Add debug commands
    commands.set('debug-refresh', {
      data: {
        name: 'debug-refresh',
        description: 'Refresh bot commands (Admin only)',
        toJSON: () => ({ name: 'debug-refresh', description: 'Refresh bot commands (Admin only)' })
      },
      execute: handleDebugRefresh
    });

    commands.set('debug-commands', {
      data: {
        name: 'debug-commands',
        description: 'List registered commands (Admin only)',
        toJSON: () => ({ name: 'debug-commands', description: 'List registered commands (Admin only)' })
      },
      execute: handleDebugListCommands
    });

    console.log(`✅ Successfully loaded ${commands.size} commands`);
    return commands;
  } catch (error) {
    console.error('❌ Failed to load commands:', error);
    throw error;
  }
}

// Improved command registration with better logging and validation
async function registerGuildCommands(commands) {
  if (!commands.size) {
    throw new Error('No commands to register');
  }

  try {
    // Convert commands to JSON payload
    const commandData = Array.from(commands.values())
      .map(cmd => {
        try {
          return cmd.data.toJSON();
        } catch (error) {
          console.error(`❌ Failed to serialize command ${cmd.data.name}:`, error);
          return null;
        }
      })
      .filter(Boolean);

    console.log('🔄 Starting command registration process...');
    console.log('📋 Commands to register:', commandData.map(c => c.name));

    // Get existing commands for comparison
    const existingCommands = await rest.get(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    );
    console.log(`🗑️ Found ${existingCommands.length} existing commands to remove`);

    // Delete all existing commands first
    await Promise.all(existingCommands.map(cmd => 
      rest.delete(Routes.applicationGuildCommand(process.env.CLIENT_ID, process.env.GUILD_ID, cmd.id))
    ));
    console.log('✅ Cleared existing commands');

    // Register new commands in batches to avoid rate limits
    const batchSize = 5;
    const batches = [];
    for (let i = 0; i < commandData.length; i += batchSize) {
      batches.push(commandData.slice(i, i + batchSize));
    }

    let registeredCount = 0;
    for (const batch of batches) {
      try {
        const data = await rest.put(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
          { body: batch }
        );
        registeredCount += data.length;
        console.log(`✅ Registered batch of ${batch.length} commands (${registeredCount}/${commandData.length})`);
      } catch (error) {
        console.error('❌ Failed to register batch:', error);
        throw error;
      }
    }

    console.log(`🎉 Successfully registered ${registeredCount} commands`);
    return true;
  } catch (error) {
    console.error('❌ Command registration failed:', error);
    if (error.code === 50001) console.error('⚠️ Missing "applications.commands" scope');
    if (error.code === 50013) console.error('⚠️ Missing permissions');
    throw error;
  }
}

// Database initialization remains the same
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

// Debug command handlers
async function handleDebugRefresh(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({ content: '❌ Admin only command', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const newCommands = await loadCommands();
    await registerGuildCommands(newCommands);
    commands = newCommands; // Update global command cache
    await interaction.editReply('✅ Commands refreshed successfully');
  } catch (error) {
    console.error('Debug refresh failed:', error);
    await interaction.editReply(`❌ Failed to refresh: ${error.message}`);
  }
}

async function handleDebugListCommands(interaction) {
  if (!interaction.memberPermissions.has('Administrator')) {
    return interaction.reply({ content: '❌ Admin only command', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const registeredCommands = await rest.get(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
    );

    const embed = new EmbedBuilder()
      .setTitle('Registered Commands')
      .setColor(0x00FF00)
      .setDescription(registeredCommands.map(c => `• **${c.name}** - ${c.description}`).join('\n') || 'No commands registered')
      .setFooter({ text: `Total: ${registeredCommands.length} commands` });

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error('Debug command list failed:', error);
    await interaction.editReply(`❌ Failed to list commands: ${error.message}`);
  }
}

// Bot startup sequence with improved command handling
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
        // Verify command registration status
        const registeredCommands = await rest.get(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID)
        );
        
        if (registeredCommands.length === 0) {
          console.log('⚠️ No commands registered, performing initial registration...');
          await registerGuildCommands(commands);
        } else {
          console.log(`✅ Found ${registeredCommands.length} registered commands`);
        }
        
        console.log('🎉 Bot is ready!');
      } catch (error) {
        console.error('💥 Failed during ready:', error);
        process.exit(1);
      }
    });

    client.on('interactionCreate', async interaction => {
      if (!interaction.isChatInputCommand()) return;

      const command = commands.get(interaction.commandName);
      if (!command) {
        console.warn(`⚠️ Received unknown command: ${interaction.commandName}`);
        return interaction.reply({ 
          content: '❌ Unknown command', 
          ephemeral: true 
        });
      }

      // Dev mode check
      if (config.devMode && !interaction.memberPermissions.has('Administrator')) {
        return interaction.reply({
          content: '🧪 Bot is in **Dev Mode**. Commands are admin-only.',
          ephemeral: true
        });
      }

      try {
        console.log(`⚡ Executing command: ${interaction.commandName} by ${interaction.user.tag}`);
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
