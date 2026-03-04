#!/usr/bin/env node
/**
 * SeriousLetter MCP server — entry point and tool registrations.
 *
 * Connects Claude Code to the SeriousLetter job application platform.
 * Tools:
 *   sl_scrape_job       — Scrape a job listing URL using site templates
 *   sl_create_job       — Create a job in SeriousLetter
 *   sl_list_jobs        — List recent jobs
 *   sl_search_jobs      — Search jobs by company/title
 *   sl_discover_api     — Show the SeriousLetter API schema
 *   sl_scrape_and_create — Scrape + create in one step
 *   sl_list_templates   — Show available scraping templates
 *   sl_list_profiles    — List CV profiles for copying to jobs
 *   sl_copy_cv_to_job   — Copy a CV profile to a job
 *
 * stdout is the JSON-RPC transport — all debug output goes to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { scrapeJob, findTemplate, listTemplates } from "./scraper.js";
import * as api from "./api-client.js";
import * as jobroom from "./jobroom-client.js";

function errorResponse(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
}

function textResponse(data: unknown) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

const server = new McpServer(
  {
    name: "seriousletter",
    version: "0.1.0",
  },
  {
    instructions: [
      "## SeriousLetter MCP — Job Application Management",
      "",
      "This MCP server connects to a SeriousLetter instance for managing job applications.",
      "It can scrape job listings from supported sites and create them in SeriousLetter.",
      "",
      "### Available Tools",
      "",
      "| Tool | Purpose |",
      "|------|---------|",
      "| `sl_scrape_job` | Scrape a job URL → structured data (no AI, deterministic templates) |",
      "| `sl_create_job` | Create a job application in SeriousLetter |",
      "| `sl_scrape_and_create` | Scrape + create in one step |",
      "| `sl_list_jobs` | List recent jobs (with optional status filter) |",
      "| `sl_search_jobs` | Search jobs by company or title |",
      "| `sl_discover_api` | Show the full SeriousLetter API schema |",
      "| `sl_list_templates` | Show available scraping templates |",
      "| `sl_list_profiles` | List CV profiles |",
      "| `sl_copy_cv_to_job` | Copy a CV profile to a job |",
      "| `sl_update_job` | Update an existing job |",
      "| `sl_get_job` | Get full details of a specific job |",
      "| `sl_list_companies` | List/search companies |",
      "| `sl_create_company` | Create a new company |",
      "| `sl_list_letters` | List cover letters for a job |",
      "| `sl_add_note` | Add a note to a job |",
      "| `sl_list_notes` | List notes for a job |",
      "| `sl_get_preferences` | Get user job search preferences |",
      "| `sl_update_preferences` | Update user preferences |",
      "| `sl_jobroom_check_session` | Check if Chrome has an active job-room.ch session |",
      "| `sl_jobroom_list_efforts` | List work efforts from job-room.ch |",
      "| `sl_jobroom_get_proof` | Get a proof record with all entries |",
      "| `sl_jobroom_submit_effort` | Submit a work effort to job-room.ch |",
      "| `sl_jobroom_sync_job` | Sync an SL job to job-room.ch as a work effort |",
      "",
      "### Typical Workflow",
      "",
      "1. User pastes a job URL",
      "2. `sl_scrape_job` → structured data (title, company, location, description)",
      "3. Review with user, then `sl_create_job` to save it",
      "4. Or use `sl_scrape_and_create` for one-step creation",
      "",
      "### job-room.ch (NPA/RAV) Workflow",
      "",
      "All job-room.ch API calls are routed through Chrome via macOS AppleScript.",
      "The browser handles authentication automatically (httpOnly SSO cookies).",
      "",
      "1. User opens job-room.ch in Chrome and logs in",
      "2. `sl_jobroom_check_session` to verify the session is active",
      "3. `sl_jobroom_list_efforts` to see existing entries",
      "4. `sl_jobroom_sync_job` to push SL jobs as work efforts",
      "",
      "### Job Evaluation Framework",
      "",
      "When evaluating a job, score it 1-5 on each criterion from the user's preferences",
      "(retrieved via `sl_get_preferences`). The evaluation_criteria field contains the user's",
      "personal scoring priorities (must-haves, nice-to-haves, deal-breakers).",
      "",
      "Output format for evaluation notes:",
      "```",
      "## Evaluation: [Position] at [Company]",
      "Overall Fit: X/5",
      "",
      "| Criterion | Score | Notes |",
      "|-----------|-------|-------|",
      "| [criterion] | X/5 | [reasoning] |",
      "",
      "### Summary",
      "[2-3 sentence assessment]",
      "```",
      "",
      "### Job Status Mapping",
      "",
      "| Status | When to use |",
      "|--------|-------------|",
      "| `opportunity` | New job, not yet reviewed |",
      "| `editing` | Preparing application materials |",
      "| `applied` | Application submitted |",
      "| `rejected` | Received rejection |",
      "| `not_applying` | Decided not to apply |",
      "| `outdated` | Job listing expired or filled |",
      "",
      "### Note Conventions",
      "",
      "When adding notes to jobs via `sl_add_note`, use these types:",
      "- `general` (default) — freeform notes",
      "- `evaluation` — job fit analysis using the evaluation framework",
      "- `status_change` — reason for status updates",
      "- `research` — company/role research findings",
      "",
      "### Cover Letter Generation",
      "",
      "When generating cover letters, check `sl_get_preferences` for the user's cover_letter_notes",
      "which contain style instructions (tone, emphasis areas, length preferences).",
      "Also check default_letter_template for the preferred template.",
      "",
      "### Batch Workflow",
      "",
      "For processing multiple jobs at once:",
      "1. Scrape all URLs first with `sl_scrape_job`",
      "2. Check for duplicates with `sl_search_jobs` for each",
      "3. Create non-duplicates with `sl_create_job`",
      "4. Evaluate each with the evaluation framework",
      "5. Add evaluation notes with `sl_add_note`",
      "",
      "### Supported Job Sites",
      "",
      "- **LinkedIn** (linkedin.com/jobs/view/*) — HTTP with Chrome headers",
      "- More coming: Jobup, Glassdoor, Experteer",
    ].join("\n"),
  },
);

// --- sl_scrape_job ---

server.registerTool("sl_scrape_job", {
  description:
    "Scrape a job listing URL using deterministic site templates. Returns structured job data (title, company, location, description). No AI model used — pure HTML extraction.",
  inputSchema: {
    url: z.string().url().describe("The job listing URL to scrape"),
  },
}, async ({ url }) => {
  try {
    const job = await scrapeJob(url);
    return textResponse(job);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_create_job ---

server.registerTool("sl_create_job", {
  description:
    "Create a new job application in SeriousLetter. Requires company and position_title at minimum. Returns the created job with its UUID.",
  inputSchema: {
    company: z.string().describe("Company name"),
    position_title: z.string().describe("Job title"),
    company_uuid: z.string().optional().describe("UUID of existing company record (copies address)"),
    status: z.string().optional().describe("Status: opportunity (default), editing, applied, rejected, not_applying, outdated"),
    source_url: z.string().optional().describe("URL where the job listing was found"),
    application_url: z.string().optional().describe("URL of the application form"),
    location: z.string().optional().describe("Job location"),
    salary_range: z.string().optional().describe("Salary range as free text"),
    priority: z.number().optional().describe("Priority 1-5 (1=highest)"),
    language: z.string().optional().describe("Job language code (en, de, fr)"),
    job_description: z.string().optional().describe("Full job description in markdown"),
    is_recruiting_agency: z.boolean().optional().describe("True if company is a recruiter"),
    contact_person: z.string().optional().describe("Contact person name"),
  },
}, async (params) => {
  try {
    const result = await api.createJob(params);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_list_jobs ---

server.registerTool("sl_list_jobs", {
  description:
    "List job applications from SeriousLetter. Returns newest first with pagination.",
  inputSchema: {
    status: z.string().optional().describe("Filter by status: opportunity, editing, applied, rejected, not_applying, outdated"),
    page: z.number().optional().describe("Page number (default 1)"),
    page_size: z.number().optional().describe("Results per page (default 20, max 100)"),
  },
}, async (params) => {
  try {
    const result = await api.listJobs(params);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_search_jobs ---

server.registerTool("sl_search_jobs", {
  description:
    "Search jobs in SeriousLetter by company name or position title. Fuzzy matching.",
  inputSchema: {
    q: z.string().describe("Search query"),
    page: z.number().optional().describe("Page number"),
  },
}, async ({ q, page }) => {
  try {
    const result = await api.searchJobs(q, page);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_discover_api ---

server.registerTool("sl_discover_api", {
  description:
    "Show the full SeriousLetter API schema. Useful for understanding what endpoints and fields are available.",
  inputSchema: {},
}, async () => {
  try {
    const result = await api.discover();
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_scrape_and_create ---

server.registerTool("sl_scrape_and_create", {
  description:
    "Scrape a job listing URL and create it in SeriousLetter in one step. Combines sl_scrape_job + sl_create_job.",
  inputSchema: {
    url: z.string().url().describe("The job listing URL to scrape and create"),
    language: z.string().optional().describe("Job language code (en, de, fr)"),
    priority: z.number().optional().describe("Priority 1-5 (1=highest)"),
    status: z.string().optional().describe("Initial status (default: opportunity)"),
  },
}, async ({ url, language, priority, status }) => {
  try {
    // Step 1: Scrape
    const scraped = await scrapeJob(url);

    // Step 2: Check for duplicates
    if (scraped.company) {
      const existing = await api.searchJobs(scraped.company);
      const jobs = (existing as { jobs?: Array<{ position_title: string }> })?.jobs || [];
      const duplicate = jobs.find(
        (j) => j.position_title?.toLowerCase() === scraped.title.toLowerCase(),
      );
      if (duplicate) {
        return textResponse({
          warning: "Possible duplicate found",
          scraped,
          existingJob: duplicate,
          action: "Job NOT created. Use sl_create_job manually if this is a different position.",
        });
      }
    }

    // Step 3: Create
    const jobData: api.CreateJobData = {
      company: scraped.company,
      position_title: scraped.title,
      source_url: url,
      location: scraped.location,
      job_description: scraped.description,
      ...(language && { language }),
      ...(priority && { priority }),
      ...(status && { status }),
    };

    const created = await api.createJob(jobData);

    return textResponse({
      scraped,
      created,
      message: `Job "${scraped.title}" at ${scraped.company} created successfully.`,
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_list_templates ---

server.registerTool("sl_list_templates", {
  description: "List available scraping templates and their supported URL patterns.",
  inputSchema: {},
}, async () => {
  try {
    const templates = listTemplates();
    return textResponse({
      templates,
      message: `${templates.length} template(s) available. Use sl_scrape_job with a matching URL.`,
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_list_profiles ---

server.registerTool("sl_list_profiles", {
  description: "List CV profiles from SeriousLetter. These can be copied to jobs.",
  inputSchema: {},
}, async () => {
  try {
    const result = await api.listProfiles();
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_copy_cv_to_job ---

server.registerTool("sl_copy_cv_to_job", {
  description:
    "Copy a CV profile to a job as a job-specific CV. Use sl_list_profiles to find profile UUIDs and sl_list_jobs to find job UUIDs.",
  inputSchema: {
    job_uuid: z.string().describe("UUID of the job to copy the CV to"),
    profile_uuid: z.string().describe("UUID of the CV profile to copy"),
    name: z.string().optional().describe("Override the auto-generated name for the copy"),
  },
}, async ({ job_uuid, profile_uuid, name }) => {
  try {
    const result = await api.copyProfileToJob(job_uuid, profile_uuid, name);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_update_job ---

server.registerTool("sl_update_job", {
  description:
    "Update an existing job in SeriousLetter. Use sl_list_jobs or sl_search_jobs to find the job UUID first.",
  inputSchema: {
    job_uuid: z.string().describe("UUID of the job to update"),
    status: z.string().optional().describe("New status: opportunity, editing, applied, rejected, not_applying, outdated"),
    position_title: z.string().optional().describe("Updated position title"),
    location: z.string().optional().describe("Updated location"),
    salary_range: z.string().optional().describe("Updated salary range"),
    priority: z.number().optional().describe("Priority 1-5 (1=highest)"),
    language: z.string().optional().describe("Job language code"),
    job_description: z.string().optional().describe("Updated job description"),
    source_url: z.string().optional().describe("Source URL"),
    application_url: z.string().optional().describe("Application URL"),
    contact_person: z.string().optional().describe("Contact person"),
  },
}, async ({ job_uuid, ...data }) => {
  try {
    const result = await api.updateJob(job_uuid, data);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_get_job ---

server.registerTool("sl_get_job", {
  description:
    "Get full details of a specific job including description, status, company info, and all metadata.",
  inputSchema: {
    job_uuid: z.string().describe("UUID of the job"),
  },
}, async ({ job_uuid }) => {
  try {
    const result = await api.getJob(job_uuid);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_list_companies ---

server.registerTool("sl_list_companies", {
  description:
    "List or search companies in SeriousLetter. Useful for finding existing company records before creating jobs.",
  inputSchema: {
    q: z.string().optional().describe("Search query (company name)"),
    page: z.number().optional().describe("Page number"),
  },
}, async ({ q, page }) => {
  try {
    const result = await api.searchCompanies(q, page);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_create_company ---

server.registerTool("sl_create_company", {
  description:
    "Create a new company record in SeriousLetter. Returns the company with its UUID, which can be used when creating jobs.",
  inputSchema: {
    name: z.string().describe("Company name"),
    website: z.string().optional().describe("Company website URL"),
    address_line1: z.string().optional().describe("Street address"),
    city: z.string().optional().describe("City"),
    postal_code: z.string().optional().describe("Postal code"),
    country_code: z.string().optional().describe("Country code (e.g. CH, DE)"),
    country: z.string().optional().describe("Country name"),
    contact_person: z.string().optional().describe("Contact person"),
    contact_email: z.string().optional().describe("Contact email"),
    notes: z.string().optional().describe("Notes about the company"),
    is_recruiting_agency: z.boolean().optional().describe("True if this is a recruiting agency"),
  },
}, async (params) => {
  try {
    const result = await api.createCompany(params);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_list_letters ---

server.registerTool("sl_list_letters", {
  description:
    "List cover letters for a specific job. Returns letter content, template, and metadata.",
  inputSchema: {
    job_uuid: z.string().describe("UUID of the job"),
  },
}, async ({ job_uuid }) => {
  try {
    const result = await api.listLetters(job_uuid);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_add_note ---

server.registerTool("sl_add_note", {
  description:
    "Add a note to a job. Use for evaluations, status change reasons, research findings, or general notes.",
  inputSchema: {
    job_uuid: z.string().describe("UUID of the job"),
    content: z.string().describe("Note content (markdown supported)"),
    note_type: z.string().optional().describe("Type: general (default), evaluation, status_change, research"),
  },
}, async ({ job_uuid, content, note_type }) => {
  try {
    const result = await api.addJobNote(job_uuid, content, note_type);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_list_notes ---

server.registerTool("sl_list_notes", {
  description:
    "List notes for a specific job. Returns all notes with content, type, and timestamps.",
  inputSchema: {
    job_uuid: z.string().describe("UUID of the job"),
  },
}, async ({ job_uuid }) => {
  try {
    const result = await api.listJobNotes(job_uuid);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_get_preferences ---

server.registerTool("sl_get_preferences", {
  description:
    "Get user job search preferences including salary expectations, availability, work arrangement, evaluation criteria, and cover letter style notes.",
  inputSchema: {},
}, async () => {
  try {
    const result = await api.getPreferences();
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_update_preferences ---

server.registerTool("sl_update_preferences", {
  description:
    "Update user job search preferences. Only include fields you want to change.",
  inputSchema: {
    salary_min: z.number().optional().describe("Minimum salary"),
    salary_max: z.number().optional().describe("Maximum salary"),
    salary_currency: z.string().optional().describe("Currency: CHF, EUR, USD, GBP"),
    availability: z.string().optional().describe("immediately, 1_month, 2_months, 3_months, by_agreement"),
    availability_date: z.string().optional().describe("Available from date (YYYY-MM-DD)"),
    notice_period: z.string().optional().describe("none, 1_month, 2_months, 3_months"),
    work_arrangement: z.string().optional().describe("any, remote, hybrid, onsite"),
    willingness_to_travel: z.string().optional().describe("no, occasionally, frequently, yes"),
    work_permit: z.string().optional().describe("Work permit details"),
    driving_license: z.string().optional().describe("Driving license category"),
    location_preferences: z.string().optional().describe("Where you want to work"),
    evaluation_criteria: z.string().optional().describe("Job evaluation criteria for AI scoring"),
    cover_letter_notes: z.string().optional().describe("Style instructions for cover letter generation"),
    default_letter_template: z.string().optional().describe("Default letter template ID"),
  },
}, async (params) => {
  try {
    const result = await api.updatePreferences(params);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// =====================================================================
// job-room.ch (NPA/RAV) tools — Browser Proxy
//
// All API calls are routed through Chrome via macOS AppleScript.
// The user must have job-room.ch open and logged in in Chrome.
// No manual auth setup needed — the browser handles it.
// =====================================================================

// --- sl_jobroom_check_session ---

server.registerTool("sl_jobroom_check_session", {
  description:
    "Check if Chrome has an active job-room.ch session. The user must have job-room.ch open and be logged in. Returns user info and userId.",
  inputSchema: {},
}, async () => {
  try {
    const session = await jobroom.checkSession();
    if (!session.ok) {
      return textResponse({
        authenticated: false,
        message: session.error || "Not logged in. Please open job-room.ch in Chrome and log in.",
      });
    }
    return textResponse({
      authenticated: true,
      userId: session.userId,
      user: session.user,
      message: "job-room.ch session active. Use sl_jobroom_list_efforts to see work efforts.",
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_jobroom_list_efforts ---

server.registerTool("sl_jobroom_list_efforts", {
  description:
    "List work efforts (Arbeitsbemühungen) from job-room.ch. Shows all proof records and their entries. Requires Chrome to be open with an active job-room.ch session.",
  inputSchema: {
    page: z.number().optional().describe("Page number (default 0)"),
  },
}, async ({ page }) => {
  try {
    const result = await jobroom.listProofs(undefined, page);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_jobroom_get_proof ---

server.registerTool("sl_jobroom_get_proof", {
  description:
    "Get a single proof record with all its work efforts. Use sl_jobroom_list_efforts first to find the proof ID.",
  inputSchema: {
    proof_id: z.string().describe("UUID of the proof record"),
  },
}, async ({ proof_id }) => {
  try {
    const result = await jobroom.getProof(proof_id);
    return textResponse(result);
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_jobroom_submit_effort ---

server.registerTool("sl_jobroom_submit_effort", {
  description:
    "Submit a work effort to job-room.ch (NPA/RAV). Requires Chrome to be open with an active job-room.ch session.",
  inputSchema: {
    occupation: z.string().describe("Position title / job role"),
    apply_date: z.string().describe("Application date YYYY-MM-DD"),
    company_name: z.string().describe("Company name"),
    company_street: z.string().optional().describe("Street address"),
    company_house_number: z.string().optional().describe("House number"),
    company_postal_code: z.string().optional().describe("Postal code"),
    company_city: z.string().optional().describe("City"),
    company_country: z.string().optional().describe("Country code (default: CH)"),
    contact_person: z.string().optional().describe("Contact person name"),
    email: z.string().optional().describe("Contact email"),
    form_url: z.string().optional().describe("Application URL"),
    phone: z.string().optional().describe("Contact phone"),
    apply_channel: z.enum(["ELECTRONIC", "MAIL", "PERSONAL", "PHONE"]).optional().describe("How the application was sent (default: ELECTRONIC)"),
    apply_status: z.enum(["PENDING", "EMPLOYED", "REJECTED", "INTERVIEW"]).optional().describe("Current status (default: PENDING)"),
    full_time: z.boolean().optional().describe("Full-time position (default: true)"),
  },
}, async (params) => {
  try {
    const data: jobroom.CreateWorkEffortData = {
      occupation: params.occupation,
      applyDate: params.apply_date,
      companyName: params.company_name,
      companyStreet: params.company_street,
      companyHouseNumber: params.company_house_number,
      companyPostalCode: params.company_postal_code,
      companyCity: params.company_city,
      companyCountry: params.company_country || "CH",
      contactPerson: params.contact_person,
      email: params.email,
      formUrl: params.form_url,
      phone: params.phone,
      applyChannelTypes: [params.apply_channel || "ELECTRONIC"],
      applyStatus: [params.apply_status || "PENDING"],
      fullTimeJob: params.full_time !== false,
    };
    const result = await jobroom.createWorkEffort(data);
    return textResponse({
      message: `Work effort "${params.occupation}" at ${params.company_name} submitted to job-room.ch.`,
      result,
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// --- sl_jobroom_sync_job ---

server.registerTool("sl_jobroom_sync_job", {
  description:
    "Sync a SeriousLetter job to job-room.ch as a work effort. Fetches the job from SL, maps fields, and submits to job-room.ch. Requires Chrome to be open with an active job-room.ch session.",
  inputSchema: {
    job_uuid: z.string().describe("UUID of the SeriousLetter job to sync"),
    apply_date: z.string().optional().describe("Override application date (YYYY-MM-DD, defaults to job's applied_date or today)"),
  },
}, async ({ job_uuid, apply_date }) => {
  try {
    // Fetch job from SL
    const job = await api.getJob(job_uuid) as Record<string, unknown>;

    // Map to work effort
    const data = jobroom.slJobToWorkEffort(job, apply_date);

    if (!data.companyName || !data.occupation) {
      return errorResponse(new Error(
        `Job is missing required fields. company: "${data.companyName}", title: "${data.occupation}"`,
      ));
    }

    // Submit to job-room.ch via browser proxy
    const result = await jobroom.createWorkEffort(data);

    return textResponse({
      message: `Synced "${data.occupation}" at ${data.companyName} to job-room.ch.`,
      mappedData: data,
      result,
    });
  } catch (err) {
    return errorResponse(err);
  }
});

// --- Start the server ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("SeriousLetter MCP server started\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err}\n`);
  process.exit(1);
});
