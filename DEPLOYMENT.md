# Docuhotel — Deployment guide

End-to-end guide to take Docuhotel from this repo to a live production URL backed by Supabase (Postgres + Auth + Storage) and Vercel (static hosting).

There are **two modes** you can deploy:

- **Offline mode** — pure static site, all state in `localStorage`. Great for demos. Zero backend, zero cost.
- **Supabase mode** — multi-user, real database, real file storage, real auth.

You pick the mode by editing `config.js`.

---

## 1. Pre-requisites

- A [Supabase](https://supabase.com) project (free tier is fine).
- A [Vercel](https://vercel.com) account connected to this GitHub repo.
- ~30 minutes for the first deploy.

---

## 2. Supabase setup

### 2.1 Create the project

1. supabase.com → **New project**. Pick a region close to your users.
2. Save the database password somewhere safe.
3. Wait until the project finishes provisioning.

### 2.2 Run the schema

1. In Supabase, open **SQL Editor** → **New query**.
2. Paste the contents of `supabase/schema.sql` and run it.
3. Then run `supabase/storage.sql` in the same editor.

You should now see these tables under **Table editor**:

```
hotels, app_users, categories, departments, statuses, periods,
responsibles, documents, projects, requests, request_items,
request_uploads, request_log, activity_log, email_log,
email_templates, hotel_config
```

And under **Storage** → a bucket called `docuhotel` (private).

### 2.3 Create your first admin user

1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Set an email (e.g. `admin@yourhotel.com`) and a password.
3. **Important**: enable "Auto Confirm User" so the user is active immediately.
4. Copy the user's **UID** from the row.

### 2.4 Run the seed

1. Open `supabase/seed.sql` and edit the four values inside the `declare` block near the top:
   ```sql
   v_user_id uuid := '<paste the auth user UID here>';
   v_email   text := 'admin@yourhotel.com';
   v_name    text := 'Tu Nombre';
   v_hname   text := 'Mi Hotel';
   ```
   (The file is plain SQL — don't use psql `\set`, it doesn't work in the Supabase SQL Editor.)
2. Paste the whole file into **SQL Editor** and run it. You should see a `NOTICE: Seed complete...`.

This creates your hotel row, attaches the admin user to it, and inserts the default taxonomies (categories, departments, statuses, periods).

### 2.5 Grab your API keys

**Project Settings** → **API**:

- `Project URL` → goes into `config.js` as `supabaseUrl`
- `anon` `public` key → goes into `config.js` as `supabaseAnonKey`

The `service_role` key is **never** used in this app. Do not paste it anywhere on the client.

---

## 3. Local configuration

```bash
cp config.example.js config.js
```

Edit `config.js`:

```js
window.DOCUHOTEL_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "eyJhbGciOi...",
  storageBucket: "docuhotel",
  offlineMode: false,
};
```

`config.js` is in `.gitignore` — it's not committed.

### Test locally

Serve the folder with any static server:

```bash
npx serve .
# or
python3 -m http.server 8080
```

Open `http://localhost:3000` (or whichever port), you should see the login screen. Sign in with the admin you created in 2.3.

---

## 4. Vercel deploy

### 4.1 Import the repo

1. vercel.com/new → import the GitHub repo.
2. **Framework Preset**: `Other`.
3. **Build Command**: *leave empty*.
4. **Output Directory**: `./`.
5. Click **Deploy**. It will fail on first load because `config.js` is missing — that's expected.

### 4.2 Inject `config.js` on Vercel

Because `config.js` is gitignored, you need to provide it to Vercel another way. Pick one:

**Option A — commit a config (simplest)**: The anon key is meant to be public, so committing `config.js` is technically safe. To do this, remove `config.js` from `.gitignore`, commit it, and redeploy.

**Option B — Vercel build step**: Add a `build` command that writes `config.js` from environment variables. To use this, set `buildCommand` in `vercel.json`:

```json
"buildCommand": "node -e \"require('fs').writeFileSync('config.js','window.DOCUHOTEL_CONFIG='+JSON.stringify({supabaseUrl:process.env.SUPABASE_URL,supabaseAnonKey:process.env.SUPABASE_ANON_KEY,storageBucket:'docuhotel',offlineMode:false}))\""
```

Then add the two env vars in **Vercel → Settings → Environment Variables**.

We recommend Option A — it's simpler and the anon key is designed to be exposed (RLS is what protects your data).

### 4.3 Configure Supabase Auth redirect URLs

In Supabase: **Authentication** → **URL Configuration**:

- **Site URL**: `https://your-vercel-domain.vercel.app`
- **Redirect URLs**: same.

### 4.4 Done

Visit your Vercel URL, log in with the admin account, you should land in the documents tab with the seeded taxonomies and an empty document list.

---

## 5. Adding more users

Right now users are added two ways:

1. **Supabase Auth** creates the auth identity. (Dashboard → Authentication → Users.)
2. The first time the user logs in there will be no `app_users` row — they'll be blocked.

To onboard them properly, after creating the auth user, run in **SQL Editor**:

```sql
insert into app_users(id, hotel_id, name, email, role, departments)
values (
  '<auth user uid>',
  (select id from hotels limit 1),  -- or specific hotel id
  'Nombre Apellido',
  'email@hotel.com',
  'dept_head',                       -- admin | dept_head | employee
  array['dep_housekeeping']          -- or array['*'] for all
);
```

A future iteration would add an in-app "invite user" flow that does this automatically.

---

## 6. How file uploads work

- **Documents** (admin-uploaded): when you click **Save** in the document form, the file is uploaded directly from the browser to `storage://docuhotel/docs/{hotel_id}/{doc_id}/<timestamp>_<name>`. RLS only lets admins/dept_heads in your hotel write there.
- **Request uploads** (anonymous via share link): a public visitor with the request token uploads to `requests/{request_id}/{item_id}/{upload_id}_<name>`. RLS validates the request is still open and not expired.
- **Downloads** always go through `createSignedUrl` with a 15-minute TTL. No direct public-bucket URLs.

---

## 7. Backups and operations

- Supabase has Point-in-Time Recovery (PITR) on Pro plans. Enable it for production.
- Free tier: dump weekly with `pg_dump` and store outside Supabase.
- Storage objects are not automatically versioned. If you need version history, enable bucket versioning manually (Storage settings).

---

## 8. Costs (1 hotel, ~5 users, ~500 docs)

| Service | Plan | Approx. cost |
|---|---|---|
| Vercel | Hobby | 0 € |
| Supabase | Free (500 MB DB, 1 GB storage, 50 k MAU) | 0 € |
| **Total** | | **0 €/month** |

When you outgrow free tier (probably 3+ hotels or 50+ GB of PDFs), Supabase Pro at ~$25/mo covers everything.

---

## 9. Troubleshooting

**"Failed to load resource: config.js 404"**
You haven't created `config.js`. See §3 or §4.2.

**Login succeeds but the app shows a spinner forever**
The auth user has no matching `app_users` row. Run the seed (§2.4) or the manual insert in §5.

**Upload fails with "new row violates row-level security policy"**
Either: (a) the storage policies in `supabase/storage.sql` didn't run, (b) your `app_users.role` isn't `admin` or `dept_head`, or (c) you're trying to upload to a different hotel's path.

**Public/audit/request link shows "404"**
The token doesn't exist or the share is expired. Check `requests.share_token` / `projects.share_token` in the database.

**Demo data missing**
The seed only inserts taxonomies, not example documents. The demo PDFs from the prototype are not migrated automatically. Create documents from the UI to populate.

---

## 10. Offline / static deploy (no backend)

If you just want to demo the prototype to someone:

```js
window.DOCUHOTEL_CONFIG = { offlineMode: true };
```

Commit and deploy — everything works against `localStorage` only. No login, no multi-user, but instant.
