import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { cardsData, shopData } from "../index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("open")
    .setDescription("Open a pack from your inventory")
    .addIntegerOption(option =>
      option.setName("id")
        .setDescription("The ID of the pack to open")
        .setRequired(true)),

  async execute(interaction, pool) {
    const packId = interaction.options.getInteger("id");
    const userId = interaction.user.id;

    // Check if user has the pack
    const packRes = await pool.query(
      `SELECT * FROM user_packs 
       WHERE user_id = $1 AND pack_id = $2 AND opened = false
       LIMIT 1`,
      [userId, packId]
    );

    if (packRes.rows.length === 0) {
      return interaction.reply({
        content: "❌ You don't have an unopened pack with that ID!",
        ephemeral: true
      });
    }

    const pack = packRes.rows[0];

    // Mark pack as opened
    await pool.query(
      'UPDATE user_packs SET opened = true WHERE id = $1',
      [pack.id]
    );

    // Generate cards based on pack rarity distribution
    const cardsToAdd = this.generateCardsFromPack(pack);

    // Add cards to inventory
    for (const card of cardsToAdd) {
      await pool.query(
        `INSERT INTO user_cards 
         (user_id, card_id, card_name, rarity, stats_off, stats_def, stats_abl, stats_mch, value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, card.id, card.name, card.rarity, 
         card.stats.OFF, card.stats.DEF, card.stats.ABL, card.stats.MCH, card.value]
      );
    }

    // Create embed showing the cards
    const embed = new EmbedBuilder()
      .setTitle(`🎉 You opened ${pack.pack_name}!`)
      .setDescription(`You received ${cardsToAdd.length} new cards!`)
      .setColor(0xf1c40f);

    for (const card of cardsToAdd) {
      embed.addFields({
        name: `${card.name} (${card.rarity.toUpperCase()})`,
        value: `⚔️ ${card.stats.OFF} 🛡️ ${card.stats.DEF} 🎯 ${card.stats.ABL} 🤖 ${card.stats.MCH}`,
        inline: true
      });
    }

    await interaction.reply({ embeds: [embed] });
  },

  generateCardsFromPack(pack) {
    const packDef = shopData.packs.find(p => p.id === pack.pack_id);
    if (!packDef) return [];

    const cards = [];
    const totalCards = 5; // Number of cards per pack

    for (let i = 0; i < totalCards; i++) {
      // Determine rarity based on pack probabilities
      const rand = Math.random() * 100;
      let selectedRarity;
      
      if (rand < packDef.rarities.mythic) {
        selectedRarity = 'mythic';
      } else if (rand < packDef.rarities.mythic + packDef.rarities.legendary) {
        selectedRarity = 'legendary';
      } else if (rand < packDef.rarities.mythic + packDef.rarities.legendary + packDef.rarities.rare) {
        selectedRarity = 'rare';
      } else if (rand < packDef.rarities.mythic + packDef.rarities.legendary + packDef.rarities.rare + packDef.rarities.uncommon) {
        selectedRarity = 'uncommon';
      } else {
        selectedRarity = 'common';
      }

      // Filter cards by selected rarity
      const eligibleCards = cardsData.filter(card => card.rarity === selectedRarity);
      if (eligibleCards.length === 0) continue;

      // Select random card from eligible ones
      const randomCard = eligibleCards[Math.floor(Math.random() * eligibleCards.length)];
      
      // Calculate card value based on rarity
      const value = {
        'common': 50,
        'uncommon': 100,
        'rare': 250,
        'legendary': 500,
        'mythic': 1000
      }[selectedRarity];

      cards.push({
        ...randomCard,
        value
      });
    }
    
    return cards;
  }
};
