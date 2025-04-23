import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { query } from '../db.js';

export default {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View available packs in the shop"),

  async execute(interaction) {
    const shopRes = await query('SELECT * FROM shop_items');
    const packs = shopRes.rows;
    
    const embed = new EmbedBuilder()
      .setTitle("🏪 Shop")
      .setDescription("Available packs:")
      .addFields(
        packs.map(pack => ({
          name: `${pack.name} (ID: ${pack.id})`,
          value: `Price: ${pack.price} stars`
        }))
      );
    
    await interaction.reply({ embeds: [embed] });
  },
};
