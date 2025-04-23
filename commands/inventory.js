import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inventoryPath = path.join(__dirname, '../data/userInventories.json');

const ITEMS_PER_PAGE = 5;

async function getInventory(userId) {
  try {
    const data = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));
    return data[userId] || [];
  } catch {
    return [];
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your inventory of purchased items")
    .addIntegerOption(option =>
      option.setName("page")
        .setDescription("Page number to view")
        .setRequired(false)
        .setMinValue(1)),

  async execute(interaction) {
    const page = interaction.options.getInteger("page") || 1;
    const userId = interaction.user.id;
    const inventory = await getInventory(userId);
    
    if (inventory.length === 0) {
      return interaction.reply({
        content: "Your inventory is empty! Use `/shop` to view available packs to purchase.",
        ephemeral: true
      });
    }
    
    const totalPages = Math.ceil(inventory.length / ITEMS_PER_PAGE);
    if (page > totalPages) {
      return interaction.reply({
        content: `Page ${page} doesn't exist! Your inventory has ${totalPages} page(s).`,
        ephemeral: true
      });
    }
    
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const pageItems = inventory.slice(startIdx, endIdx);
    
    const embed = new EmbedBuilder()
      .setColor(0x7289DA)
      .setTitle(`${interaction.user.username}'s Inventory`)
      .setDescription(`Page ${page}/${totalPages}`)
      .addFields(
        pageItems.map((item, idx) => ({
          name: `${startIdx + idx + 1}. ${item.name}`,
          value: `Type: ${item.type}\nID: ${item.id}\nPurchased: ${new Date(item.purchaseDate).toLocaleDateString()}`,
          inline: true
        }))
      )
      .setFooter({ text: `Total items: ${inventory.length}` });
    
    const row = new ActionRowBuilder();
    
    if (page > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inventory_prev_${page - 1}`)
          .setLabel("Previous")
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    if (page < totalPages) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inventory_next_${page + 1}`)
          .setLabel("Next")
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    const replyOptions = { embeds: [embed] };
    if (row.components?.length > 0) {
      replyOptions.components = [row];
    }
    
    await interaction.reply(replyOptions);
  },
};
