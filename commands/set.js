import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, "../data/userBalances.json");

async function setBalance(userId, amount) {
  const data = JSON.parse(await fs.readFile(dataPath, "utf8"));
  data[userId] = amount;
  await fs.writeFile(dataPath, JSON.stringify(data, null, 2));
}

export default {
  data: new SlashCommandBuilder()
    .setName("set")
    .setDescription("Set a user's star balance (Admin only)")
    .addStringOption((option) =>
      option
        .setName("value")
        .setDescription("The value type to set")
        .setRequired(true)
        .addChoices({ name: "stars", value: "stars" }),
    )
    .addUserOption((option) =>
      option
        .setName("user")
        .setDescription("The user to modify")
        .setRequired(true),
    )
    .addIntegerOption((option) =>
      option
        .setName("amount")
        .setDescription("The amount to set")
        .setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    const value = interaction.options.getString("value");
    const targetUser = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");

    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator)
    ) {
      return interaction.reply({
        content: "❌ You don't have permission to use this command!",
        ephemeral: true,
      });
    }

    if (value === "stars") {
      await setBalance(targetUser.id, amount);
      await interaction.reply({
        content: `✅ Set ${targetUser.username}'s stars to ⭐ ${amount}`,
        ephemeral: true,
      });
    }
  },
};
