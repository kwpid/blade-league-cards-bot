import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import { getInventory, updateCardInAllInventories } from "../firebase.js";

const ITEMS_PER_PAGE = 5;

// Rarity colors for cards
const RARITY_COLORS = {
  common: 0x808080,    // Gray
  uncommon: 0x2ecc71,  // Green
  rare: 0x3498db,      // Blue
  legendary: 0x9b59b6, // Purple
  mythic: 0xf1c40f     // Gold
};

// Emoji representations for better visual distinction
const TYPE_EMOJIS = {
  packs: "📦",
  cards: "🃏"
};

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
        content: `${TYPE_EMOJIS[inventoryType]} Your ${inventoryType} inventory is empty!`,
        ephemeral: true
      });
    }
    
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (page > totalPages) {
      return interaction.reply({
        content: `⚠️ Page ${page} doesn't exist! Your ${inventoryType} inventory has ${totalPages} page(s).`,
        ephemeral: true
      });
    }
    
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const endIdx = startIdx + ITEMS_PER_PAGE;
    const pageItems = items.slice(startIdx, endIdx);
    
    // Create different embeds for packs vs cards
    const embed = new EmbedBuilder()
      .setTitle(`${TYPE_EMOJIS[inventoryType]} ${interaction.user.username}'s ${inventoryType.toUpperCase()}`)
      .setDescription(`📄 Page ${page}/${totalPages} | 📦 Total: ${totalItems}`);

    if (inventoryType === "packs") {
      embed.setColor(0x3498db) // Blue for packs
        .addFields(
          pageItems.map((item, idx) => ({
            name: `📦 ${startIdx + idx + 1}. ${item.name}`,
            value: [
              `🆔 ID: ${item.id}`,
              `💰 Value: ${item.price || 'N/A'} stars`,
              `\`/open ${item.id}\` to open this pack`,
              ...(item.description ? [`📝 ${item.description}`] : [])
            ].join('\n'),
            inline: false
          }))
        );
    } else {
      // Cards embed
      embed.setColor(RARITY_COLORS[pageItems[0]?.rarity] || 0x7289DA) // Use first card's rarity color
        .addFields(
          pageItems.map((card, idx) => {
            const variantEmoji = {
              normal: "",
              silver: "🥈 ",
              gold: "🏆 ",
              deluxe: "💎 "
            }[card.variant];
            
            return {
              name: `${variantEmoji}${startIdx + idx + 1}. ${card.name}`,
              value: [
                `✨ Rarity: ${card.rarity.toUpperCase()}`,
                `⭐ Value: ${card.value} stars`,
                `⚔️ OFF: ${card.stats.OFF} | 🛡️ DEF: ${card.stats.DEF}`,
                `🎯 ABL: ${card.stats.ABL} | 🤖 MCH: ${card.stats.MCH}`,
                `🆔 Card ID: ${card.cardId}`
              ].join('\n'),
              inline: true
            };
          })
        );
    }
    
    // Pagination buttons
    const row = new ActionRowBuilder();
    
    if (page > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inventory_${inventoryType}_prev_${page - 1}`)
          .setLabel("◀ Previous")
          .setStyle(ButtonStyle.Secondary)
      );
    }
    
    if (page < totalPages) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inventory_${inventoryType}_next_${page + 1}`)
          .setLabel("Next ▶")
          .setStyle(ButtonStyle.Secondary)
      );
    }
    
    // Add type switcher if there are items in both categories
    const otherType = inventoryType === "packs" ? "cards" : "packs";
    if (inventory[otherType]?.length > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inventory_${otherType}_switch_1`)
          .setLabel(`View ${otherType}`)
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    const replyOptions = { 
      embeds: [embed],
      components: row.components?.length > 0 ? [row] : []
    };
    
    await interaction.reply(replyOptions);
  },
};
