/**
 * job-room.ch (ORP/NPA) API client.
 *
 * Wraps the reverse-engineered job-room.ch internal API for submitting
 * work efforts (Arbeitsbemühungen / NPA) to the RAV system.
 *
 * Authentication requires a JWT token and CSRF value from an active
 * browser session. These are set at runtime via setAuth().
 *
 * API base: https://www.job-room.ch/onlineform-service/api/npa
 */

const BASE = "https://www.job-room.ch/onlineform-service/api/npa";
const USER_BASE = "https://www.job-room.ch/user-service/api";

// In-memory auth state (set per session via MCP tool)
let authToken = "";
let csrfValue = "";

/** Set authentication credentials from browser session */
export function setAuth(jwt: string, csrf: string): void {
  authToken = jwt;
  csrfValue = csrf;
}

/** Check if auth is configured */
export function hasAuth(): boolean {
  return !!(authToken && csrfValue);
}

/** Clear auth state */
export function clearAuth(): void {
  authToken = "";
  csrfValue = "";
}

function ensureAuth(): void {
  if (!authToken || !csrfValue) {
    throw new Error(
      "job-room.ch auth not set. Use sl_jobroom_set_auth with JWT token and CSRF value from your browser session.",
    );
  }
}

function csrfParam(): string {
  // CSRF value must be base64-encoded as _ng query param
  const encoded = Buffer.from(csrfValue).toString("base64");
  return `_ng=${encoded}`;
}

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${authToken}`,
    "X-Requested-With": "XMLHttpRequest",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

async function jobroomRequest(
  method: string,
  url: string,
  body?: Record<string, unknown>,
): Promise<unknown> {
  ensureAuth();

  const separator = url.includes("?") ? "&" : "?";
  const fullUrl = `${url}${separator}${csrfParam()}`;

  const response = await fetch(fullUrl, {
    method,
    headers: authHeaders(),
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`job-room.ch ${method} ${url}: HTTP ${response.status} — ${text}`);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

// --- User info ---

/** Get current user info (userId, etc.) */
export async function getCurrentUser(): Promise<unknown> {
  ensureAuth();
  const url = `${USER_BASE}/current-user?${csrfParam()}`;
  const response = await fetch(url, {
    headers: authHeaders(),
  });
  if (!response.ok) {
    throw new Error(`job-room.ch current-user: HTTP ${response.status}`);
  }
  return response.json();
}

// --- Proof of Work Efforts ---

export interface ProofRecord {
  id: string;
  status: string;
  controlPeriod?: { year: number; month: number };
  workEfforts?: WorkEffort[];
}

export interface WorkEffort {
  id: string;
  applyDate: string;
  occupation: string;
  applyStatus: string[];
  fullTimeJob: boolean;
  applyChannel: {
    contactPerson?: string;
    email?: string;
    formUrl?: string;
    phone?: string;
    types: string[];
    address?: {
      name: string;
      street?: string;
      houseNumber?: string;
      postalCode?: string;
      country?: string;
      city?: string;
    };
  };
}

/** List user's proof records (monthly containers) */
export async function listProofs(userId: string, page = 0): Promise<unknown> {
  return jobroomRequest(
    "GET",
    `${BASE}/_search/by-owner-user-id?userId=${userId}&page=${page}`,
  );
}

/** Get a single proof record with its work efforts */
export async function getProof(proofId: string): Promise<unknown> {
  return jobroomRequest("GET", `${BASE}/${proofId}`);
}

// --- Work Effort CRUD ---

export interface CreateWorkEffortData {
  occupation: string;
  applyDate: string;
  companyName: string;
  companyStreet?: string;
  companyHouseNumber?: string;
  companyPostalCode?: string;
  companyCity?: string;
  companyCountry?: string;
  contactPerson?: string;
  email?: string;
  formUrl?: string;
  phone?: string;
  applyChannelTypes?: string[];
  applyStatus?: string[];
  fullTimeJob?: boolean;
}

/** Build the job-room.ch work effort payload from our simplified input */
function buildWorkEffortPayload(data: CreateWorkEffortData): Record<string, unknown> {
  return {
    id: null,
    applyDate: data.applyDate,
    ravAssigned: false,
    applyChannel: {
      contactPerson: data.contactPerson || null,
      email: data.email || null,
      formUrl: data.formUrl || null,
      phone: data.phone || null,
      types: data.applyChannelTypes || ["ELECTRONIC"],
      address: {
        name: data.companyName,
        street: data.companyStreet || null,
        houseNumber: data.companyHouseNumber || null,
        postalCode: data.companyPostalCode || null,
        country: data.companyCountry || "CH",
        city: data.companyCity || null,
        poBox: null,
      },
    },
    applyStatus: data.applyStatus || ["PENDING"],
    occupation: data.occupation,
    fullTimeJob: data.fullTimeJob !== false,
    rejectionReason: null,
    jobAdvertisementId: null,
  };
}

/** Create a new work effort in a proof record */
export async function createWorkEffort(
  userId: string,
  data: CreateWorkEffortData,
): Promise<unknown> {
  const payload = buildWorkEffortPayload(data);
  return jobroomRequest(
    "POST",
    `${BASE}/_action/add-work-effort?userId=${userId}`,
    payload,
  );
}

/** Update an existing work effort */
export async function updateWorkEffort(
  userId: string,
  data: CreateWorkEffortData & { id: string },
): Promise<unknown> {
  const payload = { ...buildWorkEffortPayload(data), id: data.id };
  return jobroomRequest(
    "POST",
    `${BASE}/_action/update-work-effort?userId=${userId}`,
    payload,
  );
}

/** Delete a work effort */
export async function deleteWorkEffort(
  proofId: string,
  workEffortId: string,
): Promise<unknown> {
  return jobroomRequest(
    "DELETE",
    `${BASE}/${proofId}/work-efforts/${workEffortId}`,
  );
}

// --- Helpers ---

/** Map an SL job to a work effort creation payload */
export function slJobToWorkEffort(
  job: Record<string, unknown>,
  applyDate?: string,
): CreateWorkEffortData {
  const today = new Date().toISOString().split("T")[0];
  return {
    occupation: (job.position_title as string) || "",
    applyDate: applyDate || (job.applied_date as string) || today,
    companyName: (job.company as string) || "",
    companyStreet: (job.company_address_line1 as string) || undefined,
    companyPostalCode: (job.company_postal_code as string) || undefined,
    companyCity: (job.company_city as string) || undefined,
    companyCountry: (job.company_country_code as string) || "CH",
    contactPerson: (job.contact_person as string) || undefined,
    formUrl: (job.application_url as string) || (job.source_url as string) || undefined,
    applyChannelTypes: ["ELECTRONIC"],
    applyStatus: ["PENDING"],
    fullTimeJob: true,
  };
}
