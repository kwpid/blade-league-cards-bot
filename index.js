// index.js (main bot file)
import fs from "fs";
import path from "path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import { REST, Routes } from "discord.js";

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
    console.error(error);
    await interaction.reply({
      content: "There was an error while executing this command!",
      ephemeral: true,
    });
  }
});

// When the client is ready, run this code (only once)
client.once('ready', () => {
    console.log(`Ready! Logged in as ${client.user.tag}`);
    console.log('Available commands:', Array.from(client.commands.keys()));
});

client.login(process.env.TOKEN).catch(console.error);
