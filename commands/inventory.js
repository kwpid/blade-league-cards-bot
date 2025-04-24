import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  ComponentType
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
    const type = interaction.options?.getString('type') || 'cards';
    const rarityFilter = interaction.options?.getString('rarity');
    let page = interaction.options?.getInteger('page') || 1;
    const userId = interaction.user.id;

    // Handle button interactions
    if (interaction.isButton()) {
      const [_, btnType, btnRarity, btnPage] = interaction.customId.split('_');
      page = parseInt(btnPage);
      return await this.showInventory(interaction, pool, btnType, btnRarity === 'all' ? null : btnRarity, page);
    }

    // Handle select menu interactions
    if (interaction.isStringSelectMenu()) {
      const [_, __, menuType, menuPage] = interaction.customId.split('_');
      const selectedRarity = interaction.values[0];
      return await this.showInventory(interaction, pool, menuType, selectedRarity === 'all' ? null : selectedRarity, parseInt(menuPage));
    }

    // Default slash command handling
    await this.showInventory(interaction, pool, type, rarityFilter, page);
  },

  async showInventory(interaction, pool, type, rarityFilter, page) {
    let query = `SELECT * FROM user_${type} WHERE user_id = $1`;
    const params = [interaction.user.id];

    if (type === 'cards' && rarityFilter) {
      query += ` AND rarity = $2`;
      params.push(rarityFilter);
    } else if (type === 'packs') {
      query += ` AND opened = false`;
    }

    query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE);

    const { rows: items } = await pool.query(query, params);
    const { rows: [{ count: totalCount }] } = await pool.query(
      `SELECT COUNT(*) FROM user_${type} WHERE user_id = $1${rarityFilter ? ` AND rarity = $2` : ''}`,
      [interaction.user.id, ...(rarityFilter ? [rarityFilter] : [])]
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
        embed.addFields({
          name: `${card.card_name}`,
          value: `✨ ${card.rarity}\n⭐ ${card.value} stars\n\`/view ${card.card_id}\``,
          inline: true
        });
      });
    }

    // Pagination buttons
    const row = new ActionRowBuilder();
    if (page > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inv_${type}_${rarityFilter || 'all'}_${page - 1}`)
          .setLabel('◀ Previous')
          .setStyle(ButtonStyle.Secondary)
      );
    }
    if (page < totalPages) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inv_${type}_${rarityFilter || 'all'}_${page + 1}`)
          .setLabel('Next ▶')
          .setStyle(ButtonStyle.Secondary)
      );
    }

    // Rarity dropdown
    const filterRow = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`inventory_filter_${type}_${page}`)
        .setPlaceholder('Filter by rarity')
        .addOptions([
          { label: 'All Rarities', value: 'all' },
          { label: 'Common', value: 'common' },
          { label: 'Uncommon', value: 'uncommon' },
          { label: 'Rare', value: 'rare' },
          { label: 'Legendary', value: 'legendary' },
          { label: 'Mythic', value: 'mythic' }
        ])
    );

    const responseOptions = {
      embeds: [embed],
      components: [filterRow, row].filter(row => row.components.length > 0),
      ephemeral: true
    };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(responseOptions);
    } else {
      await interaction.reply(responseOptions);
    }
  }
};
