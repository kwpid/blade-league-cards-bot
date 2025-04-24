import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from 'discord.js';
import { shopData, calculatePackPrice } from '../index.js';

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

  async execute(interaction, pool, { shopData, calculatePackPrice }) {
    const currentPage = interaction.options.getInteger('page') || 1;
    
    // Calculate dynamic prices for all packs
    const packsWithPrices = shopData.packs.map(pack => ({
      ...pack,
      price: calculatePackPrice(pack, shopData.cards)
    }));

    // Separate into regular and limited packs
    const regularPacks = packsWithPrices.filter(pack => !LIMITED_PACK_IDS.includes(pack.id));
    const limitedPacks = packsWithPrices.filter(pack => LIMITED_PACK_IDS.includes(pack.id));

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle('🛒 Card Pack Shop')
      .setThumbnail('https://i.imgur.com/J8qTf7i.png')
      .setFooter({ text: `ROI: ${(shopData.roiPercentage * 100).toFixed(0)}% • Prices update dynamically` });

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
            `🎚️ **Rarities:** ${Object.entries(pack.rarities)
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
          `🎚️ **Rarities:** ${Object.entries(pack.rarities)
            .map(([rarity, chance]) => `${rarity}: ${chance}%`)
            .join(', ')}`,
          `\`/purchase pack id:${pack.id}\``
        ].join('\n'),
        inline: true
      });
    });

    embed.setDescription(
      `Page ${page}/${totalPages} • ${regularPacks.length} regular pack${regularPacks.length !== 1 ? 's' : ''} available` +
      (limitedPacks.length > 0 ? ` • ${limitedPacks.length} limited pack${limitedPacks.length !== 1 ? 's' : ''}` : '')
    );

    // Add rarity filter dropdown if viewing page 1
    if (page === 1) {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('shop_rarity_filter')
          .setPlaceholder('Filter by Rarity')
          .addOptions([
            { label: 'All Rarities', value: 'all' },
            { label: 'Common', value: 'common' },
            { label: 'Uncommon', value: 'uncommon' },
            { label: 'Rare', value: 'rare' },
            { label: 'Legendary', value: 'legendary' },
            { label: 'Mythic', value: 'mythic' }
          ])
      );
      
      await interaction.reply({
        embeds: [embed],
        components: [row],
        ephemeral: false
      });
    } else {
      await interaction.reply({
        embeds: [embed],
        ephemeral: false
      });
    }
  }
};
