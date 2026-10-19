# Feedback board (TriageOps)

Internal board for logging feedback on a web app (UI, UX, frontend, backend, API, performance), tracking fixes with a
two-person verify step, and importing feedback from a shared Google Doc. Next.js + Postgres.

## Run it

1. Create a Supabase project. In **Project Settings → Database → Connection string**, copy the **Transaction pooler**
   string (port 6543) and put your database password in it.
2. Put it in `.env.local` (never commit this file):

   ```
   DATABASE_URL=postgresql://postgres.xxxx:YOUR-PASSWORD@aws-0-xx.pooler.supabase.com:6543/postgres
   ```

3. `npm install`, then `npm run dev` and open http://localhost:3000.

The tables are created automatically the first time the app talks to the database. Any Postgres works, not just Supabase.

## Deploy on Vercel

1. Import this repository in Vercel.
2. Add one environment variable, `DATABASE_URL` (same value as above), for Production, Preview and Development.
3. Deploy. `vercel.json` registers a daily cron (`/api/sync/cron`) as a safety-net Google Doc sync.

The board has no login. Anyone with the URL can read and edit it.

## Google Doc sync

Open **Google Doc Sync** in the sidebar for the full instructions. In short: share the doc as "Anyone with the link: Viewer",
add teammates as Editors, paste the link, and have everyone write under `Reporter: Their Name`.

On Vercel there is no always-on process, so the sync runs about once a minute while someone has the board open, and once a day
from the cron. Tune the settle delay (how long an entry must stay unchanged before it is imported, default 45 s) with
`GDOC_SETTLE_MS`.

## Moving data from the old SQLite version

```
DATABASE_URL="postgresql://..." node scripts/import-sqlite.mjs data/feedback.db
```

Safe to run more than once. Needs Node 22 or newer.
