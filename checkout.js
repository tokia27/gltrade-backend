// =====================================================================
// შეკვეთის მიღება და Telegram-ში გაგზავნა
//   1) მოკლე შეტყობინება (მაშინვე)
//   2) PDF ფაილი სრული ინფორმაციით და ფოტოებით (რამდენიმე წამში)
//   PDF თუ ვერ შეიქმნა — იგზავნება ძველებური სია ფოტოებით
// =====================================================================
const { renderOrderPdf } = require('./order-pdf');

const TG_API = process.env.TELEGRAM_API || 'https://api.telegram.org';

// Telegram HTML-ში < > & სიმბოლოები შეცდომას იწვევს — ვანეიტრალებთ
const h = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => (Number(n) || 0).toFixed(2);
const qtyOf = (it) => Number(it.quantity || it.qty || 1);

function tbilisiDate(d = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Tbilisi', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(d).map(p => [p.type, p.value]));
    return `${parts.day}.${parts.month}.${parts.year} ${parts.hour}:${parts.minute}`;
}

async function tg(method, payload) {
    const res = await fetch(`${TG_API}/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, ...payload })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.description || `HTTP ${res.status}`);
    return data;
}

async function tgDocument(buffer, filename, caption) {
    const form = new FormData();
    form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
    form.append('caption', caption);
    form.append('parse_mode', 'HTML');
    form.append('document', new Blob([buffer], { type: 'application/pdf' }), filename);
    const res = await fetch(`${TG_API}/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: form });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) throw new Error(data.description || `HTTP ${res.status}`);
    return data;
}

function normalizeOrder(body) {
    const o = body && typeof body === 'object' ? body : {};
    const cart = Array.isArray(o.cart) ? o.cart : [];
    return {
        orderId: String(o.orderId || ''),
        date: o.date || tbilisiDate(),
        userInfo: o.userInfo || '',
        address: (o.buyer && o.buyer.address) || o.address || '',
        email: o.email || '',
        account: o.account || '',
        buyer: o.buyer && typeof o.buyer === 'object' ? o.buyer : null,
        cart,
        totalSum: o.totalSum != null ? Number(o.totalSum) : cart.reduce((s, it) => s + (Number(it.price) || 0) * qtyOf(it), 0)
    };
}

function summaryText(o) {
    const b = o.buyer;
    const lines = [`🛍️ <b>ახალი შეკვეთა ${h(o.orderId)}</b>`, ''];
    if (b && b.buyerType === 'company') {
        lines.push(`🏢 <b>იურიდიული პირი:</b> ${h(b.companyName)} · ს/კ ${h(b.companyId)}`);
        if (b.contactName) lines.push(`👤 საკონტაქტო პირი: ${h(b.contactName)}`);
        lines.push(`📞 ${h(b.phone)}`);
    } else if (b && b.buyerType === 'person') {
        lines.push(`👤 <b>ფიზიკური პირი:</b> ${h(b.name)} · პ/ნ ${h(b.personalId)}`);
        lines.push(`📞 ${h(b.phone)}`);
    } else {
        lines.push(`👤 <b>მომხმარებელი:</b> ${h(o.userInfo)}`);
    }
    if (o.email) lines.push(`✉️ ${h(o.email)}`);
    lines.push(`📍 <b>მისამართი:</b> ${h(o.address)}`);
    lines.push('');
    lines.push(`📦 ${o.cart.length} დასახელება · ${o.cart.reduce((s, it) => s + qtyOf(it), 0)} ერთეული`);
    lines.push(`💰 <b>სულ გადასახდელი: ${money(o.totalSum)} ₾</b>`);
    lines.push('');
    lines.push('📄 სრული ინფორმაცია ფოტოებით — PDF ფაილში ⬇️');
    return lines.join('\n');
}

// სათადარიგო: ძველებური სია ფოტოებით (თუ PDF ვერ შეიქმნა)
async function sendItemsFallback(o) {
    for (let i = 0; i < o.cart.length; i++) {
        const it = o.cart[i];
        const details = [
            it.barcode ? `🏷️ შტრიხკოდი: ${h(it.barcode)}` : '',
            (it.selectedSize || it.size) ? `📏 ზომა: ${h(it.selectedSize || it.size)}` : '',
            (it.selectedColor || it.color) ? `🎨 ფერი: ${h(it.selectedColor || it.color)}` : ''
        ].filter(Boolean);
        const caption = `${i + 1}. <b>${h(it.name)}</b>${details.length ? '\n' + details.join(' | ') : ''}\n🔢 რაოდენობა: <b>${qtyOf(it)} ცალი</b>\n💰 ფასი: <b>${money((Number(it.price) || 0) * qtyOf(it))} ₾</b>`;
        const img = Array.isArray(it.images) ? it.images.find(s => /^https?:\/\//.test(s || '')) : null;
        try {
            if (img) await tg('sendPhoto', { photo: img, caption, parse_mode: 'HTML' });
            else await tg('sendMessage', { text: caption, parse_mode: 'HTML' });
        } catch (e) {
            await tg('sendMessage', { text: caption, parse_mode: 'HTML' });
        }
    }
}

async function sendPdf(o) {
    const started = Date.now();
    const pdf = await renderOrderPdf(o);
    const num = o.orderId.replace(/[^0-9A-Za-z-]/g, '') || 'order';
    await tgDocument(pdf, `GLTrade-order-${num}.pdf`, `📄 შეკვეთა <b>${h(o.orderId)}</b> · ${money(o.totalSum)} ₾`);
    console.log(`✅ PDF გაიგზავნა (${o.orderId}, ${Math.round(pdf.length / 1024)} KB, ${Date.now() - started} ms)`);
}

async function handleCheckout(req, res) {
    const o = normalizeOrder(req.body);
    if (!o.orderId || o.cart.length === 0) {
        return res.status(400).json({ success: false, message: 'შეკვეთა ცარიელია' });
    }

    // 1) მოკლე შეტყობინება — თუ ეს ვერ გაიგზავნა, მომხმარებელი შეცდომას ნახავს
    try {
        await tg('sendMessage', { text: summaryText(o), parse_mode: 'HTML' });
    } catch (err) {
        console.error('❌ Telegram API Error:', err.message);
        return res.status(500).json({ success: false, message: `Telegram Error: ${err.message}` });
    }

    // მომხმარებელს პასუხი მაშინვე მიდის — PDF-ს ლოდინი არ სჭირდება
    res.status(200).json({ success: true, message: 'შეკვეთა გაიგზავნა!' });

    // 2) PDF ფონურ რეჟიმში
    try {
        await sendPdf(o);
    } catch (err) {
        console.error('⚠️ PDF ვერ შეიქმნა:', err.message);
        try {
            await tg('sendMessage', { text: `⚠️ შეკვეთა ${h(o.orderId)}: PDF ვერ შეიქმნა, პროდუქცია ქვემოთაა:`, parse_mode: 'HTML' });
            await sendItemsFallback(o);
        } catch (e2) {
            console.error('❌ სათადარიგო გაგზავნაც ვერ მოხერხდა:', e2.message);
        }
    }
}

module.exports = { handleCheckout, normalizeOrder, summaryText, tbilisiDate };
