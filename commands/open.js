import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("open")
    .setDescription("Open a pack from your inventory")
    .addIntegerOption(option =>
      option.setName("id")
        .setDescription("The ID of the pack to open")
        .setRequired(true)),

  async execute(interaction, pool) {
    const packId = interaction.options.getInteger("id");
    const userId = interaction.user.id;

    // Check if user has the pack
    const packRes = await pool.query(
      `SELECT * FROM user_packs 
       WHERE user_id = $1 AND pack_id = $2 AND opened = false
       LIMIT 1`,
      [userId, packId]
    );

    if (packRes.rows.length === 0) {
      return interaction.reply({
        content: "❌ You don't have an unopened pack with that ID!",
        ephemeral: true
      });
    }

    const pack = packRes.rows[0];

    // Mark pack as opened
    await pool.query(
      'UPDATE user_packs SET opened = true WHERE id = $1',
      [pack.id]
    );

    // Generate random cards (simplified example)
    const cardsToAdd = generateCardsFromPack(pack);

    // Add cards to inventory
    for (const card of cardsToAdd) {
      await pool.query(
        `INSERT INTO user_cards 
         (user_id, card_id, card_name, rarity, stats_off, stats_def, stats_abl, stats_mch, value)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [userId, card.id, card.name, card.rarity, 
         card.stats.OFF, card.stats.DEF, card.stats.ABL, card.stats.MCH, card.value]
      );
    }

    // Create embed showing the cards
    const embed = new EmbedBuilder()
      .setTitle(`🎉 You opened ${pack.pack_name}!`)
      .setDescription(`You received ${cardsToAdd.length} new cards!`)
      .setColor(0xf1c40f);

    for (const card of cardsToAdd) {
      embed.addFields({
        name: `${card.name} (${card.rarity.toUpperCase()})`,
        value: `⚔️ ${card.stats.OFF} 🛡️ ${card.stats.DEF} 🎯 ${card.stats.ABL} 🤖 ${card.stats.MCH}`,
        inline: true
      });
    }

    await interaction.reply({ embeds: [embed] });
  }
};

// Simplified card generation - replace with your actual logic
function generateCardsFromPack(pack) {
  const rarities = ['common', 'uncommon', 'rare', 'legendary', 'mythic'];
  const cards = [];
  
  // Generate 5 random cards for this example
  for (let i = 0; i < 5; i++) {
    const rarity = rarities[Math.floor(Math.random() * rarities.length)];
    cards.push({
      id: Math.floor(Math.random() * 1000),
      name: `Card ${i+1}`,
      rarity,
      stats: {
        OFF: Math.floor(Math.random() * 100),
        DEF: Math.floor(Math.random() * 100),
        ABL: Math.floor(Math.random() * 100),
        MCH: Math.floor(Math.random() * 100)
      },
      value: rarity === 'mythic' ? 1000 : 
             rarity === 'legendary' ? 500 :
             rarity === 'rare' ? 250 :
             rarity === 'uncommon' ? 100 : 50
    });
  }
  
  return cards;
}
