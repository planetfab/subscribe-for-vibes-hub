# Subscribe for Vibes Hub — Handoff Document

**Project:** Subscribe for Vibes Hub  
**Client:** PlanetFab Studio, New York City  
**Founders:** Fabrice Frere & Michelle Keller  
**Live URL:** https://hub.planetfab.com  
**GitHub:** https://github.com/planetfab/subscribe-for-vibes-hub  
**Date:** June 2026

---

## What This Is

A private editorial dashboard that replaces the Make.com "Integration Email" automation pipeline. It monitors a dedicated inbox, processes incoming content through Claude AI in Michelle's editorial voice, stores the results as draft cards, and provides one-click publishing to LinkedIn, Instagram, and the PlanetFab WordPress blog.

The Make.com scenario is still running as a parallel backup and should remain active until the hub is fully validated in production.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 18+ with Express |
| Frontend | Vanilla HTML / CSS / JavaScript (no framework) |
| AI | Anthropic Claude API (`claude-sonnet-4-5`) |
| Database | PostgreSQL via Railway addon (in-memory fallback for local dev) |
| Email | IMAP via `imapflow` + `mailparser` (Dreamhost, `buzzby@planetfab.com`) |
| Hosting | Railway (Hobby plan, auto-deploy from GitHub) |
| Domain | `hub.planetfab.com` via Dreamhost DNS → Railway |
| Publishing | LinkedIn UGC Posts API v2, Meta Graph API v19.0, WordPress REST API |
| Auth | `express-session` with per-user passwords (no OAuth for app login) |

### npm dependencies

```
@anthropic-ai/sdk   — Claude API
axios               — HTTP requests to LinkedIn / Meta / WordPress APIs
dotenv              — Environment variable loading
express             — Web server
express-session     — Session-based authentication
imapflow            — IMAP email client
mailparser          — Email parsing (MIME, attachments)
node-cron           — Scheduled email polling (every 5 minutes)
pg                  — PostgreSQL client
uuid                — UUID generation for content IDs
```

---

## Project File Structure

```
subscribe-for-vibes-hub/
├── src/
│   ├── server.js                  # Express app entry point
│   ├── config.js                  # All environment variable bindings
│   ├── database.js                # PostgreSQL + in-memory store, all CRUD
│   ├── claude.js                  # Claude API integration with system prompt
│   ├── email-watcher.js           # IMAP poller, dedup, Claude pipeline
│   ├── middleware/
│   │   └── auth.js                # requireAuth middleware (shared)
│   ├── routes/
│   │   ├── auth.js                # POST /auth/login, GET /auth/logout
│   │   ├── content.js             # GET/PUT/DELETE /api/content, bulk-delete, check-email
│   │   ├── publish.js             # POST /api/publish/* (LinkedIn, Instagram, newsletter, blog)
│   │   ├── linkedin-oauth.js      # LinkedIn OAuth initiation + callback
│   │   ├── instagram-oauth.js     # Instagram/Facebook OAuth initiation + callback
│   │   └── settings-api.js        # GET/POST /api/settings/linkedin, /instagram
│   └── publishers/
│       ├── linkedin.js            # LinkedIn UGC Posts API
│       ├── instagram.js           # Meta Graph API (create container + publish)
│       └── wordpress.js           # WordPress REST API (create draft post)
├── public/
│   ├── index.html                 # Main dashboard
│   ├── login.html                 # Login page
│   ├── settings.html              # OAuth connection settings
│   ├── robots.txt                 # Disallow all crawlers
│   ├── css/app.css                # Full stylesheet (PlanetFab brand)
│   └── js/
│       ├── app.js                 # Dashboard logic (cards, edit, delete, publish)
│       └── settings.js            # Settings page logic (OAuth status, connect)
├── .env                           # Local secrets — never committed
├── .env.example                   # Template for all required variables
├── .gitignore
├── package.json
├── Procfile                       # Railway: `web: node src/server.js`
└── railway.toml                   # Railway build config (NIXPACKS, no healthcheck path)
```

---

## Environment Variables

All variables must be set in Railway → Project → Service → Variables. They are also documented in `.env.example`.

### Required to run

| Variable | Description |
|---|---|
| `SESSION_SECRET` | Long random string for session signing. Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `FABRICE_PASSWORD` | Dashboard login password for Fabrice |
| `MICHELLE_PASSWORD` | Dashboard login password for Michelle |
| `ANTHROPIC_API_KEY` | Claude API key (created June 3 2026, stored in password manager) |
| `IMAP_HOST` | `mail.dreamhost.com` |
| `IMAP_PORT` | `993` |
| `IMAP_USER` | `buzzby@planetfab.com` |
| `IMAP_PASSWORD` | Dreamhost email password for buzzby@planetfab.com |
| `DATABASE_URL` | Auto-injected by Railway PostgreSQL addon. Leave blank for local dev (uses in-memory). |
| `NODE_ENV` | Set to `production` on Railway so session cookies are marked Secure |
| `PORT` | Set automatically by Railway — do not override |

### LinkedIn OAuth (set after completing OAuth flow on /settings)

| Variable | Description |
|---|---|
| `LINKEDIN_CLIENT_ID` | LinkedIn app client ID |
| `LINKEDIN_CLIENT_SECRET` | LinkedIn app client secret |
| `LINKEDIN_FABRICE_TOKEN` | Fabrice's personal access token (fallback if DB not available) |
| `LINKEDIN_FABRICE_URN` | `urn:li:person:XXXXXXXXX` — auto-set by OAuth flow |
| `LINKEDIN_MICHELLE_TOKEN` | Michelle's personal access token (fallback if DB not available) |
| `LINKEDIN_MICHELLE_URN` | `urn:li:person:XXXXXXXXX` — auto-set by OAuth flow |
| `LINKEDIN_PLANETFAB_TOKEN` | PlanetFab company page token (fallback) |
| `LINKEDIN_PLANETFAB_PAGE_ID` | Numeric LinkedIn organization ID |

### Instagram / Meta (set after completing OAuth flow on /settings)

| Variable | Description |
|---|---|
| `META_APP_ID` | `962437633354825` (already set) |
| `META_APP_SECRET` | Meta app secret (stored in password manager) |
| `INSTAGRAM_ACCESS_TOKEN` | Page-level access token — permanent, set by OAuth flow |
| `INSTAGRAM_ACCOUNT_ID` | Instagram Business Account ID — set by OAuth flow |

### WordPress

| Variable | Description |
|---|---|
| `WORDPRESS_USERNAME` | WordPress admin username on planetfab.com |
| `WORDPRESS_APP_PASSWORD` | Application Password generated in WP Admin → Users → Profile → Application Passwords. Format: `xxxx xxxx xxxx xxxx xxxx xxxx` |
| `WORDPRESS_SITE_URL` | Defaults to `https://www.planetfab.com` — only set if the site URL changes |

---

## Railway Setup

### Current state
- Project exists on Railway (**Hobby plan**) connected to `planetfab/subscribe-for-vibes-hub` on GitHub
- Auto-deploys on every push to `main`
- Build uses NIXPACKS (auto-detected Node.js)
- Start command: `node src/server.js`
- No HTTP healthcheck (removed — was timing out; Railway uses TCP port check instead)
- SSL certificate is valid and active on `hub.planetfab.com`
- PostgreSQL addon is active; deletes are confirmed working (soft-delete sets `deleted_at`; `getAll` filters with `WHERE deleted_at IS NULL`)

### Adding PostgreSQL (required for persistence)
1. Railway dashboard → Project → **+ New** → **Database** → **Add PostgreSQL**
2. Railway automatically injects `DATABASE_URL` into the service environment
3. On next deploy the app creates four tables automatically: `content`, `settings`, `processed_emails`, `processed_emails` (all via `CREATE TABLE IF NOT EXISTS`)
4. Without `DATABASE_URL`, the app runs fine but all data is lost on restart

### Custom domain
- Subdomain `hub.planetfab.com` must be pointed at Railway from Dreamhost DNS
- In Railway: Service → Settings → **Add Custom Domain** → enter `hub.planetfab.com`
- Railway provides a CNAME target (e.g. `abc123.railway.app`)
- In Dreamhost: DNS → add CNAME record: host `hub`, value `abc123.railway.app`

---

## GitHub Setup

- Repository: `https://github.com/planetfab/subscribe-for-vibes-hub`
- Branch: `main` (single branch, direct commits)
- Railway watches `main` and redeploys automatically on push
- `.env` is gitignored — never appears in the repo
- GitHub CLI (`gh`) is installed at `~/.npm-global/bin/railway` for Railway CLI access

---

## Email Pipeline

**Inbox:** `buzzby@planetfab.com` via Dreamhost IMAP  
**Schedule:** Checked every 5 minutes via `node-cron`, plus on-demand via the **Check Email** button

### Flow
1. Connect to IMAP over SSL (port 993)
2. UID SEARCH for all messages received in the last 7 days — `client.search({ since }, { uid: true })` returns actual UIDs, not sequence numbers (passing `{ uid: true }` is required; without it, Dreamhost returns sequence numbers that don't match UIDs and every download fails)
3. Fetch raw RFC822 source for all matched UIDs in one command — `client.fetch(uids, { source: true }, { uid: true })` yields each message as a Buffer on `message.source`
4. For each message, compute its dedup key from the `Message-ID` header (falls back to a SHA-1 hash of `subject|date|from` if the header is absent)
5. Skip messages whose ID is already in the `processed_emails` table
6. Parse body: prefer `text/plain`, fall back to stripping HTML
7. Strip email signature: search for the two-line consecutive pattern unique to each sender (see below) and discard everything from that point onward
8. Sanitize: remove `\n`, `\r`, `\t` (matches the Make.com Tools module formula)
9. Extract image attachments (jpeg/png/gif/webp, max 4 MB each, max 5 per email)
10. Send subject + body + images to Claude via the Messages API
11. Parse Claude's JSON response (7 fields)
12. Write to `content` table with status `Draft`
13. Record the `Message-ID` in `processed_emails`

### Email signature stripping
Before the body is sent to Claude or used for URL extraction, the signature is stripped using a two-line consecutive pattern. Matching the title line (not just the name) prevents false positives if either name appears in quoted text:

```
Fabrice G. Frere\nCreative Director | PlanetFab Studio
Michelle Keller\nArt Director | PlanetFab Studio
```

`[ \t]*\r?\n` tolerates trailing spaces and handles both CRLF and LF line endings. Everything from the match position onward is discarded. Implemented in `src/email-watcher.js` as `SIG_RE`, applied after body assembly and before sanitization.

### IMAP implementation note
`imapflow`'s `download()` API returns `{}` (empty object) when a message is not found, causing `content = undefined` and a `Cannot read properties of undefined (reading 'Symbol(Symbol.asyncIterator)')` error. The fix (committed June 5 2026) is to use `client.fetch()` with `{ source: true }`, which returns each message's full RFC822 source as a `Buffer` on `message.source`.

### Claude system prompt
The exact system prompt from the working Make.com scenario is preserved verbatim in `src/claude.js`. It produces all seven output fields: `section_name`, `piece_title`, `newsletter_blurb`, `linkedin_hook`, `instagram_caption`, `blog_potential`, `source_urls`.

The `linkedin_hook` field now contains a complete, ready-to-publish LinkedIn post (150–250 words, three-move structure, hashtags), not just a short hook.

### Image support
When an email contains image attachments, they are passed to Claude as base64 `image` content blocks before the text. Claude can describe and reference the image as source material. Images are not stored anywhere after processing — see Known Limitations.

Image-only emails (no text body) are also supported: they are sent to Claude with an analysis prompt so newsletter content is generated from visual inspiration alone.

---

## LinkedIn OAuth

### App details
- LinkedIn App ID: `237060309`
- Approved scope: `Share on LinkedIn`
- Redirect URI: `https://hub.planetfab.com/auth/linkedin/callback`

### Three accounts
| Account | Type | OAuth URL | Status |
|---|---|---|---|
| Fabrice Frere | Personal | `hub.planetfab.com/auth/linkedin/fabrice` | **Connected** (June 2026) |
| Michelle Keller | Personal | `hub.planetfab.com/auth/linkedin/michelle` | **Needs reconnect** — token expired or not yet re-authorized |
| PlanetFab Studio | Company page | `hub.planetfab.com/auth/linkedin/planetfab` | Pending Marketing Developer Platform approval |

### Connecting an account (one-time per person)
1. Go to `hub.planetfab.com/settings`
2. Ensure `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` are set in Railway
3. Click **Connect via OAuth** on the relevant card
4. LinkedIn login page appears → user logs in and approves
5. Callback auto-resolves the person's URN from `/v2/userinfo` (personal accounts) or detects the managed organization (company page)
6. Token and URN are stored in the `settings` database table

### Token lifetime
LinkedIn personal access tokens expire. The exact duration depends on the app's approval level — typically 60 days for standard apps. When a publish attempt fails with an auth error, the user must re-connect via `/settings`.

### Known limitation — PlanetFab Company Page
Posting to a LinkedIn Organization (company page) requires the `w_organization_social` scope, which requires the LinkedIn app to be reviewed and approved for **Marketing Developer Platform** access. This is a separate LinkedIn approval process beyond the standard "Share on LinkedIn" permission.

**Until that approval is granted**, the PlanetFab company page publish button will fail with a permissions error. Fabrice and Michelle's personal posts will work once OAuth is completed.

---

## Instagram OAuth

### App details
- Meta App ID: `962437633354825`
- Redirect URI: `https://hub.planetfab.com/auth/instagram/callback`
- Instagram account: `@planetfab` (Business account, connected to a Facebook Page)

### Connecting Instagram (one-time)
1. Add `META_APP_SECRET` to Railway environment variables
2. Go to `hub.planetfab.com/settings`
3. Click **Connect via Facebook OAuth**
4. Facebook login → approve permissions
5. Callback fetches managed Facebook Pages → finds connected Instagram Business Account → stores the permanent page-level access token

### Token lifetime
The **page-level access token** obtained through this flow does not expire (Meta's policy for page tokens derived from long-lived user tokens). However, the underlying user token expires after 60 days. If Meta ever invalidates the page token, re-connect from `/settings`.

### Known limitation — Meta App Review
The Meta app is currently in **Development mode**. In development mode, only users listed as App Admins or Testers in the Meta Developer dashboard can authenticate. The `instagram_content_publish` permission requires **Meta App Review** before any non-admin Facebook account can use it.

**To go live with Instagram publishing:**
1. Complete the Meta App Review for `instagram_content_publish` and `pages_read_engagement`
2. Switch the app to **Live mode** in the Meta Developer dashboard
3. Ensure the redirect URI `https://hub.planetfab.com/auth/instagram/callback` is registered under Facebook Login → Settings → Valid OAuth Redirect URIs

Until review is approved, Instagram publishing only works if the Facebook account being used is listed as an admin or tester of the Meta app (App ID `962437633354825`).

---

## WordPress Integration

### How it works
The **Save to Blog** button on each content card calls `POST /api/publish/blog/:id`, which sends a `POST` to `https://www.planetfab.com/wp-json/wp/v2/posts` with:
- `title`: the `piece_title` field
- `content`: the `newsletter_blurb` field
- `status`: `draft`

Authentication uses HTTP Basic Auth with a WordPress **Application Password** — not the account password.

### Generating an Application Password
1. Log in to `planetfab.com/wp-admin`
2. Go to **Users → Profile**
3. Scroll to **Application Passwords**
4. Enter a name (e.g. `Subscribe for Vibes Hub`) and click **Add New Application Password**
5. Copy the generated password (shown only once, format: `xxxx xxxx xxxx xxxx xxxx xxxx`)
6. Add to Railway:
   - `WORDPRESS_USERNAME` = your WordPress username
   - `WORDPRESS_APP_PASSWORD` = the generated password (spaces are fine)

### What happens after saving
On success, the WordPress editor opens in a new browser tab pointed directly at the draft. No approval status is required — any content (Draft, Approved, or Published) can be saved to WordPress.

---

## Dashboard Features

### Content cards
Each card displays: piece title, status badge, section name, newsletter blurb (preview), LinkedIn hook (preview), blog potential, source URLs, and creation date.

### Status workflow
`Draft` → (click Approve) → `Approved` → (publish to a channel) → `Published`  
At any point, content can also be marked `Newsletter Ready`.  
Save to Blog works regardless of status.

### Editing
Click **Edit** on any card to open a full-field editor with a live word count for the newsletter blurb (target: 150 words).

### Mobile layout
The edit modal is fully usable on small screens: it uses `max-width: 100%` (not `100vw`) to avoid the iOS scrollbar-width overflow. All textareas have `resize: vertical` via explicit ID-selector rules (required because `appearance: none` on the shared `.field textarea` reset strips WebKit's native resize grip). All inputs and textareas have `font-size: 16px` on mobile to prevent iOS viewport zoom on focus.

### Deleting and Trash
- **Single**: click **Delete** on a card → named confirmation modal → card moves to Trash (soft-delete: `deleted_at` is set in PostgreSQL; `getAll` filters with `WHERE deleted_at IS NULL`)
- **Bulk**: click **Select** in the header → cards show checkboxes → select individually or use **Select All** → click **Delete N Items** → confirmation modal. Press Escape to exit bulk mode.
- **Trash tab**: filter button at the right of the filter bar. Shows all soft-deleted cards with a countdown to auto-purge.
- **Restore**: from Trash, click **Restore** to bring a card back to its original status.
- **Delete Forever**: permanently removes a card from the database (irreversible).
- **Empty Trash**: permanently deletes all items in Trash at once.
- **Auto-purge**: a daily cron job at 3 am purges Trash items older than 5 days.
- **Persistence**: deletes execute against PostgreSQL when `DATABASE_URL` is set. In the in-memory fallback (local dev without `DATABASE_URL`), soft-deletes work within a session but are lost on restart.

### Publishing buttons (per card)
| Button | Destination | Requires |
|---|---|---|
| PF LinkedIn | PlanetFab company page | Approved + LinkedIn company page OAuth (pending review) |
| Fabrice LI | Fabrice's personal LinkedIn | Approved + Fabrice LinkedIn OAuth |
| Michelle LI | Michelle's personal LinkedIn | Approved + Michelle LinkedIn OAuth |
| Instagram | @planetfab Instagram | Approved + Instagram OAuth (pending Meta review) |
| Newsletter | Marks as Newsletter Ready | Approved |
| Save to Blog | planetfab.com WordPress draft | None — works on any status |

---

## Known Limitations

### 1. Instagram blocked by Meta App Review
The Meta app must pass App Review for `instagram_content_publish` before it works in production. This is a Meta process that can take 1–4 weeks. Until then, Instagram publishing only works for Facebook accounts listed as admins/testers of the Meta app.

### 2. LinkedIn company page requires Marketing Developer Platform access
Posting to the PlanetFab LinkedIn organization page requires LinkedIn's Marketing Developer Platform tier. Apply at `linkedin.com/developers` → Products → Marketing Developer Platform. Until approved, only personal LinkedIn posts (Fabrice and Michelle) work.

### 3. In-memory fallback without PostgreSQL
When `DATABASE_URL` is not set, the app falls back to in-memory storage and emits a console warning. All content, settings, and processed-email records are stored in-memory and lost on every restart or redeploy. OAuth tokens stored via `/settings` are also lost. The in-memory fallback exists intentionally so the app can be run locally without a database. **On Railway, the PostgreSQL addon must be added for data to persist — this is the first production step.**

### 4. LinkedIn tokens expire (~60 days)
LinkedIn access tokens are not permanent. Each person will need to re-authorize via `/settings` approximately every 60 days. The app shows an error on the card when a token is expired — just click Reconnect on the Settings page.

### 5. Email images not persisted
When emails contain image attachments, they are passed to Claude for analysis at processing time but are not stored anywhere afterward. The image cannot be retrieved or displayed later. See Features Still to Build.

### 6. No Notion integration in this version
The original Make.com pipeline wrote to a Notion database (`the-database`, ID `372bf6f10d8f80728ef6f0dedcd8bae2`). This app does not currently write to Notion. The Make.com scenario still does, as it is running in parallel.

### 7. Single-region, no CDN
Railway Hobby plan runs in a single region. No CDN is configured. Static assets (CSS, JS) are served directly by Express. Acceptable for a two-person private tool; not suitable for public traffic.

---

## Features Still to Build

### 1. Image thumbnails on content cards
**Current state:** Image attachments are passed to Claude during processing but no reference to the image is stored. Cards show text only.  
**Desired state:** If an email contained an image, a thumbnail should appear on the card and in the edit modal.  
**Requires:** Persistent image storage (see below) + `image_urls` column in the `content` table + `<img>` thumbnail in `cardHTML()`.

### 2. Persistent image storage (S3 / Cloudflare R2)
**Current state:** Images from email attachments live only in memory during the Claude API call and are then discarded.  
**Desired state:** Upload each image to an S3-compatible object store (AWS S3 or Cloudflare R2) at processing time and store the public URL in the database.  
**Implementation sketch:**
- Add `image_urls TEXT` column to the `content` table (migration: `ALTER TABLE content ADD COLUMN IF NOT EXISTS image_urls TEXT`)
- In `email-watcher.js`, after `processContent()`, upload each image and collect public URLs
- Pass them to `db.create()` as `image_urls` (comma-separated or JSON array)
- Render in cards as `<img src="...">` thumbnails
- Required env vars: `S3_BUCKET`, `S3_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` (or R2 equivalents)

### 3. Image asset management — artwork vs. analysis distinction
**Current state:** All image attachments are treated identically and passed to Claude as visual inspiration.  
**Desired state:** Distinguish between (a) **artwork / finished assets** (photography, illustrations, design exports intended for direct use in posts) and (b) **analysis references** (screenshots, mood boards, reference images used only to inform the written content). Artwork should be preserved and linked; analysis references can be discarded after processing.  
**Requires:** A UI flag or metadata field on the card (e.g. `image_type: artwork | reference`) and corresponding storage/display logic.

### 4. Platform-specific crop tools
**Current state:** Images are stored as-is; no resizing or cropping occurs.  
**Desired state:** When preparing an image for a specific platform (Instagram square, LinkedIn banner, WordPress featured image), provide a crop/resize UI in the edit modal with preset aspect ratios per platform before publishing.

---

## Local Development

```bash
# Clone
git clone https://github.com/planetfab/subscribe-for-vibes-hub.git
cd subscribe-for-vibes-hub

# Install
npm install

# Configure
cp .env.example .env
# Edit .env — at minimum set ANTHROPIC_API_KEY, IMAP_PASSWORD, 
# FABRICE_PASSWORD, MICHELLE_PASSWORD, SESSION_SECRET

# Run (dev, auto-restarts)
npm run dev

# Run (production mode)
npm start
```

App runs at `http://localhost:3000`. Database defaults to in-memory — data is lost on restart. Set `DATABASE_URL` in `.env` to use a local or remote PostgreSQL instance if needed.

---

## Deployment Checklist

For a fresh Railway deployment or post-handoff setup, complete steps in this order:

- [x] GitHub repo exists at `planetfab/subscribe-for-vibes-hub`
- [x] Railway project created and connected to the GitHub repo (Hobby plan)
- [x] Railway PostgreSQL addon added → `DATABASE_URL` auto-injected
- [x] All required environment variables set in Railway (see table above)
- [x] `NODE_ENV=production` set in Railway
- [x] `hub.planetfab.com` CNAME pointing to Railway domain in Dreamhost
- [x] Custom domain added in Railway service settings
- [x] SSL certificate valid on `hub.planetfab.com`
- [x] App loads at `hub.planetfab.com/login`
- [x] Login works for both Fabrice and Michelle
- [x] Check Email button returns content
- [x] LinkedIn OAuth completed for Fabrice (`/auth/linkedin/fabrice`)
- [ ] LinkedIn OAuth for Michelle — needs to reconnect (`/auth/linkedin/michelle`)
- [ ] WordPress Application Password generated and `WORDPRESS_USERNAME` + `WORDPRESS_APP_PASSWORD` set
- [ ] Save to Blog tested — opens WP editor in new tab
- [ ] Instagram OAuth attempted — if Meta review not yet complete, note this as pending
- [ ] Make.com "Integration Email" scenario left running until hub is validated in production

---

*Built in one session using Claude Code, June 2026.*
