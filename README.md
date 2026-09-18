# SLC1 QA-QC Dashboard — Setup & Deploy Runbook

A shared, multi-user version of your dashboard. Everyone signs in with their email (a one-tap link — no passwords), sees the same live board, and changes sync in real time. You're the main editor; leads view and can make occasional edits.

This is written for a first-timer. Follow it top to bottom. Total time: about an hour, most of it creating accounts. Everything here is free to start — verify current free-tier limits when you sign up, as they change.

---

## What you're setting up

Three free accounts working together:
- **Supabase** — the shared database + the email sign-in.
- **GitHub** — where the code lives.
- **Vercel** — hosts the app and gives you the URL your team opens.

---

## Step 1 — Install Node.js (one time, on your computer)

1. Go to nodejs.org and install the **LTS** version.
2. Confirm it worked: open Terminal (Mac) or Command Prompt (Windows) and run `node -v` — you should see a version number (18 or higher).

## Step 2 — Create the Supabase project (your database + sign-in)

1. Sign up at supabase.com → **New project**. Pick a name (e.g. `slc1-qaqc-dashboard`), set a database password (save it somewhere), choose a region near you.
2. Wait ~2 minutes for it to provision.
3. Left sidebar → **SQL Editor** → **New query**. Open the file `supabase_schema.sql` from this project, paste the whole thing in, and click **Run**. You should see "Success." This creates the data table and turns on live sync.
4. Left sidebar → **Project Settings → API**. Copy two values, you'll need them next:
   - **Project URL** (looks like `https://abcd1234.supabase.co`)
   - **anon public** key (a long string — this one is safe to expose; your security comes from the rules in the SQL you just ran).

## Step 3 — Run it on your computer first (to confirm it works)

1. Unzip this project somewhere. In Terminal, `cd` into the folder (the one with `package.json`).
2. Run `npm install` (downloads the pieces — takes a minute).
3. Make your settings file: copy `.env.example` to a new file named `.env`, open it, and paste your two Supabase values in.
4. Run `npm run dev`. It prints a local address (like `http://localhost:5173`). Open it.
5. You'll see the sign-in screen. Enter your email → check your inbox → click the link. You're in. The first person to sign in seeds the starting data.

If that works locally, it will work hosted.

## Step 4 — Put the code on GitHub

1. Sign up at github.com → **New repository** → name it `slc1-qaqc-dashboard` → **Private** → Create.
2. Follow GitHub's "…or push an existing repository" instructions, OR use their **Upload files** button to drag the whole project folder in. (Do **not** upload the `.env` file — it's personal to you and already excluded.)

## Step 5 — Deploy on Vercel (get your live URL)

1. Sign up at vercel.com with your GitHub account.
2. **Add New → Project** → import your `slc1-qaqc-dashboard` repo.
3. Before deploying, open **Environment Variables** and add the same two values from Step 2:
   - `VITE_SUPABASE_URL` → your Project URL
   - `VITE_SUPABASE_ANON_KEY` → your anon public key
4. Click **Deploy**. After a minute you get a live URL like `slc1-qaqc-dashboard.vercel.app`.

## Step 6 — Point sign-in at your live URL

1. Back in Supabase → **Authentication → URL Configuration**.
2. Set **Site URL** to your Vercel URL (`https://slc1-qaqc-dashboard.vercel.app`).
3. Add the same URL under **Redirect URLs**. Save.

This makes the email links open your hosted app instead of localhost.

## Step 7 — Invite your team

Just send them the URL. Each person enters their work email, clicks the link, and they're in — no accounts to create, no passwords. Everyone shares the same live board.

---

## Bringing your beta data over

Your current beta (in the Claude chat) holds whatever you've entered there. To move it:
1. Ask me to add an **Export** button to the beta — you'll download a `.json` file.
2. In the live app, click **Import** (top-right) and choose that file.

The live app also has **Export** built in — use it now and then for backups.

---

## Good to know

- **Who can edit:** right now anyone signed in can edit, since your leads occasionally do. To make it view-only for everyone except you, the bottom of `supabase_schema.sql` has the exact SQL to switch to an "editors" list.
- **Simultaneous edits:** the whole board saves as one document (last-write-wins). Since you're the main editor, that's fine — but if two people edit the same second, the later save wins. When you outgrow that, the next step is splitting the data into separate tables.
- **Cost:** all three services have free tiers that fit a team your size. You'd only pay if it grows a lot.
- **Updating the app later:** when I give you new code, replace the files in your GitHub repo (or re-upload) — Vercel redeploys automatically.

---

## What's in this project

```
slc1-qaqc-dashboard/
├─ index.html              # page shell
├─ package.json            # dependencies + scripts
├─ vite.config.js          # build config
├─ .env.example            # copy to .env, add your Supabase keys
├─ supabase_schema.sql     # run once in Supabase to create the database
├─ README.md               # this file
└─ src/
   ├─ main.jsx             # sign-in gate + login screen
   ├─ App.jsx              # the dashboard (your app)
   └─ supabaseClient.js    # connects to Supabase
```
