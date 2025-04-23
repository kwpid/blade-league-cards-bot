import { SlashCommandBuilder } from "discord.js";
import path from 'path';
import { fileURLToPath } from 'url';
import { getBalance, setBalance, getInventory, updateInventory } from "../firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shopDataPath = path.join(__dirname, '../data/shopItems.json');

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
      
      // Get current inventory and add the pack
      const inventory = await getInventory(interaction.user.id);
      inventory.packs.push({
        ...pack,
        purchaseDate: new Date().toISOString()
      });
      await updateInventory(interaction.user.id, inventory);
      
      await interaction.reply({
        content: `✅ Successfully purchased **${pack.name}** for ⭐ ${pack.price} stars!\nYour new balance is ⭐ ${userBalance - pack.price} stars.`,
        ephemeral: true
      });
    }
  },
};
