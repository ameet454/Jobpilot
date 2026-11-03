# HealthPilot 🫀

A free, private calorie, macro and habit tracker built for Indian food. It's written in **React** (with Vite) and works offline as an installable PWA.

> Type **"2 roti, 1 katori dal, salad"** and the meal is logged. You don't need to search, scroll or sign up.

## Why it beats HealthifyMe

HealthifyMe is the market leader in India. These are the most common complaints in its app-store reviews, and how HealthPilot handles each one:

| Pain point with HealthifyMe | HealthPilot |
|---|---|
| AI photo logging and the AI coach are behind a paid plan, with constant upsell pop-ups | All core features are free. Offline features cost nothing. AI features run on one cheap model through your own key |
| You need an account, and your health data is stored on their servers | There's no account. Data stays on your device (localStorage), and you can back it up or export it to JSON/CSV at any time |
| Logging means searching for each item, then picking a portion | **Natural-language logging that works offline**: digits, fractions (`½`, `1 1/2`), Hindi numbers (`do`, `aadha`), Indian units (katori, plate, glass), grams/ml and plurals |
| The scale's daily ups and downs feel discouraging | **Smoothed weight trend** (exponential moving average) plus a true kg/week rate from linear regression, and a projected goal date |
| Uses global BMI cut-offs | Uses **WHO Asia-Pacific BMI cut-offs** (23/25), which suit Indian bodies better |
| Diet plans are generic or need a paid coach | **One-tap day plan** made from real Indian meals. It respects veg/egg/non-veg, matches your calories and **adds protein** to the carb-heavy thali |
| Needs an internet connection | Works fully offline (service worker). Only the optional AI features use the network |
| Heavy app | Loads ~72 KB of gzipped JS |

### Features
- **Today:** calorie ring, protein/carbs/fat/fibre bars, meals grouped as breakfast/lunch/snacks/dinner, tap-to-fill water glasses, and the top coach insight.
- **Log food:**
  - Smart text input and a search with ranked fuzzy matching over 157 Indian dishes.
  - Recent, saved and custom foods, plus a browse view with diet markers.
  - 📷 Photo logging and ✨ "estimate unknown food" (AI, optional).
  - 🗓️ Plan my day.
- **Track:** weight, steps, sleep, water, and an **intermittent-fasting timer** (12:12 to 20:4) with stages and history.
- **Progress:** 7/14/30-day charts for calories, protein and water, a weight trend chart, BMI, streak, days logged and average macro split.
- **Coach:** rule-based insights that use your own numbers and work offline (protein gap, overeating, low fibre, short sleep, water, carb share, trend against your goal, losing too fast). There's also a chat. It uses AI when configured; otherwise it answers offline from your data.
- **Targets:** Mifflin–St Jeor BMR × activity, with a goal pace from 0.25 to 1 kg/week.
  - Safe calorie floors (1200 kcal for women, 1500 kcal for men).
  - Protein is based on a reference weight at BMI 25.
  - Water is 35 ml/kg.
  - Targets recalculate as your weight changes.
- Dark mode, mobile-first design and accessible controls.

## Run it

```bash
cd healthpilot
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests: parser, targets, trend, planner, store
npm run build
```

## Deploy (Vercel)

Create a Vercel project with **Root Directory = `healthpilot`**. The build settings come from `healthpilot/vercel.json`.

To turn on the AI features, add this environment variable:

| Variable | Purpose |
|---|---|
| `OPENROUTER_API_KEY` | Enables photo logging, AI estimates for unknown foods, and open-ended coach chat (`api/coach.js`) |
| `HEALTHPILOT_MODEL` (optional) | Overrides the default model, `openai/gpt-4o-mini` (vision-capable and cheap) |

Without a key, the endpoint returns 503 and the app quietly uses its offline engine.

## Deploy to Hostinger (shared / cloud web hosting)

The build is fully static, plus one PHP file for the optional AI features (`api/coach.php`). It uses relative paths, so it works at your domain root (`public_html/`) or in a subfolder (`public_html/health/`).

### Option A — upload a zip (5 minutes)
1. Run `npm run build`, then zip the **contents** of `dist/`. Make sure the hidden `.htaccess` files are included.
2. In hPanel, open **Files → File Manager → public_html** (or a subfolder), upload the zip, then right-click it and choose **Extract**.
3. In hPanel, go to **Security → SSL** and make sure SSL is active. The included `.htaccess` forces HTTPS, which installing the app needs.
4. *(Optional AI)* In `api/`, copy `config.example.php` to `config.php` and paste your OpenRouter key. Web access to that file is blocked.

### Option B — auto-deploy from GitHub
`.github/workflows/deploy-healthpilot-hostinger.yml` builds, tests and uploads over FTP on every push to `master` that touches `healthpilot/`. You can also run it manually from the **Actions** tab.

1. In hPanel, open **Files → FTP Accounts** and note the FTP host, username and password.
2. In GitHub, open **Settings → Secrets and variables → Actions** and add `FTP_SERVER`, `FTP_USERNAME` and `FTP_PASSWORD`.
3. Optionally, also add `FTP_SERVER_DIR` (default `public_html/`; keep the trailing `/`) and `OPENROUTER_API_KEY`.

The AI key is written to `api/config.php` on the server during deploy. It never goes into the repo.

> **Hostinger VPS** (no PHP): serve `dist/` with nginx and run `api/coach.js` behind it with Node, or put PHP-FPM in front of `api/coach.php`.

## Structure

```
healthpilot/
├─ api/coach.js            # optional AI: chat / parse / photo (key stays server-side, rate-limited)
├─ public/                 # PWA manifest, icon, service worker
├─ src/
│  ├─ data/foods.js        # 157 Indian foods, per-serving macros
│  ├─ lib/
│  │  ├─ parser.js         # offline natural-language meal parser + fuzzy search
│  │  ├─ nutrition.js      # BMR/TDEE/targets/BMI
│  │  ├─ trend.js          # weight EMA + weekly rate
│  │  ├─ planner.js        # meal-plan generator
│  │  ├─ insights.js       # coach rules, streaks, averages
│  │  └─ store.jsx         # reducer + localStorage persistence
│  └─ components/          # Today, Food, Track, Progress, Coach, Settings, Onboarding
└─ tests/engine.test.js
```

Nutrition values are estimates for typical home recipes (from IFCT 2017 and USDA references). HealthPilot gives general wellness guidance, not medical advice.
