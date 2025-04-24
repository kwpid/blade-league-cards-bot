import { SlashCommandBuilder } from "discord.js";
import { MessageFlags } from "discord-api-types/v10";
import { shopData } from "../index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("purchase")
    .setDescription("Purchase an item from the shop")
    .addStringOption(option =>
      option.setName("type")
        .setDescription("The type of item to purchase")
        .setRequired(true)
        .addChoices(
          { name: "pack", value: "pack" },
          { name: "limited pack", value: "limitedPack" }
        ))
    .addIntegerOption(option =>
      option.setName("id")
        .setDescription("The ID of the item to purchase")
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction, pool) {
    const type = interaction.options.getString("type");
    const id = interaction.options.getInteger("id");
    
    // Determine which shop category to look in
    const shopCategory = type === "limitedPack" ? "limitedPacks" : "packs";
    const pack = shopData[shopCategory].find(p => p.id === id);
    
    if (!pack) {
      return interaction.reply({ 
        content: `❌ Invalid ${type === "limitedPack" ? "limited pack" : "pack"} ID! Use /shop to see available items.`, 
        flags: MessageFlags.Ephemeral
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      
      // Check or create user balance
      const { rows } = await client.query(
        `INSERT INTO user_balances (user_id, balance)
         VALUES ($1, 100)
         ON CONFLICT (user_id) 
         DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING balance`,
        [interaction.user.id]
      );
      
      const currentBalance = rows[0].balance;
      
      if (currentBalance < pack.price) {
        await interaction.reply({ 
          content: `❌ You don't have enough stars! You need ⭐ ${pack.price} stars but have ⭐ ${currentBalance} stars.`, 
          flags: MessageFlags.Ephemeral
        });
        await client.query('ROLLBACK');
        return;
      }

      // Deduct balance
      await client.query(
        `UPDATE user_balances 
         SET balance = balance - $1
         WHERE user_id = $2`,
        [pack.price, interaction.user.id]
      );
      
      // Add pack to user's collection
      await client.query(
        `INSERT INTO user_packs (user_id, pack_id, pack_name, pack_description, pack_price, is_limited)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [interaction.user.id, pack.id, pack.name, pack.description, pack.price, type === "limitedPack"]
      );
      
      await client.query('COMMIT');
      
      await interaction.reply({
        content: `✅ Successfully purchased **${pack.name}** for ⭐ ${pack.price} stars!\nYour new balance is ⭐ ${currentBalance - pack.price} stars.`,
        flags: MessageFlags.Ephemeral
      });
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Purchase error:', error);
      await interaction.followUp({
        content: "❌ An error occurred during purchase. Please try again.",
        flags: MessageFlags.Ephemeral
      });
    } finally {
      client.release();
    }
  }
};
