import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { randomInt } from 'crypto';

const successResponses = [
    "You beg on the streets and get {amount} stars from a generous passerby.",
    "A kind soul takes pity on you and gives you {amount} stars.",
    "You perform a little dance and earn {amount} stars from amused onlookers.",
    "After hours of begging, you finally get {amount} stars.",
    "You tell a sob story and receive {amount} stars.",
    "A wealthy merchant tosses you {amount} stars without even looking.",
    "You hold up a clever sign and collect {amount} stars.",
    "Someone mistakes you for a performer and gives you {amount} stars.",
    "You help carry some bags and get {amount} stars as thanks.",
    "A noble feels charitable today and gives you {amount} stars."
];

const failResponses = [
    "You trip and fall while begging. People laugh and walk past you.",
    "A pigeon poops on you before anyone could give you stars.",
    "Someone hands you a fake star made of chocolate. It's not worth anything.",
    "You get ignored like yesterday's news. No stars for you.",
    "A toddler gives you a rock instead of stars. Nice."
];

const cooldown = 60 * 1000; // 1 minute cooldown
const userCooldowns = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Beg for stars and hope someone is generous'),

    async execute(interaction, pool) {
        const userId = interaction.user.id;
        const now = Date.now();

        // Cooldown check
        if (userCooldowns.has(userId)) {
            const expirationTime = userCooldowns.get(userId) + cooldown;
            if (now < expirationTime) {
                const timeLeft = Math.ceil((expirationTime - now) / 1000);
                return interaction.reply({
                    content: `🕐 You're too tired to beg again. Try again in ${timeLeft} seconds.`,
                    ephemeral: true
                });
            }
        }

        userCooldowns.set(userId, now);

        // 25% chance to fail
        const failChance = randomInt(0, 4); // 0 = fail (1 in 4 chance)
        if (failChance === 0) {
            const failMessage = failResponses[randomInt(0, failResponses.length)];

            const failEmbed = new EmbedBuilder()
                .setColor(0xFF5555)
                .setTitle("😢 You Failed to Beg")
                .setDescription(failMessage)
                .setFooter({ text: `+0 ⭐ stars`, iconURL: interaction.user.displayAvatarURL() })
                .setTimestamp();

            return interaction.reply({ embeds: [failEmbed] });
        }

        const amount = randomInt(5, 51);
        const responseText = successResponses[randomInt(0, successResponses.length)].replace('{amount}', amount);

        try {
            const client = await pool.connect();
            try {
                await client.query(`
                    INSERT INTO user_balances (user_id, balance)
                    VALUES ($1, $2)
                    ON CONFLICT (user_id)
                    DO UPDATE SET balance = user_balances.balance + $2
                    RETURNING balance
                `, [userId, amount]);

                const successEmbed = new EmbedBuilder()
                    .setColor(0xFFD700)
                    .setTitle("✨ You Begged...")
                    .setDescription(responseText)
                    .setFooter({ text: `+${amount} ⭐ stars`, iconURL: interaction.user.displayAvatarURL() })
                    .setTimestamp();

                await interaction.reply({ embeds: [successEmbed] });
            } finally {
                client.release();
            }
        } catch (error) {
            console.error('Error executing beg command:', error);
            await interaction.reply({
                content: '❌ An error occurred while processing your beg.',
                ephemeral: true
            });
        }
    }
};
