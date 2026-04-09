# PIC KPI Sales Dashboard

Activity-based KPI dashboard pulling data from Close CRM's "PIC KPI Tracker" report. React + Vite frontend with Netlify Functions (serverless) for the API.

## Deploy to Netlify

1. Push this repo to GitHub
2. Connect the repo in [Netlify](https://app.netlify.com)
3. Set the environment variable in **Site settings > Environment variables**:
   - `CLOSE_API_KEY` = your Close API key
4. Deploy — Netlify auto-detects `netlify.toml`, builds the frontend, and deploys the serverless functions

Build settings are pre-configured in `netlify.toml`:
- **Build command**: `cd frontend && npm install && npm run build`
- **Publish directory**: `frontend/dist`
- **Functions**: `netlify/functions` (auto-detected)

Agent commission configs and deal equity overrides are persisted via Netlify Blobs (built-in KV storage).

## Local Development

### Option A — Netlify CLI (recommended)

```bash
npm install
cd frontend && npm install && cd ..
npx netlify dev
```

Runs everything on one port with functions and frontend together.

### Option B — Flask + Vite (standalone)

```bash
# Terminal 1 — Flask backend
cd backend
pip install -r requirements.txt
echo "CLOSE_API_KEY=your_key_here" > .env
python app.py

# Terminal 2 — Vite dev server (proxies /api to Flask)
cd frontend
npm install
npm run dev
```

Flask API at `http://localhost:5000`, frontend at `http://localhost:3000`.

## Features

- **Dashboard**: Activity, conversion rates, equity/revenue, commission & projections, deeds signed
- **Leaderboard**: Ranked agent view, sortable by any column (defaults to Commission MTD)
- **Agent Config**: Per-agent commission rate settings (default 15%, junior acquisitions 5%)
- **Views**: Daily / Weekly / Monthly / Year-to-date with team-total and per-agent dropdown
- **Auto-refresh**: Data refreshes every 15 minutes + manual refresh button
- **Dynamic agents**: Agent list pulled from Close API — new users appear automatically

## Data Sources

| Metric | Close Source |
|--------|-------------|
| Total Calls Made | Outbound calls (external) |
| SMS/Voicemails | "No Answer/SMS" call disposition |
| Emails Sent | Outgoing manual emails |
| Offers Made | "Offer Made" call disposition |
| Made Contact | Sum of: Made Contact + Not Interested + Offer Made + Offer Accepted |
| Deeds Signed | Opportunities with status type "won" (Deed(s) Purchased — Closed) |
| Revenue/Equity | Opportunity value from won deals |
