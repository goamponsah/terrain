# Terrain v2 — With Database & Authentication

## What's new in v2
- User registration and login
- Lodge data saves to PostgreSQL database
- Data persists across sessions and devices
- Each lodge has their own private account

## Deploy to Railway

### Step 1 — Add PostgreSQL database
1. In your Railway project, click **+ New**
2. Select **Database** → **PostgreSQL**
3. Railway creates the database and sets DATABASE_URL automatically

### Step 2 — Add environment variables
In your Railway service settings → Variables, add:
```
JWT_SECRET=your-random-secret-string-here
NODE_ENV=production
```
For JWT_SECRET use any long random string e.g. `terrain-jwt-2026-xK9mP2qR8vN4`

### Step 3 — Deploy
Push this code to GitHub, Railway deploys automatically.
The database tables are created automatically on first run.

## Environment Variables Required
- `DATABASE_URL` — Set automatically by Railway PostgreSQL
- `JWT_SECRET` — Any secret string for signing login tokens
- `NODE_ENV` — Set to `production`

## File Structure
```
server.js          — Express server + all API routes
public/
  login.html       — Login page (default landing)
  register.html    — Registration + trial signup
  onboarding.html  — 5-step setup wizard (saves to DB)
  dashboard.html   — Revenue dashboard (loads from DB)
  packages.html    — Package pricing
  forecast.html    — Demand forecasting
  channels.html    — Channel mix
  styles.css       — Shared styles
  app.js           — Shared JS
```

## User Flow
1. Lodge owner visits getonterrain.com
2. Clicks "Create Free Account" → register.html
3. Completes 5-step onboarding → data saved to PostgreSQL
4. Redirected to personalized dashboard
5. Can log back in anytime and data is there
