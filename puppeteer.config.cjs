// Render-ზე Chrome უნდა ინახებოდეს პროექტის საქაღალდეში,
// რომ აწყობის (build) შემდეგ გაშვებისასაც ხელმისაწვდომი იყოს.
const { join } = require('path');

module.exports = {
    cacheDirectory: join(__dirname, '.cache', 'puppeteer')
};
