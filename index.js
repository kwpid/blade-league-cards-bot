import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Client, GatewayIntentBits } from 'discord.js';
import { Pool } from 'pg';
import 'dotenv/config';

// Basic setup
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Load data files - FIXED THE MISSING PARENTHESES HERE
const cardsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/cards.json'), 'utf8'));
const shopData = JSON.parse(fs.readFileSync(path.join(__dirname, 'data/shopItems.json'), 'utf8'));

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize database tables
async function initDB() {
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
  console.log('Database tables verified');
}

// Load commands
const commands = {};
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = (await import(`./commands/${file}`)).default;
  commands[command.data.name] = command;
}

// Ready event
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await initDB();
});

// Interaction handling
client.on('interactionCreate', async interaction => {
  if (!interaction.isCommand()) return;

  const command = commands[interaction.commandName];
  if (!command) return;

  try {
    await command.execute(interaction, pool, { cardsData, shopData });
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

// Export for commands to use
export { pool, cardsData, shopData };
