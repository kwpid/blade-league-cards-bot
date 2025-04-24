import { SlashCommandBuilder } from 'discord.js';
import { cardsData, shopData } from '../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('open')
    .setDescription('Open a pack from your inventory')
    .addIntegerOption(option =>
      option.setName('id')
        .setDescription('The ID of the pack to open')
        .setRequired(true)),
        
  async execute(interaction, pool) {
    const packId = interaction.options.getInteger('id');
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

    // Generate cards (simplified example)
    const cardsToAdd = [];
    for (let i = 0; i < 5; i++) {
      const randomCard = cardsData[Math.floor(Math.random() * cardsData.length)];
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

    // Show opened cards
    const embed = new EmbedBuilder()
      .setTitle(`🎉 You opened ${pack.pack_name}!`)
      .setDescription(`You received ${cardsToAdd.length} cards!`);
    
    cardsToAdd.forEach(card => {
      embed.addFields({
        name: `${card.name} (${card.rarity})`,
        value: `OFF: ${card.stats.OFF} | DEF: ${card.stats.DEF} | Value: ${card.value} stars`
      });
    });

    await interaction.reply({ embeds: [embed] });
  }
};
