# JobPilot v2 — AI Job Command Centre

India's first AI job command centre. Real jobs from LinkedIn, Indeed, Glassdoor & 300+ company boards — ranked by your match score. Tailored resume in 2 minutes.

## Deploy to Vercel (5 minutes)

```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Login to Vercel
vercel login

# 3. Deploy
cd C:\Users\Amit\jobpilot
vercel --prod
```

When prompted:
- **Set up and deploy**: Yes
- **Which scope**: Your account
- **Link to existing project**: No
- **Project name**: jobpilot
- **Directory**: ./
- **Override settings**: No

## Add Environment Variables

After first deploy, go to **Vercel Dashboard → jobpilot project → Settings → Environment Variables** and add:

| Variable | Value | Required |
|---|---|---|
| `OPENROUTER_API_KEY` | `sk-or-v1-...` | ✅ Yes |
| `JSEARCH_API_KEY` | `your-rapidapi-key` | Recommended |

Then redeploy: `vercel --prod`

## Architecture

```
jobpilot/
├── index.html        ← Full product (single HTML, 132KB)
├── api/
│   ├── ai.js         ← OpenRouter proxy (server-side key)
│   └── search.js     ← JSearch proxy (server-side key)
├── vercel.json       ← CSP headers + routing
└── package.json
```

**User flow (hosted):**
1. Visit `yourproject.vercel.app`
2. Click "Try live demo" OR upload resume
3. No API keys needed — all calls go through `/api/ai` and `/api/search`
4. Real jobs fetched, AI-scored, tailored resume generated
5. Download as .docx

## Local Development

```bash
# Copy env vars
cp .env.example .env.local
# Edit .env.local and add your keys

# Run locally
vercel dev
# → http://localhost:3000
```

## Pricing Model

| Plan | Price | What's included |
|---|---|---|
| Free | ₹0 | Demo mode, 3 tailored resumes |
| Active | ₹499 | Unlimited scan + tailoring (implement via Razorpay) |

**Unit economics at 100 users:**
- OpenRouter cost: ~$15-40/month
- JSearch cost: ~$10/month  
- Revenue at ₹499: ~₹49,900/month
- Net margin: ~90%
