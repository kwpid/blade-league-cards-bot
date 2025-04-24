import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { shopData } from '../index.js';

const ITEMS_PER_PAGE = 6;
const LIMITED_PACK_IDS = [101]; // Add IDs of packs that should be limited here

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
    
    // Separate packs into regular and limited
    const regularPacks = (shopData.packs || []).filter(pack => !LIMITED_PACK_IDS.includes(pack.id));
    const limitedPacks = (shopData.packs || []).filter(pack => LIMITED_PACK_IDS.includes(pack.id));

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle('🛒 Card Pack Shop')
      .setThumbnail('https://i.imgur.com/J8qTf7i.png');

    // Add limited packs section if any exist
    if (limitedPacks.length > 0) {
      embed.addFields({
        name: '🕒 Limited Time Packs',
        value: 'These packs are only available for a limited time!',
        inline: false
      });

      limitedPacks.forEach(pack => {
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

      embed.addFields({ name: '\u200B', value: 'Regular Packs', inline: false });
    }

    // Handle pagination for regular packs
    const totalPages = Math.ceil(regularPacks.length / ITEMS_PER_PAGE);
    const page = Math.min(currentPage, totalPages);
    const startIdx = (page - 1) * ITEMS_PER_PAGE;
    const paginatedItems = regularPacks.slice(startIdx, startIdx + ITEMS_PER_PAGE);

    // Add regular packs
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

    embed.setDescription(`Page ${page}/${totalPages} • ${regularPacks.length} regular pack${regularPacks.length !== 1 ? 's' : ''} available` +
      (limitedPacks.length > 0 ? ` • ${limitedPacks.length} limited pack${limitedPacks.length !== 1 ? 's' : ''}` : ''));

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};
