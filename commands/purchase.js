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
          ephemeral: true 
        });
      }

      // Get or create user balance
      const balanceRes = await pool.query(
        'SELECT balance FROM user_balances WHERE user_id = $1',
        [interaction.user.id]
      );
      const userBalance = balanceRes.rows[0]?.balance || 100;
      
      if (userBalance < pack.price) {
        return interaction.reply({ 
          content: `❌ You don't have enough stars! You need ${pack.price} stars but have ${userBalance} stars.`, 
          ephemeral: true 
        });
      }

      // Deduct stars
     const balanceRes = await pool.query(
  `INSERT INTO user_balances (user_id, balance)
   VALUES ($1, $2)
   ON CONFLICT (user_id) 
   DO UPDATE SET balance = user_balances.balance - $3
   RETURNING balance`,
  [interaction.user.id, 100 - pack.price, pack.price]
);
const newBalance = balanceRes.rows[0].balance;
      
      // Add to inventory
      await pool.query(
        `INSERT INTO user_packs (user_id, pack_id, pack_name, pack_description, pack_price)
         VALUES ($1, $2, $3, $4, $5)`,
        [interaction.user.id, pack.id, pack.name, pack.description, pack.price]
      );
      
      await interaction.reply({
        content: `✅ Successfully purchased **${pack.name}** for ⭐ ${pack.price} stars!\nYour new balance is ⭐ ${userBalance - pack.price} stars.`,
        ephemeral: true
      });
    }
  }
};
