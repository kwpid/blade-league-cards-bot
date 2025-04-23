import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import path from 'path';
import { fileURLToPath } from 'url';
import { getInventory, updateInventory } from "../firebase.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cardsPath = path.join(__dirname, '../data/cards.json');

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

function calculateCardValue(card) {
  const rarityValues = {
    common: 1,
    uncommon: 2,
    rare: 5,
    legendary: 15,
    mythic: 30
  };
  
  const variantMultipliers = {
    normal: 1,
    silver: 2,
    gold: 5,
    deluxe: 10
  };
  
  const statSum = Object.values(card.stats).reduce((a, b) => a + b, 0);
  return Math.round(
    (rarityValues[card.rarity] * variantMultipliers[card.variant]) + 
    (statSum * 0.1)
  );
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
    const inventory = await getInventory(userId);
    
    // Find the pack in inventory
    const packIndex = inventory.packs.findIndex(p => p.id === packId);
    
    if (packIndex === -1) {
      return interaction.reply({
        content: "❌ You don't have a pack with that ID in your inventory!",
        ephemeral: true
      });
    }
    
    // Get all available cards
    const allCards = JSON.parse(await fs.readFile(cardsPath, 'utf8'));
    
    // Determine rarity distribution (weighted random)
    const rarityWeights = {
      common: 50,
      uncommon: 30,
      rare: 15,
      legendary: 4,
      mythic: 1
    };
    
    // Select a random card based on rarity weights
    let selectedCard;
    const totalWeight = Object.values(rarityWeights).reduce((a, b) => a + b, 0);
    let random = Math.random() * totalWeight;
    
    for (const card of allCards) {
      random -= rarityWeights[card.rarity];
      if (random <= 0) {
        selectedCard = card;
        break;
      }
    }
    
    // Determine variant
    const variant = getRandomVariant();
    const modifiedStats = applyVariantBonuses(selectedCard, variant);
    
    // Create card object for inventory
    const obtainedCard = {
      cardId: selectedCard.id,
      name: selectedCard.name,
      variant,
      obtainedDate: new Date().toISOString(),
      stats: modifiedStats,
      rarity: selectedCard.rarity,
      value: calculateCardValue({ ...selectedCard, stats: modifiedStats, variant })
    };
    
    // Add card to inventory and remove pack
    inventory.cards.push(obtainedCard);
    inventory.packs.splice(packIndex, 1);
    await updateInventory(userId, inventory);
    
    // Create embed to show the card
    const variantDisplay = {
      normal: "",
      silver: "Silver ",
      gold: "Gold ",
      deluxe: "Deluxe "
    };
    
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle(`🎉 You opened a ${variantDisplay[variant]}${selectedCard.name}!`)
      .setDescription(`⭐ ${obtainedCard.value} star value`)
      .addFields(
        { name: "Rarity", value: selectedCard.rarity.toUpperCase(), inline: true },
        { name: "Variant", value: variant.toUpperCase(), inline: true },
        { name: "Stats", value: `OFF: ${modifiedStats.OFF}\nDEF: ${modifiedStats.DEF}\nABL: ${modifiedStats.ABL}\nMCH: ${modifiedStats.MCH}` }
      )
      .setFooter({ text: "Added to your card collection!" });
    
    await interaction.reply({ embeds: [embed] });
  },
};
