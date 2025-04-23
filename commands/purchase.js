import { SlashCommandBuilder } from "discord.js";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '../data/userBalances.json');
const shopDataPath = path.join(__dirname, '../data/shopItems.json');
const inventoryPath = path.join(__dirname, '../data/userInventories.json');

async function getBalance(userId) {
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  return data[userId] || 100;
}

async function setBalance(userId, amount) {
  const data = JSON.parse(await fs.readFile(dataPath, 'utf8'));
  data[userId] = amount;
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
}

async function addToInventory(userId, item) {
  let inventories = {};
  try {
    inventories = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));
  } catch {
    inventories = {};
  }
  
  if (!inventories[userId]) {
    inventories[userId] = [];
  }
  
  inventories[userId].push({
    ...item,
    purchaseDate: new Date().toISOString()
  });
  
  await fs.writeFile(inventoryPath, JSON.stringify(inventories, null, 2));
}

export default {
  data: new SlashCommandBuilder()
    .setName("purchase")
    .setDescription("Purchase an item from the shop")
    .addStringOption(option =>
      option.setName("type")
        .setDescription("The type of item to purchase")
        .setRequired(true)
        .addChoices({ name: "shop", value: "shop" }))
    .addIntegerOption(option =>
      option.setName("id")
        .setDescription("The ID of the item to purchase")
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction) {
    const type = interaction.options.getString("type");
    const id = interaction.options.getInteger("id");
    
    if (type === "shop") {
      const shopData = JSON.parse(await fs.readFile(shopDataPath, 'utf8'));
      const pack = shopData.packs.find(p => p.id === id);
      
      if (!pack) {
        return interaction.reply({ 
          content: "❌ Invalid pack ID! Use `/shop` to see available packs.", 
          ephemeral: true 
        });
      }

      const userBalance = await getBalance(interaction.user.id);
      
      if (userBalance < pack.price) {
        return interaction.reply({ 
          content: `❌ You don't have enough stars! You need ${pack.price} stars but have ${userBalance} stars.`, 
          ephemeral: true 
        });
      }

      // Deduct stars and complete purchase
      await setBalance(interaction.user.id, userBalance - pack.price);
      
      // Add to inventory
      await addToInventory(interaction.user.id, {
        id: pack.id,
        type: "pack",
        name: pack.name
      });
      
      await interaction.reply({
        content: `✅ Successfully purchased **${pack.name}** for ⭐ ${pack.price} stars!\nYour new balance is ⭐ ${userBalance - pack.price} stars.`,
        ephemeral: true
      });
    }
  },
};
