import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder
} from 'discord.js';

const ITEMS_PER_PAGE = 9;
const RARITY_COLORS = {
  common: 0x808080,
  uncommon: 0x2ecc71,
  rare: 0x3498db,
  legendary: 0x9b59b6,
  mythic: 0xf1c40f
};

export default {
  data: new SlashCommandBuilder()
    .setName('inventory')
    .setDescription('View your inventory')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Inventory type')
        .addChoices(
          { name: 'Packs', value: 'packs' },
          { name: 'Cards', value: 'cards' }
        ))
    .addStringOption(option =>
      option.setName('rarity')
        .setDescription('Filter cards by rarity')
        .addChoices(
          { name: 'All Rarities', value: 'all' },
          { name: 'Common', value: 'common' },
          { name: 'Uncommon', value: 'uncommon' },
          { name: 'Rare', value: 'rare' },
          { name: 'Legendary', value: 'legendary' },
          { name: 'Mythic', value: 'mythic' }
        ))
    .addIntegerOption(option =>
      option.setName('page')
        .setDescription('Page number')
        .setMinValue(1)),

  async execute(interaction, pool, { cardsData, shopData }) {
    // Handle both slash commands and button interactions
    const isButton = interaction.isButton?.() || false;
    const type = isButton 
      ? interaction.options?.getString('type') || 'cards'
      : interaction.options.getString('type') || 'cards';
    const rarityFilter = isButton
      ? interaction.options?.getString('rarity') || 'all'
      : interaction.options.getString('rarity') || 'all';
    const page = isButton
      ? interaction.options?.getInteger('page') || 1
      : interaction.options.getInteger('page') || 1;

    const userId = interaction.user.id;

    try {
      // Main query to get items
      let query = `SELECT *, id as unique_id FROM user_${type} WHERE user_id = $1`;
      const params = [userId];

      if (type === 'cards' && rarityFilter !== 'all') {
        query += ` AND rarity = $2`;
        params.push(rarityFilter);
      } else if (type === 'packs') {
        query += ` AND opened = false`;
      }

      // Add sorting
      if (type === 'cards') {
        query += ` ORDER BY value DESC`;
      } else if (type === 'packs') {
        query += ` ORDER BY purchase_date DESC`;
      }

      query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE);

      const { rows: items } = await pool.query(query, params);

      // Count query
      let countQuery = `SELECT COUNT(*) FROM user_${type} WHERE user_id = $1`;
      const countParams = [userId];

      if (type === 'cards' && rarityFilter !== 'all') {
        countQuery += ` AND rarity = $2`;
        countParams.push(rarityFilter);
      } else if (type === 'packs') {
        countQuery += ` AND opened = false`;
      }

      const { rows: [{ count: totalCount }] } = await pool.query(countQuery, countParams);
      const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

      const embed = new EmbedBuilder()
        .setColor(RARITY_COLORS[rarityFilter] || 0x7289DA)
        .setTitle(`${type === 'packs' ? '📦' : '🃏'} ${interaction.user.username}'s ${type.charAt(0).toUpperCase() + type.slice(1)}`)
        .setFooter({ text: `Page ${page}/${totalPages} • ${totalCount} ${type}${rarityFilter !== 'all' ? ` (${rarityFilter})` : ''}` });

      if (items.length === 0) {
        embed.setDescription(`No ${type} found${rarityFilter !== 'all' ? ` with ${rarityFilter} rarity` : ''}.`);
      } else if (type === 'packs') {
        items.forEach(pack => {
          const packInfo = shopData.packs.find(p => p.id === pack.pack_id);
          embed.addFields({
            name: `📦 ${pack.pack_name}`,
            value: `ID: ${pack.pack_id}\n` +
                   `Contains: ${packInfo?.contents || 'Unknown'}\n` +
                   `\`/open ${pack.unique_id}\``,
            inline: true
          });
        });
      } else {
        items.forEach(card => {
          const cardData = cardsData.find(c => c.id === card.card_id);
          const uniqueId = `${card.card_id}:${card.unique_id.toString().padStart(3, '0')}`;
          embed.addFields({
            name: `${card.card_name} (${uniqueId})`,
            value: `✨ ${card.rarity}\n` +
                   `⭐ Value: ${card.value} stars\n` +
                   `\`/view ${uniqueId}\` \`/sell ${uniqueId}\``,
            inline: true
          });
        });
      }

      // Only add filter dropdown for cards
      const components = [];
      if (type === 'cards') {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('inventory_filter')
          .setPlaceholder('Filter by rarity')
          .addOptions([
            { label: 'All Rarities', value: 'all' },
            { label: 'Common', value: 'common' },
            { label: 'Uncommon', value: 'uncommon' },
            { label: 'Rare', value: 'rare' },
            { label: 'Legendary', value: 'legendary' },
            { label: 'Mythic', value: 'mythic' }
          ]);

        components.push(new ActionRowBuilder().addComponents(selectMenu));
      }

      // Handle response based on interaction state
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          embeds: [embed],
          components: components
        });
      } else {
        await interaction.reply({
          embeds: [embed],
          components: components,
          ephemeral: false // Changed to false to make it visible to everyone
        });
      }
    } catch (error) {
      console.error('Error in inventory command:', error);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: '❌ An error occurred while fetching your inventory.' });
      } else {
        await interaction.reply({ content: '❌ An error occurred while fetching your inventory.', ephemeral: true });
      }
    }
  }
};
