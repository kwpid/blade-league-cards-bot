import fs from "fs";
import path from "path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import { REST, Routes } from "discord.js";
import { fileURLToPath } from "url";

config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const commandsPath = path.join(__dirname, "commands");
const commands = [];

(async () => {
  try {
    if (!fs.existsSync(commandsPath)) {
      console.warn(`Commands folder not found at: ${commandsPath}`);
    } else {
      const commandFiles = fs
        .readdirSync(commandsPath)
        .filter((file) => file.endsWith(".js"));

      for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        try {
          const command = (await import(filePath)).default;
          if ("data" in command && "execute" in command) {
            client.commands.set(command.data.name, command);
            commands.push(command.data.toJSON());
          } else {
            console.warn(`The command at ${filePath} is missing "data" or "execute".`);
          }
        } catch (error) {
          console.error(`Error loading command at ${filePath}:`, error);
        }
      }
    }

    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);

    async function registerCommands() {
      try {
        console.log("Refreshing application (/) commands...");
        const data = await rest.put(
          Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
          { body: commands }
        );
        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
      } catch (error) {
        console.error("Error registering commands:", error);
      }
    }

    client.on("interactionCreate", async (interaction) => {
      if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);

        if (!command) {
          console.warn(`Command "${interaction.commandName}" not found.`);
          return;
        }

        try {
          console.log(`Executing command: ${interaction.commandName}`);
          await command.execute(interaction);
        } catch (error) {
          console.error(`Error executing command "${interaction.commandName}":`, error);
          await interaction.reply({
            content: "There was an error while executing this command!",
            ephemeral: true,
          });
        }
      }
    });

    client.once("ready", async () => {
      console.log(`Ready! Logged in as ${client.user.tag}`);
      console.log("Available commands:", Array.from(client.commands.keys()));
      await registerCommands();
    });

    await client.login(process.env.TOKEN);
  } catch (err) {
    console.error("Failed to start bot:", err);
  }
})();
