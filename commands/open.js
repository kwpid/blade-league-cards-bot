import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { cardsData, shopData } from '../index.js';

const CARDS_PER_PACK = 1;

export default {
  data: new SlashCommandBuilder()
    .setName('open')
    .setDescription('Open packs from your inventory')
    .addIntegerOption(option =>
      option.setName('id')
        .setDescription('The unique ID of the pack to open (from /inventory)')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('quantity')
        .setDescription('Number of packs to open (max 5)')
        .setMinValue(1)
        .setMaxValue(5)),

  async execute(interaction, pool) {
    const packUniqueId = interaction.options.getInteger('id');
    const quantity = interaction.options.getInteger('quantity') || 1;
    const userId = interaction.user.id;

    // First check if the specified pack exists and belongs to the user
    const packCheck = await pool.query(
      `SELECT * FROM user_packs 
       WHERE id = $1 AND user_id = $2 AND opened = false`,
      [packUniqueId, userId]
    );

    if (packCheck.rows.length === 0) {
      return interaction.reply({
        content: `❌ You don't have an unopened pack with ID ${packUniqueId}!`,
        ephemeral: true
      });
    }

    // Get additional packs of the same type if quantity > 1
    const packsRes = await pool.query(
      `SELECT * FROM user_packs 
       WHERE user_id = $1 AND pack_id = $2 AND opened = false
       ORDER BY id ASC
       LIMIT $3`,
      [userId, packCheck.rows[0].pack_id, quantity]
    );

    if (packsRes.rows.length < quantity) {
      return interaction.reply({
        content: `❌ You only have ${packsRes.rows.length} unopened ${packCheck.rows[0].pack_name} pack(s)!`,
        ephemeral: true
      });
    }

    // Get pack rarity distribution
    const packInfo = shopData.packs.find(p => p.id === packCheck.rows[0].pack_id);
    if (!packInfo) {
      return interaction.reply({
        content: `❌ Invalid pack type!`,
        ephemeral: true
      });
    }

    // Generate cards using pack's rarity distribution
    const cardsToAdd = [];
    for (let i = 0; i < quantity * CARDS_PER_PACK; i++) {
      // Determine rarity based on pack's distribution
      const random = Math.random() * 100;
      let selectedRarity;
      let cumulative = 0;
      
      for (const [rarity, chance] of Object.entries(packInfo.rarities)) {
        cumulative += chance;
        if (random <= cumulative) {
          selectedRarity = rarity;
          break;
        }
      }

      // Filter cards by selected rarity
      const eligibleCards = cardsData.filter(card => card.rarity === selectedRarity);
      if (eligibleCards.length === 0) {
        // Fallback to any card if no cards found for selected rarity
        selectedRarity = cardsData[Math.floor(Math.random() * cardsData.length)].rarity;
      }

      // Select random card from filtered pool
      const finalEligibleCards = cardsData.filter(card => card.rarity === selectedRarity);
      const randomCard = finalEligibleCards[Math.floor(Math.random() * finalEligibleCards.length)];
      
      cardsToAdd.push({
        ...randomCard,
        value: {
          common: 50,
          uncommon: 100,
          rare: 250,
          legendary: 500,
          mythic: 1000
        }[randomCard.rarity]
      });
    }

    // Start transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Batch insert cards and get their unique IDs
      const insertedCards = [];
      for (const card of cardsToAdd) {
        const res = await client.query(
          `INSERT INTO user_cards 
           (user_id, card_id, card_name, rarity, stats_off, stats_def, stats_abl, stats_mch, value)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id`,
          [
            userId, 
            card.id, 
            card.name, 
            card.rarity, 
            card.stats.OFF, 
            card.stats.DEF, 
            card.stats.ABL, 
            card.stats.MCH, 
            card.value
          ]
        );
        insertedCards.push({
          ...card,
          unique_id: res.rows[0].id
        });
      }

      // DELETE the opened packs
      await client.query(
        `DELETE FROM user_packs 
         WHERE id = ANY($1::int[])`,
        [packsRes.rows.map(p => p.id)]
      );

      await client.query('COMMIT');

      // Create embed
      const embed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle(`🎁 Opened ${quantity} ${packCheck.rows[0].pack_name}${quantity > 1 ? 's' : ''}!`)
        .setDescription(`Obtained ${insertedCards.length} card${insertedCards.length > 1 ? 's' : ''}`)
        .setThumbnail('https://i.imgur.com/r3JYj4x.png');

      insertedCards.forEach((card, idx) => {
        const uniqueId = `${card.id}:${card.unique_id.toString().padStart(3, '0')}`;
        embed.addFields({
          name: `#${idx + 1} ${card.name} (${uniqueId})`,
          value: `✨ ${card.rarity.toUpperCase()} • ⭐ ${card.value}\n` +
                 `⚔️${card.stats.OFF} 🛡️${card.stats.DEF} 🎯${card.stats.ABL} 🤖${card.stats.MCH}`,
          inline: true
        });
      });

      await interaction.reply({ embeds: [embed] });

    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error opening packs:', error);
      await interaction.reply({
        content: '❌ An error occurred while opening your packs. Please try again.',
        ephemeral: true
      });
    } finally {
      client.release();
    }
  }
};
