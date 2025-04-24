import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { shopData } from '../index.js';

const ITEMS_PER_PAGE = 6;

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View available card packs')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Type of shop')
        .setChoices(
          { name: 'Packs', value: 'packs' },
          { name: 'Limited Packs', value: 'limitedPacks' }
        ))
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number')
        .setMinValue(1)),

  async execute(interaction) {
    const type = interaction.options.getString('type') || 'packs';
    const currentPage = interaction.options.getInteger('page') || 1;
    const items = shopData[type] || [];

    if (items.length === 0) {
      return await interaction.reply({
        content: `There are currently no items available in the ${type === 'limitedPacks' ? 'Limited Packs' : 'Packs'} shop.`,
        ephemeral: true
      });
    }

    const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
    const page = Math.min(currentPage, totalPages);
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const paginatedItems = items.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    const embed = new EmbedBuilder()
      .setColor(type === 'limitedPacks' ? 0xFFA500 : 0x00AE86)
      .setTitle(type === 'limitedPacks' ? '🕒 Limited Packs Shop' : '🛒 Card Pack Shop')
      .setDescription(`Page ${page}/${totalPages} • ${items.length} item${items.length > 1 ? 's' : ''} available`)
      .setThumbnail('https://i.imgur.com/J8qTf7i.png');

    paginatedItems.forEach(pack => {
      embed.addFields({
        name: `${pack.name} (ID: ${pack.id})`,
        value: [
          `💰 **Price:** ⭐ ${pack.price}`,
          `${pack.description || 'No description provided.'}`,
          `\`/purchase pack id:${pack.id}\``
        ].join('\n'),
        inline: true
      });
    });

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};
