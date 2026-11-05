// =====================================================================
// ადმინ-პანელი (gltrade.ge/admin/) — სერვერის ნაწილი
//   • შესვლა: Google ანგარიში, მხოლოდ ADMIN_EMAILS-ში მითითებული ელ-ფოსტა
//   • პროდუქტები ინახება საიტის repository-ში (products.js) — GitHub API-ით
//   • ფოტოები იწერება images/ საქაღალდეში იმავე commit-ში
//   • თარგმნა: Claude (თუ ANTHROPIC_API_KEY არის) ან უფასო MyMemory
//
// Render-ის Environment ცვლადები:
//   GITHUB_TOKEN     — GitHub-ის გასაღები (Contents: Read and write, მხოლოდ tokia27/gltrade)
//   GITHUB_REPO      — (არასავალდებულო) ნაგულისხმევად tokia27/gltrade
//   ADMIN_EMAILS     — (არასავალდებულო) ნაგულისხმევად info@gltrade.ge; რამდენიმე — მძიმით
//   ANTHROPIC_API_KEY — (არასავალდებულო) უკეთესი თარგმანისთვის
// =====================================================================

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '866386160743-088e822qoqei7cbm8pfcd9skhuc8falg.apps.googleusercontent.com';
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'info@gltrade.ge').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
const REPO = process.env.GITHUB_REPO || 'tokia27/gltrade';
const BRANCH = process.env.GITHUB_BRANCH || 'main';
const PRODUCTS_PATH = 'products.js';
const GH_API = process.env.GITHUB_API || 'https://api.github.com';
const TOKENINFO = process.env.GOOGLE_TOKENINFO || 'https://oauth2.googleapis.com/tokeninfo';
const MYMEMORY = process.env.MYMEMORY_API || 'https://api.mymemory.translated.net/get';
const ANTHROPIC_API = process.env.ANTHROPIC_API || 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

const PRODUCTS_HEADER = '// GLTrade — პროდუქტების სია.\n// ამ ფაილს ადმინ-პანელი (gltrade.ge/admin/) ავტომატურად ცვლის. ხელით რედაქტირებისას შეინარჩუნეთ JSON ფორმატი.\n';
const FIELD_ORDER = ['id', 'barcode', 'title', 'price', 'inStock', 'category', 'subcategory', 'images', 'sizes', 'colors', 'brands'];

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

// ---------------- შესვლის შემოწმება ----------------
const tokenCache = new Map(); // token -> { email, until }

async function verifyAdmin(req) {
    const auth = req.headers['authorization'] || req.headers['Authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
    if (!token) throw new HttpError(401, 'გთხოვთ, შეხვიდეთ Google ანგარიშით.');
    const cached = tokenCache.get(token);
    if (cached && cached.until > Date.now()) return cached.email;

    const res = await fetch(`${TOKENINFO}?id_token=${encodeURIComponent(token)}`);
    const info = await res.json().catch(() => ({}));
    if (!res.ok || info.error_description || info.error) throw new HttpError(401, 'სესია ამოიწურა, შედით თავიდან.');
    if (info.aud !== GOOGLE_CLIENT_ID) throw new HttpError(401, 'არასწორი შესვლა.');
    if (String(info.email_verified) !== 'true') throw new HttpError(403, 'ელ-ფოსტა დადასტურებული არ არის.');
    const email = String(info.email || '').toLowerCase();
    if (!ADMIN_EMAILS.includes(email)) throw new HttpError(403, `${email} — ამ ანგარიშს ადმინ-პანელზე წვდომა არ აქვს.`);
    const exp = Number(info.exp) * 1000 || (Date.now() + 5 * 60 * 1000);
    tokenCache.set(token, { email, until: Math.min(exp, Date.now() + 10 * 60 * 1000) });
    return email;
}

// ---------------- GitHub ----------------
async function gh(method, path, body, accept) {
    if (!process.env.GITHUB_TOKEN) throw new HttpError(500, 'სერვერზე GITHUB_TOKEN არ არის მითითებული (Render → Environment).');
    const res = await fetch(`${GH_API}${path}`, {
        method,
        headers: {
            'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
            'Accept': accept || 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': 'gltrade-admin',
            ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body: body ? JSON.stringify(body) : undefined
    });
    if (accept === 'application/vnd.github.raw') {
        if (!res.ok) throw new HttpError(502, `GitHub: ფაილი ვერ წავიკითხე (${res.status})`);
        return res.text();
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
        const err = new HttpError(res.status === 401 || res.status === 403 ? 502 : 502,
            `GitHub: ${data.message || res.status}${res.status === 401 ? ' — შეამოწმეთ GITHUB_TOKEN' : ''}`);
        err.ghStatus = res.status;
        throw err;
    }
    return data;
}

function parseProducts(text) {
    const start = text.indexOf('[', text.indexOf('const products'));
    const end = text.lastIndexOf(']');
    if (start < 0 || end < start) throw new HttpError(500, 'products.js ვერ წავიკითხე');
    return JSON.parse(text.slice(start, end + 1));
}

function orderFields(p) {
    const o = {};
    FIELD_ORDER.forEach(k => { if (p[k] !== undefined && p[k] !== null && p[k] !== '') o[k] = p[k]; });
    Object.keys(p).forEach(k => { if (!(k in o) && !k.startsWith('__') && p[k] !== undefined) o[k] = p[k]; });
    return o;
}

function serializeProducts(list) {
    return PRODUCTS_HEADER + 'const products = [\n' + list.map(p => JSON.stringify(orderFields(p))).join(',\n') + '\n];\n';
}

async function loadState() {
    const ref = await gh('GET', `/repos/${REPO}/git/ref/heads/${BRANCH}`);
    const headSha = ref.object.sha;
    const text = await gh('GET', `/repos/${REPO}/contents/${PRODUCTS_PATH}?ref=${headSha}`, null, 'application/vnd.github.raw');
    return { headSha, products: parseProducts(text) };
}

async function commitFiles(headSha, files, message) {
    const commit = await gh('GET', `/repos/${REPO}/git/commits/${headSha}`);
    const tree = [];
    for (const f of files) {
        const blob = await gh('POST', `/repos/${REPO}/git/blobs`, { content: f.content, encoding: f.encoding || 'utf-8' });
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await gh('POST', `/repos/${REPO}/git/trees`, { base_tree: commit.tree.sha, tree });
    const newCommit = await gh('POST', `/repos/${REPO}/git/commits`, { message, tree: newTree.sha, parents: [headSha] });
    await gh('PATCH', `/repos/${REPO}/git/refs/heads/${BRANCH}`, { sha: newCommit.sha, force: false });
    return newCommit.sha;
}

// ერთდროული ცვლილებისას (409/422) — ერთხელ ვცდით თავიდან
async function withRetry(fn) {
    try { return await fn(); } catch (err) {
        if (err.ghStatus === 409 || err.ghStatus === 422) return fn();
        throw err;
    }
}

// ---------------- პროდუქტის შემოწმება ----------------
function cleanText(v, max) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max); }

function validateProduct(input) {
    const p = input && typeof input === 'object' ? input : {};
    const title = p.title || {};
    const ka = cleanText(title.ka, 300);
    if (ka.length < 2) throw new HttpError(400, 'დასახელება აუცილებელია');
    const price = Math.round(Number(p.price) * 100) / 100;
    if (!isFinite(price) || price <= 0 || price > 1000000) throw new HttpError(400, 'ფასი არასწორია');
    const category = cleanText(p.category, 80);
    if (!category) throw new HttpError(400, 'კატეგორია აუცილებელია');
    const out = {
        ...p,
        title: { ka, en: cleanText(title.en, 300) || ka, ru: cleanText(title.ru, 300) || ka },
        price,
        inStock: p.inStock !== false,
        category,
        subcategory: cleanText(p.subcategory, 80) || undefined,
        barcode: cleanText(p.barcode, 80) || undefined,
        images: Array.isArray(p.images) ? p.images.map(s => cleanText(s, 300)).filter(s => /^images\/[^/]+$|^https?:\/\//.test(s)) : []
    };
    return out;
}

function decodeUpload(dataUrl) {
    const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
    if (!m) throw new HttpError(400, 'ფოტოს ფორმატი არასწორია');
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    if (m[2].length > 4 * 1024 * 1024) throw new HttpError(400, 'ფოტო ზედმეტად დიდია');
    return { ext, base64: m[2] };
}

// ---------------- თარგმნა ----------------
async function translateClaude(text) {
    const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({
            model: ANTHROPIC_MODEL,
            max_tokens: 400,
            system: 'You translate Georgian product names for an office-supplies web shop into English and Russian. Keep brand names, model codes, numbers and sizes unchanged. Convert units: მლ→ml/мл, ლ→L/л, ც/ცალი→pcs/шт, მმ→mm/мм, სმ→cm/см, გრ→g/г, კგ→kg/кг. Use natural shop wording. Reply with JSON only: {"en":"...","ru":"..."}',
            messages: [{ role: 'user', content: text }]
        })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((data.error && data.error.message) || `Claude ${res.status}`);
    const raw = (data.content || []).map(c => c.text || '').join('');
    const json = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    return { en: cleanText(json.en, 300), ru: cleanText(json.ru, 300), engine: 'claude' };
}

async function translateMyMemory(text) {
    const one = async (to) => {
        const res = await fetch(`${MYMEMORY}?q=${encodeURIComponent(text)}&langpair=ka|${to}`);
        const data = await res.json().catch(() => ({}));
        const t = data.responseData && data.responseData.translatedText;
        if (!res.ok || !t || /MYMEMORY WARNING|QUOTA/i.test(t)) throw new Error('დღიური უფასო ლიმიტი ამოიწურა — სცადეთ ხვალ ან ჩაწერეთ ხელით');
        return cleanText(t.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&'), 300);
    };
    const [en, ru] = await Promise.all([one('en'), one('ru')]);
    return { en, ru, engine: 'mymemory' };
}

// ---------------- მარშრუტები ----------------
function wrap(fn) {
    return async (req, res) => {
        try {
            const email = await verifyAdmin(req);
            const out = await fn(req, email);
            res.status(200).json({ success: true, ...out });
        } catch (err) {
            const status = err.status || 500;
            if (status >= 500) console.error('❌ ადმინი:', err.message);
            res.status(status).json({ success: false, message: err.message || 'სერვერის შეცდომა' });
        }
    };
}

const handlers = {
    me: wrap(async (req, email) => ({ email })),

    list: wrap(async () => {
        const { products } = await loadState();
        return { products };
    }),

    save: wrap(async (req, email) => {
        const body = req.body || {};
        const input = body.product || {};
        const uploads = Array.isArray(body.uploads) ? body.uploads.slice(0, 12).map(decodeUpload) : [];
        const order = Array.isArray(input.__order) ? input.__order : null;
        let saved;
        await withRetry(async () => {
            const { headSha, products } = await loadState();
            const p = validateProduct(input);
            const isNew = !p.id || !products.some(x => x.id === Number(p.id));
            if (isNew) p.id = products.reduce((m, x) => Math.max(m, Number(x.id) || 0), 0) + 1;
            p.id = Number(p.id);
            const stamp = Date.now().toString(36);
            const files = uploads.map((u, i) => ({ path: `images/p${p.id}-${stamp}-${i + 1}.${u.ext}`, content: u.base64, encoding: 'base64' }));
            if (order) {
                p.images = order.map(o => (o && o.upload != null) ? (files[o.upload] && files[o.upload].path) : (o && o.src)).filter(Boolean);
            } else {
                p.images = [...p.images, ...files.map(f => f.path)];
            }
            delete p.__order;
            saved = orderFields(p);
            const list = isNew ? [...products, saved] : products.map(x => (x.id === saved.id ? saved : x));
            files.push({ path: PRODUCTS_PATH, content: serializeProducts(list) });
            await commitFiles(headSha, files, `ადმინი: ${isNew ? 'დაემატა' : 'შეიცვალა'} „${saved.title.ka}“ (ID ${saved.id}) — ${email}`);
        });
        return { product: saved };
    }),

    remove: wrap(async (req, email) => {
        const id = Number(req.params.id);
        await withRetry(async () => {
            const { headSha, products } = await loadState();
            const p = products.find(x => x.id === id);
            if (!p) throw new HttpError(404, 'პროდუქტი ვერ მოიძებნა');
            const list = products.filter(x => x.id !== id);
            await commitFiles(headSha, [{ path: PRODUCTS_PATH, content: serializeProducts(list) }], `ადმინი: წაიშალა „${p.title && p.title.ka}“ (ID ${id}) — ${email}`);
        });
        return { id };
    }),

    translate: wrap(async (req) => {
        const text = cleanText((req.body || {}).text, 300);
        if (text.length < 2) throw new HttpError(400, 'ჩაწერეთ ქართული დასახელება');
        try {
            if (process.env.ANTHROPIC_API_KEY) return await translateClaude(text);
        } catch (err) {
            console.warn('⚠️ Claude თარგმანი ვერ მოხერხდა, ვცდი MyMemory-ს:', err.message);
        }
        try { return await translateMyMemory(text); } catch (err) { throw new HttpError(502, err.message); }
    })
};

function mountAdmin(app, express) {
    const big = express.json({ limit: '20mb' });
    app.get('/api/admin/me', handlers.me);
    app.get('/api/admin/products', handlers.list);
    app.post('/api/admin/products', big, handlers.save);
    app.delete('/api/admin/products/:id', handlers.remove);
    app.post('/api/admin/translate', express.json({ limit: '50kb' }), handlers.translate);
}

module.exports = { mountAdmin, handlers, parseProducts, serializeProducts };
