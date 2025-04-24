import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { cardsData, shopData } from '../index.js';

const CARDS_PER_PACK = 1;

export default {
  data: new SlashCommandBuilder()
    .setName('open')
    .setDescription('Open packs from your inventory')
    .addIntegerOption(option =>
      option.setName('id')
        .setDescription('The ID of the pack to open')
        .setRequired(true))
    .addIntegerOption(option =>
      option.setName('quantity')
        .setDescription('Number of packs to open (max 5)')
        .setMinValue(1)
        .setMaxValue(5))
    .addStringOption(option =>
      option.setName('rarity')
        .setDescription('Filter by minimum rarity')
        .addChoices(
          { name: 'Common', value: 'common' },
          { name: 'Uncommon', value: 'uncommon' },
          { name: 'Rare', value: 'rare' },
          { name: 'Legendary', value: 'legendary' },
          { name: 'Mythic', value: 'mythic' }
        )),

  async execute(interaction, pool) {
    const packId = interaction.options.getInteger('id');
    const quantity = interaction.options.getInteger('quantity') || 1;
    const minRarity = interaction.options.getString('rarity') || 'common';
    const userId = interaction.user.id;

    // Check available unopened packs
    const packsRes = await pool.query(
      `SELECT * FROM user_packs 
       WHERE user_id = $1 AND pack_id = $2 AND opened = false
       LIMIT $3`,
      [userId, packId, quantity]
    );

    if (packsRes.rows.length === 0) {
      return interaction.reply({
        content: `❌ You don't have ${quantity} unopened pack(s) with ID ${packId}!`,
        flags: "Ephemeral"
      });
    }

    // Get pack rarity distribution
    const packInfo = shopData.packs.find(p => p.id === packId);
    if (!packInfo) {
      return interaction.reply({
        content: `❌ Invalid pack ID ${packId}!`,
        flags: "Ephemeral"
      });
    }

    // Mark packs as opened
    await pool.query(
      `UPDATE user_packs 
       SET opened = true 
       WHERE id = ANY($1::int[])`,
      [packsRes.rows.map(p => p.id)]
    );

    // Generate cards with proper rarity distribution
    const rarityTiers = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
    const minRarityIdx = rarityTiers.indexOf(minRarity);
    
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
      
      // Ensure selected rarity meets minimum requirement
      if (rarityTiers.indexOf(selectedRarity) < minRarityIdx) {
        selectedRarity = minRarity;
      }

      // Filter cards by selected rarity
      const eligibleCards = cardsData.filter(card => card.rarity === selectedRarity);
      if (eligibleCards.length === 0) {
        // Fallback to any card of min rarity if no cards found for selected rarity
        const fallbackCards = cardsData.filter(card => 
          rarityTiers.indexOf(card.rarity) >= minRarityIdx
        );
        if (fallbackCards.length > 0) {
          selectedRarity = fallbackCards[0].rarity;
        } else {
          // If still no cards, use common as final fallback
          selectedRarity = 'common';
        }
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

    // Batch insert cards
    const values = cardsToAdd.map(card => 
      `($1, ${card.id}, '${card.name.replace(/'/g, "''")}', '${card.rarity}', 
       ${card.stats.OFF}, ${card.stats.DEF}, ${card.stats.ABL}, ${card.stats.MCH}, ${card.value})`
    ).join(',');

    await pool.query(
      `INSERT INTO user_cards 
       (user_id, card_id, card_name, rarity, stats_off, stats_def, stats_abl, stats_mch, value)
       VALUES ${values}`,
      [userId]
    );

    // Create embed
    const embed = new EmbedBuilder()
      .setColor(0x0099FF)
      .setTitle(`🎁 Opened ${quantity} ${packInfo.name}${quantity > 1 ? 's' : ''}!`)
      .setDescription(`Obtained ${cardsToAdd.length} card${cardsToAdd.length > 1 ? 's' : ''} (Min rarity: ${minRarity})`)
      .setThumbnail('https://i.imgur.com/r3JYj4x.png');

    cardsToAdd.forEach((card, idx) => {
      embed.addFields({
        name: `#${idx + 1} ${card.name}`,
        value: `✨ ${card.rarity.toUpperCase()} • ⭐ ${card.value}\n⚔️${card.stats.OFF} 🛡️${card.stats.DEF} 🎯${card.stats.ABL} 🤖${card.stats.MCH}`,
        inline: true
      });
    });

    await interaction.reply({ embeds: [embed] });
  }
};
