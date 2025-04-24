import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits, EmbedBuilder, REST, Routes } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';

// Setup __dirname for ES modules
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load config.json
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

// Log Dev Mode status
console.log(`🧪 Dev Mode is ${config.devMode ? 'ENABLED (Admin-only)' : 'DISABLED (Public)'}`);

// Create Discord client
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

// Discord REST setup
const CLIENT_ID = process.env.CLIENT_ID;
const TEST_GUILD_ID = process.env.TEST_GUILD_ID;
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

// Initialize database
async function initDB() {
  let retries = 5;
  while (retries > 0) {
    try {
      const client = await pool.connect();
      try {
        await client.query('SELECT NOW()');
        console.log('Database connection successful');

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

// Load commands
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

// Register slash commands
async function registerCommands(commands) {
  const commandsArray = Object.values(commands).map(cmd => cmd.data.toJSON());

  if (process.env.NODE_ENV === 'development') {
    console.log('🧪 Dev Mode: Registering test server commands only...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.TEST_GUILD_ID),
      { body: commandsArray }
    );
  } else {
    console.log('🚀 Prod Mode: Registering global commands...');
    await rest.put(
      Routes.applicationCommands(process.env.CLIENT_ID),
      { body: commandsArray }
    );
  }
}


// Verify database structure
async function verifyDatabaseStructure() {
  const client = await pool.connect();
  try {
    const checkRes = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='user_balances' AND column_name='last_daily_claim'
    `);

    if (checkRes.rows.length === 0) {
      console.log('Adding missing last_daily_claim column...');
      await client.query(`
        ALTER TABLE user_balances 
        ADD COLUMN last_daily_claim TIMESTAMP WITH TIME ZONE
      `);
      console.log('Database structure updated successfully');
    }
  } catch (error) {
    console.error('Database verification failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

// Start bot
async function startBot() {
  try {
    console.log('Starting bot initialization...');
    await initDB();
    const commands = await loadCommands();

    client.once('ready', () => {
      console.log(`Logged in as ${client.user.tag}`);
      console.log(`Loaded ${Object.keys(commands).length} commands`);
      verifyDatabaseStructure();
    });

    client.on('interactionCreate', async interaction => {
      if (interaction.isCommand()) {
        // Debug commands
        if (interaction.commandName === 'debug-refresh') {
          if (!interaction.memberPermissions.has('Administrator')) {
            return interaction.reply({ content: '❌ Admin only command', ephemeral: true });
          }
          try {
            await registerCommands(commands);
            await verifyDatabaseStructure();
            return interaction.reply({ 
              content: '✅ Commands refreshed and database verified!', 
              ephemeral: true 
            });
          } catch (error) {
            console.error('Debug refresh failed:', error);
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
          await command.execute(interaction, pool, { cardsData, shopData });
        } catch (error) {
          console.error(`Error executing ${interaction.commandName}:`, error);
          const errorMessage = error.code === '42703' 
            ? "❌ Database needs update! Use `/debug-refresh` as admin to fix."
            : '❌ Command failed';
          
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: errorMessage, ephemeral: true });
          } else {
            await interaction.reply({ content: errorMessage, ephemeral: true });
          }
        }
      } else if (interaction.isButton() || interaction.isStringSelectMenu()) {
        // Handle button and select menu interactions
        try {
          if (interaction.customId.startsWith('inv_')) // Replace this part in index.js (around line 256):
if (interaction.customId.startsWith('inv_')) {
    // Handle inventory pagination
    const [_, type, rarityFilter, page] = interaction.customId.split('_');
    const inventoryCommand = commands['inventory'];
    
    if (!inventoryCommand) {
        throw new Error('Inventory command not found');
    }

    // Create a proper interaction object that maintains all methods
    const modifiedInteraction = {
        ...interaction,
        isButton: () => true,
        isStringSelectMenu: () => false,
        options: {
            getString: (name) => {
                if (name === 'type') return type;
                if (name === 'rarity') return rarityFilter === 'all' ? null : rarityFilter;
                return null;
            },
            getInteger: (name) => {
                if (name === 'page') return parseInt(page);
                return null;
            }
        },
        user: interaction.user
    };

    await inventoryCommand.execute(modifiedInteraction, pool, { cardsData, shopData });
    await interaction.deferUpdate();
} else if (interaction.customId === 'inventory_filter') {
            // Handle rarity filter selection
            const type = interaction.message.embeds[0].title.includes('Packs') ? 'packs' : 'cards';
            const inventoryCommand = commands['inventory'];
            
            if (!inventoryCommand) {
              throw new Error('Inventory command not found');
            }

            // Create options for the inventory command
            const options = {
              getString: (name) => {
                if (name === 'type') return type;
                if (name === 'rarity') return interaction.values[0] === 'all' ? null : interaction.values[0];
                return null;
              },
              getInteger: (name) => {
                if (name === 'page') return 1;
                return null;
              }
            };

            await inventoryCommand.execute({
              ...interaction,
              options,
              user: interaction.user
            }, pool, { cardsData, shopData });
            
            await interaction.deferUpdate();
          }
        } catch (error) {
          console.error('Error handling button interaction:', error);
          if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ content: '❌ Interaction failed', ephemeral: true });
          } else {
            await interaction.reply({ content: '❌ Interaction failed', ephemeral: true });
          }
        }
      }
    });

    await registerCommands(commands);
    await verifyDatabaseStructure();
    await client.login(process.env.TOKEN);
    console.log('Bot is now running!');

  } catch (error) {
    console.error('Fatal error during bot startup:', error);
    process.exit(1);
  }
}

// Start the bot
startBot();

// Export for command use
export { pool, cardsData, shopData };
