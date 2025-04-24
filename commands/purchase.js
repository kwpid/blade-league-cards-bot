import { SlashCommandBuilder } from "discord.js";
import { shopData } from "../index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("purchase")
    .setDescription("Purchase an item from the shop")
    .addStringOption(option =>
      option.setName("type")
        .setDescription("The type of item to purchase")
        .setRequired(true)
        .addChoices({ name: "pack", value: "pack" }))
    .addIntegerOption(option =>
      option.setName("id")
        .setDescription("The ID of the item to purchase")
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction, pool) {
    const type = interaction.options.getString("type");
    const id = interaction.options.getInteger("id");
    
    if (type === "pack") {
      const pack = shopData.packs.find(p => p.id === id);
      
      if (!pack) {
        return interaction.reply({ 
          content: "❌ Invalid pack ID! Use /shop to see available packs.", 
          flags: "Ephemeral"
        });
      }

      // Get user balance in a transaction
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Get current balance
        const balanceResult = await client.query(
          'SELECT balance FROM user_balances WHERE user_id = $1 FOR UPDATE',
          [interaction.user.id]
        );
        
        const currentBalance = balanceResult.rows[0]?.balance || 100;
        
        if (currentBalance < pack.price) {
          await interaction.reply({ 
            content: `❌ You don't have enough stars! You need ${pack.price} stars but have ${currentBalance} stars.`, 
            flags: "Ephemeral"
          });
          await client.query('ROLLBACK');
          return;
        }

        // Deduct stars
        await client.query(
          `INSERT INTO user_balances (user_id, balance)
           VALUES ($1, $2)
           ON CONFLICT (user_id) 
           DO UPDATE SET balance = EXCLUDED.balance - $3`,
          [interaction.user.id, currentBalance, pack.price]
        );
        
        // Add to inventory
        await client.query(
          `INSERT INTO user_packs (user_id, pack_id, pack_name, pack_description, pack_price)
           VALUES ($1, $2, $3, $4, $5)`,
          [interaction.user.id, pack.id, pack.name, pack.description, pack.price]
        );
        
        await client.query('COMMIT');
        
        await interaction.reply({
          content: `✅ Successfully purchased **${pack.name}** for ⭐ ${pack.price} stars!\nYour new balance is ⭐ ${currentBalance - pack.price} stars.`,
          flags: "Ephemeral"
        });
      } catch (error) {
        await client.query('ROLLBACK');
        console.error('Purchase error:', error);
        await interaction.reply({
          content: "❌ An error occurred during your purchase. Please try again.",
          flags: "Ephemeral"
        });
      } finally {
        client.release();
      }
    }
  }
};
