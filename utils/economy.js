import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(readFileSync(join(__dirname, '../config.json'), 'utf-8'));

// Base values for different rarities
const BASE_VALUES = {
  common: 10,
  uncommon: 25,
  rare: 50,
  legendary: 100,
  mythic: 250,
  'ultra-rare': 150
};

// Calculate card value based on stats and rarity
export function calculateCardValue(card) {
  const baseValue = BASE_VALUES[card.rarity.toLowerCase()] || 10;
  const statTotal = card.stats.OFF + card.stats.DEF + card.stats.ABL + card.stats.MCH;
  const statMultiplier = statTotal / 400; // Normalize to 0-1 range
  
  // Apply ROI percentage to the calculated value
  return Math.round(baseValue * (1 + statMultiplier) * (1 + config.roiPercentage));
}

// Calculate pack price based on its contents
export function calculatePackPrice(pack, cardsData) {
  // Get all cards that can appear in this pack
  let eligibleCards = cardsData;
  
  // If pack has allowedCards, filter to only those
  if (pack.allowedCards && pack.allowedCards.length > 0) {
    eligibleCards = cardsData.filter(card => pack.allowedCards.includes(card.id));
  }
  
  // Calculate expected value of the pack
  let expectedValue = 0;
  const totalWeight = Object.values(pack.rarities).reduce((sum, weight) => sum + weight, 0);
  
  for (const [rarity, weight] of Object.entries(pack.rarities)) {
    const rarityCards = eligibleCards.filter(card => card.rarity.toLowerCase() === rarity);
    if (rarityCards.length === 0) continue;
    
    const avgRarityValue = rarityCards.reduce((sum, card) => sum + calculateCardValue(card), 0) / rarityCards.length;
    expectedValue += avgRarityValue * (weight / totalWeight);
  }
  
  // Apply ROI percentage and round
  return Math.round(expectedValue * (1 + config.roiPercentage));
}
