import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, ActivityType, EmbedBuilder, REST, Routes, SlashCommandBuilder } from 'discord.js';
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

// Additional env var verification
console.log('🔍 Verifying Discord environment variables...');
console.log(`- CLIENT_ID: ${process.env.CLIENT_ID} (${process.env.CLIENT_ID?.length} chars)`);
console.log(`- GUILD_ID: ${process.env.GUILD_ID} (${process.env.GUILD_ID?.length} chars)`);
console.log(`- TOKEN: ${process.env.TOKEN ? '***REDACTED***' : 'MISSING'} (${process.env.TOKEN?.length} chars)`);

if (!/^\d+$/.test(process.env.GUILD_ID)) {
  console.error('❌ GUILD_ID must be a numeric string');
  process.exit(1);
}

if (!/^\d+$/.test(process.env.CLIENT_ID)) {
  console.error('❌ CLIENT_ID must be a numeric string');
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

// Improved command loading with validation
async function loadCommands() {
  const commands = {};
  const skippedCommands = [];
  
  const commandFiles = fs.readdirSync(path.join(__dirname, 'commands'))
    .filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    try {
      const { default: command } = await import(`./commands/${file}`);
      
      // Validate command structure
      if (!command?.data) {
        skippedCommands.push({ name: file.replace('.js', ''), reason: 'Missing data property' });
        continue;
      }

      // Verify command can be serialized
      try {
        command.data.toJSON();
      } catch (err) {
        skippedCommands.push({ name: command.data.name, reason: 'Invalid data structure' });
        continue;
      }

      commands[command.data.name] = command;
      console.log(`📦 Loaded command: ${command.data.name}`);
    } catch (err) {
      console.error(`❌ Error loading command "${file}":`, err);
      skippedCommands.push({ name: file.replace('.js', ''), reason: 'Load error' });
    }
  }

  // Add test command for debugging
  const testCommand = {
    data: new SlashCommandBuilder()
      .setName('test-command')
      .setDescription('Test command for debugging'),
    execute: async (interaction) => {
      await interaction.reply('Test command working!');
    }
  };
  commands['test-command'] = testCommand;
  console.log('📦 Loaded debug command: test-command');

  if (skippedCommands.length > 0) {
    console.warn('⚠️ Skipped commands:');
    skippedCommands.forEach(cmd => {
      console.warn(`- ${cmd.name}: ${cmd.reason}`);
    });
  }

  console.log(`✅ Loaded ${Object.keys(commands).length} commands (${skippedCommands.length} skipped).`);
  return commands;
}

// Enhanced command registration with retries and better logging
async function registerCommands(commands) {
  try {
    console.log('🔍 Starting guild-specific command registration process...');
    
    // Prepare command list with validation
    const commandsArray = [];
    const invalidCommands = [];
    
    for (const [name, cmd] of Object.entries(commands)) {
      if (!cmd?.data) {
        invalidCommands.push(name);
        continue;
      }
      
      try {
        commandsArray.push(cmd.data.toJSON());
      } catch (err) {
        console.error(`❌ Failed to serialize command ${name}:`, err);
        invalidCommands.push(name);
      }
    }

    console.log('📋 Valid commands to register:', commandsArray.map(c => c.name));
    if (invalidCommands.length > 0) {
      console.warn('⚠️ Invalid commands not registered:', invalidCommands);
    }

    if (commandsArray.length === 0) {
      throw new Error('No valid commands to register');
    }

    // Clear existing commands
    console.log('🗑️ Clearing existing guild-specific commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: [] })
      .then(res => console.log(`✅ Cleared ${res.length} existing commands`))
      .catch(err => console.error('⚠️ Error clearing commands:', err));

    // Add delay to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Register new commands with retries
    const MAX_RETRIES = 3;
    let lastError;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        console.log(`📡 Registering commands (attempt ${attempt}/${MAX_RETRIES})...`);
        
        const data = await rest.put(
          Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
          { body: commandsArray }
        );

        console.log(`✅ Successfully registered ${data.length} guild-specific commands.`);
        console.log('📋 Registered commands:', data.map(c => c.name));
        return data;
      } catch (error) {
        lastError = error;
        console.error(`❌ Registration attempt ${attempt} failed:`, error.message);
        
        if (attempt < MAX_RETRIES) {
          const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
          console.log(`⏳ Retrying in ${delay/1000} seconds...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('Command registration failed');
  } catch (error) {
    console.error('❌ Failed to register guild-specific commands:');
    console.error('Error details:', error);
    
    if (error.request) {
      console.error('Request details:', {
        path: error.request.path,
        method: error.request.method,
        body: error.request.body
      });
    }
    
    // Specific error handling
    if (error.code === 0) {
      console.error('⚠️ Possible network connectivity issue');
    } else if (error.code === 50001) {
      console.error('⚠️ Missing access - check bot permissions');
    } else if (error.code === 50013) {
      console.error('⚠️ Missing permissions - check bot role position');
    } else if (error.code === 429) {
      console.error('⚠️ Rate limited - try again later');
    }
    
    throw error;
  }
}

// Enhanced verification
async function verifyCommandRegistration(expectedCommands) {
  try {
    console.log('🔍 Verifying command registration...');
    const registeredCommands = await rest.get(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
    );
    
    const registeredNames = registeredCommands.map(c => c.name);
    const expectedSet = new Set(expectedCommands);
    
    // Check for missing commands
    const missing = expectedCommands.filter(c => !registeredNames.includes(c));
    
    // Check for unexpected commands
    const extra = registeredCommands
      .filter(c => !expectedSet.has(c.name))
      .map(c => c.name);
    
    if (missing.length > 0 || extra.length > 0) {
      console.error('❌ Command verification issues:');
      if (missing.length > 0) console.error('- Missing commands:', missing);
      if (extra.length > 0) console.error('- Extra commands:', extra);
      return false;
    }
    
    console.log('✅ All commands verified (exact match)');
    return true;
  } catch (error) {
    console.error('❌ Verification failed:', error);
    return false;
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

// Bot startup with improved command handling
async function startBot() {
  try {
    console.log('🚀 Starting bot initialization...');
    await initDB();
    const commands = await loadCommands();

    client.once('ready', async () => {
      console.log(`🤖 Logged in as ${client.user.tag}`);
      
      // Initial delay to ensure everything is connected
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      try {
        await verifyDatabaseStructure();
        
        // Register commands with enhanced verification
        const registrationSuccess = await registerCommands(commands);
        if (!registrationSuccess) {
          throw new Error('Initial command registration failed');
        }
        
        // Strict verification
        const verification = await verifyCommandRegistration(
          Object.keys(commands).filter(c => c !== 'test-command')
        );
        
        if (!verification) {
          console.error('⚠️ Command registration verification failed - attempting full refresh...');
          await new Promise(resolve => setTimeout(resolve, 10000));
          await registerCommands(commands);
        }
        
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
        if (error.message.includes('rate limited')) {
          console.log('⏳ Rate limited - waiting 1 minute before exit...');
          await new Promise(resolve => setTimeout(resolve, 60000));
        }
        process.exit(1);
      }
    });

    client.on('interactionCreate', async interaction => {
      if (interaction.isCommand()) {
        // Debug commands
        if (interaction.commandName === 'debug-refresh') {
          if (!interaction.memberPermissions.has('Administrator')) {
            return interaction.reply({ content: '❌ This command is restricted to server admins.', ephemeral: true });
          }

          try {
            await interaction.deferReply({ ephemeral: true });

            const currentCommands = await loadCommands();
            await registerCommands(currentCommands);
            
            const verification = await verifyCommandRegistration(
              Object.keys(currentCommands).filter(c => c !== 'test-command')
            );

            await interaction.editReply({
              content: verification 
                ? `✅ Successfully refreshed ${Object.keys(currentCommands).length} commands!` 
                : `⚠️ Commands refreshed but verification failed`,
              embeds: verification ? [] : [new EmbedBuilder()
                .setColor(0xFFA500)
                .setDescription('Some commands may not be registered properly. Check logs for details.')
              ]
            });
          } catch (error) {
            console.error('Debug refresh failed:', error);
            await interaction.editReply({
              content: `❌ Failed to refresh: ${error.message}`,
              embeds: [new EmbedBuilder()
                .setColor(0xFF0000)
                .setDescription('Check bot logs for detailed error information')
              ]
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
