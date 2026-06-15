# Subscribe for Vibes Hub — Handoff Document

**Project:** Subscribe for Vibes Hub  
**Client:** PlanetFab Studio, New York City  
**Founders:** Fabrice Frere & Michelle Keller  
**Live URL:** https://hub.planetfab.com  
**GitHub:** https://github.com/planetfab/subscribe-for-vibes-hub  
**Last updated:** June 10 2026

---

## What This Is

A private editorial dashboard that replaces the Make.com "Integration Email" automation pipeline. It monitors a dedicated inbox, processes incoming content through Claude AI in Michelle's editorial voice, stores the results as draft cards, and provides one-click publishing to LinkedIn, Instagram, and the PlanetFab WordPress blog.

The Make.com scenario is still running as a parallel backup and should remain active until the hub is fully validated in production.

---

## Cost Incident — June 5 2026

**What happened:** Runaway API costs of approximately $300 in a single day. Two compounding causes: (1) automatic email polling every 5 minutes was triggering Claude API calls at high volume, (2) the `web_search_20250305` tool was enabled on every call, adding $0.50–$1.00 per email processed.

**Resolution:**
- Automatic polling removed; replaced with twice-daily scheduled checks (see Email Pipeline)
- Web search removed from the default `processContent()` call; available only via the manual Research & Enrich button in the edit modal
- Anthropic spend limit set to **$350 for June 2026**, drops to **$20/month from July 1 2026**
- Current API balance: approximately **$4**

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js 18+ with Express |
| Frontend | Vanilla HTML / CSS / JavaScript (no framework) |
| AI | Anthropic Claude API (`claude-sonnet-4-5`, prompt caching enabled) |
| Database | PostgreSQL via Railway addon (in-memory fallback for local dev) |
| Email | IMAP via `imapflow` + `mailparser` (Dreamhost, `buzzby@planetfab.com`) |
| Image processing | `sharp` — cover-crop resizing for LinkedIn (1200×627) and WordPress (1536×1024) |
| Rich text editor | Quill.js 1.3.7 (CDN) — blog post field in edit modal |
| Hosting | Railway (Hobby plan, auto-deploy from GitHub) |
| Domain | `hub.planetfab.com` via Dreamhost DNS → Railway |
| Publishing | LinkedIn UGC Posts API v2, Meta Graph API v19.0, WordPress REST API + Yoast SEO |
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
node-cron           — Scheduled checks (8am/2pm ET) and daily trash purge
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
│   ├── email-watcher.js           # IMAP poller, dedup, Claude pipeline, cron schedule
│   ├── image-utils.js             # sharp wrappers: resizeToJpeg(), decodeBuffer()
│   ├── middleware/
│   │   └── auth.js                # requireAuth middleware (shared)
│   ├── routes/
│   │   ├── auth.js                # POST /auth/login, GET /auth/logout
│   │   ├── content.js             # GET/PUT/DELETE /api/content, bulk-delete, check-email (SSE)
│   │   ├── publish.js             # POST /api/publish/* (LinkedIn, Instagram, newsletter, blog)
│   │   ├── linkedin-oauth.js      # LinkedIn OAuth initiation + callback
│   │   ├── instagram-oauth.js     # Instagram/Facebook OAuth initiation + callback
│   │   └── settings-api.js        # GET/POST /api/settings/linkedin, /instagram
│   └── publishers/
│       ├── linkedin.js            # LinkedIn UGC Posts API (with image upload)
│       ├── instagram.js           # Meta Graph API (create container + publish)
│       └── wordpress.js           # WordPress REST API (draft post + media upload + Yoast)
├── public/
│   ├── index.html                 # Main dashboard
│   ├── login.html                 # Login page
│   ├── settings.html              # OAuth connection settings
│   ├── privacy.html               # Public privacy policy (required for Meta App Review)
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
| `INSTAGRAM_ACCESS_TOKEN` | Page-level access token — permanent, set by OAuth flow. **Set in Railway June 9 2026.** |
| `INSTAGRAM_USER_ID` | Instagram Business Account ID — set by OAuth flow (was `INSTAGRAM_ACCOUNT_ID` before June 2026). **Set in Railway June 9 2026.** |
| `INSTAGRAM_PAGE_ID` | Facebook Page ID connected to the Instagram account — used for `cross_post_to_facebook_page`. **Set in Railway June 9 2026.** |

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
- PostgreSQL addon is active and stable; all tokens, settings, and content persist across deployments
- DB init retries up to 4 times with 4-second delays (8s connection timeout) to survive Railway's PostgreSQL startup race
- DB init is split into two phases: Phase 1 retries the connection with `SELECT 1`; Phase 2 runs schema migrations. Phase 2 errors are logged but do not null the pool, so a migration hiccup never silently falls back to in-memory.

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
| `newsletter_blurb` | TEXT | 150–750 word newsletter text |
| `linkedin_hook` | TEXT | Full LinkedIn post (150–250 words + hashtags) |
| `instagram_caption` | TEXT | |
| `source_urls` | TEXT | Comma-separated; extracted in Node.js after signature stripping, not by Claude |
| `blog_post` | TEXT | 600–800 word article; stored as Quill HTML after first edit; `<em>` tags used for titles of published works |
| `meta_description` | TEXT | SEO meta description, max 155 chars; sent to Yoast SEO + WP excerpt on blog publish |
| `status` | TEXT | `Draft`, `Approved`, `Published`, `Newsletter Ready` |
| `email_subject` | TEXT | |
| `raw_content` | TEXT | Sanitized email body sent to Claude |
| `images` | TEXT | JSON array of `{data, contentType, filename, caption?}` — base64 encoded, up to 3 |
| `email_message_id` | TEXT | Originating email Message-ID (dedup fallback) |
| `published_channels` | TEXT | JSON object mapping channel keys to ISO timestamp of publish — e.g. `{"linkedin_fabrice":"2026-06-05T…"}` |
| `email_received_at` | TIMESTAMPTZ | Original email received date, shown on cards |
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
Key/value store for OAuth tokens and URNs. Tokens survive deployments because DB init Phase 2 errors never null the pool.

---

## Email Pipeline

**Inbox:** `buzzby@planetfab.com` via Dreamhost IMAP  
**Schedule:** Twice daily via `node-cron` at **8 am and 2 pm Eastern** (handles EST/EDT automatically via `America/New_York` timezone), plus on-demand via the **Check Email** button

### Scheduled checks
- Log line on start: `[email] Scheduled check starting at <ISO timestamp>`
- Log line on finish: `[email] Scheduled check complete — N new email(s) processed`
- When there are no new emails the IMAP dedup check exits before any Claude call — **zero API cost**

### Flow
1. Connect to IMAP over SSL (port 993)
2. UID SEARCH for all messages received in the last 7 days — `client.search({ since }, { uid: true })` returns actual UIDs, not sequence numbers (passing `{ uid: true }` is required; without it, Dreamhost returns sequence numbers that don't match UIDs and every download fails)
3. Fetch raw RFC822 source for all matched UIDs — `client.fetch(uids, { source: true }, { uid: true })` yields each message as a Buffer on `message.source`
4. For each message, compute its dedup key from the `Message-ID` header (falls back to a SHA-1 hash of `subject|date|from` if the header is absent)
5. Skip messages whose ID is already in `processed_emails` OR whose `email_message_id` appears in any `content` row (including deleted) — this double-check prevents reprocessing if a `processed_emails` record is ever missing
6. Parse body: prefer `text/plain`, fall back to HTML. HTML fallback converts `<br>` and closing block tags to `\n` before stripping other tags so that signature detection (which requires a newline) works correctly in HTML emails
7. Strip email signature: search for the two-line consecutive pattern unique to each sender (see below) and discard everything from that point onward
8. Extract URLs in Node.js from the signature-stripped body (not by Claude). `planetfab.com` is on a denylist so own-domain signature URLs are always excluded
9. Sanitize: remove `\n`, `\r`, `\t` (matches the Make.com Tools module formula)
10. Extract image attachments (jpeg/png/gif/webp, max 4 MB each, max 5 for Claude, max 3 stored)
11. Send subject + body + images to Claude via the Messages API (max 5 images, base64 encoded) — **no web search tool at this stage**
12. Parse Claude's JSON response (9 fields including `meta_description`); truncate `meta_description` to 155 chars at word boundary if over limit
13. Override `source_urls` with the Node.js-extracted URLs (Claude's `source_urls` output is discarded)
14. Convert up to 3 image attachments to base64 and store as JSON in the `images` column
15. Write to `content` table (status `Draft`) with `email_message_id` and `email_received_at` set
16. Record the `Message-ID` in `processed_emails`

### Check Email button (manual / on-demand)
Uses **Server-Sent Events (SSE)** to stream real-time progress into the header ticker:
- "Connecting to mailbox…"
- "Found N new emails…"
- "Processing: `<subject>`…"
- "Saving to database…"
- "Done — N new cards added." or "No new emails found."

The ticker scrolls horizontally inside a fixed-width clipped container when the message is too long. Width never changes regardless of subject length.

### Email signature stripping
```
Fabrice G. Frere\nCreative Director | PlanetFab Studio
Michelle Keller\nArt Director | PlanetFab Studio
```
`[ \t]*\r?\n` tolerates trailing spaces and handles both CRLF and LF line endings. Everything from the match position onward is discarded. Implemented in `src/email-watcher.js` as `SIG_RE`.

For HTML-only emails: `<br>` and closing block tags are converted to `\n` before stripping, ensuring the regex always has a newline to match.

### Claude system prompt
The system prompt in `src/claude.js` produces **9 output fields**:

| Field | Description |
|---|---|
| `section_name` | Newsletter section name |
| `piece_title` | Headline |
| `newsletter_blurb` | 150–750 word newsletter text in Michelle's voice |
| `linkedin_hook` | Complete LinkedIn post, 150–250 words + hashtags |
| `instagram_caption` | Instagram caption |
| `source_urls` | Populated by Node.js extraction; Claude is told to leave this empty |
| `blog_post` | 600–800 word journalistic article. `<em></em>` is the only permitted HTML — used for titles of published works (books, magazines, films, exhibitions, albums, monographs) |
| `meta_description` | SEO summary, hard max 155 chars, enforced by `truncateMeta()` after parse |

`max_tokens` is set to 4000 to accommodate the full blog post alongside the other fields.

**Prompt caching (June 9 2026):** The `system` parameter is passed as an array with `cache_control: { type: "ephemeral" }` on the system prompt block. The system prompt is ~1,100 tokens and identical across every call, so cached reads save ~90% of those input tokens. Cache TTL is 5 minutes, refreshed on each hit. Both `processContent()` and `enrichContent()` use this format. Cache hits appear in the API response as `cache_read_input_tokens`.

**Web search (disabled by default):** The `web_search_20250305` tool is NOT included in `processContent()`. It is only enabled in `enrichContent()`, which is called by the manual **Research & Enrich** button in the edit modal. A confirmation dialog warns the user of the $0.50–$1.00 estimated cost before proceeding.

**Formatting rules (Strunk & White):** The `FORMATTING RULES` section constrains `blog_post`: bold only for critical terms introduced for the first time, `<em></em>` for titles of works and foreign words, links only when directly citing a source, no headers, no underlines except hyperlinks. When in doubt, no formatting.

---

## Image Handling

### Storage
Images from email attachments are stored as base64 in the `images` TEXT column (JSON array). Up to 3 images are stored per card. Each entry: `{ data: base64string, contentType, filename, caption? }`.

The `getImageSrc(img)` function in `app.js` is the **single swap point** for the storage format — it returns `img.url || data:${img.contentType};base64,${img.data}`. When migrating to Cloudflare R2 or S3, only this function and the `storedImages` builder in `email-watcher.js` need to change.

The `express.json` body size limit is set to `50mb` to handle base64 image arrays in PUT requests.

### Card display
Each card shows up to 3 thumbnail images. Clicking a thumbnail opens a full-screen lightbox with previous/next navigation, a download button, and a counter. The lightbox is keyboard-navigable (←/→/Escape) and touch-friendly on mobile.

### Edit modal image management
- Up to 3 images per card — shown as thumbnails with an × remove button
- **Hero badge** on the first thumbnail — the first image is always the featured/hero image
- **Photo credit field** — a small text input below each thumbnail for optional caption/credit. Stored in the image object alongside `data`/`contentType`/`filename`. Sent to WordPress as both a Gutenberg `<figcaption>` on inline images and via PATCH to the WP media library caption field.
- **Drag to reorder** using the Pointer Events API (`setPointerCapture` routes all move/up events regardless of pointer position; `touch-action: none` prevents scroll competition on mobile). The caption input is excluded from drag initiation.
- **Add Image** button — opens a file picker for JPEG/PNG/WebP (max 3 total). Files are converted to base64 client-side via FileReader. Manually added images are NOT sent to Claude for analysis.

### LinkedIn image publishing
When publishing to LinkedIn and the card has images, the first image is resized to **1200×627** (cover crop, 85% JPEG quality via `sharp`) and uploaded via the 3-step LinkedIn media API: register upload slot → PUT binary to pre-signed URL → create post with `shareMediaCategory: IMAGE`. Falls back to text-only post if no images or upload fails.

### WordPress image publishing
- **First image**: resized to **1536×1024** JPEG → uploaded to WP media library → set as `featured_media`. Caption set via PATCH to WP media endpoint if a credit is present.
- **Additional images (2nd, 3rd)**: uploaded at original size/format → embedded as `<!-- wp:image -->` Gutenberg blocks after the first paragraph, with `<figcaption>` if a caption is present
- Individual image upload failures are non-blocking (null is pushed to keep index alignment)

---

## WordPress Integration

### Two-author publishing
Each card has two blog buttons: **Blog as Fabrice** and **Blog as Michelle**. Publishing to one does not affect the other — each has an independent green checkmark indicator. No approval status is required for either.

| Button | Credentials used |
|---|---|
| Blog as Fabrice | `WORDPRESS_USERNAME` + `WORDPRESS_APP_PASSWORD` |
| Blog as Michelle | `WORDPRESS_MICHELLE_USERNAME` + `WORDPRESS_MICHELLE_APP_PASSWORD` |

### Post content
WordPress receives the `blog_post` field as the post body (not `newsletter_blurb`). If `blog_post` is Quill HTML (starts with `<`), it is sent as-is with inline image blocks injected after the first `</p>`. If `blog_post` is plain text (pre-edit), it is wrapped in Gutenberg `<!-- wp:paragraph -->` blocks. If `blog_post` is empty, falls back to `newsletter_blurb`.

### SEO and excerpt
Each published post also receives:
- **`yoast_meta.yoast_wpseo_metadesc`** — set to `meta_description` if present (Yoast SEO plugin)
- **`excerpt.raw`** — set to the full `newsletter_blurb`; Elementor handles truncation in the archive view

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

### Accounts
| Account | Type | OAuth URL | Status |
|---|---|---|---|
| Fabrice Frere | Personal | `hub.planetfab.com/auth/linkedin/fabrice` | **Connected** (June 2026) |
| Michelle Keller | Personal | `hub.planetfab.com/auth/linkedin/michelle` | **Needs reconnect** — token not yet re-authorized |
| PlanetFab Studio | Company page | `hub.planetfab.com/auth/linkedin/planetfab` | Pending Marketing Developer Platform approval |

### Token lifetime
LinkedIn personal access tokens expire (~60 days for standard apps). When a publish attempt fails with an auth error, re-connect via `/settings`.

### Known limitation — PlanetFab Company Page
Posting to a LinkedIn Organization requires the `w_organization_social` scope and Marketing Developer Platform approval. Until granted, the PF LinkedIn button is removed from the card UI. Personal posts (Fabrice and Michelle) work once OAuth is complete.

---

## Instagram OAuth

### App details
- Meta App ID: `962437633354825`
- Graph API version: `v25.0`
- Redirect URI: `https://hub.planetfab.com/auth/instagram/callback`
- Instagram account: `@planetfab` (Business account, connected to a Facebook Page)
- OAuth scopes: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`

### How publishing works
`src/publishers/instagram.js` uses the two-step Meta Content Publishing API:
1. **Upload image to WordPress** — the first card image is resized to 1080×1080 JPEG and uploaded to the WordPress media library using Fabrice's credentials. This gives Meta a public HTTPS URL to fetch. **Fabrice's WordPress credentials must be set** for Instagram publishing to work.
2. **Create media container** — POST `/{ig-user-id}/media` with `image_url` (the WordPress `source_url`), `caption`, and `cross_post_to_facebook_page: true` (cross-posts to the linked Facebook Page automatically).
3. **Publish container** — POST `/{ig-user-id}/media_publish` with the container ID.

**Cards without images cannot be published to Instagram** — the publisher throws a clear error before making any API call.

**WP media library side effect:** each Instagram publish uploads one image to the WordPress media library as an orphaned attachment (no post parent). It does not affect the blog or any front-end pages but will accumulate in the media library over time.

### Token lifetime
The page-level access token does not expire under normal conditions. If Meta invalidates it, re-connect from `/settings`.

### Meta App status (as of June 9 2026)
The Meta app (`962437633354825`) is in **Live mode**. Instagram publishing is fully operational for the `@planetfab` account. The `instagram_content_publish` and `pages_read_engagement` permissions were approved via Meta App Review and the app was switched to Live mode in June 2026.

---

## Dashboard Features

### Content cards
Each card displays all content fields with labeled rows: Newsletter Blurb, LinkedIn Post, Instagram Caption, Blog Post, Blog Potential, and Source URLs. Each field label has a **copy-to-clipboard button** (always visible for mobile compatibility). Blog Post HTML is stripped to plain text before copying.

Below each card: the original **email received date** (subtle, shown when available).

### Status workflow
`Draft` → (click Approve) → `Approved` → (publish to a channel) → `Published`  
At any point, content can also be marked `Newsletter Ready`.  
Blog buttons work on any status.

Once a card is Published or Newsletter Ready, all channel buttons remain active. Each channel only disables once that specific channel has been published (per the green checkmark). Publishing to Fabrice LI does not affect Michelle LI, and vice versa.

### Edit modal fields
| Field | Input type | Notes |
|---|---|---|
| Piece Title | text input | |
| Section Name | text input | |
| Newsletter Blurb | textarea | Live word count (target: 150 words) |
| LinkedIn Post | textarea | |
| Instagram Caption | textarea | |
| Blog Potential | textarea | Auto-grows; Yes/No + expansion notes |
| Blog Post | Quill rich text | Bold, italic, underline, H2/H3, links. `<em>` for work titles. Saves as HTML. |
| Meta Description | text input | Live X/160 character counter; green at 150–160, red over 160 |
| Source URLs | textarea | Comma-separated; pre-filled by Node.js extraction |
| Status | select | Draft / Approved / Published / Newsletter Ready |
| Images | thumbnail grid | Hero badge, × remove, drag-to-reorder, Add Image, photo credit input per image |

### Research & Enrich button
In the edit modal next to the Blog Post field. Triggers `enrichContent()` which re-enables web search for a single API call to deepen the content with external research. Shows a confirmation dialog with estimated cost ($0.50–$1.00) before proceeding. Updates all text fields (blurb, LinkedIn, Instagram, meta description, blog post) with enriched content; user reviews and saves manually.

### Per-channel publish indicators
Each channel button shows a **green ✓ checkmark** once published to that channel. The timestamp is stored in `published_channels` (JSON column in PostgreSQL) and survives deployments. Channels are independent — publishing Fabrice LI does not mark or disable Michelle LI.

### Est. API cost display
Header shows "Est. API cost this month: $X.XX" — calculated as card count × $0.10. Hidden on mobile.

### Deleting and Trash
- **Single**: card moves to Trash (soft-delete: `deleted_at` set)
- **Bulk**: Select mode → checkboxes → Delete N Items
- **Trash**: filter tab showing deleted cards with 5-day countdown. Restore or Delete Forever.
- **Auto-purge**: daily cron at 3 am purges items older than 5 days.

### Publishing buttons (per card)
| Button | Destination | Requires |
|---|---|---|
| Fabrice LI | Fabrice's personal LinkedIn | Approved/Published + Fabrice LinkedIn OAuth |
| Michelle LI | Michelle's personal LinkedIn | Approved/Published + Michelle LinkedIn OAuth (needs reconnect) |
| Blog as Fabrice | planetfab.com WordPress draft (Fabrice byline) | None |
| Blog as Michelle | planetfab.com WordPress draft (Michelle byline) | None |
| Instagram | @planetfab Instagram + linked Facebook Page | Approved/Published + Instagram OAuth + card must have an image + Fabrice's WordPress credentials set |
| Newsletter | Marks as Newsletter Ready | Approved/Published |

Note: The **PlanetFab company LinkedIn button has been removed** from all cards. Company page publishing requires Marketing Developer Platform approval which is pending.

---

## Known Limitations

### 1. Instagram publishing — live as of June 9 2026
Images are uploaded to WordPress to obtain a public URL, then posted to Instagram via the Meta Graph API v25.0 with `cross_post_to_facebook_page: true`. The Meta app (`962437633354825`) is in **Live mode** and `instagram_content_publish` is approved. Publishing is fully operational for `@planetfab`. Railway env vars `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_USER_ID`, and `INSTAGRAM_PAGE_ID` are set.

### 2. LinkedIn company page requires Marketing Developer Platform access
Posting to the PlanetFab LinkedIn organization page requires LinkedIn's Marketing Developer Platform tier. Until approved, the button is not shown.

### 3. In-memory fallback without PostgreSQL
When `DATABASE_URL` is not set, all data is stored in-memory and lost on every restart. On Railway, the PostgreSQL addon must be added for persistence.

### 4. LinkedIn tokens expire (~60 days)
Each person will need to re-authorize via `/settings` approximately every 60 days.

### 5. Images stored as base64 in PostgreSQL (not object storage)
Email attachment images are stored as base64 JSON in the `images` column — up to 3 images, up to ~4 MB each. This works for the current two-person usage but will become unwieldy at scale. The `getImageSrc()` function in `app.js` is the designated swap point for migrating to Cloudflare R2 or S3.

### 6. No Notion integration in this version
The original Make.com pipeline wrote to a Notion database. This app does not write to Notion. The Make.com scenario still does.

### 7. Single-region, no CDN
Railway Hobby plan runs in a single region. Static assets are served directly by Express. Acceptable for a two-person private tool.

### 8. Anthropic spend limit
June 2026 spend limit: $350 (post-incident cap). From July 1 2026: $20/month. Current balance: ~$4. Monitor usage at console.anthropic.com.

---

## Features Still to Build

### 1. Migrate image storage to Cloudflare R2
**Current state:** Base64 in PostgreSQL `images` column — functional but not scalable.  
**Desired state:** Upload each image to R2 at processing time; store public URL in the database.  
**Swap points:** `getImageSrc(img)` in `app.js` (display) and the `storedImages` builder in `email-watcher.js` (write). Required env vars: bucket name, region, access key, secret key.

### 2. ~~Instagram publishing~~ — complete (June 9 2026)
Meta app in Live mode, `instagram_content_publish` approved, all Railway env vars set. No further action needed.

### 3. Buzz page CSS improvements
**Current state:** Functional but unstyled.  
**Desired state:** Match the hub's PlanetFab brand aesthetic.

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
- [x] Check Email button returns content with real-time SSE progress
- [x] LinkedIn OAuth completed for Fabrice (`/auth/linkedin/fabrice`)
- [ ] LinkedIn OAuth for Michelle — needs to reconnect (`/auth/linkedin/michelle`)
- [x] `WORDPRESS_USERNAME` + `WORDPRESS_APP_PASSWORD` set (Fabrice)
- [ ] `WORDPRESS_MICHELLE_USERNAME` + `WORDPRESS_MICHELLE_APP_PASSWORD` set (Michelle)
- [ ] Blog as Fabrice tested — opens WP editor in new tab
- [ ] Blog as Michelle tested — opens WP editor in new tab under Michelle's byline
- [x] Instagram OAuth completed — Meta app in Live mode, `INSTAGRAM_ACCESS_TOKEN` / `INSTAGRAM_USER_ID` / `INSTAGRAM_PAGE_ID` set in Railway (June 9 2026)
- [ ] Make.com "Integration Email" scenario left running until hub is fully validated

---

---

## Replication Guide — Deploying for a New Client

This section covers everything needed to spin up a new instance of this app for a different brand. Budget **4–8 hours** for a clean first deployment when all credentials are in hand; longer if LinkedIn Marketing Developer Platform approval or Meta App Review is needed (those can take days or weeks and are outside your control).

---

### What to Change in the System Prompt

The system prompt lives entirely in `src/claude.js` in the `SYSTEM_PROMPT` constant. It is a single long string — no external config file. For a new client, replace every brand-specific element:

| What to change | Where in the prompt | Example replacement |
|---|---|---|
| "Michelle Keller" (name) | First sentence and throughout | "Sara Kim" |
| "PlanetFab Studio" (studio name) | PLANETFAB CONTEXT section | "Studio Meridian" |
| "New York City" | PLANETFAB CONTEXT section | "Los Angeles" |
| "Subscribe for Vibes" (newsletter name) | First sentence | "The Friday Signal" |
| Newsletter section names | SECTION NAMES block | Replace with the client's own taxonomy |
| Clients / references | PLANETFAB CONTEXT section | Remove or replace with client's actual clients |
| Voice descriptors | VOICE block | Rewrite to match the new brand personality |
| THREE-MOVE STRUCTURE | Leave as-is or adapt | This is editorial scaffolding — works for most brands |
| BLOG POST instructions | PlanetFab lens sentence | Replace "design, branding, visual culture" with client's domain |

**The output field names (`section_name`, `piece_title`, etc.) and JSON format must not change** — they are referenced throughout `src/email-watcher.js` and `src/database.js`.

The `enrichContent()` function (Research & Enrich button) uses the same `SYSTEM_PROMPT`, so voice changes apply automatically there too.

---

### Swapping WordPress for Squarespace

The WordPress publisher is in `src/publishers/wordpress.js`. WordPress uses the WP REST API (`/wp-json/wp/v2/posts` and `/wp-json/wp/v2/media`) authenticated via HTTP Basic Auth with an Application Password.

**Squarespace does not have a comparable publishing API.** As of 2026 the Squarespace API v1 supports only Commerce, Inventory, and Profiles — it does not expose blog post creation endpoints. Options:

1. **Remove blog publishing entirely** — the hub still works; LinkedIn, Instagram, and newsletter marking are unaffected. Set `WORDPRESS_SITE_URL` to a placeholder and leave the blog buttons disabled in the UI.
2. **Use Squarespace's Make.com or Zapier integration** — post to a Make.com webhook that creates the Squarespace blog item. Replace `saveToWordPress()` in `src/publishers/wordpress.js` with a call to `axios.post(webhookUrl, payload)`.
3. **Switch to another REST-capable CMS** — Ghost (has a Content API), Webflow (CMS API v2), or WordPress.com (uses the same REST API as self-hosted WP). These are simpler swaps: only `wordpress.js` and the relevant env vars change.

If replacing WordPress: update `src/publishers/wordpress.js`, add the new publisher's env vars to `config.js`, and update the route in `src/routes/publish.js` that calls `saveToWordPress()`. The UI buttons in `public/js/app.js` are labeled "Blog as X" and can be relabeled or removed.

---

### Credentials to Collect from a New Client

Gather all of the following **before starting**. Missing credentials mid-setup will stall deployment.

**Infrastructure**
- [ ] A dedicated email inbox the client controls with IMAP access (host, port, username, password). Gmail works if IMAP is enabled and an App Password is generated (not the main password).
- [ ] Preferred domain/subdomain for the hub (e.g. `hub.clientdomain.com`) and access to their DNS provider to add a CNAME record.

**Anthropic**
- [ ] Anthropic account with a funded API key. Create at console.anthropic.com. Set a spend limit immediately — recommend $20–50/month for a two-person team.

**LinkedIn** (if LinkedIn publishing is wanted)
- [ ] A LinkedIn Developer App with "Share on LinkedIn" scope approved. Redirect URI must match the new hub's domain: `https://hub.clientdomain.com/auth/linkedin/callback`. Record the Client ID and Client Secret.
- [ ] Each person who will publish to LinkedIn must complete the OAuth flow after deployment via `/settings`.
- [ ] For a company page: the LinkedIn app must apply for Marketing Developer Platform access. This is a separate approval process that LinkedIn evaluates manually.

**Instagram / Meta** (if Instagram publishing is wanted)
- [ ] A Meta Developer App with the Instagram Business account linked to a Facebook Page. Redirect URI: `https://hub.clientdomain.com/auth/instagram/callback`. Record the App ID and App Secret.
- [ ] Fabrice's (or primary user's) WordPress Application Password must be set — the Instagram publisher uploads each image to WordPress to obtain a public URL before passing it to Meta. Instagram publishing will fail without this.
- [ ] The Meta app must pass App Review for `instagram_content_publish` before non-admin accounts can post. Plan for days to weeks.

**WordPress** (if blog publishing is wanted; skip for Squarespace)
- [ ] WordPress site URL (self-hosted or WordPress.com Business plan — both support the REST API).
- [ ] Application Password for each author. Generated in WP Admin → Users → Profile → Application Passwords. Must be generated by an account with at least Editor role.
- [ ] Confirm the Yoast SEO plugin is installed if SEO meta descriptions should populate (WP silently ignores `yoast_meta` if Yoast is absent — no error, just no SEO data).

**Session security**
- [ ] Generate a `SESSION_SECRET` with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- [ ] Choose dashboard passwords for each user (`FABRICE_PASSWORD` / `MICHELLE_PASSWORD` — rename these env vars to match the client's user names, and update `src/config.js` `users` object accordingly).

---

### Railway Setup Steps (New Project)

1. **Fork or copy the repo** to a new GitHub org/account for the client, or create a new private repo and push the code. Update the `HANDOFF.md` client header.

2. **Create a Railway project**
   - railway.app → New Project → Deploy from GitHub repo
   - Select the new repo, branch `main`
   - Railway auto-detects Node.js via NIXPACKS and uses `Procfile` (`web: node src/server.js`)

3. **Add PostgreSQL**
   - Project → + New → Database → Add PostgreSQL
   - `DATABASE_URL` is injected automatically; no action needed

4. **Set environment variables** (Project → Service → Variables)
   - All variables from the "Required to run" table in the Environment Variables section above
   - Replace `LINKEDIN_REDIRECT_URI` with the new domain: `https://hub.clientdomain.com/auth/linkedin/callback`
   - Replace `INSTAGRAM_REDIRECT_URI` similarly
   - Replace `WORDPRESS_SITE_URL` with the client's WordPress URL
   - Set `NODE_ENV=production`

5. **Deploy** — Railway auto-deploys on push to `main`. Watch the build log for errors. A successful first deploy initializes all database tables automatically.

6. **Add custom domain**
   - Railway → Service → Settings → Custom Domains → Add Domain → enter `hub.clientdomain.com`
   - Railway provides a CNAME target (e.g. `abc123.railway.app`)
   - Add a CNAME record in the client's DNS provider: host `hub`, value `abc123.railway.app`
   - SSL certificate provisions automatically (allow up to 10 minutes)

7. **Complete OAuth flows**
   - Visit `https://hub.clientdomain.com/settings`
   - Connect each LinkedIn account
   - Connect Instagram
   - Verify connections show green status

---

### DNS Setup

The app needs one DNS record: a CNAME from the hub subdomain to the Railway-provided domain.

```
Type:  CNAME
Host:  hub          (or whatever subdomain the client chose)
Value: abc123.railway.app   (Railway provides this in Service → Settings → Domains)
TTL:   3600
```

**Common DNS providers:** Dreamhost, Cloudflare, GoDaddy, Namecheap, Google Domains — all support CNAME records in their dashboard. On Cloudflare, proxy mode (orange cloud) may interfere with Railway's SSL certificate provisioning; set to DNS Only (grey cloud) if the certificate doesn't provision.

If the client uses a root domain (`clientdomain.com`) rather than a subdomain, some DNS providers support ANAME/ALIAS records for apex domains. Railway recommends using a subdomain.

---

### LinkedIn OAuth Setup (New App)

LinkedIn requires a Developer App per deployment. The same app can support multiple redirect URIs, but each deployment needs its own redirect URI added to the app's authorized list.

1. Go to developer.linkedin.com → My Apps → Create App
2. App name: `[Client Name] Hub` (internal only)
3. LinkedIn Page: link to the client's company page
4. OAuth 2.0 settings → Add redirect URL: `https://hub.clientdomain.com/auth/linkedin/callback`
5. Products → Request "Share on LinkedIn" — approved immediately for most apps
6. Copy Client ID and Client Secret → set as `LINKEDIN_CLIENT_ID` and `LINKEDIN_CLIENT_SECRET` in Railway

For each person who will post: after deployment, visit `https://hub.clientdomain.com/auth/linkedin/[username]` to complete their OAuth authorization. Tokens expire approximately every 60 days for standard apps; users re-authorize at `/settings`.

For company page posting, also request "Marketing Developer Platform" product access. LinkedIn evaluates this manually and may take days or reject non-qualifying apps.

---

### Instagram / Meta OAuth Setup (New App)

#### Prerequisites
- The client must have an **Instagram Business account** (not a personal or Creator account).
- That Instagram account must be **connected to a Facebook Page** the client administers. This is done in Instagram Settings → Account → Switch to Professional Account, then linking a Facebook Page.
- The Facebook Page admin must also be an admin of the Meta Developer App you create below.

#### Create the Meta Developer App
1. Go to developers.facebook.com → My Apps → Create App
2. App type: **Business**
3. App name: `[Client Name] Hub` (internal only — users never see this)
4. Connect a Business Portfolio if prompted (use the client's Meta Business account)
5. In the app dashboard, go to **App Settings → Basic**:
   - Add `hub.clientdomain.com` to **App Domains**
   - Set a Privacy Policy URL (required for App Review — can be the client's website)
   - Record **App ID** and **App Secret** → set as `META_APP_ID` and `META_APP_SECRET` in Railway
6. Go to **Use Cases → Customize** → add the **Instagram Graph API** use case
7. Add these permissions: `instagram_basic`, `instagram_content_publish`, `pages_show_list`, `pages_read_engagement`
8. Go to **App Settings → Advanced** → add the OAuth redirect URI: `https://hub.clientdomain.com/auth/instagram/callback`

#### Development mode vs Live mode
- The app starts in **Development mode**. In this mode, only Facebook accounts listed as App Admins or Testers can complete OAuth and publish. This is sufficient for testing.
- To allow any account to authenticate, submit the app for **Meta App Review** (`instagram_content_publish` and `pages_read_engagement`), then switch to **Live mode** in the app dashboard. App Review requires a Privacy Policy URL (the hub has one at `/privacy`), a demo video showing the publishing flow, and a business justification. Plan for days to weeks.
- **PlanetFab status:** The `962437633354825` app is already in Live mode as of June 2026. For a new client, repeat this process with their own Meta Developer App.

#### Complete the OAuth flow
After deployment, visit `https://hub.clientdomain.com/settings` and click **Connect Instagram**. The OAuth flow:
1. Redirects to Facebook login
2. Asks permission for the scopes listed above
3. Exchanges the auth code for a short-lived user token, then a long-lived page token (~60 days for user token; page token does not expire)
4. Discovers the Instagram Business Account connected to the user's Facebook Page
5. Saves `instagram_access_token` (page token) and `instagram_account_id` (Instagram user ID) to the `settings` database table

After connecting, the Settings page shows the connected Instagram username.

#### Image hosting dependency
Instagram publishing requires a **publicly accessible image URL** — the Meta API fetches the image from that URL when creating the media container. This app uses the WordPress media library as the image host: the first card image is uploaded to WordPress (resized to 1080×1080 JPEG) and the returned `source_url` is passed to Meta. **This means `WORDPRESS_USERNAME` and `WORDPRESS_APP_PASSWORD` must be set even if the client does not use blog publishing.** The uploaded images accumulate as orphaned attachments in the WP media library.

If the client has no WordPress site, an alternative image host (S3, Cloudflare R2, or any public URL) would need to replace the `uploadImageToWordPress()` call in `src/publishers/instagram.js`.

---

### Estimated Time to Replicate

| Phase | Time estimate | Blocker? |
|---|---|---|
| Fork repo + update system prompt + branding | 1–2 hours | No |
| Railway setup + env vars + DNS | 1 hour | No |
| LinkedIn app creation + personal OAuth | 30 min | No |
| WordPress Application Passwords | 15 min | No |
| Email inbox + IMAP setup | 30 min | No |
| Meta app + Instagram OAuth | 1–2 hours | No |
| Meta App Review (`instagram_content_publish`) | **Days to weeks** | Yes — external |
| LinkedIn Marketing Developer Platform | **Days to weeks** | Yes — external |

**Total for a functional hub (no Instagram, no company LinkedIn):** ~4 hours  
**Total fully featured:** 4 hours setup + waiting period for Meta/LinkedIn approvals

---

### Pre-Deployment Checklist (New Client)

Confirm each item is in hand before starting:

**Credentials in hand**
- [ ] IMAP host, port, username, password for the dedicated inbox
- [ ] Anthropic API key with spend limit set
- [ ] LinkedIn app Client ID + Client Secret (redirect URI added)
- [ ] Meta App ID + App Secret (redirect URI added, Instagram Business account linked to a Facebook Page)
- [ ] WordPress site URL + Application Password for primary author — required for both blog publishing **and** Instagram image hosting
- [ ] New `SESSION_SECRET` generated
- [ ] Dashboard usernames and passwords decided

**Code ready**
- [ ] System prompt updated for new brand voice, newsletter name, section names, studio context
- [ ] Email signature stripping regex in `src/email-watcher.js` updated (`SIG_RE`) — the current regex matches "Fabrice G. Frere\nCreative Director | PlanetFab Studio"; change to match the new client's email signature
- [ ] `src/config.js` `users` object updated if user names changed (rename `fabrice`/`michelle` keys)
- [ ] `WORDPRESS_SITE_URL` default in `src/config.js` updated from `https://www.planetfab.com` to the new client's URL (or remove the default and require the env var)
- [ ] Dashboard CSS (`public/css/app.css`) updated with client brand colors if needed

**Infrastructure ready**
- [ ] New GitHub repo exists
- [ ] Railway project created + PostgreSQL addon added
- [ ] All env vars set in Railway
- [ ] DNS CNAME record added
- [ ] Custom domain added in Railway, SSL active

**Post-deploy verification**
- [ ] App loads at the new hub URL
- [ ] Login works for all users
- [ ] Check Email button processes a test email end-to-end
- [ ] At least one LinkedIn account connected
- [ ] Blog publish tested (creates draft in WP editor)
- [ ] Spend limit confirmed at console.anthropic.com

---

*Built using Claude Code, June 2026.*
