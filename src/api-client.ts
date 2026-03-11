/**
 * SeriousLetter API client.
 *
 * Wraps the SeriousLetter external API (token-gated, /api/v1/*).
 * Supports multiple user profiles with runtime switching.
 *
 * Configuration:
 *   SL_API_URL   — base URL (default: https://jobs.seriousletter.com)
 *   SL_API_TOKEN — legacy single-token fallback
 *
 * User profiles are persisted to ~/.seriousletter-mcp-users.json
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const API_URL = process.env.SL_API_URL || "https://jobs.seriousletter.com";
const USERS_FILE = join(homedir(), ".seriousletter-mcp-users.json");

// --- User profile store ---

interface UserProfile {
  name: string;
  token: string;
}

// File-persisted registry: maps user names → tokens (shared across sessions)
// Active user is per-session (in memory only) so concurrent sessions can serve different users.

interface UserRegistry {
  users: Record<string, UserProfile>;
}

let registry: UserRegistry = { users: {} };
let activeUser: string | null = null; // per-session, NOT persisted

function loadRegistry(): void {
  if (existsSync(USERS_FILE)) {
    try {
      const raw = JSON.parse(readFileSync(USERS_FILE, "utf-8"));
      // Handle legacy format that had activeUser in file
      registry = { users: raw.users || {} };
    } catch {
      console.error("[SL] Failed to parse users file, starting fresh");
      registry = { users: {} };
    }
  }

  // Seed from legacy SL_API_TOKEN env var if no users exist
  const legacyToken = process.env.SL_API_TOKEN || "";
  if (Object.keys(registry.users).length === 0 && legacyToken) {
    registry.users["default"] = { name: "default", token: legacyToken };
    activeUser = "default";
    saveRegistry();
  }
}

function saveRegistry(): void {
  writeFileSync(USERS_FILE, JSON.stringify(registry, null, 2), "utf-8");
}

// Load on module init
loadRegistry();

// --- Public user management API ---

export function listUsers(): { activeUser: string | null; users: string[] } {
  return {
    activeUser,
    users: Object.keys(registry.users),
  };
}

export function switchUser(name: string): string {
  // Reload registry in case another session added a user
  loadRegistry();

  const key = name.toLowerCase();
  if (!registry.users[key]) {
    throw new Error(
      `User "${name}" not found. Known users: ${Object.keys(registry.users).join(", ") || "(none)"}. ` +
      `Use sl_add_user to register a new user with their API token.`,
    );
  }
  activeUser = key;
  return `Switched to user: ${registry.users[key].name} (this session only)`;
}

export function addUser(name: string, token: string): string {
  // Reload to avoid overwriting changes from other sessions
  loadRegistry();

  const key = name.toLowerCase();
  const isUpdate = !!registry.users[key];
  registry.users[key] = { name, token };
  saveRegistry();

  // Auto-switch in this session
  activeUser = key;

  const action = isUpdate ? "updated" : "registered";
  return `User "${name}" ${action} and activated. Token prefix: ${token.substring(0, 8)}...`;
}

export function removeUser(name: string): string {
  loadRegistry();

  const key = name.toLowerCase();
  if (!registry.users[key]) {
    throw new Error(`User "${name}" not found.`);
  }
  delete registry.users[key];
  if (activeUser === key) {
    activeUser = null;
  }
  saveRegistry();
  return `User "${name}" removed.`;
}

export function getActiveUserName(): string | null {
  if (!activeUser || !registry.users[activeUser]) return null;
  return registry.users[activeUser].name;
}

// --- Internal token resolution ---

function getActiveToken(): string {
  if (activeUser && registry.users[activeUser]) {
    return registry.users[activeUser].token;
  }
  const available = Object.keys(registry.users);
  const hint = available.length > 0
    ? `Known users: ${available.join(", ")}. Use sl_switch_user to select one.`
    : "Use sl_add_user to register a user with their API token.";
  throw new Error(`No active user for this session. ${hint}`);
}

async function apiRequest(
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  const token = getActiveToken();

  const url = `${API_URL}${path}`;
  const headers: Record<string, string> = {
    "X-API-Token": token,
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

export async function deleteJob(jobUuid: string): Promise<unknown> {
  return apiRequest("DELETE", `/api/v1/jobs/${jobUuid}`);
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

export async function updateCompany(
  companyUuid: string,
  data: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest("PUT", `/api/v1/companies/${companyUuid}`, data);
}

export async function deleteCompany(companyUuid: string): Promise<unknown> {
  return apiRequest("DELETE", `/api/v1/companies/${companyUuid}`);
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

export async function getProfile(profileUuid: string): Promise<unknown> {
  return apiRequest("GET", `/api/v1/profiles/${profileUuid}`);
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
  const body: Record<string, unknown> = { text: content };
  if (noteType) body.category = noteType;
  return apiRequest("POST", `/api/v1/jobs/${jobUuid}/notes`, body);
}

// --- Conversations ---

export async function listConversations(jobUuid: string): Promise<unknown> {
  return apiRequest("GET", `/api/v1/jobs/${jobUuid}/conversations`);
}

export async function createConversation(
  jobUuid: string,
  messages: Array<{ role: string; content: string }>,
  name?: string,
  cvUuid?: string,
): Promise<unknown> {
  const body: Record<string, unknown> = { messages };
  if (name) body.name = name;
  if (cvUuid) body.cv_uuid = cvUuid;
  return apiRequest("POST", `/api/v1/jobs/${jobUuid}/conversations`, body);
}

export async function getConversation(conversationId: number): Promise<unknown> {
  return apiRequest("GET", `/api/v1/conversations/${conversationId}`);
}

export async function updateConversation(
  conversationId: number,
  data: Record<string, unknown>,
): Promise<unknown> {
  return apiRequest("PUT", `/api/v1/conversations/${conversationId}`, data);
}

export async function deleteConversation(conversationId: number): Promise<unknown> {
  return apiRequest("DELETE", `/api/v1/conversations/${conversationId}`);
}

// --- Prompts/Pipelines ---

export async function listPrompts(section?: string): Promise<unknown> {
  const query = section ? `?section=${section}` : "";
  return apiRequest("GET", `/api/v1/prompts${query}`);
}

export async function getPrompt(pipelineId: string): Promise<unknown> {
  return apiRequest("GET", `/api/v1/prompts/${pipelineId}`);
}

// --- Pipeline Execution ---

export async function runPipeline(
  jobUuid: string,
  pipelineId: string,
  options?: {
    cv_uuid?: string;
    message?: string;
    save_conversation?: boolean;
    conversation_name?: string;
  },
): Promise<unknown> {
  const body: Record<string, unknown> = {};
  if (options?.cv_uuid) body.cv_uuid = options.cv_uuid;
  if (options?.message) body.message = options.message;
  if (options?.save_conversation !== undefined)
    body.save_conversation = options.save_conversation;
  if (options?.conversation_name)
    body.conversation_name = options.conversation_name;
  return apiRequest(
    "POST",
    `/api/v1/jobs/${jobUuid}/run/${pipelineId}`,
    body,
  );
}

// --- Export ---

export async function exportLetterPdf(letterId: number, template?: string): Promise<Response> {
  const token = getActiveToken();
  const query = template ? `?template=${template}` : "";
  const url = `${API_URL}/api/v1/export/letters/${letterId}/pdf${query}`;
  return fetch(url, { headers: { "X-API-Token": token } });
}

export async function exportCvPdf(profileUuid: string, template?: string): Promise<Response> {
  const token = getActiveToken();
  const query = template ? `?template=${template}` : "";
  const url = `${API_URL}/api/v1/export/cvs/${profileUuid}/pdf${query}`;
  return fetch(url, { headers: { "X-API-Token": token } });
}
