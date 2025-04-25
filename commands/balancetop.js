import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('balancetop')
    .setDescription('Displays the top 10 richest players'),
  
  async execute(interaction, pool) {
    try {
      // Defer the reply to give more time for the database query
      await interaction.deferReply();

      // Query the database for top 10 balances
      const client = await pool.connect();
      try {
        const result = await client.query(`
          SELECT user_id, balance 
          FROM user_balances 
          ORDER BY balance DESC 
          LIMIT 10
        `);

        if (result.rows.length === 0) {
          return interaction.editReply('❌ No user balances found in the database.');
        }

        // Create the embed
        const embed = new EmbedBuilder()
          .setTitle('💰 Top 10 Richest Players')
          .setColor(0xF8C471) // Gold-ish color
          .setTimestamp()
          .setFooter({ text: 'Economy Leaderboard' });

        // Process each user and add them to the embed
        const leaderboard = await Promise.all(result.rows.map(async (row, index) => {
          try {
            const user = await interaction.client.users.fetch(row.user_id);
            return {
              name: `${index + 1}. ${user.username}`,
              value: `$${row.balance.toLocaleString()}`,
              inline: false
            };
          } catch (error) {
            // If user can't be fetched, show their ID instead
            return {
              name: `${index + 1}. User (${row.user_id})`,
              value: `$${row.balance.toLocaleString()}`,
              inline: false
            };
          }
        }));

        // Add fields to the embed
        embed.addFields(leaderboard);

        // Send the embed
        await interaction.editReply({ embeds: [embed] });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Error executing baltop command:', error);
      await interaction.editReply('❌ An error occurred while fetching the leaderboard.');
    }
  }
};
