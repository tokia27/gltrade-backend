require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');
const axios = require('axios');

const app = express();

app.use(cors());
app.use(express.json());

app.post('/api/checkout', async (req, res) => {
    try {
        const { orderId, userInfo, address, cart, totalSum } = req.body;

        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;

        // 1. ჯერ ვაგზავნით ზოგად ინფორმაციას შეკვეთაზე (მომხმარებელი, მისამართი და ა.შ.)
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

        // 2. ახლა ციკლით ჩამოვუვლით კალათაში არსებულ თითოეულ პროდუქტს:
        if (Array.isArray(cart) && cart.length > 0) {
            for (let i = 0; i < cart.length; i++) {
                const item = cart[i];

                const qty = item.quantity || item.qty || 1;
                const price = Number(item.price) || 0;
                const itemTotal = (price * qty).toFixed(2);

                const size = item.selectedSize || item.size;
                const color = item.selectedColor || item.color;

                let details = [];
                if (size) details.push(`📏 ზომა: ${size}`);
                if (color) details.push(`🎨 ფერი: ${color}`);

                const detailsText = details.length > 0 ? `\n${details.join(' | ')}` : '';

                // თითოეული პროდუქტის ტექსტის შაბლონი ფოტოს ქვეშ
                const itemCaption = 
`${i + 1}. <b>${item.name}</b>${detailsText}
🔢 რაოდენობა: <b>${qty} ცალი</b>
💰 ფასი: <b>${itemTotal} ₾</b>`;

                // პროდუქტის სურათის გზის მიღება
                const itemImgPath = item.images && item.images.length > 0 ? item.images[0] : null;
                let fullPath = itemImgPath ? path.resolve(__dirname, itemImgPath) : null;

                // თუ სურათი არსებობს დისკზე — ვაგზავნით ფოტოს ტექსტთან ერთად
                if (fullPath && fs.existsSync(fullPath)) {
                    const form = new FormData();
                    form.append('chat_id', chatId);
                    form.append('photo', fs.createReadStream(fullPath));
                    form.append('caption', itemCaption);
                    form.append('parse_mode', 'HTML');

                    await axios.post(`https://api.telegram.org/bot${botToken}/sendPhoto`, form, {
                        headers: form.getHeaders()
                    });
                } else {
                    // თუ სურათი ვერ იპოვა — ვაგზავნით მხოლოდ ტექსტს
                    await axios.post(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                        chat_id: chatId,
                        text: itemCaption,
                        parse_mode: 'HTML'
                    });
                }
            }
        }

        // 3. ბოლოს ვაგზავნით ჯამურ თანხას და საბანკო რეკვიზიტებს
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