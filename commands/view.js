import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('view')
    .setDescription('View detailed information about a card')
    .addStringOption(option =>
      option.setName('id')
        .setDescription('Card ID in format card_id:unique_id (e.g., 123:001)')
        .setRequired(true)),

  async execute(interaction, pool) {
    const idInput = interaction.options.getString('id');
    const userId = interaction.user.id;

    const [cardId, uniqueId] = idInput.split(':').map(part => part.trim());
    
    if (!cardId || !uniqueId) {
      return interaction.reply({
        content: '❌ Invalid card ID format! Use `card_id:unique_id` (e.g., 123:001)',
        ephemeral: true
      });
    }

    try {
      // Check if user has this card
      const cardRes = await pool.query(
        `SELECT * FROM user_cards 
         WHERE user_id = $1 AND card_id = $2 AND id = $3`,
        [userId, parseInt(cardId), parseInt(uniqueId)]
      );

      if (cardRes.rows.length === 0) {
        return interaction.reply({
          content: `❌ You don't have this card (${idInput}) in your inventory!`,
          ephemeral: true
        });
      }

      const card = cardRes.rows[0];
      const rarityColors = {
        common: 0x808080,
        uncommon: 0x2ecc71,
        rare: 0x3498db,
        legendary: 0x9b59b6,
        mythic: 0xf1c40f
      };

      const embed = new EmbedBuilder()
        .setColor(rarityColors[card.rarity] || 0x7289DA)
        .setTitle(card.card_name)
        .setDescription(`🆔 ${card.card_id}:${card.id.toString().padStart(3, '0')}`)
        .addFields(
          { name: '✨ Rarity', value: card.rarity, inline: true },
          { name: '⭐ Value', value: `${card.value} stars`, inline: true },
          { name: '⚔️ OFF', value: card.stats_off.toString(), inline: true },
          { name: '🛡️ DEF', value: card.stats_def.toString(), inline: true },
          { name: '🎯 ABL', value: card.stats_abl.toString(), inline: true },
          { name: '🤖 MCH', value: card.stats_mch.toString(), inline: true }
        )
        .setFooter({ 
          text: `Sell this card for ${Math.floor(card.value * 0.7)} stars with /sell card ${card.card_id}:${card.id.toString().padStart(3, '0')}` 
        });

      return interaction.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in view command:', error);
      return interaction.reply({
        content: '❌ An error occurred while viewing this card!',
        ephemeral: true
      });
    }
  }
};
