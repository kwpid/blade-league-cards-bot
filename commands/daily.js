import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
  data: new SlashCommandBuilder()
    .setName('daily')
    .setDescription('Claim your daily stars (150–500) every 12 hours'),

  async execute(interaction, pool) {
    const userId = interaction.user.id;

    const cooldownRes = await pool.query(
      `SELECT last_daily_claim FROM user_balances WHERE user_id = $1`,
      [userId]
    );

    const now = new Date();
    const lastClaim = cooldownRes.rows[0]?.last_daily_claim;
    const cooldownTime = 12 * 60 * 60 * 1000;

    if (lastClaim && (now - new Date(lastClaim)) < cooldownTime) {
      const nextClaim = new Date(new Date(lastClaim).getTime() + cooldownTime);
      const timeLeft = Math.ceil((nextClaim - now) / (1000 * 60 * 60));

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setTitle('⏳ Daily Cooldown')
            .setDescription(`You've already claimed your daily stars! Try again in **${timeLeft} hour(s)**.`)
            .setTimestamp()
        ],
        ephemeral: true
      });
    }

    const starsEarned = Math.floor(Math.random() * (500 - 150 + 1)) + 150;

    const updateRes = await pool.query(`
      INSERT INTO user_balances (user_id, balance, last_daily_claim)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id)
      DO UPDATE SET 
        balance = user_balances.balance + EXCLUDED.balance,
        last_daily_claim = EXCLUDED.last_daily_claim
      RETURNING balance
    `, [userId, starsEarned, now]);

    const balance = updateRes.rows[0].balance;

    const embed = new EmbedBuilder()
      .setColor('Green')
      .setTitle('🎉 Daily Stars Claimed!')
      .setDescription(`You received **⭐ ${formatStars(starsEarned)}**!\n\nNew Balance: **⭐ ${formatStars(balance)}**`)
      .setFooter({ text: 'Come back in 12 hours!' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};

function formatStars(num) {
  const units = ['', 'K', 'M', 'B', 'T'];
  let i = 0;
  while (num >= 1000 && i < units.length - 1) {
    num /= 1000;
    i++;
  }
  return `${num.toFixed(2)}${units[i]}`;
}
