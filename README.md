# SeriousLetter MCP

An MCP (Model Context Protocol) server that connects Claude Code to the
[SeriousLetter](https://jobs.seriousletter.com) job application platform.

Once configured, you can manage your entire job search from inside Claude Code:
scrape listings, maintain your pipeline, generate cover letters, export PDFs,
and file Swiss RAV/NPA work efforts — all without leaving the terminal.

Repository: [github.com/mnott/SeriousLetter-MCP](https://github.com/mnott/SeriousLetter-MCP)


## Features

- **50 tools** covering every part of the job application workflow
- Scrape job listings from LinkedIn and other supported sites — no manual copy-paste
- AI-powered cover letter generation using server-side pipelines (prompt templates stay on the server)
- CV/profile management and job-specific CV copies
- Swiss job-room.ch (arbeit.swiss) integration: search, import, and file work efforts
- Multi-user support: one installation, multiple users
- Full conversation and note history per job


## Requirements

- [Node.js](https://nodejs.org/) 18 or later
- [bun](https://bun.sh/) (used as the package manager and build tool)
- A SeriousLetter account with an API token
- Claude Code (claude.ai/code)


## Installation

### 1. Clone the repository

```bash
git clone https://github.com/mnott/SeriousLetter-MCP.git
cd SeriousLetter-MCP
```

### 2. Install dependencies

```bash
bun install
```

### 3. Build

```bash
bun run build
```

This compiles TypeScript to `dist/index.js`.

### 4. Get an API token

Sign in at [jobs.seriousletter.com](https://jobs.seriousletter.com), open your
profile, go to **API Tokens**, and generate a token.

### 5. Register the server in Claude Code

Edit `~/.claude.json` and add a `seriousletter` entry under the top-level
`mcpServers` object:

```json
{
  "mcpServers": {
    "seriousletter": {
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/SeriousLetter-MCP/dist/index.js"],
      "env": {
        "SL_API_URL": "https://jobs.seriousletter.com",
        "SL_API_TOKEN": "your-api-token-here"
      }
    }
  }
}
```

Replace `/absolute/path/to/SeriousLetter-MCP` with the actual path where you
cloned the repo (e.g. `~/dev/ai/SeriousLetter-MCP`).

### 6. Restart Claude Code

The tools appear as `mcp__seriousletter__sl_*` in your Claude Code session.


## Usage Examples

### Scrape and create a job from a URL

```
You: Scrape this job and add it to SeriousLetter:
     https://www.linkedin.com/jobs/view/1234567890

Claude: [uses sl_scrape_and_create]
        Done. Created "Senior Software Engineer" at Acme Corp (uuid: abc-123).
```

### Generate a cover letter

```
You: Generate a cover letter for the Acme Corp job, formal tone, in English.

Claude: [uses sl_generate_letter]
        Here is the generated letter: ...
```

### Export a letter as PDF

```
You: Export the cover letter as PDF and save it to my desktop.

Claude: [uses sl_list_letters, sl_export_letter_pdf]
        Exported. Saved to ~/Desktop/acme-corp-cover-letter.pdf
```

### Search Swiss job-room.ch

```
You: Search job-room.ch for software engineer roles in Zurich.

Claude: [uses sl_search_jobroom with canton_codes: ["ZH"]]
        Found 14 results. Here are the top matches: ...
```

### File a work effort to RAV

```
You: File the Acme Corp application as a work effort on job-room.ch.

Claude: [uses sl_jobroom_sync_job]
        Synced "Senior Software Engineer" at Acme Corp to job-room.ch.
```


## Tool Reference

### Job Management

| Tool | Description |
|------|-------------|
| `sl_scrape_job` | Scrape a job listing URL. Returns structured data (title, company, location, description). No AI used — pure HTML extraction. |
| `sl_create_job` | Create a new job application. Requires company and position title at minimum. |
| `sl_scrape_and_create` | Scrape a URL and create the job in one step. Checks for duplicates first. |
| `sl_list_jobs` | List job applications, newest first. Filter by status, paginate. |
| `sl_search_jobs` | Search jobs by company name or title. Fuzzy matching. |
| `sl_get_job` | Get full job details including description, status, and metadata. |
| `sl_update_job` | Update any field on an existing job (status, title, location, description, etc.). |
| `sl_discover_api` | Show the full SeriousLetter API schema. Useful for exploring available fields. |

### CV and Profiles

| Tool | Description |
|------|-------------|
| `sl_list_profiles` | List all CV profiles. Shows names and UUIDs. |
| `sl_get_profile` | Get full CV content: experiences, education, skills, languages, certifications. |
| `sl_copy_cv_to_job` | Copy a CV profile to a job as a job-specific CV for customisation. |
| `sl_export_cv_pdf` | Export a CV profile as PDF. |

### Cover Letters

| Tool | Description |
|------|-------------|
| `sl_list_letters` | List all cover letters for a job. |
| `sl_create_letter` | Save a cover letter to a job (store after generating or writing manually). |
| `sl_get_letter` | Get a single cover letter by ID. |
| `sl_update_letter` | Update a letter's content or version name. |
| `sl_generate_letter` | Generate a cover letter using SeriousLetter's 3-stage server-side pipeline (draft → review → consensus). |
| `sl_export_letter_pdf` | Export a cover letter as PDF. |

### Companies

| Tool | Description |
|------|-------------|
| `sl_list_companies` | List or search companies in the address book. |
| `sl_create_company` | Create a company record (name, address, contact). UUID can be reused across jobs. |

### Notes and Conversations

| Tool | Description |
|------|-------------|
| `sl_add_note` | Add a note to a job (evaluation, research finding, status reason). |
| `sl_list_notes` | List all notes for a job. |
| `sl_list_conversations` | List saved conversations for a job (analyses, evaluations). |
| `sl_save_conversation` | Save a conversation (array of user/assistant messages) to a job. |
| `sl_get_conversation` | Get a saved conversation by ID with all messages. |

### AI Pipelines

| Tool | Description |
|------|-------------|
| `sl_list_prompts` | List available AI pipelines. Shows name, section, stage count. Prompt templates are not exposed. |
| `sl_get_prompt` | Get pipeline metadata: stages, execution order, context variables. |
| `sl_run_prompt` | Run an AI pipeline server-side on a job. Returns gap analysis, skill analysis, cover letter, etc. |

### Scraping Templates

| Tool | Description |
|------|-------------|
| `sl_list_templates` | List available site templates and their supported URL patterns. LinkedIn is currently supported; more are planned. |

### Preferences

| Tool | Description |
|------|-------------|
| `sl_get_preferences` | Get user preferences: salary, availability, work arrangement, evaluation criteria, cover letter style notes. |
| `sl_update_preferences` | Update any preference field. |

### job-room.ch (Swiss Public Employment Service)

These tools integrate with [arbeit.swiss](https://www.job-room.ch), Switzerland's
official public job platform.

**Search tools** — no authentication required:

| Tool | Description |
|------|-------------|
| `sl_search_jobroom` | Search job-room.ch for jobs by keyword, canton, workload, and more. |
| `sl_get_jobroom_job` | Get full details of a job-room.ch listing by UUID. |
| `sl_import_jobroom_job` | Import a job-room.ch listing into SeriousLetter (checks for duplicates first). |

**RAV/NPA work effort tools** — require Chrome open and logged in to job-room.ch.
API calls are routed through your browser session, so no separate credential setup
is needed:

| Tool | Description |
|------|-------------|
| `sl_jobroom_check_session` | Verify that Chrome has an active job-room.ch login. |
| `sl_jobroom_list_efforts` | List all filed work efforts (Arbeitsbemühungen). |
| `sl_jobroom_get_proof` | Get a single proof record with all its work effort entries. |
| `sl_jobroom_submit_effort` | Submit a new work effort directly (manual field entry). |
| `sl_jobroom_sync_job` | Sync a SeriousLetter job to job-room.ch automatically — fetches job data and maps fields. |

### Multi-User Management

| Tool | Description |
|------|-------------|
| `sl_list_users` | List registered users and show which is active in this session. |
| `sl_switch_user` | Switch to a different user for the rest of the session. |
| `sl_add_user` | Register a new user (or update an existing user's token). |
| `sl_remove_user` | Remove a registered user and their token. |


## Multi-User Support

Multiple people can share one MCP installation. Each user needs their own
SeriousLetter API token.

### Add the first user at install time

Set the primary user's token in `~/.claude.json` as shown in the Installation
section above. This becomes the default user.

### Add additional users at runtime

```
You: Add Grazyna as a SeriousLetter user with token abc123...

Claude: [uses sl_add_user]
        User "Grazyna" registered.
```

### Switch between users

```
You: Switch to Grazyna.

Claude: [uses sl_switch_user]
        Switched to Grazyna. All subsequent calls use her token.
```

User sessions are per-Claude-Code-session. Switching does not persist across
restarts; the token in `~/.claude.json` is always the startup default.


## Typical Workflow

A complete job application flow looks like this:

1. **Find a job** — paste the URL, or search job-room.ch
2. **Scrape and create** — `sl_scrape_and_create` extracts the listing and saves it
3. **Attach a CV** — `sl_copy_cv_to_job` links your profile to the job
4. **Evaluate** — `sl_run_prompt` runs a gap analysis or skill analysis pipeline
5. **Generate a letter** — `sl_generate_letter` runs the 3-stage AI pipeline
6. **Refine** — `sl_update_letter` to edit; `sl_add_note` to record thoughts
7. **Export** — `sl_export_letter_pdf` and `sl_export_cv_pdf`
8. **File with RAV** — `sl_jobroom_sync_job` submits the work effort to job-room.ch


## Development

```bash
# Install dependencies
bun install

# Compile TypeScript
bun run build

# Watch mode (recompiles on save)
bun run dev

# Run the server directly (for testing)
node dist/index.js
```

The source is in `src/`:

- `index.ts` — All tool registrations and server entry point
- `api-client.ts` — SeriousLetter REST API client
- `jobroom-client.ts` — job-room.ch browser-proxy client (RAV/NPA tools)
- `jobroom-search.ts` — job-room.ch public search API client
- `scraper.ts` — Job listing scraper using Playwright and site templates
- `templates/` — Per-site scraping templates (LinkedIn, etc.)

After making changes to the source, rebuild with `bun run build` and restart
Claude Code to pick up the new version.


## License

MIT
