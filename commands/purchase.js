import { SlashCommandBuilder } from "discord.js";
import { query } from '../db.js';

export default {
  data: new SlashCommandBuilder()
    .setName("purchase")
    .setDescription("Purchase an item from the shop")
    .addStringOption(option =>
      option.setName("type")
        .setDescription("The type of item to purchase")
        .setRequired(true)
        .addChoices({ name: "shop", value: "shop" }))
    .addIntegerOption(option =>
      option.setName("id")
        .setDescription("The ID of the item to purchase")
        .setRequired(true)),

  async execute(interaction) {
    const id = interaction.options.getInteger("id");
    const userId = interaction.user.id;
    
    // Get shop data (now stored in DB)
    const shopRes = await query('SELECT * FROM shop_items WHERE id = $1', [id]);
    const pack = shopRes.rows[0];
    if (!pack) {
      return interaction.reply({ 
        content: "❌ Invalid pack ID!", 
        ephemeral: true 
      });
    }
    
    // Check balance
    const balanceRes = await query(
      'SELECT balance FROM user_balances WHERE user_id = $1',
      [userId]
    );
    const balance = balanceRes.rows[0]?.balance || 100;
    
    if (balance < pack.price) {
      return interaction.reply({ 
        content: `❌ You need ${pack.price - balance} more stars!`, 
        ephemeral: true 
      });
    }
    
    // Deduct balance
    await query(
      'UPDATE user_balances SET balance = balance - $1 WHERE user_id = $2',
      [pack.price, userId]
    );
    
    // Add to inventory
    await query(
      `UPDATE user_inventories SET packs = packs || $1::jsonb 
       WHERE user_id = $2`,
      [JSON.stringify([{ ...pack, purchaseDate: new Date().toISOString() }]), userId]
    );
    
    await interaction.reply({
      content: `✅ Purchased ${pack.name} for ${pack.price} stars!`,
      ephemeral: true
    });
  },
};
