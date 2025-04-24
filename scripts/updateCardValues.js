// scripts/updateCardValues.js
import { pool } from '../index.js';
import { calculateCardValue } from '../utils/economy.js';
import cardsData from '../data/cards.json' assert { type: 'json' };

async function updateCardValues() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    // Get all user cards
    const { rows: userCards } = await client.query('SELECT * FROM user_cards');
    
    for (const userCard of userCards) {
      const cardData = cardsData.find(c => c.id === userCard.card_id);
      if (!cardData) continue;
      
      const newValue = calculateCardValue(cardData);
      
      await client.query(
        'UPDATE user_cards SET value = $1 WHERE id = $2',
        [newValue, userCard.id]
      );
    }
    
    await client.query('COMMIT');
    console.log('✅ Successfully updated all card values');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error updating card values:', error);
  } finally {
    client.release();
    process.exit();
  }
}

updateCardValues();
