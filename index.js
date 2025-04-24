import fs from "fs";
import path from "path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import { REST, Routes } from "discord.js";
import { Pool } from "pg";
import { fileURLToPath } from 'url';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load card and shop data from JSON files
const cardsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/cards.json'), 'utf8'));
const shopData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/shopItems.json'), 'utf8'));

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

// PostgreSQL Pool Setup (only for user data)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:imLZWLusyTSipUOnZsAFRadaYsoHcPyl@metro.proxy.rlwy.net:30227/railway',
  ssl: {
    rejectUnauthorized: false,
  }
});

// Test the connection
pool.connect()
  .then(() => console.log("Connected to PostgreSQL!"))
  .catch(err => console.error("Connection error", err.stack));

// Read commands from ./commands/
const commands = [];
const commandsPath = path.join(__dirname, "commands");
const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith(".js"));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = (await import(`./commands/${file}`)).default;
  if ("data" in command && "execute" in command) {
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
  }
}

// Register slash commands with Discord
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
  console.error(error);
}

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);

    if (!command) return;

    try {
      await command.execute(interaction, pool);
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: "There was an error while executing this command!",
        ephemeral: true,
      });
    }
  } else if (interaction.isButton()) {
    if (interaction.customId.startsWith('inventory_')) {
      const parts = interaction.customId.split('_');
      const inventoryCommand = client.commands.get('inventory');
      
      if (inventoryCommand) {
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
        await interaction.deferUpdate();
      }
    }
  }
});

client.once('ready', async () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);
  
  // Create tables if they don't exist (only for user data)
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

client.login(process.env.TOKEN).catch(console.error);

// Export the pool and data for use in other files
export { pool, cardsData, shopData };
