import {
  SlashCommandBuilder,
  EmbedBuilder
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

  async execute(interaction, pool) {
    const type = interaction.options.getString('type') || 'cards';
    const rarityFilter = interaction.options.getString('rarity');
    const page = interaction.options.getInteger('page') || 1;

    const userId = interaction.user.id;

    let query = `SELECT *, id as unique_id FROM user_${type} WHERE user_id = $1`;
    const params = [userId];

    if (type === 'cards' && rarityFilter) {
      query += ` AND rarity = $2`;
      params.push(rarityFilter);
    } else if (type === 'packs') {
      query += ` AND opened = false`;
    }

    // Add sorting for cards (by value descending)
    if (type === 'cards') {
      query += ` ORDER BY value DESC`;
    }

    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE);

    const { rows: items } = await pool.query(query, params);
    const { rows: [{ count: totalCount }] } = await pool.query(
      `SELECT COUNT(*) FROM user_${type} WHERE user_id = $1${rarityFilter ? ` AND rarity = $2` : ''}`,
      [userId, ...(rarityFilter ? [rarityFilter] : [])]
    );

    const totalPages = Math.max(1, Math.ceil(totalCount / ITEMS_PER_PAGE));

    const embed = new EmbedBuilder()
      .setColor(RARITY_COLORS[rarityFilter] || 0x7289DA)
      .setTitle(`${type === 'packs' ? '📦' : '🃏'} ${interaction.user.username}'s Inventory`)
      .setFooter({ text: `Page ${page}/${totalPages} • ${totalCount} ${type}` });

    if (items.length === 0) {
      embed.setDescription('No items found on this page.');
    } else if (type === 'packs') {
      items.forEach(pack => {
        embed.addFields({
          name: `📦 ${pack.pack_name}`,
          value: `ID: ${pack.pack_id}\nPrice: ${pack.pack_price} stars\n\`/open id:${pack.pack_id}\``,
          inline: true
        });
      });
    } else {
      items.forEach(card => {
        // Generate the unique ID format [cardId]:[uniqueId]
        const uniqueId = `${card.card_id}:${card.unique_id.toString().padStart(3, '0')}`;
        embed.addFields({
          name: `${card.card_name} (${uniqueId})`,
          value: `✨ ${card.rarity}\n⭐ ${card.value} stars\n\`/view ${uniqueId}\``,
          inline: true
        });
      });
    }

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });
  }
};
