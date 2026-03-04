/**
 * SeriousLetter API client.
 *
 * Wraps the SeriousLetter external API (token-gated, /api/v1/*).
 * Configured via environment variables:
 *   SL_API_URL   — base URL (default: https://jobs.seriousletter.com)
 *   SL_API_TOKEN — API token (required)
 */

const API_URL = process.env.SL_API_URL || "https://jobs.seriousletter.com";
const API_TOKEN = process.env.SL_API_TOKEN || "";

function ensureToken(): void {
  if (!API_TOKEN) {
    throw new Error(
      "SL_API_TOKEN not set. Generate one at your SeriousLetter instance under Settings > API Tokens.",
    );
  }
}

async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  ensureToken();

  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {
    "X-API-Token": API_TOKEN,
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`SL API ${method} ${path}: HTTP ${response.status} — ${text}`);
  }

  return response.json();
}

// --- Jobs ---

export interface JobListParams {
  status?: string;
  page?: number;
  page_size?: number;
}

export async function listJobs(params?: JobListParams): Promise<unknown> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.page) query.set("page", String(params.page));
  if (params?.page_size) query.set("page_size", String(params.page_size));
  const qs = query.toString();
  return apiRequest("GET", `/api/v1/jobs${qs ? `?${qs}` : ""}`);
}

export async function searchJobs(q: string, page?: number): Promise<unknown> {
  const query = new URLSearchParams({ q });
  if (page) query.set("page", String(page));
  return apiRequest("GET", `/api/v1/jobs/search?${query}`);
}

export async function getJob(jobUuid: string): Promise<unknown> {
  return apiRequest("GET", `/api/v1/jobs/${jobUuid}`);
}

export interface CreateJobData {
  company: string;
  position_title: string;
  company_uuid?: string;
  status?: string;
  source_url?: string;
  application_url?: string;
  location?: string;
  salary_range?: string;
  priority?: number;
  language?: string;
  job_description?: string;
  company_address_line1?: string;
  company_address_line2?: string;
  company_city?: string;
  company_postal_code?: string;
  company_country_code?: string;
  company_country?: string;
  is_recruiting_agency?: boolean;
  contact_person?: string;
}

export async function createJob(data: CreateJobData): Promise<unknown> {
  return apiRequest("POST", "/api/v1/jobs", data as unknown as Record<string, unknown>);
}

export async function updateJob(
  jobUuid: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest("PUT", `/api/v1/jobs/${jobUuid}`, data);
}

// --- Companies ---

export async function searchCompanies(q?: string, page?: number): Promise<unknown> {
  const query = new URLSearchParams();
  if (q) query.set("q", q);
  if (page) query.set("page", String(page));
  const qs = query.toString();
  return apiRequest("GET", `/api/v1/companies${qs ? `?${qs}` : ""}`);
}

export interface CreateCompanyData {
  name: string;
  website?: string;
  address_line1?: string;
  address_line2?: string;
  city?: string;
  postal_code?: string;
  country_code?: string;
  country?: string;
  contact_person?: string;
  contact_email?: string;
  contact_phone?: string;
  notes?: string;
  is_recruiting_agency?: boolean;
}

export async function createCompany(data: CreateCompanyData): Promise<unknown> {
  return apiRequest("POST", "/api/v1/companies", data as unknown as Record<string, unknown>);
}

// --- Discovery ---

export async function discover(): Promise<unknown> {
  return apiRequest("GET", "/api/v1/discover");
}

// --- Letters ---

export async function listLetters(jobUuid: string): Promise<unknown> {
  return apiRequest("GET", `/api/v1/jobs/${jobUuid}/letters`);
}

export interface CreateLetterData {
  content: string;
  version_name?: string;
  tone?: string;
  language?: string;
}

export async function createLetter(jobUuid: string, data: CreateLetterData): Promise<unknown> {
  return apiRequest("POST", `/api/v1/jobs/${jobUuid}/letters`, data as unknown as Record<string, unknown>);
}

export async function getLetter(letterId: number): Promise<unknown> {
  return apiRequest("GET", `/api/v1/letters/${letterId}`);
}

export async function updateLetter(
  letterId: number,
  data: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest("PUT", `/api/v1/letters/${letterId}`, data);
}

export async function generateLetter(
  jobUuid: string,
  options?: { tone?: string; language?: string; profile_uuid?: string },
): Promise<unknown> {
  return apiRequest("POST", `/api/v1/jobs/${jobUuid}/letters/generate`, (options || {}) as Record<string, unknown>);
}

// --- CVs ---

export async function listProfiles(): Promise<unknown> {
  return apiRequest("GET", "/api/v1/profiles");
}

export async function listJobCvs(jobUuid: string): Promise<unknown> {
  return apiRequest("GET", `/api/v1/jobs/${jobUuid}/cvs`);
}

export async function copyProfileToJob(
  jobUuid: string,
  profileUuid: string,
  name?: string,
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (name) body.name = name;
  return apiRequest("POST", `/api/v1/jobs/${jobUuid}/cvs/copy/${profileUuid}`, body);
}

// --- Preferences ---

export async function getPreferences(): Promise<unknown> {
  return apiRequest("GET", "/api/v1/preferences");
}

export async function updatePreferences(
  data: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest("PATCH", "/api/v1/preferences", data);
}

// --- Job Notes ---

export async function listJobNotes(jobUuid: string): Promise<unknown> {
  return apiRequest("GET", `/api/v1/jobs/${jobUuid}/notes`);
}

export async function addJobNote(
  jobUuid: string,
  content: string,
  noteType?: string,
): Promise<unknown> {
  const body: Record<string, unknown> = { content };
  if (noteType) body.note_type = noteType;
  return apiRequest("POST", `/api/v1/jobs/${jobUuid}/notes`, body);
}

// --- Export ---

export async function exportLetterPdf(letterId: number, template?: string): Promise<Response> {
  ensureToken();
  const query = template ? `?template=${template}` : "";
  const url = `${API_URL}/api/v1/export/letters/${letterId}/pdf${query}`;
  return fetch(url, { headers: { "X-API-Token": API_TOKEN } });
}

export async function exportCvPdf(profileUuid: string, template?: string): Promise<Response> {
  ensureToken();
  const query = template ? `?template=${template}` : "";
  const url = `${API_URL}/api/v1/export/cvs/${profileUuid}/pdf${query}`;
  return fetch(url, { headers: { "X-API-Token": API_TOKEN } });
}
