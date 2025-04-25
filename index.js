import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, ActivityType, EmbedBuilder, REST, Routes, SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';
import { calculateCardValue, calculatePackPrice } from './utils/economy.js';

// Setup __dirname for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load config.json
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Helper function to load JSON files
function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, filePath), 'utf8'));
}

// Shared data exports for commands
export const cardsData = loadJSON('data/cards.json');
export const shopData = {
  ...loadJSON('data/shopItems.json'),
  roiPercentage: config.roiPercentage
};
export { calculateCardValue, calculatePackPrice };

// Enhanced environment verification
console.log('🔍 Verifying Discord environment variables...');
const requiredEnvVars = ['TOKEN', 'CLIENT_ID', 'GUILD_ID', 'DATABASE_URL'];
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  process.exit(1);
}

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

console.log(`🧪 Dev Mode is ${config.devMode ? 'ENABLED (Admin-only)' : 'DISABLED (Public)'}`);
console.log(`💰 Current ROI: ${(config.roiPercentage * 100).toFixed(0)}%`);

// Create Discord client with necessary intents
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ] 
});

// Discord REST setup
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// Database setup with enhanced configuration
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30000,
  max: 20,
  allowExitOnIdle: true
});

// Enhanced command loading with validation
async function loadCommands() {
  const commands = {};
  const skippedCommands = [];
  
  const commandFiles = fs.readdirSync(path.join(__dirname, 'commands'))
    .filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    try {
      const commandPath = path.join(__dirname, 'commands', file);
      const { default: command } = await import(`file://${commandPath.replace(/\\/g, '/')}`);
      
      // Enhanced validation
      if (!command?.data) {
        skippedCommands.push({ name: file.replace('.js', ''), reason: 'Missing data property' });
        continue;
      }

      if (typeof command.execute !== 'function') {
        skippedCommands.push({ name: command.data.name, reason: 'Missing execute function' });
        continue;
      }

      // Verify command can be serialized
      try {
        JSON.stringify(command.data.toJSON());
      } catch (err) {
        skippedCommands.push({ name: command.data.name, reason: 'Invalid data structure' });
        continue;
      }

      // Ensure command name matches filename (except for aliases)
      const expectedName = file.replace('.js', '');
      if (command.data.name !== expectedName && !['test-command', 'debug-refresh'].includes(command.data.name)) {
        console.warn(`⚠️ Command name mismatch: ${command.data.name} (file: ${file})`);
      }

      commands[command.data.name] = command;
      console.log(`📦 Loaded command: ${command.data.name}`);
    } catch (err) {
      console.error(`❌ Error loading command "${file}":`, err);
      skippedCommands.push({ name: file.replace('.js', ''), reason: 'Load error' });
    }
  }

  // Add debug commands
  const debugCommands = {
    'test-command': {
      data: new SlashCommandBuilder()
        .setName('test-command')
        .setDescription('Test command for debugging'),
      execute: async (interaction) => {
        await interaction.reply('✅ Test command working!');
      }
    },
    'debug-refresh': {
      data: new SlashCommandBuilder()
        .setName('debug-refresh')
        .setDescription('Refresh commands (admin only)')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator),
      execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });
        try {
          const commands = await loadCommands();
          await registerCommands(commands);
          await interaction.editReply('✅ Commands refreshed successfully!');
        } catch (error) {
          await interaction.editReply(`❌ Failed to refresh commands: ${error.message}`);
          console.error('Debug refresh failed:', error);
        }
      }
    }
  };

  Object.entries(debugCommands).forEach(([name, cmd]) => {
    commands[name] = cmd;
    console.log(`📦 Loaded debug command: ${name}`);
  });

  if (skippedCommands.length > 0) {
    console.warn('⚠️ Skipped commands:');
    skippedCommands.forEach(cmd => {
      console.warn(`- ${cmd.name}: ${cmd.reason}`);
    });
  }

  console.log(`✅ Loaded ${Object.keys(commands).length} commands (${skippedCommands.length} skipped).`);
  return commands;
}

// Enhanced command registration with better error handling
async function registerCommands(commands) {
  try {
    console.log('🔍 Starting guild-specific command registration process...');
    
    // Validate guild exists
    const guild = await client.guilds.fetch(GUILD_ID).catch(() => null);
    if (!guild) {
      throw new Error(`Guild ${GUILD_ID} not found or bot not in guild`);
    }

    // Check bot permissions
    const me = await guild.members.fetch(client.user.id);
    const requiredPermissions = [
      PermissionsBitField.Flags.ManageGuild,
      PermissionsBitField.Flags.Administrator
    ];
    
    const missingPermissions = requiredPermissions.filter(
      perm => !me.permissions.has(perm)
    );
    
    if (missingPermissions.length > 0) {
      console.warn('⚠️ Missing recommended permissions:', 
        missingPermissions.map(p => PermissionsBitField.Flags[p]).join(', '));
    }

    // Prepare command list
    const commandsToRegister = Object.values(commands)
      .filter(cmd => cmd?.data)
      .map(cmd => cmd.data.toJSON());

    console.log('📋 Commands to register:', commandsToRegister.map(c => c.name));

    // Clear existing commands with retries
    let clearedCount = 0;
    const MAX_CLEAR_RETRIES = 3;
    
    for (let attempt = 1; attempt <= MAX_CLEAR_RETRIES; attempt++) {
      try {
        console.log(`🗑️ Clearing existing commands (attempt ${attempt}/${MAX_CLEAR_RETRIES})...`);
        const data = await rest.put(
          Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
          { body: [] }
        );
        clearedCount = data.length;
        break;
      } catch (error) {
        console.error(`❌ Clear attempt ${attempt} failed:`, error.message);
        if (attempt === MAX_CLEAR_RETRIES) throw error;
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    console.log(`✅ Cleared ${clearedCount} existing commands`);
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Register new commands with retries
    const MAX_REGISTER_RETRIES = 3;
    let registeredCommands = [];
    
    for (let attempt = 1; attempt <= MAX_REGISTER_RETRIES; attempt++) {
      try {
        console.log(`📡 Registering commands (attempt ${attempt}/${MAX_REGISTER_RETRIES})...`);
        registeredCommands = await rest.put(
          Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
          { body: commandsToRegister }
        );
        break;
      } catch (error) {
        console.error(`❌ Registration attempt ${attempt} failed:`, error.message);
        if (attempt === MAX_REGISTER_RETRIES) throw error;
        await new Promise(resolve => setTimeout(resolve, 5000 * attempt));
      }
    }

    console.log(`✅ Successfully registered ${registeredCommands.length} commands`);
    console.log('📋 Registered commands:', registeredCommands.map(c => c.name));
    return registeredCommands;
  } catch (error) {
    console.error('❌ Command registration failed:', error);
    
    // Enhanced error diagnostics
    if (error.code === 50001) {
      console.error('⚠️ Missing Access - Ensure the bot is in the server');
    } else if (error.code === 50013) {
      console.error('⚠️ Missing Permissions - Check bot role position');
    } else if (error.code === 40041) {
      console.error('⚠️ Invalid command format - Check command data');
    } else if (error.code === 429) {
      console.error('⚠️ Rate Limited - Wait before retrying');
    }
    
    throw error;
  }
}

// Bot startup sequence
async function startBot() {
  try {
    console.log('🚀 Starting bot initialization...');
    
    // Initialize database
    const dbClient = await pool.connect();
    try {
      await dbClient.query('SELECT NOW()');
      console.log('✅ Database connection successful');
    } finally {
      dbClient.release();
    }

    // Load commands
    const commands = await loadCommands();

    client.once('ready', async () => {
      console.log(`🤖 Logged in as ${client.user.tag}`);
      
      // Set initial presence
      client.user.setPresence({
        activities: [{
          name: `${config.devMode ? 'DEV MODE' : 'TCG Cards'} | ROI: ${(config.roiPercentage * 100).toFixed(0)}%`,
          type: ActivityType.Playing
        }],
        status: 'online'
      });

      // Register commands with delay
      await new Promise(resolve => setTimeout(resolve, 3000));
      try {
        await registerCommands(commands);
        console.log('🎉 Bot is fully operational!');
      } catch (error) {
        console.error('⚠️ Command registration failed - some commands may not be available');
      }
    });

    // Interaction handling
    client.on('interactionCreate', async interaction => {
      if (!interaction.isCommand()) return;

      const command = commands[interaction.commandName];
      if (!command) return;

      // Dev mode check
      if (config.devMode && !interaction.memberPermissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({
          content: '🧪 Bot is in **Dev Mode**. Commands are restricted to admins.',
          ephemeral: true
        });
      }

      try {
        await command.execute(interaction, pool, { config });
      } catch (error) {
        console.error(`❌ Error executing ${interaction.commandName}:`, error);
        
        const errorMsg = interaction.deferred || interaction.replied
          ? { content: '❌ Command execution failed', ephemeral: true }
          : { content: '❌ Command execution failed', ephemeral: true };
        
        await (interaction.deferred || interaction.replied 
          ? interaction.editReply(errorMsg)
          : interaction.reply(errorMsg));
      }
    });

    // Error handling
    client.on('error', console.error);
    process.on('unhandledRejection', console.error);

    // Login
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
