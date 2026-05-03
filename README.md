# Soul Service

Client file system for Maya's soul reading practice. Each row in the directory is a soul; opening it reveals everything she's holding for that person — readings, notes, intentions, where their love work is now.

Built with Next.js 16 (App Router, Turbopack), Drizzle ORM, and Neon Postgres. Designed so swapping Neon → Supabase later is a one-line change.

## First-time setup

```bash
npm install
cp .env.example .env.local   # then fill in DATABASE_URL
npm run db:push              # push schema to Neon
npm run db:seed              # seed with descriptive placeholder data
npm run dev                  # http://localhost:3000
```

## Get a Neon connection string

1. Sign up at [neon.tech](https://neon.tech) (free tier is fine).
2. Create a new project (region near you).
3. From **Connection Details**, copy the **Pooled connection** string.
4. Paste into `.env.local` as `DATABASE_URL=...`.

The pooled URL works for both Vercel deployments and local dev.

## Deploy to Vercel

1. Push this repo to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new), import the repo.
3. Add `DATABASE_URL` as an Environment Variable (Production + Preview + Development).
4. Deploy.

## Migrating to Supabase later

When you're ready to move off Neon:

1. Create a Supabase project, copy its **pooler** connection string.
2. Update `DATABASE_URL` in `.env.local` and Vercel.
3. In `src/db/index.ts`, swap:
   ```ts
   import { neon } from "@neondatabase/serverless";
   import { drizzle } from "drizzle-orm/neon-http";
   ```
   for:
   ```ts
   import postgres from "postgres";
   import { drizzle } from "drizzle-orm/postgres-js";
   ```
   and replace `neon(url)` with `postgres(url)`.
4. Run `npm run db:push` to sync schema, then re-seed if needed.

The schema and all queries are pure Drizzle — they work identically on both providers.

## Architecture

```
src/
├── app/                    # Next.js routes
│   ├── page.tsx            # / · Today's thread (Inbox)
│   ├── souls/page.tsx      # /souls · directory
│   ├── souls/[code]/       # /souls/{code} · single soul file
│   ├── calendar/           # /calendar · week view
│   └── exchange/           # /exchange · global invoices
├── components/             # AppShell, Sidebar, TopBar, TimelineFeed, ReadingsList, WeekCalendar
├── db/
│   ├── schema.ts           # Drizzle schema · single source of truth
│   ├── queries.ts          # Read helpers used by pages
│   ├── index.ts            # Lazy-init Postgres client (proxy)
│   └── seed.ts             # Idempotent seeder
└── lib/format.ts           # Tiny formatting helpers (money, dates, tones)
```

## Scripts

- `npm run dev` — local dev
- `npm run build` — production build
- `npm run db:generate` — generate SQL migrations from schema
- `npm run db:push` — push schema directly to DB (good for prototyping)
- `npm run db:studio` — open Drizzle Studio (DB explorer)
- `npm run db:seed` — wipe + reseed with descriptive placeholder data

## Google Calendar setup (one-time, ~5 min)

For the auto-Meet-link + calendar-invite feature.

1. **Create a Google Cloud project** at <https://console.cloud.google.com/projectcreate>. Name it anything ("Soul Service").
2. **Enable the Google Calendar API:** Cloud Console → APIs & Services → Library → search "Google Calendar API" → Enable.
3. **Configure the OAuth consent screen:** APIs & Services → OAuth consent screen.
   - User type: **External**
   - App name: "Soul Service" (or whatever)
   - User support email + developer contact: your email
   - Scopes: leave blank for now — we request them at runtime
   - Test users: add your own Google account
   - You can leave the app in "Testing" mode forever for personal use
4. **Create OAuth credentials:** APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: **Web application**
   - Name: "Soul Service Web"
   - Authorized redirect URIs (add ALL three you'll need):
     - `http://localhost:3000/api/auth/google/callback` (local dev)
     - `https://your-app.vercel.app/api/auth/google/callback` (your Vercel deploy URL — find in Vercel dashboard)
     - `https://your-domain.com/api/auth/google/callback` (custom domain, if any)
   - Click Create. You'll get a **Client ID** and **Client Secret**.
5. **Add to Vercel env vars** (Project Settings → Environment Variables, all environments):
   - `GOOGLE_CLIENT_ID` = the Client ID
   - `GOOGLE_CLIENT_SECRET` = the Client Secret
   - `APP_URL` = your production URL (e.g. `https://your-app.vercel.app`) — only needed if Vercel's auto-detect picks the wrong one
6. **Add to `.env.local`** for local dev with the same values.
7. **Redeploy.** Then go to /settings → click "Connect Google Calendar" → grant access.

After that, scheduling a session in the app auto-creates a Calendar event with a Meet link and invites the client.

## Status

- ✅ Souls directory + soul file (timeline · readings · documents · soul log · exchange · intake)
- ✅ Week calendar with click-to-open + sabbath day + now-line
- ✅ Global exchange ledger
- ⏳ Auth (skipped for v1 — add Auth.js magic link before going live)
- ⏳ Mutations (Schedule / Write log / Upload all wired as buttons but don't submit yet)
- ⏳ Google Calendar + Meet integration
- ⏳ Stripe integration for the exchange ledger
- ⏳ File uploads (storage TBD when migrating to Supabase or adding Vercel Blob)

## Static prototype

The original click-through prototype (single HTML file, fully descriptive spec) lives at:
- Repo: <https://github.com/vellumagit/soul-service>
- Live: <https://vellumagit.github.io/soul-service/>

This Next.js app is the production-ready version of that spec.
