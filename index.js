import puppeteer from 'puppeteer';
import { setTimeout } from 'timers/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { savePrice, getLatestPrice, getPriceHistory, saveNotification } from './db.js';
import dotenv from 'dotenv';
import { addDays, format, parse } from 'date-fns';
import { config } from './config.js';
import flightQueue from './queue.js';
import { checkFlightPrice } from './flightChecker.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

// Log the configured interval
console.log(chalk.blue(`Check interval set to ${process.env.CHECK_INTERVAL || 60} minutes`));

function getPriceChange(currentPrice, previousPrice) {
    if (!previousPrice) return 'N/A';
    const change = currentPrice - previousPrice;
    const percentage = ((change / previousPrice) * 100).toFixed(1);
    return `${change > 0 ? '+' : ''}${change}€ (${change > 0 ? '+' : ''}${percentage}%)`;
}

async function printSummaryTable(results) {
    console.log('\nFlight Price Summary:');
    console.log('=====================');
    
    for (const result of results) {
        const { flightConfig, price, dates } = result;
        const previousPrice = await getLatestPrice(`${flightConfig.id}-${dates.departureDate}-${dates.returnDate}`);
        const change = getPriceChange(price, previousPrice);
        const status = price < flightConfig.priceThreshold 
            ? chalk.green('Below Threshold') 
            : chalk.yellow('Above Threshold');

        console.log(`\nRoute: ${flightConfig.departureCity} → ${flightConfig.destinationCity}`);
        console.log(`Dates: ${dates.departureDate} - ${dates.returnDate}`);
        console.log(`Current Price: ${price}€`);
        console.log(`Threshold: ${flightConfig.priceThreshold}€`);
        console.log(`Change: ${change}`);
        console.log(`Status: ${status}`);
        console.log('---------------------');
    }
}

// Initialize the queue system
console.log(chalk.blue('Flight Price Checker'));
console.log(chalk.gray('==================='));

// Add event listeners for queue events
flightQueue.on('flightAdded', (flightConfig) => {
    console.log(chalk.blue(`Flight config ${flightConfig.id} added to queue`));
});

flightQueue.on('flightProcessed', ({ flightConfig, result }) => {
    console.log(chalk.green(`Flight config ${flightConfig.id} processed successfully`));
    printSummaryTable(result);
});

flightQueue.on('flightError', ({ flightConfig, error }) => {
    console.error(chalk.red(`Error processing flight config ${flightConfig.id}:`, error));
});

flightQueue.on('queueEmpty', () => {
    console.log(chalk.blue('Queue is empty'));
});

// Function to add a new flight config to the queue
export function addFlightConfig(flightConfig) {
    flightQueue.addToQueue(flightConfig);
}

// If there are initial flight configs in the config file, add them to the queue
if (config.flightConfigs && config.flightConfigs.length > 0) {
    console.log(chalk.blue(`Adding ${config.flightConfigs.length} initial flight configs to queue`));
    config.flightConfigs.forEach(flightConfig => {
        flightQueue.addToQueue(flightConfig);
    });
}