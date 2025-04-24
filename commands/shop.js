import { SlashCommandBuilder } from 'discord.js';
import { shopData } from '../index.js';

export default {
  data: new SlashCommandBuilder()
    .setName('shop')
    .setDescription('View available packs'),
    
  async execute(interaction) {
    const packsList = shopData.packs.map(pack => 
      `**${pack.name}** (ID: ${pack.id}) - ${pack.price} stars\n${pack.description}`
    ).join('\n\n');
    
    await interaction.reply({
      content: `🛒 Available Packs:\n\n${packsList}`,
      ephemeral: true
    });
  }
};
