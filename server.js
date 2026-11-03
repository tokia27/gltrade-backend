require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { handleCheckout } = require('./checkout');

const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Render-ისა და შემოწმებისთვის: სერვერი ცოცხალია?
app.get('/', (req, res) => res.send('GLTrade backend OK'));

// შეკვეთა: Telegram-ში იგზავნება მოკლე შეტყობინება + PDF ფაილი
app.post('/api/checkout', handleCheckout);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 სერვერი ჩაირთო პორტზე ${PORT}`);
});
