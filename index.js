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

// Enhanced __dirname setup for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Configuration loading with validation
function loadConfig() {
  try {
    const configPath = path.join(__dirname, 'config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    
    // Config validation
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

// Shared data exports for commands
export const cardsData = loadDataWithCache('data/cards.json');
export const shopData = {
  ...loadDataWithCache('data/shopItems.json'),
  roiPercentage: config.roiPercentage
};
export { calculateCardValue, calculatePackPrice };

// Environment validation with detailed reporting
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
      validate: val => val && val.startsWith('postgres://')
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

// Discord client setup with enhanced configuration
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

// Database setup with connection pooling and error handling
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { 
    rejectUnauthorized: false 
  } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 10,
  min: 2
});

// Test database connection
async function testDatabaseConnection() {
  let client;
  try {
    client = await pool.connect();
    await client.query('SELECT NOW()');
    console.log('✅ Database connection established');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    process.exit(1);
  } finally {
    if (client) client.release();
  }
}

// Command loader with enhanced validation
async function loadCommands() {
  const commands = new Collection();
  const commandPath = path.join(__dirname, 'commands');
  const commandFiles = fs.readdirSync(commandPath).filter(file => file.endsWith('.js'));

  let loadedCount = 0;
  let skippedCount = 0;

  for (const file of commandFiles) {
    const filePath = path.join(commandPath, file);
    const commandName = file.replace('.js', '');

    try {
      const { default: command } = await import(`file://${filePath.replace(/\\/g, '/')}`);
      
      // Validate command structure
      if (!command?.data) {
        console.warn(`⚠️ Skipping ${commandName}: Missing 'data' property`);
        skippedCount++;
        continue;
      }

      if (typeof command.execute !== 'function') {
        console.warn(`⚠️ Skipping ${commandName}: Missing 'execute' function`);
        skippedCount++;
        continue;
      }

      // Validate SlashCommandBuilder
      try {
        const jsonData = command.data.toJSON();
        if (!jsonData.name || !jsonData.description) {
          console.warn(`⚠️ Skipping ${commandName}: Invalid command data structure`);
          skippedCount++;
          continue;
        }
      } catch (error) {
        console.warn(`⚠️ Skipping ${commandName}: Failed to serialize command data`, error);
        skippedCount++;
        continue;
      }

      // Check for name consistency
      if (command.data.name !== commandName) {
        console.warn(`⚠️ Command name mismatch: ${command.data.name} (file: ${file})`);
      }

      commands.set(command.data.name, command);
      console.log(`📦 Loaded command: ${command.data.name}`);
      loadedCount++;
    } catch (error) {
      console.error(`❌ Failed to load command ${commandName}:`, error);
      skippedCount++;
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
          await interaction.editReply(`✅ Reloaded ${commands.size} commands successfully!`);
        } catch (error) {
          await interaction.editReply(`❌ Failed to reload commands: ${error.message}`);
          console.error('Command reload failed:', error);
        }
      }
    },
    'bot-status': {
      data: new SlashCommandBuilder()
        .setName('bot-status')
        .setDescription('Check bot status and commands')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
      execute: async (interaction) => {
        const embed = new EmbedBuilder()
          .setTitle('🤖 Bot Status')
          .setColor(0x00AE86)
          .addFields(
            { name: 'Commands Loaded', value: commands.size.toString(), inline: true },
            { name: 'Dev Mode', value: config.devMode ? 'ON' : 'OFF', inline: true },
            { name: 'Database', value: 'Connected', inline: true }
          )
          .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
      }
    }
  };

  for (const [name, command] of Object.entries(systemCommands)) {
    commands.set(name, command);
    console.log(`📦 Loaded system command: ${name}`);
    loadedCount++;
  }

  console.log(`✅ Successfully loaded ${loadedCount} commands (${skippedCount} skipped)`);
  return commands;
}

// Enhanced command registration with guild synchronization
async function registerGuildCommands(commands) {
  const CLIENT_ID = process.env.CLIENT_ID;
  const GUILD_ID = process.env.GUILD_ID;
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  console.log('🔄 Starting command registration process...');

  try {
    // Verify guild access
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
      throw new Error(`Bot is not in guild ${GUILD_ID} or guild doesn't exist`);
    }

    // Check bot permissions in detail
    const botMember = await guild.members.fetch(client.user.id);
    const requiredPermissions = new PermissionsBitField([
      PermissionsBitField.Flags.ViewChannel,
      PermissionsBitField.Flags.SendMessages,
      PermissionsBitField.Flags.ManageGuild
    ]);

    const missingPermissions = botMember.permissions.missing(requiredPermissions);
    if (missingPermissions.length > 0) {
      const permissionList = missingPermissions.map(p => `- ${p}`).join('\n');
      throw new Error(`Missing required permissions:\n${permissionList}`);
    }

    // Prepare command data
    const commandData = Array.from(commands.values()).map(cmd => cmd.data.toJSON());
    console.log(`📋 Preparing to register ${commandData.length} commands...`);

    // Clear existing commands first
    console.log('🧹 Clearing existing commands...');
    await rest.put(
      Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
      { body: [] }
    );

    // Register new commands with retry logic
    let registeredCommands = [];
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Registering commands (attempt ${attempt}/${maxRetries})...`);
        registeredCommands = await rest.put(
          Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
          { body: commandData }
        );
        break;
      } catch (error) {
        if (attempt === maxRetries) throw error;
        console.warn(`⚠️ Attempt ${attempt} failed, retrying...`, error.message);
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }

    console.log(`✅ Successfully registered ${registeredCommands.length} commands`);
    console.log('📜 Registered commands:', registeredCommands.map(c => c.name));

    // Verify command synchronization
    const syncedCommands = await guild.commands.fetch();
    if (syncedCommands.size !== registeredCommands.length) {
      console.warn(`⚠️ Command count mismatch: API ${registeredCommands.length} vs Guild ${syncedCommands.size}`);
    }

    return registeredCommands;
  } catch (error) {
    console.error('❌ Command registration failed:', error);
    
    // Enhanced error diagnostics
    if (error.code === 50001) {
      console.error('🔒 Missing Access - Ensure the bot is in the server');
    } else if (error.code === 50013) {
      console.error('🔒 Missing Permissions - The bot needs "Manage Guild" permission');
    } else if (error.code === 40041) {
      console.error('📛 Invalid command format - Check your command definitions');
    }
    
    throw error;
  }
}

// Bot event handlers
function setupEventHandlers(commands) {
  // Ready event
  client.once('ready', async () => {
    console.log(`🤖 Logged in as ${client.user.tag} (ID: ${client.user.id})`);
    console.log(`🌍 Serving ${client.guilds.cache.size} guild(s)`);
    
    // Update presence
    client.user.setPresence({
      activities: [{
        name: `${config.devMode ? 'DEV MODE' : 'TCG Cards'} | ROI: ${(config.roiPercentage * 100).toFixed(0)}%`,
        type: ActivityType.Playing
      }],
      status: 'online'
    });

    // Initial command sync
    try {
      await registerGuildCommands(commands);
      console.log('🎉 Bot is ready and commands are synced!');
    } catch (error) {
      console.error('⚠️ Initial command sync failed, some commands may not be available');
    }
  });

  // Interaction handling
  client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = commands.get(interaction.commandName);
    if (!command) {
      console.warn(`⚠️ Received unknown command: ${interaction.commandName}`);
      return interaction.reply({
        content: '❌ This command is not available',
        ephemeral: true
      });
    }

    // Dev mode check
    if (config.devMode) {
      const isAdmin = interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator);
      if (!isAdmin) {
        return interaction.reply({
          content: '🔧 Bot is in maintenance mode. Try again later.',
          ephemeral: true
        });
      }
    }

    // Execute command with error handling
    try {
      console.log(`⚡ Executing command: ${interaction.commandName}`);
      await command.execute(interaction, pool, { config });
    } catch (error) {
      console.error(`❌ Command execution failed: ${interaction.commandName}`, error);
      
      const errorResponse = {
        content: '⚠️ An error occurred while executing this command',
        ephemeral: true
      };

      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(errorResponse);
      } else {
        await interaction.reply(errorResponse);
      }
    }
  });

  // Error handling
  client.on('error', error => {
    console.error('🔌 Discord client error:', error);
  });

  process.on('unhandledRejection', error => {
    console.error('⚠️ Unhandled promise rejection:', error);
  });

  process.on('uncaughtException', error => {
    console.error('💥 Uncaught exception:', error);
    process.exit(1);
  });
}

// Main bot startup sequence
async function startBot() {
  try {
    console.log('🚀 Starting bot initialization...');
    
    // Test database connection first
    await testDatabaseConnection();
    
    // Load commands
    const commands = await loadCommands();
    
    // Setup event handlers
    setupEventHandlers(commands);
    
    // Login to Discord
    await client.login(process.env.TOKEN);
    
  } catch (error) {
    console.error('💥 Fatal error during bot startup:', error);
    process.exit(1);
  }
}

// Start the bot
startBot();
