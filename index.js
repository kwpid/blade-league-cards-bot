import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';

// 1. Basic setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// 2. Load data files - FIXED SYNTAX HERE
const loadJSON = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, file), 'utf8');
const cardsData = loadJSON('data/cards.json');
const shopData = loadJSON('data/shopItems.json');

// 3. Database setup
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 4. Initialize database
async function initDB() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS user_balances (
      user_id VARCHAR(20) PRIMARY KEY,
      balance INTEGER NOT NULL DEFAULT 100,
      last_updated TIMESTAMP DEFAULT NOW()
    )`,
    `CREATE TABLE IF NOT EXISTS user_packs (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(20) NOT NULL,
      pack_id INTEGER NOT NULL,
      pack_name VARCHAR(100) NOT NULL,
      pack_description TEXT,
      pack_price INTEGER,
      purchase_date TIMESTAMP DEFAULT NOW(),
      opened BOOLEAN DEFAULT FALSE,
      FOREIGN KEY (user_id) REFERENCES user_balances(user_id) ON DELETE CASCADE
    )`,
    `CREATE TABLE IF NOT EXISTS user_cards (
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
    )`
  ];

  for (const table of tables) {
    await pool.query(table);
  }
  console.log('Database tables verified');
}

// 5. Command loader
async function loadCommands() {
  const commands = {};
  const commandFiles = fs.readdirSync(path.join(__dirname, 'commands'))
    .filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = (await import(`./commands/${file}`)).default;
    commands[command.data.name] = command;
  }
  return commands;
}

// 6. Main bot
async function startBot() {
  try {
    const commands = await loadCommands();
    
    client.once('ready', async () => {
      console.log(`Logged in as ${client.user.tag}`);
      await initDB();
    });

    client.on('interactionCreate', async interaction => {
      if (!interaction.isCommand()) return;
      const command = commands[interaction.commandName];
      if (!command) return;

      try {
        await command.execute(interaction, pool, { cardsData, shopData });
      } catch (error) {
        console.error(error);
        await interaction.reply({ 
          content: '❌ Command error!', 
          ephemeral: true 
        });
      }
    });

    await client.login(process.env.TOKEN);
  } catch (error) {
    console.error('Bot startup failed:', error);
    process.exit(1);
  }
}

// 7. Start everything
startBot();
