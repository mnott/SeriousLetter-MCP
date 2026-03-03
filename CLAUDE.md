# SeriousLetter MCP

MCP server for SeriousLetter — scrape job listings from supported sites and manage applications via Claude Code.

## Quick Start

```bash
bun install
bun run build
# Server runs on stdio (MCP JSON-RPC protocol)
node dist/index.js
```

## Environment Variables

- `SL_API_URL` — SeriousLetter instance URL (default: `https://jobs.seriousletter.com`)
- `SL_API_TOKEN` — API token (required for all SL API operations)

## Architecture

```
src/
├── index.ts              # MCP server + tool registrations
├── api-client.ts         # SeriousLetter API client (HTTP, X-API-Token)
├── scraper.ts            # Template-based scraping engine
└── templates/
    ├── types.ts          # SiteTemplate type definitions
    └── linkedin.ts       # LinkedIn scraping template
```

## Adding a New Site Template

1. Create `src/templates/{site}.ts` implementing `SiteTemplate`
2. Import and add to the `templates` array in `src/scraper.ts`
3. Rebuild: `bun run build`

## Tools

| Tool | Description |
|------|-------------|
| `sl_scrape_job` | Scrape a job URL → structured data |
| `sl_create_job` | Create a job in SeriousLetter |
| `sl_scrape_and_create` | Scrape + create in one step |
| `sl_list_jobs` | List jobs with optional filters |
| `sl_search_jobs` | Search by company/title |
| `sl_discover_api` | Show the full SL API schema |
| `sl_list_templates` | Show available scraping templates |
| `sl_list_profiles` | List CV profiles |
| `sl_copy_cv_to_job` | Copy a CV to a job |
