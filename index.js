// index.js
import fs from "fs";
import path from "path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import { REST, Routes } from "discord.js";
import { db, getBalance } from "./firebase.js"; // Import Firebase functions

config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.commands = new Collection();

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
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Error executing command ${interaction.commandName}:`, error);
    await interaction.reply({
      content: "There was an error while executing this command!",
      ephemeral: true,
    });
  }
});

client.once('ready', async () => {
  console.log(`Ready! Logged in as ${client.user.tag}`);
  
  // Test Firebase connection
  try {
    const testRef = doc(db, "system", "connection_test");
    await setDoc(testRef, { 
      timestamp: new Date().toISOString(),
      status: "active",
      botName: client.user.tag
    });
    console.log("✅ Firebase connection test successful");
  } catch (error) {
    console.error("❌ Firebase connection test failed:", error);
  }

  // Initialize cards data if needed
  const cardsFile = path.join(__dirname, 'data', 'cards.json');
  if (!fs.existsSync(cardsFile)) {
    fs.mkdirSync(path.dirname(cardsFile), { recursive: true });
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
});

// Error handling
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(process.env.TOKEN).catch(error => {
  console.error('Login failed:', error);
  process.exit(1);
});
