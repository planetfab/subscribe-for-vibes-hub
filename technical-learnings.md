# Technical Learnings

## Railway and deployment

- `DATABASE_URL` must be linked via Railway's reference UI (the `{}` picker → `Postgres.DATABASE_URL`), never typed manually — manual entry causes `ENOTFOUND` errors.
- The Railway healthcheck must use a TCP port check, not the `/login` path (which causes timeout failures). There is no `healthcheckPath` in `railway.toml`.
- **Bare `railway variables` prints every secret in plaintext** to terminal output and scrollback. `--json` does **not** avoid this: per `railway variables --help`, JSON output "includes raw values". To inspect variables safely, pipe `--json` through a filter that prints only key names (or a masked/boolean comparison), e.g. `railway variables --json | python3 -c "import json,sys; print(sorted(json.load(sys.stdin)))"`.
- **Check which project the CLI is linked to before touching variables.** The linked project is per-directory and may not be the one you intend (the Hub directory was linked to NoteToPost on Sept 29 2026, so a bare `railway variables` showed NoteToPost's credentials). Run `railway status` first, or pass explicit `-p <project-id> -s <service> -e <environment>` on every call.

## Claude API

- The model name is `claude-sonnet-4-5`. `claude-sonnet-4-20250514` does not exist and returns 404.
- Prompt caching requires `cache_control: { type: "ephemeral" }` on the system prompt block.

## WordPress and Yoast

- Yoast fields require the `meta` envelope with underscore-prefixed keys (`_yoast_wpseo_*`). Any other key name silently fails to save.
- Yoast fields were silently broken since inception because of a wrong key name — fixed in commit `2bc6092`.
- Elementor HTML widgets need self-contained blocks: anchor tags use `style="color: inherit; font-size: inherit;"` to survive Elementor overrides, and lists use `<br />` before and after.

## Email ingestion and dedup

- Dedup uses two layers (the `processed_emails` table plus `email_message_id` on `content` rows). Deleting a card does not allow its source email to be reprocessed.
- Apple Mail marks emails read before the hub can detect them, so the watcher searches all emails from the last 7 days regardless of read/unread status.

## Images and publishing

- Instagram image hosting requires a public URL. WordPress serves as the image host for the two-step Meta publish flow.
- iPhone photos saved as `.jpg` can contain PNG data — use magic-byte detection for image type, not the file extension.
- The PlanetFab LinkedIn company page cannot coexist with personal Share on LinkedIn in the same Meta app (Community Management API conflict).

## Data integrity

- `blog_post` must be in `EDITABLE_FIELDS` (`src/routes/content.js`). Omitting it caused silent data loss on save — fixed in commit `060d4d8`.
