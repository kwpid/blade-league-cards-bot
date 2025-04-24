import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { shopData } from '../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View available card packs'),
    
  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x00AE86)
      .setTitle('🛒 Card Pack Shop')
      .setDescription('Available packs you can purchase')
      .setThumbnail('https://i.imgur.com/J8qTf7i.png') // Replace with shop image
      .setTimestamp();
    
    // Add each pack as a field
    shopData.packs.forEach(pack => {
      embed.addFields({
        name: `${pack.name} (ID: ${pack.id})`,
        value: [
          `💰 **Price:** ⭐ ${pack.price}`,
          `${pack.description}`,
          `\`/purchase pack id:${pack.id}\``
        ].join('\n'),
        inline: true
      });
    });

    // Add footer with refresh info
    embed.setFooter({ text: 'Shop refreshes weekly • Use /purchase to buy' });

    await interaction.reply({ 
      embeds: [embed],
      flags: "Ephemeral" 
    });
  }
};
