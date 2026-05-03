# Soul Service

A quiet, personal client workspace for one-on-one practitioners. Each row in the directory is a person; opening it reveals everything you'd want to remember about them — sessions, notes, the people in their life, what's worth handling gently. Designed to be a fresh slate the practitioner shapes into her own way of working over time.

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
│   ├── signin/             # /signin · magic-link request page
│   ├── auth/verify/        # GET handler that consumes a magic-link token
│   ├── clients/            # /clients · directory + /clients/[id] · client file
│   ├── calendar/           # /calendar · week view
│   ├── payments/           # /payments · invoices + ledger
│   ├── settings/           # /settings · biz info, integrations, templates
│   └── api/auth/google/    # Google Calendar OAuth callback
├── components/             # AppShell, Sidebar, ClientHeader, SessionCard, etc.
├── db/
│   ├── schema.ts           # Drizzle schema · single source of truth
│   ├── queries.ts          # Read helpers used by pages
│   ├── index.ts            # Lazy-init Postgres client (Proxy-wrapped)
│   └── migrate.ts          # Apply SQL migrations non-interactively
├── lib/
│   ├── actions.ts          # All server actions (mutations, sends, OAuth starts)
│   ├── auth-actions.ts     # `requestMagicLink`, `signOutAction`
│   ├── auth-tokens.ts      # Token issue/consume helpers (server-only)
│   ├── session.ts          # JWT primitives — usable from proxy.ts
│   ├── session-cookies.ts  # `requireSession`, `setSessionCookie` — uses next/headers
│   ├── resend.ts           # Resend client + magic-link email + sendEmail()
│   ├── google-calendar.ts  # OAuth + Calendar/Meet event CRUD
│   ├── ai-notes.ts         # Claude Sonnet 4.6 transcript→notes
│   └── format.ts           # Tiny formatting helpers (money, dates, tones)
└── proxy.ts                # Next.js 16 renamed middleware — gates protected routes
```

## Scripts

- `npm run dev` — local dev
- `npm run build` — production build
- `npm run db:generate` — generate SQL migrations from schema
- `npm run db:push` — push schema directly to DB (good for prototyping)
- `npm run db:studio` — open Drizzle Studio (DB explorer)
- `npm run db:seed` — wipe + reseed with descriptive placeholder data

## Auth setup (magic-link sign-in)

The app is locked to an allowlist of emails. Anyone whose email isn't on the list
silently gets the same "check your inbox" message they would on success — we
never leak who has access.

1. **Generate a session secret** (≥32 chars):
   ```bash
   openssl rand -base64 32
   ```
   Set it as `AUTH_SECRET` in `.env.local` and Vercel.

2. **Sign up for Resend** at <https://resend.com> (free tier covers thousands of
   emails/month). Create an API key and set it as `RESEND_API_KEY`.

3. **Pick a From address**:
   - For testing: use `Soul Service <onboarding@resend.dev>` (default if unset).
   - For production: verify a domain in Resend → use `Soul Service <hello@yourdomain.com>`.
   Set it as `AUTH_EMAIL_FROM`.

4. **Set the allowlist** as a comma-separated list:
   ```bash
   ALLOWED_EMAILS=svitlana@example.com,backup@example.com
   ```

5. **Visit `/signin`**, enter your email, click the link in your inbox, you're in.
   Sessions last 30 days and live in an HTTP-only cookie. Sign out from the
   sidebar footer.

> **Why no `users` table?** Single-tenant app — Svitlana is the only user.
> Removing an email from `ALLOWED_EMAILS` immediately revokes access on the
> next request, no DB change needed.

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

- ✅ Clients directory + client file (timeline · sessions · documents · log · payments · intake)
- ✅ Week calendar with click-to-open + sabbath day + now-line
- ✅ Global exchange ledger
- ✅ Auth — magic-link sign-in via Resend, allowlist gate
- ⏳ Mutations (Schedule / Write log / Upload all wired as buttons but don't submit yet)
- ⏳ Google Calendar + Meet integration
- ⏳ Stripe integration for the exchange ledger
- ⏳ File uploads (storage TBD when migrating to Supabase or adding Vercel Blob)

## Static prototype

The original click-through prototype (single HTML file, fully descriptive spec) lives at:
- Repo: <https://github.com/vellumagit/soul-service>
- Live: <https://vellumagit.github.io/soul-service/>

This Next.js app is the production-ready version of that spec.
