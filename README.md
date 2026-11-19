# Habit Tracker - Backend

This is the backend of the Habit Tracker application, built with Node.js, Express, and MongoDB.

## Deploying to Render

Create a Render Web Service with:

- Root directory: `server`
- Build command: `npm ci`
- Start command: `npm start`
- Node.js: 22.x (22.13 or newer)
- Health check path: `/api/health`

Set these environment variables in Render:

- `MONGODB_URI` — MongoDB Atlas connection string
- `JWT_SECRET` — long, random signing secret
- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` — generated Web Push keys
- `FRONTEND_URL` — `https://habbitracker-frontend.vercel.app`
- `GOOGLE_CLIENT_ID` — Google OAuth web client ID used to verify Google ID tokens
- `RESEND_API_KEY` — a newly generated Resend API key; never commit it
- `MAIL_FROM` — sender address on a domain verified in Resend
- `OTP_EXPIRY_MINUTES` — OTP lifetime (default 10)
- `OTP_MAX_ATTEMPTS` — wrong-code limit before invalidation (default 5)
- `RESET_TOKEN_EXPIRY_MINUTES` — one-use reset token lifetime (default 10)

Render supplies `PORT`. The health check returns 200 only after MongoDB is connected. Allow the Render service's outbound IP addresses in MongoDB Atlas Network Access; avoid opening the database to all IPs if possible.

Set the same Google OAuth web client ID as `VITE_GOOGLE_CLIENT_ID` in the Vercel frontend. Configure the production and local frontend origins as authorized JavaScript origins in Google Cloud. The client ID is public; do not put a Google client secret in the frontend.

Locally, the frontend uses `VITE_GOOGLE_CLIENT_ID` from `.env.example` only as a fallback when it is absent from the active Vite mode environment. The backend uses `GOOGLE_CLIENT_ID` from its `.env.example` only when it is absent from `.env` and the hosting environment. Other backend settings still come from `.env` or the hosting environment.

## Production hardening

The server uses the in-memory rate-limit and LRU stores only; they reset when the Render instance restarts or sleeps. Finance and habit responses are intentionally not cached because they contain private user data. The cache helper requires user-scoped keys and mutation handlers invalidate that user's namespace.

Finance writes and task creation may send an `Idempotency-Key` header. Existing clients may omit it. Active idempotency records are capped per user and expire after the configured TTL. Login lockout and idempotency records use MongoDB TTL indexes; allow time for Atlas's TTL monitor to remove expired records. Confirm M0 storage has room for these collections and their indexes before deployment.

Optional pagination is enabled only when `page` or `limit` is present on habit, habit-history, or finance-category list requests. Existing requests still receive arrays and retain their current response shape. Pagination metadata is returned in `X-Total-Count`, `X-Page`, `X-Limit`, and `X-Has-More`. Tasks, finance months, and goals remain unpaginated; list hard caps and request limits are configurable in `.env.example`.

For a free-tier wake-up monitor, create an UptimeRobot HTTP(s) monitor for `/api/health`. Check Render's current free-tier usage limits and terms; frequent monitoring can reduce sleep but does not guarantee availability or bypass platform limits.

## Local Development

### Prerequisites

- [Node.js](https://nodejs.org/) (22.13 or higher, within Node 22)
- [MongoDB](https://www.mongodb.com/) (Local or Atlas)
- [npm](https://www.npmjs.com/)

### Installation

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Copy `.env.example` to `.env` in the `server` directory and set:
   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_connection_string
   JWT_SECRET=your_long_random_secret
   VAPID_PUBLIC_KEY=your_vapid_public_key
   VAPID_PRIVATE_KEY=your_vapid_private_key
   FRONTEND_URL=http://localhost:5173
   GOOGLE_CLIENT_ID=your_google_oauth_client_id
   RESEND_API_KEY=your_new_resend_api_key
   MAIL_FROM="Habit Tracker <no-reply@your-verified-domain.com>"
   OTP_EXPIRY_MINUTES=10
   OTP_MAX_ATTEMPTS=5
   RESET_TOKEN_EXPIRY_MINUTES=10
   ```

Use the same settings in the backend host's environment configuration. Create a new Resend key and verify the sender domain before testing delivery. Do not reuse the compromised key or put any Resend key in source control.

### Running the Server

To start the server in development mode (with nodemon):
```bash
npm run dev
```

To start the server in production mode:
```bash
npm start
```

The server will be available at `http://localhost:5000`. The health endpoint is `http://localhost:5000/api/health`.
