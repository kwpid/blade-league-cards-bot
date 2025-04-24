
import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("daily")
    .setDescription("Claim your daily stars (150-500) every 12 hours"),

  async execute(interaction, pool) {
    const userId = interaction.user.id;
    
    // Check when the user last claimed their daily reward
    const cooldownRes = await pool.query(
      `SELECT last_daily_claim FROM user_balances WHERE user_id = $1`,
      [userId]
    );
    
    const now = new Date();
    const lastClaim = cooldownRes.rows[0]?.last_daily_claim;
    
    // 12 hours in milliseconds
    const cooldownTime = 12 * 60 * 60 * 1000;
    
    if (lastClaim && (now - new Date(lastClaim)) < cooldownTime) {
      const nextClaim = new Date(new Date(lastClaim).getTime() + cooldownTime);
      const timeLeft = Math.ceil((nextClaim - now) / (1000 * 60 * 60));
      
      const embed = new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("⏳ Daily Cooldown")
        .setDescription(`You've already claimed your daily stars! Come back in **${timeLeft} hours**.`)
        .setTimestamp();
      
      return await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Generate random stars between 150-500
    const starsEarned = Math.floor(Math.random() * (500 - 150 + 1)) + 150;
    
    // Update balance and last claim time
    const updateRes = await pool.query(
      `INSERT INTO user_balances (user_id, balance, last_daily_claim)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) 
       DO UPDATE SET 
         balance = user_balances.balance + EXCLUDED.balance,
         last_daily_claim = EXCLUDED.last_daily_claim
       RETURNING balance`,
      [userId, starsEarned, now]
    );
    
    const newBalance = updateRes.rows[0].balance;
    const formattedBalance = formatStars(newBalance);
    const formattedEarned = formatStars(starsEarned);
    
    const embed = new EmbedBuilder()
      .setColor(0x00ff00)
      .setTitle("🎉 Daily Stars Claimed!")
      .setDescription(`You received **⭐ ${formattedEarned} stars**!\n\nYour new balance: **⭐ ${formattedBalance}**`)
      .setFooter({ text: "Come back in 12 hours for more!" })
      .setTimestamp();
    
    await interaction.reply({ embeds: [embed] });
  },
};

// Reuse the same formatStars function from balance.js
function formatStars(number) {
  if (number < 1000) return number.toString();
  const units = ["", "K", "M", "B", "T"];
  let unitIndex = 0;
  while (number >= 1000 && unitIndex < units.length - 1) {
    number /= 1000;
    unitIndex++;
  }
  return `${number.toFixed(2)}${units[unitIndex]}`;
}
