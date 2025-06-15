import puppeteer from 'puppeteer';
import { setTimeout } from 'timers/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { table } from 'table';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Create history file if it doesn't exist
const historyFile = path.join(logsDir, 'price-history.json');
if (!fs.existsSync(historyFile)) {
    fs.writeFileSync(historyFile, JSON.stringify({}));
}

// Load price history
let priceHistory = JSON.parse(fs.readFileSync(historyFile, 'utf8'));

// Flight search configurations
const flightConfigs = [
    {
        id: 'paris-osaka',
        departureCity: 'Paris',
        destinationCity: 'Osaka',
        departureDate: '07-12-2025',
        returnDate: '07-20-2025',
        priceThreshold: 700
    },
    {
        id: 'paris-tokyo',
        departureCity: 'Paris',
        destinationCity: 'Tokyo',
        departureDate: '07-12-2025',
        returnDate: '07-20-2025',
        priceThreshold: 700
    },
    {
        id: 'paris-kyoto',
        departureCity: 'Paris',
        destinationCity: 'Kyoto',
        departureDate: '07-12-2025',
        returnDate: '07-20-2025',
        priceThreshold: 700
    },
    {
        id: 'paris-fukuoka',
        departureCity: 'Paris',
        destinationCity: 'Fukuoka',
        departureDate: '07-12-2025',
        returnDate: '07-20-2025',
        priceThreshold: 700
    }
];

// Initialize price history for new routes
flightConfigs.forEach(config => {
    if (!priceHistory[config.id]) {
        priceHistory[config.id] = [];
    }
});

function savePriceHistory() {
    fs.writeFileSync(historyFile, JSON.stringify(priceHistory, null, 2));
}

function getPriceChange(currentPrice, previousPrice) {
    if (!previousPrice) return 'N/A';
    const change = currentPrice - previousPrice;
    const percentage = ((change / previousPrice) * 100).toFixed(1);
    return `${change > 0 ? '+' : ''}${change}€ (${change > 0 ? '+' : ''}${percentage}%)`;
}

function printSummaryTable(results) {
    const tableData = [
        [
            chalk.bold('Route'),
            chalk.bold('Current Price'),
            chalk.bold('Threshold'),
            chalk.bold('Change'),
            chalk.bold('Status')
        ]
    ];

    results.forEach(result => {
        const { flightConfig, price } = result;
        const previousPrice = priceHistory[flightConfig.id].length > 0 
            ? priceHistory[flightConfig.id][priceHistory[flightConfig.id].length - 1].price 
            : null;
        const change = getPriceChange(price, previousPrice);
        const status = price < flightConfig.priceThreshold 
            ? chalk.green('Below Threshold') 
            : chalk.yellow('Above Threshold');

        tableData.push([
            `${flightConfig.departureCity} → ${flightConfig.destinationCity}`,
            `${price}€`,
            `${flightConfig.priceThreshold}€`,
            change,
            status
        ]);
    });

    console.log('\n' + table(tableData));
}

async function checkFlightPrice(flightConfig) {
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        // Navigate to Google Flights
        await page.goto('https://www.google.com/travel/flights?gl=US&hl=en-US');
        await page.setViewport({ width: 1400, height: 900 });

        // Handle cookie consent
        try {
            const selectors = [
                'button[aria-label="Accept all"]',
                'button[aria-label="Tout accepter"]',
            ];

            for (const selector of selectors) {
                try {
                    const button = await page.waitForSelector(selector, { timeout: 2000 });
                    if (button) {
                        await button.click();
                        break;
                    }
                } catch (e) {
                    console.log(chalk.gray(`Selector ${selector} not found`));
                }
            }
        } catch (error) {
            console.log(chalk.yellow('Error handling cookie consent:', error.message));
        }

        // Fill in flight details
        await page.locator('input[placeholder="Where from?"]').click();
        await page.keyboard.type(flightConfig.departureCity, { delay: 100 });
        await setTimeout(1000);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');
        await page.keyboard.type(flightConfig.destinationCity, { delay: 100 });
        await setTimeout(1000);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Tab');
        await page.keyboard.type(flightConfig.departureDate, { delay: 100 });
        await page.keyboard.press('Tab');
        await page.keyboard.type(flightConfig.returnDate, { delay: 100 });
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');

        // Click search
        const searchButton = await page.waitForSelector('button[aria-label="Search"]', { visible: true, timeout: 5000 });
        await searchButton.click();

        // Wait for results and get price
        await setTimeout(10000);
        const firstPrice = await page.locator('span[role="text"]').waitHandle();
        const priceText = await firstPrice.evaluate(el => el.textContent);
        const price = parseInt(priceText.replace(/[^0-9]/g, ''));

        // Take screenshot
        const screenshotPath = path.join(logsDir, `flight-screenshot-${flightConfig.id}-${Date.now()}.png`);
        await page.screenshot({ path: screenshotPath });

        return { price, screenshotPath };
    } catch (error) {
        console.error(chalk.red('Error checking flight price:', error));
        const errorScreenshotPath = path.join(logsDir, `error-screenshot-${flightConfig.id}-${Date.now()}.png`);
        await page.screenshot({ path: errorScreenshotPath });
        return null;
    } finally {
        await browser.close();
    }
}

async function checkAllFlights() {
    console.log(chalk.blue('\nStarting flight checks...'));
    console.log(chalk.gray('----------------------------------------'));
    
    const results = [];
    
    // Run checks sequentially
    for (const flightConfig of flightConfigs) {
        const result = await checkAndNotifyFlight(flightConfig);
        if (result) {
            results.push(result);
        }
        // Add a small delay between checks to avoid overwhelming the server
        await setTimeout(5000);
    }
    
    // Print summary table
    printSummaryTable(results);
    
    console.log(chalk.gray('----------------------------------------'));
    console.log(chalk.blue('All flight checks completed'));
}

async function checkAndNotifyFlight(flightConfig) {
    try {
        console.log(chalk.cyan(`\nChecking flights for ${flightConfig.departureCity} to ${flightConfig.destinationCity}...`));
        const result = await checkFlightPrice(flightConfig);
        if (!result) return null;

        const { price, screenshotPath } = result;
        
        // Update price history
        priceHistory[flightConfig.id].push({
            timestamp: new Date().toISOString(),
            price: price
        });
        savePriceHistory();
        
        // Log the result
        console.log(chalk.white(`\nFlight price for ${flightConfig.departureCity} to ${flightConfig.destinationCity}:`));
        console.log(chalk.gray(`Dates: ${flightConfig.departureDate} - ${flightConfig.returnDate}`));
        console.log(chalk.yellow(`Price: ${price}€`));
        console.log(chalk.gray(`Screenshot saved: ${screenshotPath}`));

        // If price is below threshold, show alert
        if (price < flightConfig.priceThreshold) {
            console.log(chalk.green(`\n🚨 ALERT! Price (${price}€) is below threshold (${flightConfig.priceThreshold}€)!`));
        }

        return { flightConfig, price };
    } catch (error) {
        console.error(chalk.red(`Error checking flight ${flightConfig.id}:`, error));
        return null;
    }
}

// Start the checks
console.log(chalk.blue('Flight Price Checker'));
console.log(chalk.gray('==================='));
checkAllFlights();

// Check every hour
setInterval(checkAllFlights, 60 * 60 * 1000);