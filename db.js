import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize database
async function initializeDatabase() {
    const db = await open({
        filename: path.join(__dirname, 'logs', 'price-history.db'),
        driver: sqlite3.Database
    });

    // Create users table with new schema
    await db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create price_history table if it doesn't exist
    await db.exec(`
        CREATE TABLE IF NOT EXISTS price_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_id TEXT NOT NULL,
            price INTEGER NOT NULL,
            screenshot BLOB,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Create notifications table if it doesn't exist
    await db.exec(`
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            route_id TEXT NOT NULL,
            price INTEGER NOT NULL,
            threshold INTEGER NOT NULL,
            message TEXT NOT NULL,
            is_read BOOLEAN DEFAULT 0,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    return db;
}

// Save price to database
async function savePrice(routeId, price, screenshot = null) {
    const db = await initializeDatabase();
    await db.run(
        'INSERT INTO price_history (route_id, price, screenshot) VALUES (?, ?, ?)',
        [routeId, price, screenshot]
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

// Save notification to database
async function saveNotification(routeId, price, threshold, message) {
    const db = await initializeDatabase();
    await db.run(
        'INSERT INTO notifications (route_id, price, threshold, message) VALUES (?, ?, ?, ?)',
        [routeId, price, threshold, message]
    );
    await db.close();
}

// Get unread notifications
async function getUnreadNotifications() {
    const db = await initializeDatabase();
    const results = await db.all(
        'SELECT * FROM notifications WHERE is_read = 0 ORDER BY timestamp DESC'
    );
    await db.close();
    return results;
}

// Mark notification as read
async function markNotificationAsRead(notificationId) {
    const db = await initializeDatabase();
    await db.run(
        'UPDATE notifications SET is_read = 1 WHERE id = ?',
        [notificationId]
    );
    await db.close();
}

// Mark all notifications as read
async function markAllNotificationsAsRead() {
    const db = await initializeDatabase();
    await db.run('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
    await db.close();
}

// User authentication functions
async function createUser(email, password) {
    const db = await initializeDatabase();
    const passwordHash = await bcrypt.hash(password, 10);
    
    try {
        await db.run(
            'INSERT INTO users (email, password_hash) VALUES (?, ?)',
            [email, passwordHash]
        );
        return true;
    } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT') {
            return false; // Email already exists
        }
        throw error;
    } finally {
        await db.close();
    }
}

async function authenticateUser(email, password) {
    const db = await initializeDatabase();
    try {
        const user = await db.get(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        
        if (!user) {
            return null;
        }

        const passwordMatch = await bcrypt.compare(password, user.password_hash);
        if (!passwordMatch) {
            return null;
        }

        return {
            id: user.id,
            email: user.email
        };
    } finally {
        await db.close();
    }
}

async function getUserById(userId) {
    const db = await initializeDatabase();
    try {
        const user = await db.get(
            'SELECT id, email, created_at FROM users WHERE id = ?',
            [userId]
        );
        return user;
    } finally {
        await db.close();
    }
}

export { 
    savePrice, 
    getLatestPrice, 
    getPriceHistory, 
    initializeDatabase,
    saveNotification,
    getUnreadNotifications,
    markNotificationAsRead,
    markAllNotificationsAsRead,
    createUser,
    authenticateUser,
    getUserById
}; 