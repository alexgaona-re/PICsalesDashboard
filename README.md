# PIC KPI Sales Dashboard

Activity-based KPI dashboard pulling data from Close CRM's "PIC KPI Tracker" report. Built with Flask (backend) and React + Vite (frontend).

## Quick Start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt

# Create .env with your Close API key
echo "CLOSE_API_KEY=your_key_here" > .env

python app.py
```

The API runs at `http://localhost:5000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Opens at `http://localhost:3000` — API calls proxy to the Flask backend.

### Production Build

```bash
cd frontend
npm run build
```

Serve the `frontend/dist/` directory with any static file server, pointing API calls at the Flask backend.

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
