import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { getPriceHistory } from './db.js';

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
        // Get price history for all routes
        const routes = ['paris-osaka', 'paris-tokyo', 'paris-kyoto', 'paris-fukuoka'];
        const priceData = {};
        
        for (const route of routes) {
            const history = await getPriceHistory(route);
            priceData[route] = history.map(record => ({
                price: record.price,
                timestamp: new Date(record.timestamp).toLocaleString()
            }));
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