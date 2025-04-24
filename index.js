import fs from "fs";
import path from "path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import { REST, Routes } from "discord.js";
import { Pool } from "pg";
import { fileURLToPath } from 'url';
import http from 'http';

// Get __dirname equivalent in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize variables
let cardsData;
let shopData;
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

// Load configuration
config();

// Load data files
try {
  console.log("Starting bot with Node.js", process.version);
  console.log("Current directory:", __dirname);
  console.log("Files in data directory:", fs.readdirSync(path.join(__dirname, 'data')));
  
  cardsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/cards.json'), 'utf8'));
  shopData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/shopItems.json'), 'utf8'));
  
  console.log('Cards data loaded:', cardsData.length, 'cards');
  console.log('Shop data loaded:', shopData.packs.length, 'packs');
} catch (err) {
  console.error('Failed to load data files:', err);
  process.exit(1);
}

// Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:imLZWLusyTSipUOnZsAFRadaYsoHcPyl@metro.proxy.rlwy.net:30227/railway',
  ssl: {
    rejectUnauthorized: false,
  }
});

pool.on('error', (err) => {
  console.error('Unexpected database error:', err);
});

// Health check server
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Bot is running');
});

// Main async function to avoid top-level await
async function startBot() {
  try {
    // Test database connection
    const res = await pool.query('SELECT NOW()');
    console.log('Database connection successful:', res.rows[0].now);

    // Load commands
    const commands = [];
    const commandsPath = path.join(__dirname, "commands");
    const commandFiles = fs.readdirSync(commandsPath)
      .filter(file => file.endsWith(".js"));

    for (const file of commandFiles) {
      const filePath = path.join(commandsPath, file);
      const commandModule = await import(`./commands/${file}`);
      const command = commandModule.default;
      if (command?.data && command?.execute) {
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
      }
    }

    // Register commands
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    try {
      console.log("Refreshing application (/) commands...");
      await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log("Successfully reloaded application (/) commands.");
    } catch (error) {
      console.error('Failed to refresh commands:', error);
    }

    // Start HTTP server
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
      console.log(`Health check server running on port ${PORT}`);
    });

    // Client event handlers
    client.on("interactionCreate", async (interaction) => {
      if (!interaction.isChatInputCommand()) {
        if (interaction.isButton()) {
          return handleButtonInteraction(interaction);
        }
        return;
      }

      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await interaction.deferReply({ ephemeral: true });
        await Promise.race([
          command.execute(interaction, pool),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Command timeout')), 10000)
          )
        ]);
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        const content = error.message.includes('timeout') 
          ? "⌛ Command timed out. Please try again."
          : "❌ An error occurred while executing this command!";
        
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content });
        } else {
          await interaction.reply({ content, ephemeral: true });
        }
      }
    });

    client.once('ready', async () => {
      console.log(`Ready! Logged in as ${client.user.tag}`);
      
      // Create tables if they don't exist
      try {
        await pool.query(`
          CREATE TABLE IF NOT EXISTS user_balances (
            user_id VARCHAR(20) PRIMARY KEY,
            balance INTEGER NOT NULL DEFAULT 100,
            last_updated TIMESTAMP DEFAULT NOW()
          )
        `);
        
        await pool.query(`
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
        
        await pool.query(`
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
        
        console.log("Database tables verified/created");
      } catch (err) {
        console.error("Error creating tables:", err);
      }
    });

    // Login to Discord
    await client.login(process.env.TOKEN);
    console.log("Discord client login initiated");

  } catch (error) {
    console.error('Failed to start bot:', error);
    process.exit(1);
  }
}

async function handleButtonInteraction(interaction) {
  if (interaction.customId.startsWith('inventory_')) {
    const inventoryCommand = client.commands.get('inventory');
    if (!inventoryCommand) return;
    
    try {
      await interaction.deferUpdate();
      const parts = interaction.customId.split('_');
      let type, page;
      
      if (parts.length === 3) {
        type = "packs";
        page = parts[2];
      } else {
        type = parts[1];
        page = parts[3];
      }
      
      const fakeInteraction = {
        ...interaction,
        options: {
          getString: () => type,
          getInteger: () => parseInt(page)
        },
        user: interaction.user
      };
      
      await inventoryCommand.execute(fakeInteraction, pool);
    } catch (error) {
      console.error('Error handling button interaction:', error);
    }
  }
}

// Start the bot
startBot().catch(console.error);

// Export the pool and data for use in other files
export { pool, cardsData, shopData };
