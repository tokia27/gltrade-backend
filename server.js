require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { handleCheckout } = require('./checkout');
const { mountAdmin } = require('./admin');

const app = express();

app.use(cors());

// ადმინ-პანელი (gltrade.ge/admin/) — ფოტოების გამო დიდი მოთხოვნები, ამიტომ ზოგად json-მდე
mountAdmin(app, express);

app.use(express.json({ limit: '1mb' }));

// Render-ისა და შემოწმებისთვის: სერვერი ცოცხალია?
app.get('/', (req, res) => res.send('GLTrade backend OK'));

// შეკვეთა: Telegram-ში იგზავნება მოკლე შეტყობინება + PDF ფაილი
app.post('/api/checkout', handleCheckout);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 სერვერი ჩაირთო პორტზე ${PORT}`);
});
