const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'baltop',
  description: 'Shows the richest players.',
  execute(message, args) {
    const dataPath = path.join(__dirname, '../data.json');

    // Read and parse economy data
    let rawData = fs.readFileSync(dataPath);
    let balances = JSON.parse(rawData);

    // Sort users by balance in descending order
    let sorted = Object.entries(balances)
      .sort(([, aBal], [, bBal]) => bBal - aBal)
      .slice(0, 10); // Top 10

    if (sorted.length === 0) {
      return message.channel.send('💸 No balance data found!');
    }

    // Build the leaderboard
    let leaderboard = sorted.map(([userId, balance], index) => {
      const user = message.client.users.cache.get(userId);
      const username = user ? user.username : `Unknown User (${userId})`;
      return `**${index + 1}.** ${username} — 💰 $${balance.toLocaleString()}`;
    }).join('\n');

    message.channel.send({
      embeds: [{
        color: 0x00ff99,
        title: '🏆 Balance Leaderboard',
        description: leaderboard,
        timestamp: new Date(),
        footer: {
          text: 'Top 10 richest players'
        }
      }]
    });
  }
};
