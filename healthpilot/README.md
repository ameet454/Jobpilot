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
- **Home dashboard:** a day score from six habits (calories, protein, water, steps, sleep, workout), a checklist with one-tap actions, a 7-day habit grid, a front/back muscle heat map on the 3-D body of hard sets per muscle this week (10–20 sets is the common growth target), and recent personal records.
- **Gym:**
  - **5-day plans:** Push/Pull/Legs/Upper/Lower or a body-part split, scaled for beginner, intermediate or advanced. The app always starts the next day in the cycle.
  - **61 exercises with a realistic 3-D athlete:** each exercise plays on a skinned human body (MakeHuman, CC0) with real skin, hands that grip the bar, studio lighting and soft shadows. The exact muscle head that should take the stress glows **red** through the skin (for example the upper chest on an incline press, or the side delts on a lateral raise). Supporting muscles are tinted **amber**. A tag pinned to the skin names the muscle, the rep counter and phase chip track the tempo, and spoken cues are optional. You can rotate the body or use the front, side and back views. An automated test checks every exercise so that no limb passes through the body, the equipment or the floor. Each exercise also has form steps, breathing, common mistakes, alternatives and a YouTube form-video search.
  - **Workout log:** last session's numbers beside every set, double-progression targets (add weight once every set hits the top of the rep range), warm-up/drop/failure sets, an automatic rest timer that vibrates, and PR badges using estimated 1-rep max (Epley).
- **Today (meals):** calorie ring, protein/carbs/fat/fibre bars, meals grouped as breakfast/lunch/snacks/dinner, tap-to-fill water glasses, and the top coach insight.
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

## Deploy to a VPS running Docker + Traefik (medreglens.tech) — auto-updating

This is how medreglens.tech is set up: a Hostinger VPS where Traefik routes domains to Docker containers.
`deploy/docker-deploy.sh` replaces whatever container serves the domain today (cdsco, or an older
HealthPilot), copies its HTTPS router settings, builds the app from GitHub and runs it behind Traefik.
It also installs a timer that checks GitHub every 3 minutes, so **after this one-time setup, pushing to the
branch is the deploy**: no one needs to log in to the server again.

In hPanel, open **VPS → Browser terminal** and run once:

```bash
curl -fsSL https://raw.githubusercontent.com/ameet454/Jobpilot/claude/youthful-brown-hczlf7/healthpilot/deploy/docker-deploy.sh -o hp.sh && bash hp.sh medreglens.tech
```

It lists the containers it will remove and asks you to type `DELETE`. Their settings are saved to
`/opt/healthpilot/backup-<date>/`, and their images and data volumes are kept. Add
`OPENROUTER_API_KEY=sk-or-...` before `bash` to switch on the AI features.

On the server afterwards: `FORCE=1 /opt/healthpilot/update.sh` deploys immediately, and
`tail -f /var/log/healthpilot-update.log` shows each deploy. Releases are kept in
`/opt/healthpilot/www/releases`; to roll back, point the `current` link at an older one.
If the server has no Traefik, the script hands over to `vps-setup.sh` below.

## Deploy to a Hostinger VPS without Docker (nginx, one command)

`deploy/vps-setup.sh` does the whole job on an Ubuntu/Debian VPS:

1. It finds the old app (`cdsco` by default; change it with `OLD_APP=name`). That covers nginx/Apache configs, folders, Docker containers, PM2 apps and systemd services.
2. It backs everything up to `/root/cdsco-backup-<date>/` and removes it, but **only after you type `DELETE`**.
3. It installs nginx, PHP-FPM, Node 20 and certbot.
4. It builds HealthPilot from GitHub into `/var/www/healthpilot` and serves it on your domain.
5. It turns on free HTTPS when the domain's DNS points at the VPS.

In hPanel, open **VPS → Browser terminal** and run:

```bash
curl -fsSLo vps-setup.sh https://raw.githubusercontent.com/ameet454/Jobpilot/master/healthpilot/deploy/vps-setup.sh
bash vps-setup.sh yourdomain.com --inspect      # dry run: shows what would be removed
bash vps-setup.sh yourdomain.com                # do it
```

You can add these options in front of the command:
- `OPENROUTER_API_KEY=sk-or-...` turns on the AI features.
- `EMAIL=you@example.com` sets the address for certificate expiry notices.
- `BRANCH=...` deploys a branch other than `master`.

Re-run the same command at any time to deploy the latest code.

## Deploy to Hostinger shared / cloud web hosting

The build is fully static, plus one PHP file for the optional AI features (`api/coach.php`). It uses relative paths, so it works at your domain root (`public_html/`) or in a subfolder (`public_html/health/`).

### Option A — upload a zip (5 minutes)
1. Run `npm run build`, then zip the **contents** of `dist/`. Make sure the hidden `.htaccess` files are included.
2. In hPanel, open **Files → File Manager → public_html** (or a subfolder), upload the zip, then right-click it and choose **Extract**.
3. In hPanel, go to **Security → SSL** and make sure SSL is active. The included `.htaccess` forces HTTPS, which installing the app needs.
4. *(Optional AI)* In `api/`, copy `config.example.php` to `config.php` and paste your OpenRouter key. Web access to that file is blocked.


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

## Credits

The 3-D body is based on the MakeHuman base mesh (CC0 1.0); see `tools/body/`. The muscle labels on its skin are derived from BodyParts3D, Copyright© The Database Center for Life Science, licensed by CC Attribution-Share Alike 2.1 Japan. The derived muscle data in `public/body/` and `public/thumbs/` is shared under the same licence. See `tools/anatomy/`.
