import puppeteer from 'puppeteer';
import { setTimeout } from 'timers/promises';
import chalk from 'chalk';

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

export { checkFlightPrice }; 