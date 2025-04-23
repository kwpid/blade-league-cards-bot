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
    return data[userId] || { packs: [], cards: [] };
  } catch {
    return { packs: [], cards: [] };
  }
}

export default {
  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your inventory")
    .addStringOption(option =>
      option.setName("type")
        .setDescription("Type of inventory to view")
        .setRequired(false)
        .addChoices(
          { name: "Packs", value: "packs" },
          { name: "Cards", value: "cards" }
        ))
    .addIntegerOption(option =>
      option.setName("page")
        .setDescription("Page number to view")
        .setRequired(false)
        .setMinValue(1)),

  async execute(interaction) {
    const inventoryType = interaction.options.getString("type") || "packs";
    const page = interaction.options.getInteger("page") || 1;
    const userId = interaction.user.id;
    const inventory = await getInventory(userId);
    
    const items = inventory[inventoryType];
    const totalItems = items.length;
    
    if (totalItems === 0) {
      return interaction.reply({
        content: `Your ${inventoryType} inventory is empty!`,
        ephemeral: true
      });
    }
    
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (page > totalPages) {
      return interaction.reply({
        content: `Page ${page} doesn't exist! Your ${inventoryType} inventory has ${totalPages} page(s).`,
        ephemeral: true
      });
    }
    
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const pageItems = items.slice(startIdx, endIdx);
    
    const embed = new EmbedBuilder()
      .setColor(0x7289DA)
      .setTitle(`${interaction.user.username}'s ${inventoryType.toUpperCase()} Inventory`)
      .setDescription(`Page ${page}/${totalPages}`);
    
    if (inventoryType === "packs") {
      embed.addFields(
        pageItems.map((item, idx) => ({
          name: `${startIdx + idx + 1}. ${item.name}`,
          value: `ID: ${item.id}\nUse \`/open ${item.id}\` to open this pack`,
          inline: true
        }))
      );
    } else {
      embed.addFields(
        pageItems.map((card, idx) => ({
          name: `${startIdx + idx + 1}. ${card.variant !== 'normal' ? card.variant.toUpperCase() + ' ' : ''}${card.name}`,
          value: `⭐ Value: ${card.value}\nRarity: ${card.rarity.toUpperCase()}\nOFF: ${card.stats.OFF} | DEF: ${card.stats.DEF}\nABL: ${card.stats.ABL} | MCH: ${card.stats.MCH}`,
          inline: true
        }))
      );
    }
    
    embed.setFooter({ text: `Total ${inventoryType}: ${totalItems}` });
    
    const row = new ActionRowBuilder();
    
    if (page > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inventory_${inventoryType}_prev_${page - 1}`)
          .setLabel("Previous")
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    if (page < totalPages) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inventory_${inventoryType}_next_${page + 1}`)
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
