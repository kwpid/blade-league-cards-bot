
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shopDataPath = path.join(__dirname, '../data/shopItems.json');

export default {
  data: new SlashCommandBuilder()
    .setName("shop")
    .setDescription("View available packs in the shop"),

  async execute(interaction) {
    const shopData = JSON.parse(await fs.readFile(shopDataPath, 'utf8'));
    
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("🏪 Card Pack Shop")
      .setDescription("Here are the available packs you can purchase:")
      .addFields(
        shopData.packs.map(pack => ({
          name: `${pack.name} (ID: ${pack.id})`,
          value: `💰 ${pack.price} stars\n${pack.description}`
        }))
      )
      .setFooter({ text: "Use /purchase shop <id> to buy a pack!" });

    await interaction.reply({ embeds: [embed] });
  },
};
