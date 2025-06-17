import puppeteer from 'puppeteer';
import { setTimeout } from 'timers/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { table } from 'table';
import { savePrice, getLatestPrice, getPriceHistory, saveNotification } from './db.js';
import dotenv from 'dotenv';
import { addDays, format, parse } from 'date-fns';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Configuration
const config = {
    checkInterval: (process.env.CHECK_INTERVAL || 60) * 60 * 1000, // Convert minutes to milliseconds
    flightConfigs: [
        {
            id: 'paris-osaka',
            departureCity: 'Paris',
            destinationCity: 'ITM',
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
    ]
};

// Log the configured interval
console.log(chalk.blue(`Check interval set to ${process.env.CHECK_INTERVAL || 60} minutes`));

function getPriceChange(currentPrice, previousPrice) {
    if (!previousPrice) return 'N/A';
    const change = currentPrice - previousPrice;
    const percentage = ((change / previousPrice) * 100).toFixed(1);
    return `${change > 0 ? '+' : ''}${change}€ (${change > 0 ? '+' : ''}${percentage}%)`;
}

// Function to generate date combinations
function generateDateCombinations(departureDate, returnDate) {
    const combinations = [];
    
    // Parse the input dates as MM-dd-yyyy
    const [depMonth, depDay, depYear] = departureDate.split('-').map(Number);
    const [retMonth, retDay, retYear] = returnDate.split('-').map(Number);
    
    const baseDeparture = new Date(depYear, depMonth - 1, depDay);
    const baseReturn = new Date(retYear, retMonth - 1, retDay);

    for (let i = -4; i <= 4; i++) {
        for (let j = -4; j <= 4; j++) {
            const newDeparture = new Date(baseDeparture);
            newDeparture.setDate(baseDeparture.getDate() + i);
            
            const newReturn = new Date(baseReturn);
            newReturn.setDate(baseReturn.getDate() + j);
            
            // Only add combinations where return date is after departure date
            if (newReturn > newDeparture) {
                combinations.push({
                    departureDate: format(newDeparture, 'MM-dd-yyyy'),
                    returnDate: format(newReturn, 'MM-dd-yyyy')
                });
            }
        }
    }
    
    return combinations;
}

async function printSummaryTable(results) {
    const tableData = [
        [
            chalk.bold('Route'),
            chalk.bold('Dates'),
            chalk.bold('Current Price'),
            chalk.bold('Threshold'),
            chalk.bold('Change'),
            chalk.bold('Status')
        ]
    ];

    for (const result of results) {
        const { flightConfig, price, dates } = result;
        const previousPrice = await getLatestPrice(`${flightConfig.id}-${dates.departureDate}-${dates.returnDate}`);
        const change = getPriceChange(price, previousPrice);
        const status = price < flightConfig.priceThreshold 
            ? chalk.green('Below Threshold') 
            : chalk.yellow('Above Threshold');

        tableData.push([
            `${flightConfig.departureCity} → ${flightConfig.destinationCity}`,
            `${dates.departureDate} - ${dates.returnDate}`,
            `${price}€`,
            `${flightConfig.priceThreshold}€`,
            change,
            status
        ]);
    }

    console.log('\n' + table(tableData));
}

async function checkFlightPrice(flightConfig, dates, retryCount = 0) {
    const MAX_RETRIES = 3;
    const INITIAL_RETRY_DELAY = 2000; // 2 seconds

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    try {
        // Navigate to Google Flights
        await page.goto('https://www.google.com/travel/flights?gl=US&hl=en-US&curr=EUR');
        await page.setViewport({ width: 1400, height: 2500 });

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
        await page.keyboard.type(flightConfig.departureCity, { delay: 0 });
        await setTimeout(2000);

        await page.keyboard.press('Enter');
        await setTimeout(100);
        await page.keyboard.press('Tab');
        await setTimeout(100);
        await page.keyboard.type(flightConfig.destinationCity, { delay: 0 });
        await setTimeout(2000);

        await page.keyboard.press('Enter');
        await setTimeout(100);
        await page.keyboard.press('Tab');
        await setTimeout(100);
        await page.keyboard.type(dates.departureDate, { delay: 100 });
        await page.keyboard.press('Enter');
        await setTimeout(100);
        await page.keyboard.press('Tab');
        await setTimeout(100);
        await page.keyboard.type(dates.returnDate, { delay: 100 });
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');

        // Click search
        const searchButton = await page.waitForSelector('button[aria-label="Search"]');
        await searchButton.click();

        // Wait for results and get price
        await setTimeout(10000);
        const firstPrice = await page.locator('span[role="text"]').waitHandle();
        const priceText = await firstPrice.evaluate(el => el.textContent);
        const price = parseInt(priceText.replace(/[^0-9]/g, ''));

        return { price };
    } catch (error) {
        console.error(chalk.red(`Error checking flight price (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`, error.message));
        
        // Close the browser before retrying
        await browser.close();

        // Implement retry logic with exponential backoff
        if (retryCount < MAX_RETRIES) {
            const delay = INITIAL_RETRY_DELAY * Math.pow(2, retryCount);
            console.log(chalk.yellow(`Retrying in ${delay/1000} seconds...`));
            await setTimeout(delay);
            return checkFlightPrice(flightConfig, dates, retryCount + 1);
        }

        console.error(chalk.red(`Failed to check price after ${MAX_RETRIES + 1} attempts`));
        return null;
    } finally {
        await browser.close();
    }
}

async function checkAndNotifyFlight(flightConfig) {
    try {
        console.log(chalk.cyan(`\nChecking flights for ${flightConfig.departureCity} to ${flightConfig.destinationCity}...`));
        
        const dateCombinations = generateDateCombinations(flightConfig.departureDate, flightConfig.returnDate);
        const results = [];

        // Process date combinations in parallel with a concurrency limit
        const DATE_CONCURRENCY_LIMIT = 1; // Limit concurrent date checks per flight config
        
        for (let i = 0; i < dateCombinations.length; i += DATE_CONCURRENCY_LIMIT) {
            const dateBatch = dateCombinations.slice(i, i + DATE_CONCURRENCY_LIMIT);
            const batchResults = await Promise.all(
                dateBatch.map(async (dates) => {
                    console.log(chalk.gray(`Checking dates: ${dates.departureDate} - ${dates.returnDate}`));
                    const result = await checkFlightPrice(flightConfig, dates);
                    
                    if (!result) return null;

                    const { price } = result;
                    
                    // Update price history in database with unique ID for this date combination
                    const routeId = `${flightConfig.id}-${dates.departureDate}-${dates.returnDate}`;
                    await savePrice(routeId, price);
                    
                    // Log the result
                    console.log(chalk.white(`\nFlight price for ${flightConfig.departureCity} to ${flightConfig.destinationCity}:`));
                    console.log(chalk.gray(`Dates: ${dates.departureDate} - ${dates.returnDate}`));
                    console.log(chalk.yellow(`Price: ${price}€`));

                    // If price is below threshold, create notification
                    if (price < flightConfig.priceThreshold) {
                        const message = `🚨 Price Alert! Flight from ${flightConfig.departureCity} to ${flightConfig.destinationCity} (${dates.departureDate} - ${dates.returnDate}) is now ${price}€ (below threshold of ${flightConfig.priceThreshold}€)`;
                        console.log(chalk.green(`\n${message}`));
                        
                        // Save notification to database
                        await saveNotification(
                            routeId,
                            price,
                            flightConfig.priceThreshold,
                            message
                        );
                    }

                    return { flightConfig, price, dates };
                })
            );
            
            // Filter out null results and add to results array
            const validResults = batchResults.filter(result => result !== null);
            results.push(...validResults);
            
            // Add a small delay between date batches to avoid rate limiting
            if (i + DATE_CONCURRENCY_LIMIT < dateCombinations.length) {
                await setTimeout(1000);
            }
        }

        return results;
    } catch (error) {
        console.error(chalk.red(`Error checking flight ${flightConfig.id}:`, error));
        return null;
    }
}

async function checkAllFlights() {
    console.log(chalk.blue('\nStarting flight checks...'));
    console.log(chalk.gray('----------------------------------------'));
    
    const allResults = [];
    const CONCURRENCY_LIMIT = 10; // Limit concurrent browser instances
    
    // Process flight configs in batches to limit concurrency
    for (let i = 0; i < config.flightConfigs.length; i += CONCURRENCY_LIMIT) {
        const batch = config.flightConfigs.slice(i, i + CONCURRENCY_LIMIT);
        const batchResults = await Promise.all(
            batch.map(flightConfig => checkAndNotifyFlight(flightConfig))
        );
        
        // Filter out null results and flatten the array
        const validResults = batchResults
            .filter(results => results !== null)
            .flat();
            
        allResults.push(...validResults);
        
        // Add a small delay between batches to avoid rate limiting
        if (i + CONCURRENCY_LIMIT < config.flightConfigs.length) {
            await setTimeout(5000);
        }
    }
    
    // Print summary table
    printSummaryTable(allResults);
    
    console.log(chalk.gray('----------------------------------------'));
    console.log(chalk.blue('All flight checks completed'));
}

// Start the checks
console.log(chalk.blue('Flight Price Checker'));
console.log(chalk.gray('==================='));
checkAllFlights();

// Check at configured interval
setInterval(checkAllFlights, config.checkInterval);