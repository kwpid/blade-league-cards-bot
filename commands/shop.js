import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { shopData } from '../index.js';

const ITEMS_PER_PAGE = 6;

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View available card packs')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number')
        .setMinValue(1)),

  async execute(interaction) {
    const currentPage = interaction.options.getInteger('page') || 1;
    const totalPages = Math.ceil(shopData.packs.length / ITEMS_PER_PAGE);
    const startIdx = (currentPage - 1) * ITEMS_PER_PAGE;
    const paginatedItems = shopData.packs.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle('🛒 Card Pack Shop')
      .setDescription(`Page ${currentPage}/${totalPages} • ${shopData.packs.length} packs available`)
      .setThumbnail('https://i.imgur.com/J8qTf7i.png');

    paginatedItems.forEach(pack => {
      embed.addFields({
        name: `${pack.name} (ID: ${pack.id})`,
        value: [
          `💰 **Price:** ⭐ ${pack.price}`,
          `${pack.description}`,
          `\`/purchase pack id:${pack.id}\``
        ].join('\n'),
        inline: true
      });
    });

    // Pagination buttons
    const row = new ActionRowBuilder();
    if (currentPage > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`shop_page_${currentPage - 1}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
      );
    }
    if (currentPage < totalPages) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`shop_page_${currentPage + 1}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    await interaction.reply({ 
      embeds: [embed],
      components: row.components.length ? [row] : [],
      flags: "Ephemeral"
    });
  }
};
