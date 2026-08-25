require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json());

app.post('/api/checkout', async (req, res) => {
    try {
        const { orderId, userInfo, address, cart, totalSum } = req.body;

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        // 1. ზოგადი ინფორმაცია შეკვეთაზე
        const headerMessage = 
`🛍️ <b>ახალი შეკვეთა ${orderId}</b>

👤 <b>მომხმარებელი:</b> ${userInfo}
📍 <b>მისამართი:</b> ${address}

📦 <b>პროდუქტების სია:</b>`;

        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: headerMessage,
            parse_mode: 'HTML'
        });

        // 2. ციკლი კალათის პროდუქტებზე
        if (Array.isArray(cart) && cart.length > 0) {
            for (let i = 0; i < cart.length; i++) {
                const item = cart[i];

                const qty = item.quantity || item.qty || 1;
                const price = Number(item.price) || 0;
                const itemTotal = (price * qty).toFixed(2);

                const size = item.selectedSize || item.size;
                const color = item.selectedColor || item.color;

                let details = [];
                if (item.barcode) details.push(`🏷️ შტრიხკოდი: ${item.barcode}`);
                if (size) details.push(`📏 ზომა: ${size}`);
                if (color) details.push(`🎨 ფერი: ${color}`);

                const detailsText = details.length > 0 ? `\n${details.join(' | ')}` : '';

                // ტექსტი ფოტოს ქვეშ
                const itemCaption = 
`${i + 1}. <b>${item.name}</b>${detailsText}
🔢 რაოდენობა: <b>${qty} ცალი</b>
💰 ფასი: <b>${itemTotal} ₾</b>`;

                // სურათის URL (რომელიც ფრონტიდან https://gltrade.ge/... სახით მოვიდა)
                const imageUrl = item.images && item.images.length > 0 ? item.images[0] : null;

                // 📸 თუ სურათის URL არსებობს — პირდაპირ URL-ით ვაგზავნით Telegram-ში
                if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
                    await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, {
                        chat_id: chatId,
                        photo: imageUrl,
                        caption: itemCaption,
                        parse_mode: 'HTML'
                    });
                } else {
                    // თუ სურათი საერთოდ არ აქვს პროდუქტს — მხოლოდ ტექსტი
                    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        chat_id: chatId,
                        text: itemCaption,
                        parse_mode: 'HTML'
                    });
                }
            }
        }

        // 3. ჯამური თანხა
        const footerMessage = 
`💰 <b>სულ გადასახდელი: ${totalSum} ₾</b>
💳 <b>საბანკო ანგარიში:</b> GE29TB7777777777777777`;

        await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            chat_id: chatId,
            text: footerMessage,
            parse_mode: 'HTML'
        });

        console.log('✅ ყველა პროდუქტის ფოტო და დეტალები გაიგზავნა!');
        res.status(200).json({ success: true, message: 'შეკვეთა გაიგზავნა!' });

    } catch (error) {
        const telegramErr = error.response?.data?.description || error.message;
        console.error('❌ Telegram API Error:', error.response?.data || error.message);
        
        res.status(500).json({ 
            success: false, 
            message: `Telegram Error: ${telegramErr}` 
        });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 სერვერი ჩაირთო პორტზე ${PORT}`);
});