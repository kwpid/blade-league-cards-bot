import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('sell')
    .setDescription('Sell items from your inventory')
    .addStringOption(option =>
      option.setName('type')
        .setDescription('Item type to sell')
        .setRequired(true)
        .addChoices(
          { name: 'Pack', value: 'pack' },
          { name: 'Card', value: 'card' }
        ))
    .addStringOption(option =>
      option.setName('id')
        .setDescription('ID of the item to sell (pack_id or card_id:unique_id)')
        .setRequired(true)),

  async execute(interaction, pool) {
    const type = interaction.options.getString('type');
    const idInput = interaction.options.getString('id');
    const userId = interaction.user.id;

    try {
      if (type === 'pack') {
        const packId = parseInt(idInput, 10);
        if (isNaN(packId)) {
          return interaction.reply({ content: '❌ Invalid pack ID!', ephemeral: true });
        }

        const packRes = await pool.query(`
          SELECT * FROM user_packs 
          WHERE user_id = $1 AND pack_id = $2 AND opened = false 
          LIMIT 1
        `, [userId, packId]);

        if (packRes.rowCount === 0) {
          return interaction.reply({ content: `❌ No unopened pack with ID ${packId}!`, ephemeral: true });
        }

        const pack = packRes.rows[0];
        const sellValue = Math.floor(pack.pack_price * 0.7);

        await pool.query('BEGIN');
        await pool.query('DELETE FROM user_packs WHERE id = $1', [pack.id]);
        await pool.query('UPDATE user_balances SET balance = balance + $1 WHERE user_id = $2', [sellValue, userId]);
        await pool.query('COMMIT');

        const embed = new EmbedBuilder()
          .setColor('Green')
          .setTitle('📦 Pack Sold')
          .setDescription(`You sold **${pack.pack_name}** for **${sellValue}** stars (70% value)`)
          .addFields(
            { name: 'Pack ID', value: `${pack.pack_id}`, inline: true },
            { name: 'Original Value', value: `${pack.pack_price} stars`, inline: true }
          );

        return interaction.reply({ embeds: [embed] });

      } else if (type === 'card') {
        const [cardId, uniqueId] = idInput.split(':').map(str => str.trim());
        if (!cardId || !uniqueId || isNaN(cardId) || isNaN(uniqueId)) {
          return interaction.reply({ content: '❌ Use format `card_id:unique_id`!', ephemeral: true });
        }

        const cardRes = await pool.query(`
          SELECT * FROM user_cards 
          WHERE user_id = $1 AND card_id = $2 AND id = $3
        `, [userId, parseInt(cardId), parseInt(uniqueId)]);

        if (cardRes.rowCount === 0) {
          return interaction.reply({ content: `❌ Card (${idInput}) not found!`, ephemeral: true });
        }

        const card = cardRes.rows[0];
        const sellValue = Math.floor(card.value * 0.7);

        await pool.query('BEGIN');
        await pool.query('DELETE FROM user_cards WHERE id = $1', [card.id]);
        await pool.query('UPDATE user_balances SET balance = balance + $1 WHERE user_id = $2', [sellValue, userId]);
        await pool.query('COMMIT');

        const embed = new EmbedBuilder()
          .setColor('Green')
          .setTitle('🃏 Card Sold')
          .setDescription(`You sold **${card.card_name}** for **${sellValue}** stars (70% value)`)
          .addFields(
            { name: 'Card ID', value: `${card.card_id}:${card.id.toString().padStart(3, '0')}`, inline: true },
            { name: 'Rarity', value: card.rarity, inline: true },
            { name: 'Original Value', value: `${card.value} stars`, inline: true }
          );

        return interaction.reply({ embeds: [embed] });
      }
    } catch (err) {
      console.error('Sell Command Error:', err);
      await pool.query('ROLLBACK');
      return interaction.reply({ content: '❌ An error occurred during the sale!', ephemeral: true });
    }
  }
};
