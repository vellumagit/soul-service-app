# Soul Service — Setup Instructions

A concrete checklist to turn on the recently-shipped features. Roughly 30 minutes start to finish if you do all of them. Each section can stand alone; skip whatever you're not using yet.

Whenever this doc says `<your-vercel-domain>`, substitute your actual Vercel deployment URL (e.g. `https://soulservice.app`).

---

## Step 0 — Sanity check (1 min)

Open `https://<your-vercel-domain>/status`. Anything green is already configured. Skip those sections. Focus on the amber rows.

---

## Step 1 — Lead capture (5 min, zero env vars)

This is already live. No environment variables, no third-party services. Create a form and wire it up.

1. Go to **`/network/forms`** → click **"New form"**.
2. Fill in:
   - **Name**: e.g. "Grief PDF download"
   - **Default source / intent**: "downloaded the grief PDF" (this fills the "From" line when you accept the lead)
   - **Webhook URL**: leave blank for now (we'll come back to Make.com)
   - **Auto-accept**: leave OFF until you trust the source
3. Click **Create form**. A modal pops up with the **bearer token**. **Copy it immediately** — it's shown exactly once. If you lose it, you have to rotate to get a fresh one.
4. Wire the token into your lead magnet form code:
   ```bash
   curl -X POST 'https://<your-vercel-domain>/api/leads/intake' \
     -H 'Authorization: Bearer lf_yourtoken' \
     -H 'Content-Type: application/json' \
     -d '{"email":"test@example.com","name":"Test Lead","intent":"testing"}'
   ```
5. Check **`/network/inbox`** — your test submission should be there.
6. Click **Accept** → it becomes a Network entry at `/clients/<id>`.

Done. Lead capture works.

### Notes
- Aliases accepted: `full_name`, `email_address`, `phone_number` (in addition to `name`, `email`, `phone`).
- Honeypot field: a non-empty `_hp` field → silent 204 (bot sees "success", we store nothing).
- Per-token rate limit: 30 submissions/minute.
- 24h email dedup per form: repeat submissions are marked `duplicate` (visible under the "All" filter).
- Token rotation is the kill switch if a token leaks.

---

## Step 2 — Recall.ai auto-notes (15 min — the big magic feature)

The meeting-bot flow. Needs an account, three env vars, and one webhook URL registered on Recall's dashboard.

### 2a. Sign up + collect credentials

1. Sign up at **recall.ai** (pick **`us-east-1`** region unless you have a reason to pick EU).
2. Add a payment method. Recall is pay-per-use, no monthly subscription — ~$0.30-0.50 per session-hour.
3. In the dashboard:
   - **Developers → API Keys** → create a key. Copy it.
   - Same page → **"Create Workspace Secret"** → for verifying webhooks. Copy it (starts with `whsec_...`).

### 2b. Set env vars in Vercel

Project → Settings → Environment Variables → add these three to **all environments** (Production + Preview + Development):

```
RECALL_API_KEY=<the API key from step 2a>
RECALL_REGION=us-east-1
RECALL_WEBHOOK_SECRET=whsec_<the workspace secret>
```

Also add the same three lines to `.env.local` for local dev.

After saving, **redeploy** the latest commit (or wait for the next push).

### 2c. Register the webhook on Recall's dashboard

1. Recall dashboard → **Webhooks** → **Create webhook**.
2. **Endpoint URL**: `https://<your-vercel-domain>/api/webhooks/recall`
3. **Subscribed events**: check **`bot.status_change`** and **`transcript.done`**.
4. Save.

### 2d. Confirm + enable

1. Open `/status` → the **"Auto-notes — meeting notetaker bot (Recall.ai)"** row should be green.
2. Open `/settings` → **Auto-notes** section → toggle **"Use the Recall.ai notetaker"** ON. Pick a bot name (default "Notetaker" — keep it neutral; this is what clients see).
3. Decide on **"Auto-add to every scheduled session"** — ON = fully automatic; OFF = use the per-session "Add notetaker" button.

### 2e. Test it

1. Schedule a session in Soul Service with a Meet URL, **>11 minutes in the future** (Recall's hard minimum for scheduled bots).
2. Watch the chip on the session card cycle: *Bot scheduled → Bot joining… → Bot recording → Notes incoming… → ✓ Auto-notes*.
3. After the meeting ends, the structured notes should be on the session within ~2 minutes.

If the chip stays at "Bot scheduled" past the meeting time (Motion.ai-style no-show), hit the **"Add notetaker"** button — it spawns a fresh bot to join immediately.

---

## Step 3 — OpenAI Whisper (5 min — fallback for non-Meet sessions)

Powers the **"From audio"** button on session cards (in-person sessions, voice-memo dictation, audio files from anywhere). Recall handles the Meet case; Whisper handles everything else.

1. Sign up at **platform.openai.com** (separate from ChatGPT — different product).
2. Add a payment method, put **$5 minimum prepaid** on it. Set a monthly spend cap of $10 in billing settings as a guardrail.
3. Generate an API key.
4. Vercel env vars (all envs): `OPENAI_API_KEY=sk-...`
5. Same in `.env.local` for local dev.
6. Redeploy. `/status` → "Voice memos → notes (Whisper + AI)" row flips green.
7. **Test:** open any session card → "From audio" → tap the record button, talk for 30 seconds, tap stop, then "Transcribe → Notes."

Whisper pricing: $0.006/min of audio. $5 buys you ~14 hours of transcription.

---

## Step 4 — Make.com integration (optional, 10 min)

Only do this if you want **automatic** thank-you emails / mailing list sync / Slack pings when a lead arrives. Soul Service intentionally doesn't send these — Make.com does.

1. In Make.com, create a new scenario.
2. **Trigger**: search for "Webhooks" → **Custom webhook**. Click "Add" → it generates a unique URL like `https://hook.us2.make.com/abc...`. Copy it.
3. Back in Soul Service: `/network/forms` → click **Edit** on the form you created → paste the Make.com URL into **Outbound webhook URL** → Save.
4. In Make.com, click "Redetermine data structure" then submit a test lead through your form. Make.com captures the payload shape — you'll see:
   ```json
   {
     "event": "lead.received",
     "form": { "id": "...", "name": "...", "slug": "..." },
     "submission": {
       "id": "...", "name": "...", "email": "...",
       "phone": "...", "fields": { ... }, "receivedAt": "..."
     },
     "promotedClientId": null
   }
   ```
5. Add downstream modules: send Gmail/Resend, add to ConvertKit, post to Slack, whatever. Use `submission.email` etc. as the inputs.
6. Turn the scenario ON.

---

## Verification pass

Run after everything is configured:

| What | How to verify |
|---|---|
| Lead capture | Submit a test lead via curl → see it in `/network/inbox` → Accept → see it in `/clients/<id>` |
| Recall.ai | Schedule a test session >11min future → watch the chip cycle → notes appear after |
| Whisper | "From audio" on any session → record 30s → notes appear |
| Make.com | Submit a test lead → check that the Make.com scenario fired |

---

## Suggested order if time-constrained

If you've only got an hour:

1. **Lead capture** (5 min) — instant value, no env vars
2. **Recall.ai** (15 min) — biggest leverage feature
3. **OpenAI Whisper** (5 min) — quick win, $5 covers months
4. Skip Make.com until you've got a real lead magnet live and a thank-you email worth automating

---

## Per-account configuration she does once (not env vars)

These happen inside the running app, not in Vercel:

- **Google Calendar OAuth** — Settings → "Google Calendar & Meet" → Connect. Per-account, so Svit + Brian connect separately.
- **Recall bot name** — Settings → Auto-notes → "Bot name." Default "Notetaker." This is what clients see in the participant list during a session.
- **Sabbath days** — Settings → "Sabbath days" → toggle whichever weekdays she keeps for herself.
- **Reminder cadence** — Settings → Automations → client reminder hours, practitioner reminder hours.
- **Email + note templates** — Settings → Email templates / Note templates.
- **First lead capture form** — `/network/forms` → New form.
