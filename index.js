import fs from "fs";
import path from "path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import { REST, Routes } from "discord.js";
import { Client as PGClient } from "pg";  // Import PostgreSQL client

config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();

// PostgreSQL Setup
const pgClient = new PGClient({
  connectionString: 'postgresql://postgres:imLZWLusyTSipUOnZsAFRadaYsoHcPyl@metro.proxy.rlwy.net:30227/railway',  // Directly using the connection URL you provided
  ssl: {
    rejectUnauthorized: false,  // Important for secure connections to PostgreSQL
  }
});

pgClient.connect()
  .then(() => console.log("Connected to PostgreSQL!"))
  .catch(err => console.error("Connection error", err.stack));

// Read commands from ./commands/
const commands = [];
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
  // First, remove all global commands
  await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: [] });
  // Then register guild-specific commands
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
      await command.execute(interaction);
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
        // Handle both old and new button formats
        let type, page;
        
        if (parts.length === 3) {
          // Old format: inventory_[action]_[page]
          type = "packs"; // Default to packs for backward compatibility
          page = parts[2];
        } else {
          // New format: inventory_[type]_[action]_[page]
          type = parts[1];
          page = parts[3];
        }
        
        // Create a fake interaction object with the options
        const fakeInteraction = {
          ...interaction,
          options: {
            getString: () => type,
            getInteger: () => parseInt(page)
          },
          user: interaction.user
        };
        
        await inventoryCommand.execute(fakeInteraction);
        await interaction.deferUpdate();
      }
    }
  }
});

// When the client is ready, run this code (only once)
client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    console.log('Available commands:', Array.from(client.commands.keys()));
    
    // Ensure data directories exist
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    
    // Initialize inventory file if it doesn't exist
    const inventoryFile = path.join(dataDir, 'userInventories.json');
    if (!fs.existsSync(inventoryFile)) {
      fs.writeFileSync(inventoryFile, '{}');
    }
    
    // Initialize cards file if it doesn't exist
    const cardsFile = path.join(dataDir, 'cards.json');
    if (!fs.existsSync(cardsFile)) {
      fs.writeFileSync(cardsFile, JSON.stringify([
        {
          "id": 1,
          "name": "Kupidcat",
          "stats": {
            "OFF": 76,
            "DEF": 87,
            "ABL": 60,
            "MCH": 82
          },
          "rarity": "rare",
          "availableTypes": "all"
        }
      ], null, 2));
    }

    // Example to create a table if it doesn't exist
    pgClient.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY, 
        username VARCHAR(255) UNIQUE NOT NULL
      )
    `)
      .then(() => console.log("Table 'users' created or already exists."))
      .catch(err => console.error("Error creating table:", err));
});

// Example function to insert data into PostgreSQL
const insertData = async (username) => {
  try {
    await pgClient.query('INSERT INTO users(username) VALUES($1) ON CONFLICT (username) DO NOTHING', [username]);
    console.log(`User ${username} inserted or already exists.`);
  } catch (err) {
    console.error('Error inserting data:', err);
  }
};

// Example of using PostgreSQL inside a command
client.on('messageCreate', async (message) => {
  if (message.content.startsWith('!save')) {
    const username = message.author.username;
    await insertData(username);
    message.reply(`Your username, ${username}, has been saved to the database!`);
  }
});

client.login(process.env.TOKEN).catch(console.error);
