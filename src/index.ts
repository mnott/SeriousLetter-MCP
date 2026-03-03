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
      "| `sl_jobroom_set_auth` | Set job-room.ch auth (JWT + CSRF from browser) |",
      "| `sl_jobroom_auth_status` | Check job-room.ch auth status |",
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
      "1. User logs into job-room.ch in their browser",
      "2. `sl_jobroom_set_auth` with JWT token and CSRF cookie from DevTools",
      "3. `sl_jobroom_list_efforts` to see existing entries",
      "4. `sl_jobroom_sync_job` to push SL jobs as work efforts",
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

// =====================================================================
// job-room.ch (NPA/RAV) tools
// =====================================================================

// --- sl_jobroom_set_auth ---

server.registerTool("sl_jobroom_set_auth", {
  description:
    "Set job-room.ch authentication credentials from your browser session. Required before using any other sl_jobroom_* tools. Get the JWT from the Authorization header and the CSRF from cookies in Chrome DevTools.",
  inputSchema: {
    jwt: z.string().describe("Bearer JWT token from the Authorization header (without 'Bearer ' prefix)"),
    csrf: z.string().describe("CSRF cookie value (will be base64-encoded automatically)"),
  },
}, async ({ jwt, csrf }) => {
  try {
    jobroom.setAuth(jwt, csrf);
    // Verify by fetching current user
    const user = await jobroom.getCurrentUser();
    return textResponse({
      message: "job-room.ch auth configured successfully.",
      user,
    });
  } catch (err) {
    jobroom.clearAuth();
    return errorResponse(err);
  }
});

// --- sl_jobroom_auth_status ---

server.registerTool("sl_jobroom_auth_status", {
  description: "Check if job-room.ch authentication is configured.",
  inputSchema: {},
}, async () => {
  return textResponse({
    authenticated: jobroom.hasAuth(),
    message: jobroom.hasAuth()
      ? "job-room.ch auth is configured. Use sl_jobroom_list_efforts to see work efforts."
      : "Not authenticated. Use sl_jobroom_set_auth with JWT and CSRF from your browser session.",
  });
});

// --- sl_jobroom_list_efforts ---

server.registerTool("sl_jobroom_list_efforts", {
  description:
    "List work efforts (Arbeitsbemühungen) from job-room.ch. Shows all proof records and their entries. Requires prior sl_jobroom_set_auth.",
  inputSchema: {
    user_id: z.string().describe("User ID from job-room.ch (get via sl_jobroom_set_auth response)"),
    page: z.number().optional().describe("Page number (default 0)"),
  },
}, async ({ user_id, page }) => {
  try {
    const result = await jobroom.listProofs(user_id, page);
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
    "Submit a work effort to job-room.ch (NPA/RAV). Can create from scratch or from an existing SeriousLetter job. Use sl_jobroom_set_auth first.",
  inputSchema: {
    user_id: z.string().describe("User ID from job-room.ch"),
    occupation: z.string().describe("Position title / job role"),
    apply_date: z.string().describe("Application date YYYY-MM-DD"),
    company_name: z.string().describe("Company name"),
    company_street: z.string().optional().describe("Street address"),
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
    const result = await jobroom.createWorkEffort(params.user_id, data);
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
    "Sync a SeriousLetter job to job-room.ch as a work effort. Fetches the job from SL, maps fields, and submits to job-room.ch. Requires sl_jobroom_set_auth first.",
  inputSchema: {
    job_uuid: z.string().describe("UUID of the SeriousLetter job to sync"),
    user_id: z.string().describe("User ID from job-room.ch"),
    apply_date: z.string().optional().describe("Override application date (YYYY-MM-DD, defaults to job's applied_date or today)"),
  },
}, async ({ job_uuid, user_id, apply_date }) => {
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

    // Submit to job-room.ch
    const result = await jobroom.createWorkEffort(user_id, data);

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
