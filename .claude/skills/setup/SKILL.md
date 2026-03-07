---
name: setup
description: Install and configure SeriousLetter MCP for Claude Code. USE WHEN user says "install seriousletter", "setup seriousletter mcp", "configure seriousletter", OR wants to set up the SeriousLetter MCP server.
---

# SeriousLetter MCP Setup Wizard

This skill installs and configures the SeriousLetter MCP server so Claude Code
can connect to the SeriousLetter job application platform.

Work through each step in order. Every step checks its own preconditions, so
the wizard is safe to re-run if setup was interrupted.

---

## Step 1: Check Prerequisites

**Check:** Verify that Node.js 18+ and bun are available.

```bash
node --version
bun --version
```

**Action if missing:**
- If `node` is not found or the version is below 18: direct the user to
  https://nodejs.org and ask them to install it, then re-run this skill.
- If `bun` is not found: run `curl -fsSL https://bun.sh/install | bash`
  or direct the user to https://bun.sh. Then re-run this skill.

Report the installed versions before continuing.

---

## Step 2: Locate or Clone the Repository

**Check:** Look for an existing clone at `~/dev/ai/seriousletter-mcp/`.
Check whether `dist/index.js` already exists (indicates a previous successful
build).

```bash
ls ~/dev/ai/seriousletter-mcp/dist/index.js 2>/dev/null && echo "EXISTS" || echo "NOT_FOUND"
```

**Action if not found:**
Ask the user where to clone the repository:

> Where should I clone the SeriousLetter MCP repository?
> Default: ~/dev/ai/seriousletter-mcp
> Press Enter to accept the default, or type a path.

Once confirmed, clone:

```bash
git clone https://github.com/mnott/SeriousLetter-MCP.git <chosen-path>
```

If the directory exists but is incomplete (no `dist/`), skip cloning and
continue from Step 3.

Record the resolved install path for use in later steps.

---

## Step 3: Install Dependencies

**Check:** Look for `node_modules/` in the install directory.

```bash
ls <install-path>/node_modules 2>/dev/null | head -1
```

**Action if missing:**

```bash
cd <install-path> && bun install
```

Report success or any errors before continuing.

---

## Step 4: Build the Server

**Check:** Verify `dist/index.js` exists and is newer than `src/index.ts`.

```bash
ls -la <install-path>/dist/index.js 2>/dev/null
```

**Action if missing or stale:**

```bash
cd <install-path> && bun run build
```

Confirm that `dist/index.js` was produced. If the build fails, report the
error output in full and stop — the user needs to resolve compile errors
before continuing.

---

## Step 5: Check Existing Registration

**Check:** Read `~/.claude.json` and look for a `seriousletter` key under
`mcpServers`.

```bash
grep -c '"seriousletter"' ~/.claude.json 2>/dev/null || echo "0"
```

**If already registered:**
Show the current configuration (mask the token — show only the first 8
characters followed by `...`). Ask:

> SeriousLetter MCP is already registered. Do you want to update the
> configuration? (yes/no)

If no, skip to Step 9.

---

## Step 6: Collect the API Token

**Action:** Ask the user for their SeriousLetter API token.

> Please paste your SeriousLetter API token.
> (Sign in at https://jobs.seriousletter.com, go to Profile > API Tokens,
> and generate one if you do not have one yet.)

If the user already has a token configured (detected in Step 5), offer to
keep the existing one:

> A token is already configured. Press Enter to keep it, or paste a new one.

Do not display the full token value in any output — mask it as `<token>` in
status messages.

---

## Step 7: Confirm the API URL

**Action:** Confirm the base URL. The default is the production server.

> SL_API_URL (default: https://jobs.seriousletter.com):
> Press Enter to accept, or type an override.

Accept the default unless the user explicitly types a different URL. Do not
suggest dev URLs unless the user brings them up.

---

## Step 8: Register in ~/.claude.json

**Action:** Edit `~/.claude.json` to add or update the `seriousletter` entry
under `mcpServers`.

The entry to write:

```json
"seriousletter": {
  "type": "stdio",
  "command": "node",
  "args": ["<absolute-install-path>/dist/index.js"],
  "env": {
    "SL_API_URL": "<confirmed-url>",
    "SL_API_TOKEN": "<token>"
  }
}
```

Use the absolute path to `dist/index.js` (expand `~` to the real home
directory path).

Read `~/.claude.json` first to parse the existing JSON. If `mcpServers`
does not exist, create it. Insert or replace the `seriousletter` key without
disturbing other entries. Write the result back as valid JSON.

Verify the file is valid JSON after writing:

```bash
node -e "JSON.parse(require('fs').readFileSync(process.env.HOME + '/.claude.json', 'utf8'))" && echo "VALID"
```

If the parse fails, show the diff and ask the user to review `~/.claude.json`
manually before continuing.

---

## Step 9: Verify the Server Starts

**Action:** Confirm the built server exits cleanly without crashing.

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1"}}}' \
  | SL_API_URL=https://jobs.seriousletter.com SL_API_TOKEN=test \
    node <absolute-install-path>/dist/index.js 2>/dev/null | head -1
```

This sends a minimal MCP initialize request. A JSON response starting with
`{"jsonrpc"` confirms the server loads correctly. An empty response or a
Node.js stack trace indicates a problem — report it and stop.

---

## Step 10: Report Completion

Report a summary of what was done:

- Install path
- Node.js and bun versions confirmed
- Whether the repo was cloned or already present
- Whether `~/.claude.json` was updated or already correct
- Server startup verified

Then instruct the user:

> Setup is complete. Restart Claude Code (quit and reopen, or run /quit and
> relaunch) for the new MCP server to take effect.
>
> After restart, the SeriousLetter tools will be available as:
>   mcp__seriousletter__sl_list_jobs
>   mcp__seriousletter__sl_scrape_and_create
>   ... (50 tools total)
>
> To add a second user, ask Claude: "Add <name> as a SeriousLetter user
> with token <token>".
>
> To verify the connection after restart, ask Claude:
>   "List my SeriousLetter jobs"
