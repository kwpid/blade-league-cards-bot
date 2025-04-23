import { query } from './db.js';

async function init() {
  try {
    await query(`CREATE TABLE IF NOT EXISTS cards (...)`);
    await query(`CREATE TABLE IF NOT EXISTS shop_items (...)`);
    console.log("Database initialized");
    process.exit(0);
  } catch (error) {
    console.error("Initialization failed:", error);
    process.exit(1);
  }
}

init();
