import { EventEmitter } from 'events';
import { checkFlightPrice } from './flightChecker.js';
import { savePrice, saveNotification } from './db.js';
import chalk from 'chalk';

class FlightQueue extends EventEmitter {
    constructor() {
        super();
        this.queue = [];
        this.isProcessing = false;
    }

    // Add a new flight config to the queue
    addToQueue(flightConfig) {
        console.log(chalk.blue(`Adding flight config ${flightConfig.id} to queue`));
        this.queue.push(flightConfig);
        this.emit('flightAdded', flightConfig);
        
        // Start processing if not already processing
        if (!this.isProcessing) {
            this.processQueue();
        }
    }

    // Process the queue
    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        while (this.queue.length > 0) {
            const flightConfig = this.queue[0];
            console.log(chalk.cyan(`\nProcessing flight config ${flightConfig.id}...`));
            
            try {
                const result = await this.processFlightConfig(flightConfig);
                this.emit('flightProcessed', { flightConfig, result });
            } catch (error) {
                console.error(chalk.red(`Error processing flight config ${flightConfig.id}:`, error));
                this.emit('flightError', { flightConfig, error });
            }

            // Remove the processed flight config
            this.queue.shift();
        }

        this.isProcessing = false;
        this.emit('queueEmpty');
    }

    // Process a single flight config
    async processFlightConfig(flightConfig) {
        let dateCombinations;
        
        // If dates are provided, use them directly
        if (flightConfig.dates) {
            dateCombinations = [flightConfig.dates];
        } else {
            // Otherwise generate date combinations
            dateCombinations = this.generateDateCombinations(
                flightConfig.departureDate,
                flightConfig.returnDate,
                flightConfig.daysRange || 0
            );
        }

        const results = [];

        for (const dates of dateCombinations) {
            console.log(chalk.gray(`Checking dates: ${dates.departureDate} - ${dates.returnDate}`));
            const result = await checkFlightPrice(flightConfig, dates);
            
            if (!result) continue;

            const { price } = result;
            const routeId = `${flightConfig.id}-${dates.departureDate}-${dates.returnDate}`;
            
            // Save price to database
            await savePrice(routeId, price);
            
            // Log the result
            console.log(chalk.white(`\nFlight price for ${flightConfig.departureCity} to ${flightConfig.destinationCity}:`));
            console.log(chalk.gray(`Dates: ${dates.departureDate} - ${dates.returnDate}`));
            console.log(chalk.yellow(`Price: ${price}€`));

            // Create notification if price is below threshold
            if (price < flightConfig.priceThreshold) {
                const message = `🚨 Price Alert! Flight from ${flightConfig.departureCity} to ${flightConfig.destinationCity} (${dates.departureDate} - ${dates.returnDate}) is now ${price}€ (below threshold of ${flightConfig.priceThreshold}€)`;
                console.log(chalk.green(`\n${message}`));
                
                await saveNotification(
                    routeId,
                    price,
                    flightConfig.priceThreshold,
                    message
                );
            }

            results.push({ flightConfig, price, dates });
        }

        return results;
    }

    // Helper function to generate date combinations
    generateDateCombinations(departureDate, returnDate, daysRange = 0) {
        const combinations = [];
        
        const [depMonth, depDay, depYear] = departureDate.split('-').map(Number);
        const [retMonth, retDay, retYear] = returnDate.split('-').map(Number);
        
        const baseDeparture = new Date(depYear, depMonth - 1, depDay);
        const baseReturn = new Date(retYear, retMonth - 1, retDay);

        for (let i = -daysRange; i <= daysRange; i++) {
            for (let j = -daysRange; j <= daysRange; j++) {
                const newDeparture = new Date(baseDeparture);
                newDeparture.setDate(baseDeparture.getDate() + i);
                
                const newReturn = new Date(baseReturn);
                newReturn.setDate(baseReturn.getDate() + j);
                
                if (newReturn > newDeparture) {
                    combinations.push({
                        departureDate: this.formatDate(newDeparture),
                        returnDate: this.formatDate(newReturn)
                    });
                }
            }
        }
        
        return combinations;
    }

    // Helper function to format date
    formatDate(date) {
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const year = date.getFullYear();
        return `${month}-${day}-${year}`;
    }
}

// Create and export a singleton instance
const flightQueue = new FlightQueue();
export default flightQueue; 