import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const ITEMS_PER_PAGE = 6;
const LIMITED_PACK_IDS = [101];

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View available card packs')
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number')
        .setMinValue(1)),

  async execute(interaction, pool, { shopData, calculatePackPrice, config, cardsData }) {
    const currentPage = interaction.options.getInteger('page') || 1;
    
    try {
      // Calculate dynamic prices for all packs
      const packsWithPrices = shopData.packs.map(pack => ({
        ...pack,
        price: calculatePackPrice(pack, cardsData)
      }));

      // Separate into regular and limited packs
      const regularPacks = packsWithPrices.filter(pack => !LIMITED_PACK_IDS.includes(pack.id));
      const limitedPacks = packsWithPrices.filter(pack => LIMITED_PACK_IDS.includes(pack.id));

      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x00AE86)
        .setTitle('🛒 Card Pack Shop')
        .setThumbnail('https://i.imgur.com/J8qTf7i.png')
        .setFooter({ text: `ROI: ${(config.roiPercentage * 100).toFixed(0)}% • Prices update dynamically` });

      // Add limited packs section
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
              `💰 Price: ⭐ ${pack.price}`,
              pack.description || 'No description provided.',
              `🎚️ Rarities: ${Object.entries(pack.rarities)
                .map(([rarity, chance]) => `${rarity}: ${chance}%`)
                .join(', ')}`,
              `\`/purchase pack id:${pack.id}\``
            ].join('\n'),
            inline: true
          });
        });

        if (regularPacks.length > 0) {
          embed.addFields({ name: '\u200B', value: 'Regular Packs', inline: false });
        }
      }

      // Handle pagination
      const totalPages = Math.ceil(regularPacks.length / ITEMS_PER_PAGE);
      const page = Math.min(currentPage, totalPages);
      const paginatedItems = regularPacks.slice(
        (page - 1) * ITEMS_PER_PAGE,
        page * ITEMS_PER_PAGE
      );

      // Add regular packs
      paginatedItems.forEach(pack => {
        embed.addFields({
          name: `${pack.name} (ID: ${pack.id})`,
          value: [
            `💰 Price: ⭐ ${pack.price}`,
            pack.description || 'No description provided.',
            `🎚️ Rarities: ${Object.entries(pack.rarities)
              .map(([rarity, chance]) => `${rarity}: ${chance}%`)
              .join(', ')}`,
            `\`/purchase pack id:${pack.id}\``
          ].join('\n'),
          inline: true
        });
      });

      embed.setDescription(
        `Page ${page}/${totalPages} • ${regularPacks.length} regular pack${regularPacks.length !== 1 ? 's' : ''}` +
        (limitedPacks.length > 0 ? ` • ${limitedPacks.length} limited pack${limitedPacks.length !== 1 ? 's' : ''}` : '')
      );

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      console.error('Shop command error:', error);
      await interaction.reply({
        content: '❌ An error occurred while loading the shop. Please try again later.',
        ephemeral: true
      });
    }
  }
};
