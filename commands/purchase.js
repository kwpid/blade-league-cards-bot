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
          { name: "limited", value: "limited" }
        ))
    .addIntegerOption(option =>
      option.setName("id")
        .setDescription("The ID of the item to purchase")
        .setRequired(true)
        .setMinValue(1)),

  async execute(interaction, pool) {
    const type = interaction.options.getString("type");
    const id = interaction.options.getInteger("id");

    const itemList = type === "limited" ? shopData.limited : shopData.packs;
    const item = itemList.find(p => p.id === id);

    if (!item) {
      return interaction.reply({ 
        content: `❌ Invalid ${type} ID! Use /shop to see available ${type}s.`,
        flags: MessageFlags.Ephemeral
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query(
        `INSERT INTO user_balances (user_id, balance)
         VALUES ($1, 100)
         ON CONFLICT (user_id) 
         DO UPDATE SET user_id = EXCLUDED.user_id
         RETURNING balance`,
        [interaction.user.id]
      );

      const currentBalance = rows[0].balance;

      if (currentBalance < item.price) {
        await interaction.reply({ 
          content: `❌ You don't have enough stars! You need ${item.price} stars but have ${currentBalance} stars.`,
          flags: MessageFlags.Ephemeral
        });
        await client.query('ROLLBACK');
        return;
      }

      await client.query(
        `UPDATE user_balances 
         SET balance = balance - $1
         WHERE user_id = $2`,
        [item.price, interaction.user.id]
      );

      await client.query(
        `INSERT INTO user_packs (user_id, pack_id, pack_name, pack_description, pack_price, is_limited)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [interaction.user.id, item.id, item.name, item.description, item.price, type === "limited"]
      );

      await client.query('COMMIT');

      await interaction.reply({
        content: `✅ Successfully purchased **${item.name}** for ⭐ ${item.price} stars!\nYour new balance is ⭐ ${currentBalance - item.price} stars.`,
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
