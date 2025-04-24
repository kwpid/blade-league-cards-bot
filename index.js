import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';

// 1. Basic setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 2. Load data files
const loadJSON = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8'));
const cardsData = loadJSON('data/cards.json');
const shopData = loadJSON('data/shopItems.json');

// 3. Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 4. Initialize database (same as before)
async function initDB() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS user_balances (...)`,
    `CREATE TABLE IF NOT EXISTS user_packs (...)`, 
    `CREATE TABLE IF NOT EXISTS user_cards (...)`
  ];
  for (const table of tables) await pool.query(table);
}

// 5. Simplified command loader
async function loadCommands() {
  const commands = {};
  const commandFiles = fs.readdirSync(path.join(__dirname, 'commands'))
    .filter(file => file.endsWith('.js'));
  
  for (const file of commandFiles) {
    const { default: command } = await import(`./commands/${file}`);
    if (command?.data) commands[command.data.name] = command;
  }
  return commands;
}

// 6. Start bot
async function start() {
  const commands = await loadCommands();
  
  client.on('ready', () => console.log(`Logged in as ${client.user.tag}`));
  client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;
    try {
      await commands[interaction.commandName]?.execute(interaction, pool, { cardsData, shopData });
    } catch (err) {
      console.error(err);
      await interaction.reply({ content: '❌ Command failed', ephemeral: true });
    }
  });

  await initDB();
  await client.login(process.env.TOKEN);
}

start().catch(console.error);
