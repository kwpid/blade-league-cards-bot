import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";

const ITEMS_PER_PAGE = 5;
const RARITY_COLORS = {
  common: 0x808080,
  uncommon: 0x2ecc71,
  rare: 0x3498db,
  legendary: 0x9b59b6,
  mythic: 0xf1c40f
};
const TYPE_EMOJIS = {
  packs: "📦",
  cards: "🃏"
};

export default {
  data: new SlashCommandBuilder()
    .setName("inventory")
    .setDescription("View your inventory")
    .addStringOption(option =>
      option.setName("type")
        .setDescription("Type of inventory to view")
        .setRequired(false)
        .addChoices(
          { name: "Packs", value: "packs" },
          { name: "Cards", value: "cards" }
        ))
    .addIntegerOption(option =>
      option.setName("page")
        .setDescription("Page number to view")
        .setRequired(false)
        .setMinValue(1)),

  async execute(interaction, pool) {
    const inventoryType = interaction.options.getString("type") || "packs";
    const page = interaction.options.getInteger("page") || 1;
    const userId = interaction.user.id;
    
    let items, totalItems;
    
    if (inventoryType === "packs") {
      const res = await pool.query(
        'SELECT COUNT(*) FROM user_packs WHERE user_id = $1 AND opened = false',
        [userId]
      );
      totalItems = parseInt(res.rows[0].count);
      
      const packsRes = await pool.query(
        `SELECT * FROM user_packs 
         WHERE user_id = $1 AND opened = false
         ORDER BY purchase_date DESC
         LIMIT $2 OFFSET $3`,
        [userId, ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE]
      );
      items = packsRes.rows;
    } else {
      const res = await pool.query(
        'SELECT COUNT(*) FROM user_cards WHERE user_id = $1',
        [userId]
      );
      totalItems = parseInt(res.rows[0].count);
      
      const cardsRes = await pool.query(
        `SELECT * FROM user_cards 
         WHERE user_id = $1
         ORDER BY obtained_date DESC
         LIMIT $2 OFFSET $3`,
        [userId, ITEMS_PER_PAGE, (page - 1) * ITEMS_PER_PAGE]
      );
      items = cardsRes.rows;
    }
    
    if (totalItems === 0) {
      return interaction.reply({
        content: `${TYPE_EMOJIS[inventoryType]} Your ${inventoryType} inventory is empty!`,
        ephemeral: true
      });
    }
    
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (page > totalPages) {
      return interaction.reply({
        content: `⚠️ Page ${page} doesn't exist! Your ${inventoryType} inventory has ${totalPages} page(s).`,
        ephemeral: true
      });
    }
    
    const embed = new EmbedBuilder()
      .setTitle(`${TYPE_EMOJIS[inventoryType]} ${interaction.user.username}'s ${inventoryType.toUpperCase()}`)
      .setDescription(`📄 Page ${page}/${totalPages} | 📦 Total: ${totalItems}`);

    if (inventoryType === "packs") {
      embed.setColor(0x3498db)
        .addFields(
          items.map((item, idx) => ({
            name: `📦 ${((page - 1) * ITEMS_PER_PAGE) + idx + 1}. ${item.pack_name}`,
            value: [
              `🆔 ID: ${item.pack_id}`,
              `💰 Value: ${item.pack_price || 'N/A'} stars`,
              `\`/open ${item.pack_id}\` to open this pack`,
              ...(item.pack_description ? [`📝 ${item.pack_description}`] : [])
            ].join('\n'),
            inline: false
          }))
        );
    } else {
      embed.setColor(RARITY_COLORS[items[0]?.rarity] || 0x7289DA)
        .addFields(
          items.map((card, idx) => {
            const variantEmoji = {
              normal: "",
              silver: "🥈 ",
              gold: "🏆 ",
              deluxe: "💎 "
            }[card.variant];
            
            return {
              name: `${variantEmoji}${((page - 1) * ITEMS_PER_PAGE) + idx + 1}. ${card.card_name}`,
              value: [
                `✨ Rarity: ${card.rarity.toUpperCase()}`,
                `⭐ Value: ${card.value} stars`,
                `⚔️ OFF: ${card.stats_off} | 🛡️ DEF: ${card.stats_def}`,
                `🎯 ABL: ${card.stats_abl} | 🤖 MCH: ${card.stats_mch}`,
                `🆔 Card ID: ${card.card_id}`
              ].join('\n'),
              inline: true
            };
          })
        );
    }
    
    const row = new ActionRowBuilder();
    
    if (page > 1) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inventory_${inventoryType}_prev_${page - 1}`)
          .setLabel("◀ Previous")
          .setStyle(ButtonStyle.Secondary)
      );
    }
    
    if (page < totalPages) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inventory_${inventoryType}_next_${page + 1}`)
          .setLabel("Next ▶")
          .setStyle(ButtonStyle.Secondary)
      );
    }
    
    const otherType = inventoryType === "packs" ? "cards" : "packs";
    const otherCountRes = await pool.query(
      `SELECT COUNT(*) FROM user_${otherType} WHERE user_id = $1`,
      [userId]
    );
    const otherCount = parseInt(otherCountRes.rows[0].count);
    
    if (otherCount > 0) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`inventory_${otherType}_switch_1`)
          .setLabel(`View ${otherType}`)
          .setStyle(ButtonStyle.Primary)
      );
    }
    
    const replyOptions = { 
      embeds: [embed],
      components: row.components?.length > 0 ? [row] : []
    };
    
    await interaction.reply(replyOptions);
  }
};
