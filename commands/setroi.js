// commands/setROI.js
import { SlashCommandBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, '../config.json');

export default {
  data: new SlashCommandBuilder()
    .setName('set-roi')
    .setDescription('Set the ROI percentage for the economy (admin only)')
    .addNumberOption(option =>
      option.setName('percentage')
        .setDescription('New ROI percentage (0-1)')
        .setRequired(true)
        .setMinValue(0)
        .setMaxValue(1)),
        
  async execute(interaction) {
    if (!interaction.memberPermissions.has('ADMINISTRATOR')) {
      return interaction.reply({
        content: '❌ You must be an administrator to use this command.',
        ephemeral: true
      });
    }
    
    const newROI = interaction.options.getNumber('percentage');
    
    try {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config.roiPercentage = newROI;
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      
      await interaction.reply({
        content: `✅ ROI percentage updated to ${(newROI * 100).toFixed(0)}%. Prices will now reflect this change.`,
        ephemeral: true
      });
    } catch (error) {
      console.error('Error updating ROI:', error);
      await interaction.reply({
        content: '❌ Failed to update ROI percentage.',
        ephemeral: true
      });
    }
  }
};
