import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { query } from '../db.js';

function getRandomVariant() {
  const roll = Math.random() * 100;
  if (roll < 0.5) return 'deluxe';
  if (roll < 1.5) return 'gold';
  if (roll < 3.5) return 'silver';
  return 'normal';
}

function applyVariantBonuses(card, variant) {
  const bonuses = {
    normal: { multiplier: 1, add: 0 },
    silver: { multiplier: 1.1, add: 5 },
    gold: { multiplier: 1.25, add: 10 },
    deluxe: { multiplier: 1.5, add: 15 }
  };
  const bonus = bonuses[variant];
  const newStats = {};
  for (const stat in card.stats) {
    newStats[stat] = Math.round(card.stats[stat] * bonus.multiplier + bonus.add);
  }
  return newStats;
}

export default {
  data: new SlashCommandBuilder()
    .setName("open")
    .setDescription("Open a pack from your inventory")
    .addIntegerOption(option =>
      option.setName("id")
        .setDescription("The ID of the pack to open")
        .setRequired(true)),

  async execute(interaction) {
    const packId = interaction.options.getInteger("id");
    const userId = interaction.user.id;
    
    // Get inventory from DB
    const inventoryRes = await query(
      'SELECT packs, cards FROM user_inventories WHERE user_id = $1',
      [userId]
    );
    let inventory = inventoryRes.rows[0] || { packs: [], cards: [] };
    
    // Find pack
    const packIndex = inventory.packs.findIndex(p => p.id === packId);
    if (packIndex === -1) {
      return interaction.reply({
        content: "❌ Pack not found in your inventory!",
        ephemeral: true
      });
    }
    
    // Get cards (assuming cards are stored in DB)
    const cardsRes = await query('SELECT * FROM cards');
    const allCards = cardsRes.rows;
    
    // Random card selection logic (same as before)
    const selectedCard = allCards[Math.floor(Math.random() * allCards.length)];
    const variant = getRandomVariant();
    const modifiedStats = applyVariantBonuses(selectedCard, variant);
    
    // Add card to inventory
    inventory.packs.splice(packIndex, 1);
    inventory.cards.push({
      cardId: selectedCard.id,
      name: selectedCard.name,
      variant,
      stats: modifiedStats,
      obtainedDate: new Date().toISOString()
    });
    
    // Update DB
    await query(
      'UPDATE user_inventories SET packs = $1, cards = $2 WHERE user_id = $3',
      [JSON.stringify(inventory.packs), JSON.stringify(inventory.cards), userId]
    );
    
    // Send embed (same as before)
    const embed = new EmbedBuilder()
      .setTitle(`🎉 Opened ${selectedCard.name}!`)
      .addFields(
        { name: "Rarity", value: selectedCard.rarity, inline: true },
        { name: "Variant", value: variant, inline: true }
      );
    
    await interaction.reply({ embeds: [embed] });
  },
};
