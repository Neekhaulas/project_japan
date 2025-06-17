import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import ejs from 'ejs';
import { getPriceHistory, getUnreadNotifications, markNotificationAsRead, markAllNotificationsAsRead } from './db.js';
import { initializeDatabase, savePrice, saveNotification } from './db.js';
import { checkFlightPrice } from './flightChecker.js';
import { config } from './config.js';
import flightQueue from './queue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;

// Set up EJS as the view engine
app.set('view engine', 'ejs');
app.set('views', join(__dirname, 'views'));

// Serve static files
app.use(express.static(join(__dirname, 'public')));

// Routes
app.get('/', async (req, res) => {
    try {
        // Query the database for all unique route_ids
        const db = await initializeDatabase();
        const rows = await db.all('SELECT DISTINCT route_id FROM price_history');
        await db.close();

        // Get unread notifications
        const notifications = await getUnreadNotifications();

        // Group data by destination city
        const priceData = {};
        
        for (const row of rows) {
            const routeId = row.route_id;
            // Extract departure and destination cities from route_id (e.g., 'paris-osaka-07-12-2025-07-20-2025' -> 'paris' and 'osaka')
            const [departureCity, destinationCity] = routeId.split('-');
            
            if (!priceData[destinationCity]) {
                priceData[destinationCity] = {};
            }

            const history = await getPriceHistory(routeId);
            // Store the full route_id as the key for this destination, including departure city
            priceData[destinationCity][routeId] = {
                departureCity,
                history: history.map(record => ({
                    price: record.price,
                    timestamp: new Date(record.timestamp).toLocaleString()
                }))
            };
        }
        
        res.render('index', { priceData, notifications });
    } catch (error) {
        console.error('Error fetching price data:', error);
        res.status(500).send('Error fetching price data');
    }
});

// API endpoint for getting price history
app.get('/api/prices/:routeId', async (req, res) => {
    try {
        const history = await getPriceHistory(req.params.routeId);
        res.json(history);
    } catch (error) {
        console.error('Error fetching price history:', error);
        res.status(500).json({ error: 'Error fetching price history' });
    }
});

// API endpoint for marking notification as read
app.post('/api/notifications/:id/read', async (req, res) => {
    try {
        await markNotificationAsRead(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Error marking notification as read' });
    }
});

// API endpoint for marking all notifications as read
app.post('/api/notifications/clear-all', async (req, res) => {
    try {
        await markAllNotificationsAsRead();
        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing all notifications:', error);
        res.status(500).json({ error: 'Error clearing all notifications' });
    }
});

// API endpoint for rechecking a specific flight
app.post('/api/recheck/:routeId', async (req, res) => {
    try {
        const routeId = req.params.routeId;
        const [departureCity, destinationCity, ...dates] = routeId.split('-');
        
        // Find the matching flight config
        const flightConfig = config.flightConfigs.find(config => 
            config.id === `${departureCity}-${destinationCity}`
        );

        if (!flightConfig) {
            return res.status(404).json({ error: 'Flight configuration not found' });
        }

        // Extract dates from routeId
        const departureDate = dates.slice(0, 3).join('-');
        const returnDate = dates.slice(3).join('-');

        // Add to queue instead of checking immediately
        flightQueue.addToQueue({
            ...flightConfig,
            dates: { departureDate, returnDate }
        });

        res.json({ success: true, status: 'queued' });
    } catch (error) {
        console.error('Error queueing flight check:', error);
        res.status(500).json({ error: 'Error queueing flight check' });
    }
});

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
}); 