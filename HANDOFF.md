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
| Image processing | `sharp` — cover-crop resizing for LinkedIn (1200×627) and WordPress (1536×1024) |
| Rich text editor | Quill.js 1.3.7 (CDN) — blog post field in edit modal |
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
sharp               — Image resizing/cropping for platform-specific dimensions
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
│   ├── image-utils.js             # sharp wrappers: resizeToJpeg(), decodeBuffer()
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
│       ├── linkedin.js            # LinkedIn UGC Posts API (with image upload)
│       ├── instagram.js           # Meta Graph API (create container + publish)
│       └── wordpress.js           # WordPress REST API (draft post + media upload)
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
| `WORDPRESS_USERNAME` | WordPress username for Fabrice's account on planetfab.com |
| `WORDPRESS_APP_PASSWORD` | Application Password generated in WP Admin → Users → Profile → Application Passwords. Format: `xxxx xxxx xxxx xxxx xxxx xxxx` |
| `WORDPRESS_MICHELLE_USERNAME` | WordPress username for Michelle's account on planetfab.com |
| `WORDPRESS_MICHELLE_APP_PASSWORD` | Application Password for Michelle's WP account (same generation process) |
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
- DB init retries up to 4 times with 4-second delays (8s connection timeout) to survive Railway's PostgreSQL startup race

### Adding PostgreSQL (required for persistence)
1. Railway dashboard → Project → **+ New** → **Database** → **Add PostgreSQL**
2. Railway automatically injects `DATABASE_URL` into the service environment
3. On next deploy the app creates all tables automatically via `CREATE TABLE IF NOT EXISTS` and runs `ALTER TABLE ADD COLUMN IF NOT EXISTS` migrations for every added column — safe to re-run on every startup
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

---

## Database Schema

The app creates and migrates all tables automatically at startup. Current columns:

### `content`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID | Primary key |
| `piece_title` | TEXT | |
| `section_name` | TEXT | |
| `newsletter_blurb` | TEXT | 150-word newsletter entry |
| `linkedin_hook` | TEXT | Full LinkedIn post (150–250 words + hashtags) |
| `instagram_caption` | TEXT | |
| `blog_potential` | TEXT | Yes/No + notes |
| `source_urls` | TEXT | Comma-separated |
| `blog_post` | TEXT | 600–800 word article from Claude; stored as Quill HTML after first edit |
| `status` | TEXT | `Draft`, `Approved`, `Published`, `Newsletter Ready` |
| `email_subject` | TEXT | |
| `raw_content` | TEXT | Sanitized email body sent to Claude |
| `images` | TEXT | JSON array of `{data, contentType, filename}` — base64 encoded, up to 3 |
| `email_message_id` | TEXT | Originating email Message-ID (dedup fallback) |
| `deleted_at` | TIMESTAMPTZ | NULL = active; set = soft-deleted (Trash) |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

### `processed_emails`
| Column | Type | Notes |
|---|---|---|
| `message_id` | TEXT | Primary key — email Message-ID or SHA-1 hash fallback |
| `processed_at` | TIMESTAMPTZ | |

**Important:** Records in `processed_emails` are NEVER deleted, even when a content card is permanently deleted. This prevents deleted cards from being recreated on the next email check. A secondary dedup check also queries the `content` table for `email_message_id` matches (including soft-deleted rows) in case a `processed_emails` record is ever missing.

### `settings`
Key/value store for OAuth tokens and URNs.

---

## Email Pipeline

**Inbox:** `buzzby@planetfab.com` via Dreamhost IMAP  
**Schedule:** Checked every 5 minutes via `node-cron`, plus on-demand via the **Check Email** button

### Flow
1. Connect to IMAP over SSL (port 993)
2. UID SEARCH for all messages received in the last 7 days — `client.search({ since }, { uid: true })` returns actual UIDs, not sequence numbers (passing `{ uid: true }` is required; without it, Dreamhost returns sequence numbers that don't match UIDs and every download fails)
3. Fetch raw RFC822 source for all matched UIDs — `client.fetch(uids, { source: true }, { uid: true })` yields each message as a Buffer on `message.source`
4. For each message, compute its dedup key from the `Message-ID` header (falls back to a SHA-1 hash of `subject|date|from` if the header is absent)
5. Skip messages whose ID is already in `processed_emails` OR whose `email_message_id` appears in any `content` row (including deleted) — this double-check prevents reprocessing if a `processed_emails` record is ever missing
6. Parse body: prefer `text/plain`, fall back to stripping HTML
7. Strip email signature: search for the two-line consecutive pattern unique to each sender (see below) and discard everything from that point onward
8. Sanitize: remove `\n`, `\r`, `\t` (matches the Make.com Tools module formula)
9. Extract image attachments (jpeg/png/gif/webp, max 4 MB each, max 5 for Claude, max 3 stored)
10. Send subject + body + images to Claude via the Messages API (max 5 images, base64 encoded)
11. Parse Claude's JSON response (8 fields)
12. Convert up to 3 image attachments to base64 and store as JSON in the `images` column
13. Write to `content` table (status `Draft`) with `email_message_id` set
14. Record the `Message-ID` in `processed_emails`

### Email signature stripping
```
Fabrice G. Frere\nCreative Director | PlanetFab Studio
Michelle Keller\nArt Director | PlanetFab Studio
```
`[ \t]*\r?\n` tolerates trailing spaces and handles both CRLF and LF line endings. Everything from the match position onward is discarded. Implemented in `src/email-watcher.js` as `SIG_RE`.

### IMAP implementation note
`imapflow`'s `download()` API returns `{}` (empty object) when a message is not found. The fix is to use `client.fetch()` with `{ source: true }`, which returns each message's full RFC822 source as a `Buffer` on `message.source`.

### Claude system prompt
The system prompt in `src/claude.js` produces **8 output fields**:

| Field | Description |
|---|---|
| `section_name` | Newsletter section name |
| `piece_title` | Headline |
| `newsletter_blurb` | 150-word newsletter entry in Michelle's voice |
| `linkedin_hook` | Complete LinkedIn post, 150–250 words + hashtags |
| `instagram_caption` | Instagram caption |
| `blog_potential` | Yes/No + expansion notes |
| `source_urls` | All URLs extracted from the email body |
| `blog_post` | 600–800 word journalistic article in plain text with `\n\n` paragraph breaks |

`max_tokens` is set to 4000 to accommodate the full blog post alongside the other fields.

---

## Image Handling

### Storage
Images from email attachments are stored as base64 in the `images` TEXT column (JSON array). Up to 3 images are stored per card. Each entry: `{ data: base64string, contentType, filename }`.

The `getImageSrc(img)` function in `app.js` is the **single swap point** for the storage format — it returns `img.url || data:${img.contentType};base64,${img.data}`. When migrating to Cloudflare R2 or S3, only this function and the `storedImages` builder in `email-watcher.js` need to change.

The `express.json` body size limit is set to `50mb` to handle base64 image arrays in PUT requests.

### Card display
Each card shows up to 3 thumbnail images. Clicking a thumbnail opens a full-screen lightbox with previous/next navigation, a download button, and a counter. The lightbox is keyboard-navigable (←/→/Escape) and touch-friendly on mobile (nav buttons are positioned absolute over the image, not alongside it).

### Edit modal image management
- Up to 3 images per card — shown as thumbnails with an × remove button
- **Hero badge** on the first thumbnail — the first image is always the featured/hero image
- **Drag to reorder** using the Pointer Events API (`setPointerCapture` routes all move/up events regardless of pointer position; `touch-action: none` prevents scroll competition on mobile). Reorder logic uses splice with no-change detection for `dropIdx === srcIdx` and `dropIdx === srcIdx + 1`.
- **Add Image** button — opens a file picker for JPEG/PNG/WebP (max 3 total). Files are converted to base64 client-side via FileReader. Manually added images are NOT sent to Claude for analysis.

### LinkedIn image publishing
When publishing to LinkedIn and the card has images, the first image is resized to **1200×627** (cover crop, 85% JPEG quality via `sharp`) and uploaded via the 3-step LinkedIn media API: register upload slot → PUT binary to pre-signed URL → create post with `shareMediaCategory: IMAGE`. Falls back to text-only post if no images or upload fails.

### WordPress image publishing
- **First image**: resized to **1536×1024** JPEG → uploaded to WP media library → set as `featured_media`
- **Additional images (2nd, 3rd)**: uploaded at original size/format → embedded as `<!-- wp:image -->` Gutenberg blocks after the first paragraph of the post body
- Individual image upload failures are non-blocking (null is pushed to keep index alignment)

---

## WordPress Integration

### Two-author publishing
Each card has two blog buttons: **Blog as Fabrice** and **Blog as Michelle**. Both create a WordPress draft post using separate Application Passwords:

| Button | Credentials used | Byline |
|---|---|---|
| Blog as Fabrice | `WORDPRESS_USERNAME` + `WORDPRESS_APP_PASSWORD` | Fabrice Frere |
| Blog as Michelle | `WORDPRESS_MICHELLE_USERNAME` + `WORDPRESS_MICHELLE_APP_PASSWORD` | Michelle Keller |

### Post content
WordPress receives the `blog_post` field as the post body (not `newsletter_blurb`). If `blog_post` is Quill HTML (starts with `<`), it is sent as-is with inline image blocks injected after the first `</p>`. If `blog_post` is plain text (pre-edit), it is wrapped in Gutenberg `<!-- wp:paragraph -->` blocks. If `blog_post` is empty, falls back to `newsletter_blurb`.

On success, the WordPress editor opens in a new tab pointed at the draft. No approval status is required.

### Generating an Application Password
1. Log in to `planetfab.com/wp-admin`
2. Go to **Users → Profile**
3. Scroll to **Application Passwords**
4. Enter a name (e.g. `Subscribe for Vibes Hub`) and click **Add New Application Password**
5. Copy the generated password (shown only once, format: `xxxx xxxx xxxx xxxx xxxx xxxx`)

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

### Token lifetime
LinkedIn personal access tokens expire (~60 days for standard apps). When a publish attempt fails with an auth error, re-connect via `/settings`.

### Known limitation — PlanetFab Company Page
Posting to a LinkedIn Organization requires the `w_organization_social` scope and Marketing Developer Platform approval. Until granted, the PF LinkedIn button will fail. Personal posts (Fabrice and Michelle) work once OAuth is complete.

---

## Instagram OAuth

### App details
- Meta App ID: `962437633354825`
- Redirect URI: `https://hub.planetfab.com/auth/instagram/callback`
- Instagram account: `@planetfab` (Business account, connected to a Facebook Page)

### Token lifetime
The page-level access token does not expire under normal conditions. If Meta invalidates it, re-connect from `/settings`.

### Known limitation — Meta App Review
The Meta app is in **Development mode**. Only Facebook accounts listed as App Admins or Testers can authenticate. The `instagram_content_publish` permission requires Meta App Review before production use.

**To go live:**
1. Complete Meta App Review for `instagram_content_publish` and `pages_read_engagement`
2. Switch app to **Live mode** in the Meta Developer dashboard

---

## Dashboard Features

### Content cards
Each card displays all content fields with labeled rows: Newsletter Blurb, LinkedIn Post, Instagram Caption, Blog Post, Blog Potential, and Source URLs. Each field label has a **copy-to-clipboard button** (permanent clipboard icon — always visible for mobile compatibility). Clicking copies the full field text; the icon swaps to a green checkmark for 2 seconds. Blog Post HTML is stripped to plain text before copying.

### Status workflow
`Draft` → (click Approve) → `Approved` → (publish to a channel) → `Published`  
At any point, content can also be marked `Newsletter Ready`.  
Blog buttons work regardless of status.

### Edit modal
Full-field editor with:
- Live word count for newsletter blurb (target: 150 words)
- Auto-grow textarea for Blog Potential
- **Quill.js rich text editor** for Blog Post — supports bold, italic, underline, H2/H3 headings, and hyperlinks. Saves as HTML. Claude's plain-text output is auto-converted to `<p>` tags on first open.
- Image thumbnails with Hero badge, × remove, drag-to-reorder, and Add Image button

### Mobile layout
Edit modal uses `max-width: 100%` (not `100vw`) to avoid the iOS scrollbar-width overflow. Textareas have `resize: vertical` via explicit ID-selector rules. All inputs have `font-size: 16px` on mobile to prevent iOS viewport zoom.

### Deleting and Trash
- **Single**: card moves to Trash (soft-delete: `deleted_at` set)
- **Bulk**: Select mode → checkboxes → Delete N Items
- **Trash**: filter tab showing deleted cards with 5-day countdown. Restore or Delete Forever.
- **Auto-purge**: daily cron at 3 am purges items older than 5 days.

### Publishing buttons (per card)
| Button | Destination | Requires |
|---|---|---|
| PF LinkedIn | PlanetFab company page | Approved + Marketing Developer Platform approval (pending) |
| Fabrice LI | Fabrice's personal LinkedIn | Approved + Fabrice LinkedIn OAuth |
| Michelle LI | Michelle's personal LinkedIn | Approved + Michelle LinkedIn OAuth (needs reconnect) |
| Instagram | @planetfab Instagram | Approved + Instagram OAuth (pending Meta review) |
| Newsletter | Marks as Newsletter Ready | Approved |
| Blog as Fabrice | planetfab.com WordPress draft (Fabrice byline) | None — works on any status |
| Blog as Michelle | planetfab.com WordPress draft (Michelle byline) | None — works on any status |

---

## Known Limitations

### 1. Instagram blocked by Meta App Review
The Meta app must pass App Review for `instagram_content_publish` before it works in production. Until then, Instagram publishing only works for Facebook accounts listed as admins/testers of Meta app `962437633354825`.

### 2. LinkedIn company page requires Marketing Developer Platform access
Posting to the PlanetFab LinkedIn organization page requires LinkedIn's Marketing Developer Platform tier. Until approved, only personal LinkedIn posts (Fabrice and Michelle) work.

### 3. In-memory fallback without PostgreSQL
When `DATABASE_URL` is not set, all data is stored in-memory and lost on every restart. On Railway, the PostgreSQL addon must be added for persistence.

### 4. LinkedIn tokens expire (~60 days)
Each person will need to re-authorize via `/settings` approximately every 60 days.

### 5. Images stored as base64 in PostgreSQL (not object storage)
Email attachment images are stored as base64 JSON in the `images` column — up to 3 images, up to ~4 MB each. This works for the current two-person usage but will become unwieldy at scale. The `getImageSrc()` function in `app.js` is the designated swap point for migrating to Cloudflare R2 or S3: change it and the `storedImages` builder in `email-watcher.js`, nothing else.

### 6. No Notion integration in this version
The original Make.com pipeline wrote to a Notion database (`the-database`, ID `372bf6f10d8f80728ef6f0dedcd8bae2`). This app does not write to Notion. The Make.com scenario still does.

### 7. Single-region, no CDN
Railway Hobby plan runs in a single region. Static assets are served directly by Express. Acceptable for a two-person private tool.

---

## Features Still to Build

### 1. Migrate image storage to Cloudflare R2 or S3
**Current state:** Base64 in PostgreSQL `images` column — functional but not scalable.  
**Desired state:** Upload each image to R2/S3 at processing time; store public URL in the database.  
**Swap points:** `getImageSrc(img)` in `app.js` (display) and the `storedImages` builder in `email-watcher.js` (write). Required env vars: bucket name, region, access key, secret key.

### 2. Image asset management — artwork vs. analysis distinction
**Current state:** All attachments are treated identically.  
**Desired state:** Distinguish finished assets (photography, design exports) from analysis references (mood boards, screenshots). Artwork should be preserved; references can be discarded after processing.

### 3. Platform-specific crop tools
**Current state:** `sharp` resizes to fixed dimensions on publish. No user-controlled crop.  
**Desired state:** Crop/resize UI in the edit modal with preset aspect ratios per platform (Instagram square, LinkedIn banner, WordPress featured image) before publishing.

### 4. Notion sync
Write processed content to the Notion database as a parallel record, replacing the Make.com automation entirely.

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

App runs at `http://localhost:3000`. Database defaults to in-memory — data is lost on restart. Set `DATABASE_URL` in `.env` to use a local or remote PostgreSQL instance.

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
- [x] `WORDPRESS_USERNAME` + `WORDPRESS_APP_PASSWORD` set (Fabrice)
- [ ] `WORDPRESS_MICHELLE_USERNAME` + `WORDPRESS_MICHELLE_APP_PASSWORD` set (Michelle)
- [ ] Blog as Fabrice tested — opens WP editor in new tab
- [ ] Blog as Michelle tested — opens WP editor in new tab under Michelle's byline
- [ ] Instagram OAuth attempted — if Meta review not yet complete, note as pending
- [ ] Make.com "Integration Email" scenario left running until hub is validated in production

---

*Built using Claude Code, June 2026.*
