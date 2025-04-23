import fs from "fs";
import path from "path";
import { Client, Collection, GatewayIntentBits } from "discord.js";
import { config } from "dotenv";
import { REST, Routes } from "discord.js";
import { query } from './db.js';
import { fileURLToPath } from 'url';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

async function initializeBot() {
  try {
    // Initialize database tables
    await query(`
      CREATE TABLE IF NOT EXISTS user_balances (
        user_id TEXT PRIMARY KEY,
        balance INTEGER NOT NULL DEFAULT 100
      );
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS user_inventories (
        user_id TEXT PRIMARY KEY,
        packs JSONB NOT NULL DEFAULT '[]',
        cards JSONB NOT NULL DEFAULT '[]'
      );
    `);

    // Initialize cards table if it doesn't exist
    const cardsExist = await query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'cards'
      );
    `);
    
    if (!cardsExist.rows[0].exists) {
      await query(`
        CREATE TABLE cards (
          id SERIAL PRIMARY KEY,
          name TEXT NOT NULL,
          stats JSONB NOT NULL,
          rarity TEXT NOT NULL,
          available_types TEXT NOT NULL
        );
      `);
      
      // Insert default card
      await query(`
        INSERT INTO cards (name, stats, rarity, available_types)
        VALUES ($1, $2, $3, $4);
      `, [
        "Kupidcat",
        { OFF: 76, DEF: 87, ABL: 60, MCH: 82 },
        "rare",
        "all"
      ]);
    }

    // Load commands
    const commandsPath = path.join(__dirname, "commands");
    const commandFiles = fs.readdirSync(commandsPath)
      .filter(file => file.endsWith(".js"));
    
    const commands = [];
    for (const file of commandFiles) {
      const command = (await import(`./commands/${file}`)).default;
      if ("data" in command && "execute" in command) {
        client.commands.set(command.data.name, command);
        commands.push(command.data.toJSON());
      }
    }

    // Register commands
    const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
    console.log("Refreshing application (/) commands...");
    
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log("Successfully reloaded application (/) commands.");

    // Set up event listeners
    client.once('ready', () => {
      console.log(`Ready! Logged in as ${client.user.tag}`);
      console.log('Available commands:', Array.from(client.commands.keys()));
    });

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
      } else if (interaction.isButton() && interaction.customId.startsWith('inventory_')) {
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
          
          await inventoryCommand.execute(fakeInteraction);
          await interaction.deferUpdate();
        }
      }
    });

    // Start the bot
    await client.login(process.env.TOKEN);
  } catch (error) {
    console.error("Bot initialization failed:", error);
    process.exit(1);
  }
}

initializeBot();
