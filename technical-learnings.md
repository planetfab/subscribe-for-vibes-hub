# Technical Learnings

## Railway CLI

- **Bare `railway variables` prints every secret in plaintext** to terminal output and scrollback. Note that `--json` does **not** avoid this: per `railway variables --help`, JSON output "includes raw values". To inspect variables safely, pipe `--json` through a filter that prints only key names (or a masked/boolean comparison), e.g. `railway variables --json | python3 -c "import json,sys; print(sorted(json.load(sys.stdin)))"`.
- **Check which project the CLI is linked to before touching variables.** The linked project is per-directory and may not be the one you intend (the Hub directory was linked to NoteToPost on Sept 29 2026, so a bare `railway variables` showed NoteToPost's credentials). Run `railway status` first, or pass explicit `-p <project-id> -s <service> -e <environment>` on every call.
