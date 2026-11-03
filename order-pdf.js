// =====================================================================
// შეკვეთის PDF: HTML შაბლონი + Chromium (puppeteer) -> PDF ფაილი
// =====================================================================
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// სათადარიგო ქართული შრიფტი (ფაილში ჩასმული) — თუ Google Fonts ვერ ჩაიტვირთა
const FALLBACK_FONT_CSS = (() => {
    const face = (file, weight) => {
        try {
            const b64 = fs.readFileSync(path.join(__dirname, 'fonts', file)).toString('base64');
            return `@font-face{font-family:'GLSans';font-weight:${weight};src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
        } catch (e) { return ''; }
    };
    return face('GLSans-regular.ttf', '100 500') + face('GLSans-bold.ttf', '600 900');
})();

// გამყიდველის მონაცემები — საჭიროების შემთხვევაში აქ შეცვალეთ
const SELLER = {
    brand: 'GLTrade',
    company: 'შპს „გლ ნოუთ“',
    taxId: '400480902',
    address: 'ქ. თბილისი, ვ. გულისაშვილის 18ბ',
    phone: '597 77 98 30',
    email: 'info@gltrade.ge',
    banks: [
        ['საქართველოს ბანკი', 'GE03BG0000000613125631'],
        ['თიბისი ბანკი', 'GE69TB7874536020100009']
    ]
};

const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => (Number(n) || 0).toFixed(2);

function itemImage(item) {
    const list = Array.isArray(item.images) ? item.images : (item.images ? [item.images] : []);
    const src = list.find(s => typeof s === 'string' && /^(https?:|data:image\/)/.test(s));
    return src || '';
}

function buyerRows(order) {
    const b = order.buyer || {};
    if (b.buyerType === 'company') {
        return [
            ['ტიპი', 'იურიდიული პირი'], ['კომპანია', b.companyName], ['საიდენტიფიკაციო კოდი', b.companyId],
            ['საკონტაქტო პირი', b.contactName || '—'], ['ტელეფონი', b.phone], ['ელ-ფოსტა', order.email || '—']
        ];
    }
    if (b.buyerType === 'person') {
        return [
            ['ტიპი', 'ფიზიკური პირი'], ['სახელი და გვარი', b.name], ['პირადი ნომერი', b.personalId],
            ['ტელეფონი', b.phone], ['ელ-ფოსტა', order.email || '—']
        ];
    }
    // ძველი ვერსიის საიტიდან მოსული შეკვეთა (buyer ობიექტის გარეშე)
    return [['მომხმარებელი', order.userInfo || '—']];
}

function orderHtml(order) {
    const cart = Array.isArray(order.cart) ? order.cart : [];
    const qtyOf = (it) => Number(it.quantity || it.qty || 1);
    const total = order.totalSum != null ? Number(order.totalSum) : cart.reduce((s, it) => s + (Number(it.price) || 0) * qtyOf(it), 0);
    const units = cart.reduce((s, it) => s + qtyOf(it), 0);

    const rows = cart.map((it, i) => {
        const img = itemImage(it);
        const extra = [
            it.barcode ? `შტრიხკოდი: ${esc(it.barcode)}` : '',
            (it.selectedSize || it.size) ? `ზომა: ${esc(it.selectedSize || it.size)}` : '',
            (it.selectedColor || it.color) ? `ფერი: ${esc(it.selectedColor || it.color)}` : ''
        ].filter(Boolean).map(x => `<span>${x}</span>`).join('');
        return `
        <tr>
          <td class="n">${i + 1}</td>
          <td class="ph">${img ? `<img src="${esc(img)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'noimg'}))">` : '<div class="noimg"></div>'}</td>
          <td class="name"><b>${esc(it.name || 'პროდუქტი')}</b>${extra}</td>
          <td class="r">${qtyOf(it)}</td>
          <td class="r">${money(it.price)} ₾</td>
          <td class="r"><b>${money((Number(it.price) || 0) * qtyOf(it))} ₾</b></td>
        </tr>`;
    }).join('');

    return `<!doctype html><html lang="ka"><head><meta charset="utf-8">
<title>შეკვეთა ${esc(order.orderId)} — GLTrade</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Georgian:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>
${FALLBACK_FONT_CSS}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Noto Sans Georgian', 'GLSans', Arial, sans-serif; color: #0E1726; font-size: 11.5px; line-height: 1.45; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; padding: 4mm 14mm 0; }
.head { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 14px; border-bottom: 3px solid #1D4ED8; }
.logo { font-size: 28px; font-weight: 900; letter-spacing: -0.02em; line-height: 1; }
.logo span { color: #1D4ED8; }
.logo small { display: block; font-size: 10.5px; font-weight: 600; color: #566070; letter-spacing: 0; margin-top: 6px; }
.doc { text-align: right; }
.doc h1 { font-size: 22px; font-weight: 900; line-height: 1.1; }
.doc .no { color: #1D4ED8; }
.doc p { color: #566070; margin-top: 4px; }
.badge { display: inline-block; margin-top: 6px; background: #E0E8FF; color: #1D4ED8; font-weight: 700; font-size: 10.5px; border-radius: 999px; padding: 3px 10px; }
.parties { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
.box { border: 1px solid #DCE2EC; border-radius: 10px; padding: 11px 13px; }
.box h2, .pay h2 { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #1D4ED8; font-weight: 800; margin-bottom: 7px; }
.kv { display: grid; grid-template-columns: 146px 1fr; gap: 3px 8px; }
.kv dt { color: #566070; }
.kv dd { font-weight: 600; word-break: break-word; }
.addr { margin-top: 12px; background: #F4F7FF; border-radius: 10px; padding: 10px 13px; display: flex; gap: 10px; align-items: baseline; }
.addr b { font-size: 10px; text-transform: uppercase; letter-spacing: .08em; color: #1D4ED8; font-weight: 800; white-space: nowrap; }
.addr span { font-size: 13px; font-weight: 700; }
table { width: 100%; border-collapse: collapse; margin-top: 16px; }
thead { display: table-header-group; }
thead th { background: #172554; color: #fff; font-size: 10px; font-weight: 700; text-align: left; padding: 7px 8px; }
thead th:first-child { border-radius: 8px 0 0 8px; } thead th:last-child { border-radius: 0 8px 8px 0; }
tbody td { padding: 8px; border-bottom: 1px solid #E6EAF2; vertical-align: middle; }
tbody tr { page-break-inside: avoid; break-inside: avoid; }
td.n { width: 24px; color: #566070; font-weight: 700; }
td.ph { width: 74px; }
td.ph img, .noimg { width: 64px; height: 64px; object-fit: contain; border: 1px solid #E6EAF2; border-radius: 8px; background: #fff; display: block; }
.noimg { background: #EEF1F6; }
td.name b { display: block; font-size: 12px; }
td.name span { display: block; color: #566070; font-size: 10.5px; }
.r { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
th.r { text-align: right; }
.sum { display: flex; justify-content: space-between; gap: 16px; margin-top: 14px; align-items: flex-start; break-inside: avoid; }
.pay { flex: 1; border: 1px solid #DCE2EC; border-radius: 10px; padding: 11px 13px; }
.pay p { margin-top: 2px; }
.pay .purpose { margin-top: 7px; background: #FFF3DC; color: #7A4A00; border-radius: 6px; padding: 5px 8px; font-weight: 700; display: inline-block; }
.tot { width: 290px; }
.tot span { white-space: nowrap; }
.tot div { display: flex; justify-content: space-between; padding: 4px 0; color: #566070; }
.tot .grand { gap: 10px; margin-top: 6px; padding: 10px 12px; background: #1D4ED8; color: #fff; border-radius: 10px; font-size: 15px; font-weight: 800; }
.sign { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 34px; break-inside: avoid; }
.sign div { border-top: 1px solid #9AA4B5; padding-top: 6px; color: #566070; font-size: 10.5px; }
</style></head><body><div class="page">
  <div class="head">
    <div class="logo">GL<span>Trade</span><small>${esc(SELLER.company)} · ს/კ ${esc(SELLER.taxId)}</small></div>
    <div class="doc"><h1>შეკვეთა <span class="no">${esc(order.orderId)}</span></h1><p>${esc(order.date)}</p><span class="badge">ახალი შეკვეთა · გადაუხდელი</span></div>
  </div>

  <div class="parties">
    <div class="box"><h2>მყიდველი</h2><dl class="kv">${buyerRows(order).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v || '—')}</dd>`).join('')}</dl></div>
    <div class="box"><h2>გამყიდველი</h2><dl class="kv">
      <dt>კომპანია</dt><dd>${esc(SELLER.company)} (${esc(SELLER.brand)})</dd>
      <dt>საიდენტიფიკაციო კოდი</dt><dd>${esc(SELLER.taxId)}</dd>
      <dt>მისამართი</dt><dd>${esc(SELLER.address)}</dd>
      <dt>ტელეფონი</dt><dd>${esc(SELLER.phone)}</dd>
      <dt>ელ-ფოსტა</dt><dd>${esc(SELLER.email)}</dd>
      <dt>საიტის ანგარიში</dt><dd>${esc(order.account || '—')}</dd>
    </dl></div>
  </div>

  <div class="addr"><b>მიწოდების მისამართი</b><span>${esc(order.address || '—')}</span></div>

  <table>
    <thead><tr><th>#</th><th>ფოტო</th><th>პროდუქტი</th><th class="r">რაოდ.</th><th class="r">ფასი</th><th class="r">ჯამი</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>

  <div class="sum">
    <div class="pay"><h2>გადახდა საბანკო გადარიცხვით</h2>
      <p>მიმღები: <b>${esc(SELLER.company)}</b>, ს/კ ${esc(SELLER.taxId)}</p>
      ${SELLER.banks.map(([bank, iban]) => `<p>${esc(bank)}: <b>${esc(iban)}</b></p>`).join('')}
      <span class="purpose">დანიშნულება: შეკვეთა ${esc(order.orderId)}</span>
    </div>
    <div class="tot">
      <div><span>პროდუქცია (${cart.length} დასახ., ${units} ერთ.)</span><span>${money(total)} ₾</span></div>
      <div><span>მიწოდება</span><span>უფასო</span></div>
      <div class="grand"><span>სულ გადასახდელი</span><span>${money(total)} ₾</span></div>
    </div>
  </div>

  <div class="sign"><div>გადასცა (${esc(SELLER.brand)}) — სახელი, ხელმოწერა</div><div>მიიღო (მყიდველი) — სახელი, ხელმოწერა</div></div>
</div></body></html>`;
}

async function renderOrderPdf(order) {
    const browser = await puppeteer.launch({
        headless: true,
        executablePath: process.env.CHROME_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-zygote']
    });
    try {
        const page = await browser.newPage();
        // ფოტოები/ფონტი თუ ვერ ჩაიტვირთა 20 წამში — PDF მაინც იქმნება
        await page.setContent(orderHtml(order), { waitUntil: 'networkidle0', timeout: 20000 })
            .catch(err => console.warn('PDF: ზოგი რესურსი ვერ ჩაიტვირთა:', err.message));
        await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
        const footer = `<div style="width:100%;font-size:8px;color:#8A94A6;padding:0 14mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif">
            <span>gltrade.ge · ${esc(SELLER.email)} · ${esc(SELLER.phone)}</span>
            <span>${esc(order.orderId)} · <span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;
        const pdf = await page.pdf({
            format: 'A4', printBackground: true, displayHeaderFooter: true,
            headerTemplate: '<div></div>', footerTemplate: footer,
            margin: { top: '10mm', bottom: '14mm' }
        });
        return Buffer.from(pdf);
    } finally {
        await browser.close().catch(() => {});
    }
}

module.exports = { orderHtml, renderOrderPdf, SELLER };
