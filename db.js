import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize database
async function initializeDatabase() {
    const db = await open({
        filename: path.join(__dirname, 'logs', 'price-history.db'),
        driver: sqlite3.Database
    });

    // Create price_history table if it doesn't exist
    await db.exec(`
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_id TEXT NOT NULL,
            price INTEGER NOT NULL,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    return db;
}

// Save price to database
async function savePrice(routeId, price) {
    const db = await initializeDatabase();
    await db.run(
        'INSERT INTO price_history (route_id, price) VALUES (?, ?)',
        [routeId, price]
    );
    await db.close();
}

// Get latest price for a route
async function getLatestPrice(routeId) {
    const db = await initializeDatabase();
    const result = await db.get(
        'SELECT price FROM price_history WHERE route_id = ? ORDER BY timestamp DESC LIMIT 1',
        [routeId]
    );
    await db.close();
    return result ? result.price : null;
}

// Get all prices for a route
async function getPriceHistory(routeId) {
    const db = await initializeDatabase();
    const results = await db.all(
        'SELECT price, timestamp FROM price_history WHERE route_id = ? ORDER BY timestamp ASC',
        [routeId]
    );
    await db.close();
    return results;
}

export { savePrice, getLatestPrice, getPriceHistory }; 