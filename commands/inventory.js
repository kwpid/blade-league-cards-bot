import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { query } from '../db.js';

const ITEMS_PER_PAGE = 5;

async function getInventory(userId) {
  const res = await query(
    `INSERT INTO user_inventories (user_id) 
     VALUES ($1) 
     ON CONFLICT (user_id) 
     DO NOTHING 
     RETURNING packs, cards`,
    [userId]
  );
  return res.rows[0] || { packs: [], cards: [] };
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
    
    if (inventory.packs.length === 0 && inventory.cards.length === 0) {
      return interaction.reply({
        content: "Your inventory is empty! Use `/shop` to view available packs.",
        ephemeral: true
      });
    }
    
    // Display packs only (modify as needed)
    const totalPages = Math.ceil(inventory.packs.length / ITEMS_PER_PAGE);
    if (page > totalPages && totalPages > 0) {
      return interaction.reply({
        content: `Page ${page} doesn't exist! Your inventory has ${totalPages} page(s).`,
        ephemeral: true
      });
    }
    
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const pageItems = inventory.packs.slice(startIdx, startIdx + ITEMS_PER_PAGE);
    
    const embed = new EmbedBuilder()
      .setColor(0x7289DA)
      .setTitle(`${interaction.user.username}'s Inventory`)
      .setDescription(`Page ${page}/${totalPages}`)
      .addFields(
        pageItems.map((item, idx) => ({
          name: `${startIdx + idx + 1}. ${item.name}`,
          value: `ID: ${item.id}\nPurchased: ${new Date(item.purchaseDate).toLocaleDateString()}`,
          inline: true
        }))
      );
    
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
    
    await interaction.reply({ 
      embeds: [embed],
      components: row.components.length > 0 ? [row] : []
    });
  },
};
