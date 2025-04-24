import { SlashCommandBuilder } from 'discord.js';
import { randomInt } from 'crypto';

const responses = [
    "You beg on the streets and get {amount} coins from a generous passerby.",
    "A kind soul takes pity on you and gives you {amount} coins.",
    "You perform a little dance and earn {amount} coins from amused onlookers.",
    "After hours of begging, you finally get {amount} coins.",
    "You tell a sob story and receive {amount} coins.",
    "A wealthy merchant tosses you {amount} coins without even looking.",
    "You hold up a clever sign and collect {amount} coins.",
    "Someone mistakes you for a performer and gives you {amount} coins.",
    "You help carry some bags and get {amount} coins as thanks.",
    "A noble feels charitable today and gives you {amount} coins."
];

const cooldown = 60 * 1000; // 1 minute cooldown in milliseconds
const userCooldowns = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('beg')
        .setDescription('Beg for coins and hope someone is generous'),
    
    async execute(interaction, pool) {
        const userId = interaction.user.id;
        const now = Date.now();

        // Check cooldown
        if (userCooldowns.has(userId)) {
            const expirationTime = userCooldowns.get(userId) + cooldown;
            if (now < expirationTime) {
                const timeLeft = Math.ceil((expirationTime - now) / 1000);
                return interaction.reply({ 
                    content: `You're too tired to beg again. Try again in ${timeLeft} seconds.`,
                    ephemeral: true 
                });
            }
        }

        // Set cooldown
        userCooldowns.set(userId, now);

        // Random amount between 5 and 50
        const amount = randomInt(5, 51);

        try {
            const client = await pool.connect();
            try {
                // Update user balance
                await client.query(`
                    INSERT INTO user_balances (user_id, balance)
                    VALUES ($1, $2)
                    ON CONFLICT (user_id)
                    DO UPDATE SET balance = user_balances.balance + $2
                    RETURNING balance
                `, [userId, amount]);

                // Get random response
                const response = responses[randomInt(0, responses.length)]
                    .replace('{amount}', amount);

                await interaction.reply(response);
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
