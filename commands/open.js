import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const inventoryPath = path.join(__dirname, '../data/userInventories.json');
const cardsPath = path.join(__dirname, '../data/cards.json');
const shopDataPath = path.join(__dirname, '../data/shopItems.json');

async function getInventory(userId) {
  try {
    const data = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));
    return data[userId] || { packs: [], cards: [] };
  } catch {
    return { packs: [], cards: [] };
  }
}

async function updateInventory(userId, inventory) {
  let allInventories = {};
  try {
    allInventories = JSON.parse(await fs.readFile(inventoryPath, 'utf8'));
  } catch {
    allInventories = {};
  }
  
  allInventories[userId] = inventory;
  await fs.writeFile(inventoryPath, JSON.stringify(allInventories, null, 2));
}

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
    
    // Get pack details including rarity chances
    const pack = inventory.packs[packIndex];
    
    if (!pack.rarities) {
      return interaction.reply({
        content: "❌ This pack doesn't have valid rarity settings!",
        ephemeral: true
      });
    }
    
    // Get all available cards
    const allCards = JSON.parse(await fs.readFile(cardsPath, 'utf8'));
    
    // Select a random card based on pack's rarity weights
    const rarityEntries = Object.entries(pack.rarities).filter(([_, weight]) => weight > 0);
    const totalWeight = rarityEntries.reduce((sum, [_, weight]) => sum + weight, 0);
    
    if (totalWeight <= 0) {
      return interaction.reply({
        content: "❌ This pack has no valid rarity weights configured!",
        ephemeral: true
      });
    }
    
    let random = Math.random() * totalWeight;
    let selectedRarity;
    
    for (const [rarity, weight] of rarityEntries) {
      random -= weight;
      if (random <= 0) {
        selectedRarity = rarity;
        break;
      }
    }
    
    // Filter cards by selected rarity
    const eligibleCards = allCards.filter(card => card.rarity === selectedRarity);
    
    if (eligibleCards.length === 0) {
      return interaction.reply({
        content: `❌ No cards available for the selected rarity (${selectedRarity})!`,
        ephemeral: true
      });
    }
    
    // Select random card from eligible ones
    const selectedCard = eligibleCards[Math.floor(Math.random() * eligibleCards.length)];
    
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
    
    const rarityColors = {
      common: 0x808080,
      uncommon: 0x2ecc71,
      rare: 0x3498db,
      legendary: 0x9b59b6,
      mythic: 0xf1c40f
    };
    
    const embed = new EmbedBuilder()
      .setColor(rarityColors[selectedCard.rarity] || 0x00ff00)
      .setTitle(`🎉 You opened a ${variantDisplay[variant]}${selectedCard.name}!`)
      .setDescription(`⭐ ${obtainedCard.value} star value`)
      .addFields(
        { name: "Rarity", value: selectedCard.rarity.toUpperCase(), inline: true },
        { name: "Variant", value: variant.toUpperCase(), inline: true },
        { name: "Stats", value: `OFF: ${modifiedStats.OFF}\nDEF: ${modifiedStats.DEF}\nABL: ${modifiedStats.ABL}\nMCH: ${modifiedStats.MCH}` }
      )
      .setFooter({ text: `From ${pack.name} pack` });
    
    await interaction.reply({ embeds: [embed] });
  },
};
