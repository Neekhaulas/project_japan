import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPriceHistory } from './db.js';
import { initializeDatabase } from './db.js';

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
        
        res.render('index', { priceData });
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

app.listen(port, () => {
    console.log(`Web interface available at http://localhost:${port}`);
}); 