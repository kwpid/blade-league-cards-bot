import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';

// Basic setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Load data files
const cardsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/cards.json'), 'utf8');
const shopData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/shopItems.json'), 'utf8'));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Load commands
const commands = {};
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = (await import(`./commands/${file}`)).default;
  commands[command.data.name] = command;
}

// Ready event
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

// Interaction handling
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const command = commands[interaction.commandName];
  if (!command) return;

  try {
    await command.execute(interaction, pool);
  } catch (error) {
    console.error(error);
    await interaction.reply({ 
      content: 'There was an error executing this command!', 
      ephemeral: true 
    });
  }
});

// Start bot
client.login(process.env.TOKEN);
