# StackForge AI — Step-by-Step Launch Guide

Estimated time: 2–3 hours start to finish.
Cost: $0 until you exceed free tiers (thousands of users away).

---

## STEP 1 — Get your accounts ready (15 min)

Create accounts at these four services (all free):

1. **github.com** — stores your code
2. **vercel.com** — hosts your app (sign up with GitHub)
3. **supabase.com** — auth + database
4. **app.lemonsqueezy.com** — payments

---

## STEP 2 — Set up Supabase (10 min)

1. Go to supabase.com → New Project
2. Name it `stackforge` — pick any region near your users — set a strong DB password
3. Wait ~2 minutes for the project to provision
4. Go to **SQL Editor** → paste the entire contents of `supabase-schema.sql` → click Run
5. Go to **Settings → API** and copy:
   - **Project URL** → this is your `VITE_SUPABASE_URL`
   - **anon public key** → this is your `VITE_SUPABASE_ANON_KEY`
   - **service_role secret key** → this is your `SUPABASE_SERVICE_ROLE_KEY` (keep this secret)
6. Go to **Authentication → URL Configuration**:
   - Set Site URL to: `https://stackforgeai.com` (or your Vercel URL for now — update later)
   - Add `https://your-app.vercel.app` to Redirect URLs

---

## STEP 3 — Set up Lemon Squeezy (20 min)

1. Go to app.lemonsqueezy.com → create a store
   - Store name: StackForge AI
   - Store URL slug: `stackforgeai` (gives you `stackforgeai.lemonsqueezy.com`)

2. **Create your product:**
   - Products → New Product
   - Name: `StackForge AI`
   - Type: Subscription
   - Add variant: `Monthly Plan` → $20/month
   - Description: "Generate production-ready DevOps stacks in 90 seconds."
   - Click Save — copy the **variant ID** from the URL (number at the end)

3. **Get your checkout URL:**
   - Format: `https://stackforgeai.lemonsqueezy.com/checkout/buy/YOUR_VARIANT_ID`
   - This is your `VITE_LS_CHECKOUT_URL`

4. **Set up the webhook** (critical — this activates accounts after payment):
   - Go to Settings → Webhooks → Add Webhook
   - URL: `https://your-app.vercel.app/api/webhook`
     (you'll update this after deploying to Vercel — come back here)
   - Events to subscribe to (check all of these):
     - subscription_created
     - subscription_updated
     - subscription_cancelled
     - subscription_expired
     - subscription_paused
     - subscription_resumed
     - subscription_payment_failed
   - Click Save — copy the **Signing Secret** → this is your `LEMONSQUEEZY_WEBHOOK_SECRET`

---

## STEP 4 — Prepare your code (10 min)

1. Copy your `StackForge.jsx` file (the app) into `src/StackForge.jsx`

2. Open `src/StackForge.jsx` and find the `callClaude` function:
   ```js
   const callClaude = async (system, user) => { ... }
   ```
   Replace the entire function with this one import:
   ```js
   // At the top of the file, add:
   import { callClaude } from './api.js'
   ```
   And delete the old `callClaude` function body entirely.

3. Copy `.env.example` to `.env.local` and fill in all the values:
   ```
   VITE_SUPABASE_URL=https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbG...
   VITE_LS_CHECKOUT_URL=https://stackforgeai.lemonsqueezy.com/checkout/buy/12345
   VITE_LS_STORE_SLUG=stackforgeai
   ```
   Note: The server-side keys (SUPABASE_SERVICE_ROLE_KEY, ANTHROPIC_API_KEY,
   LEMONSQUEEZY_WEBHOOK_SECRET) go in Vercel's dashboard, NOT in .env.local.

4. Create a `.gitignore` file:
   ```
   .env.local
   .env
   node_modules/
   dist/
   ```

---

## STEP 5 — Push to GitHub (5 min)

1. Go to github.com → New repository
2. Name: `stackforge-app`, Private, no README (we'll push our own files)
3. In your terminal:
   ```bash
   cd stackforge-app
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOURUSERNAME/stackforge-app.git
   git push -u origin main
   ```

---

## STEP 6 — Deploy to Vercel (10 min)

1. Go to vercel.com → Add New Project
2. Import your `stackforge-app` GitHub repository
3. Framework: Vite (Vercel detects this automatically)
4. Build command: `npm run build`
5. Output directory: `dist`

6. **Add environment variables** (click Environment Variables before deploying):
   ```
   VITE_SUPABASE_URL              = https://xxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY         = eyJhbG...
   VITE_LS_CHECKOUT_URL           = https://stackforgeai.lemonsqueezy.com/checkout/buy/...
   VITE_LS_STORE_SLUG             = stackforgeai
   SUPABASE_SERVICE_ROLE_KEY      = eyJhbG... (the secret one)
   ANTHROPIC_API_KEY              = sk-ant-...
   LEMONSQUEEZY_WEBHOOK_SECRET    = your-signing-secret
   ALLOWED_ORIGIN                 = https://your-app.vercel.app
   ```

7. Click **Deploy** — takes about 90 seconds
8. Your app is live at `https://your-app.vercel.app`

---

## STEP 7 — Wire everything together (5 min)

Now that you have a Vercel URL:

1. **Update Lemon Squeezy webhook URL:**
   - Settings → Webhooks → Edit your webhook
   - URL: `https://your-app.vercel.app/api/webhook`

2. **Update Supabase redirect URLs:**
   - Authentication → URL Configuration
   - Add `https://your-app.vercel.app` to Redirect URLs
   - Update Site URL if you don't have a custom domain yet

3. **Update Vercel ALLOWED_ORIGIN:**
   - Settings → Environment Variables → edit ALLOWED_ORIGIN
   - Set to your actual URL
   - Redeploy (click Deployments → Redeploy)

---

## STEP 8 — Test the full flow (15 min)

1. Go to your Vercel URL
2. Click "Subscribe — $20/month"
3. Use Lemon Squeezy's test card: `4242 4242 4242 4242`, any future expiry, any CVC
4. Complete checkout
5. Come back to your app URL
6. Create an account with the same email you used in checkout
7. You should see the StackForge dashboard (not the subscribe wall)
8. Generate a stack — verify it works end to end

If it doesn't work after step 7, check:
- Supabase → Table Editor → subscriptions — does a row exist for your email?
- Vercel → Functions logs — any errors in `/api/webhook`?

---

## STEP 9 — Add a custom domain (15 min)

1. Buy `stackforgeai.com` on Namecheap.com (~$10/year)
2. Vercel → your project → Settings → Domains → Add Domain → type `stackforgeai.com`
3. Vercel shows you two DNS records to add — copy them
4. Go to Namecheap → your domain → Advanced DNS → add those records
5. Wait 5–30 minutes for DNS to propagate
6. Vercel auto-provisions SSL — your site is live at `stackforgeai.com` with HTTPS

7. Update everywhere:
   - Supabase: Authentication → URL Config → set Site URL to `https://stackforgeai.com`
   - Vercel: env var `ALLOWED_ORIGIN` → `https://stackforgeai.com`
   - Lemon Squeezy: webhook URL → `https://stackforgeai.com/api/webhook`

---

## STEP 10 — Point landing page to your app (5 min)

Open your `stackforge-landing.html` and update the Buy buttons:
```html
<!-- Replace href="#" with your Lemon Squeezy checkout URL: -->
<a href="https://stackforgeai.lemonsqueezy.com/checkout/buy/YOUR_VARIANT_ID" ...>
```

Deploy the landing page to a separate Netlify site:
- Rename the file to `index.html`
- Drag to netlify.com/drop
- In Netlify site settings → change domain to `stackforgeai.netlify.app`
- Later: point `stackforgeai.com` here (or to Vercel — dealer's choice)

---

## MONITORING CREDENTIAL SHARING

When someone shares credentials, you'll see it in:

1. **Vercel logs** (`vercel logs your-app` or the Functions dashboard):
   ```
   [SHARING DETECTED] user=abc123 prev_ip=1.2.3.4 new_ip=5.6.7.8 mins_ago=3.2
   ```

2. **Supabase Table Editor** → subscriptions → `last_ip` column
   - If you see two different IPs hitting within 15 minutes, that's credential sharing

To ban a specific account:
- Supabase → Table Editor → subscriptions → find their row
- Change `status` from `active` to `suspended`
- They'll immediately see the subscription wall

---

## FREE TIER LIMITS (when you'll start paying)

| Service      | Free limit                        | Cost when exceeded     |
|--------------|-----------------------------------|------------------------|
| Vercel       | 100GB bandwidth, 100K req/day     | $20/month Pro          |
| Supabase     | 500MB DB, 50K MAU                 | $25/month Pro          |
| Lemon Squeezy| No limit                          | 5% + $0.50 per txn     |
| Anthropic    | Pay per token always              | ~$0.05–0.15 per gen    |

## COST MATH — your Anthropic key covers all users

You pay Anthropic per token. Users pay you $20/month flat. Here's how the numbers work:

| Scenario | Anthropic cost | Your revenue | Margin |
|----------|---------------|--------------|--------|
| 10 users, 20 gen/mo each  | ~$20   | $200   | 90% |
| 50 users, 20 gen/mo each  | ~$100  | $1,000 | 90% |
| 100 users, 20 gen/mo each | ~$200  | $2,000 | 87% |
| 200 users, 20 gen/mo each | ~$400  | $4,000 | 88% |

Each full generation costs roughly $0.08–$0.15 in Anthropic tokens.
The 50/day per-user limit protects against power users burning through your budget.
At normal usage (5–20 generations/month), your Anthropic bill is comfortably covered.

At 100 subscribers ($2,000/month revenue), total monthly costs:
- Vercel Pro: $20
- Supabase Pro: $25
- Anthropic API: ~$200 (100 users × 20 avg generations × $0.10)
- Lemon Squeezy fees: ~$115 (5.75% of $2,000)
= **~$360/month costs on $2,000 revenue = 82% margin**

**If a user abuses it** (hits 50/day limit every day = 1,500 gen/month):
- Their Anthropic cost to you: ~$150/month
- They're paying you $20
- Solution: lower the limit, or add a "heavy user" tier at $49/month
