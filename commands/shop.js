import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { shopData } from "../index.js";

export default {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View available packs in the shop"),

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("🏪 Card Pack Shop")
      .setDescription("Here are the available packs you can purchase:")
      .addFields(
        shopData.packs.map(pack => ({
          name: `${pack.name} (ID: ${pack.id})`,
          value: `💰 ${pack.price} stars\n${pack.description}\nRarities: ${Object.entries(pack.rarities)
            .filter(([_, value]) => value > 0)
            .map(([rarity, chance]) => `${rarity}: ${chance}%`)
            .join(', ')}`
        }))
      )
      .setFooter({ text: "Use /purchase pack <id> to buy a pack!" });

    await interaction.reply({ embeds: [embed] });
  },
};
