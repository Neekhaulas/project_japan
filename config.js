// Configuration
export const config = {
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