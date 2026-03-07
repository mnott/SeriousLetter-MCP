/**
 * Template-based scraping engine.
 *
 * Given a URL, matches it against registered site templates, fetches the HTML
 * with the template's headers, and extracts structured fields using the
 * template's field extractors.
 *
 * No AI model needed — extraction is deterministic.
 */

import type { Browser } from "playwright";
import type { SiteTemplate, ScrapedJob, FieldExtractor } from "./templates/types.js";
import { linkedinTemplate } from "./templates/linkedin.js";
import { glassdoorTemplate } from "./templates/glassdoor.js";

/** All registered site templates */
const templates: SiteTemplate[] = [linkedinTemplate, glassdoorTemplate];

// --- Playwright browser lifecycle (lazy singleton) ---

let _browser: Browser | null = null;

/** Get or launch the shared browser instance.
 *  Uses system Chrome in non-headless mode to avoid bot detection on sites
 *  like Glassdoor. The window is minimized to stay out of the way. */
async function getBrowser(): Promise<Browser> {
  if (_browser?.isConnected()) return _browser;
  const { chromium } = await import("playwright");
  _browser = await chromium.launch({
    channel: "chrome",
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--window-position=-2400,-2400",
      "--window-size=1,1",
    ],
  });
  return _browser;
}

/** Close the shared browser (called on process exit). */
async function closeBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close().catch(() => {});
    _browser = null;
  }
}

// Clean up browser on exit
for (const sig of ["SIGTERM", "SIGINT", "beforeExit"] as const) {
  process.on(sig, () => { closeBrowser(); });
}

/** Find the template that matches a URL */
export function findTemplate(url: string): SiteTemplate | undefined {
  return templates.find((t) => t.urlPattern.test(url));
}

/** List all registered template names and their URL patterns */
export function listTemplates(): Array<{ name: string; pattern: string }> {
  return templates.map((t) => ({
    name: t.name,
    pattern: t.urlPattern.source,
  }));
}

/** Extract a single field from HTML using an extractor definition */
function extractField(html: string, extractor: FieldExtractor): string | undefined {
  let content: string | undefined;

  if (extractor.metaTag) {
    // Extract from <meta property="..." content="..."> or <meta name="..." content="...">
    const metaRegex = new RegExp(
      `<meta\\s+(?:property|name)=["']${escapeRegex(extractor.metaTag)}["']\\s+content=["']([^"']*?)["']`,
      "i",
    );
    const match = html.match(metaRegex);
    if (match) content = match[1];

    // Also try reversed attribute order: content before property
    if (!content) {
      const reversedRegex = new RegExp(
        `<meta\\s+content=["']([^"']*?)["']\\s+(?:property|name)=["']${escapeRegex(extractor.metaTag)}["']`,
        "i",
      );
      const match2 = html.match(reversedRegex);
      if (match2) content = match2[1];
    }
  } else if (extractor.selector && extractor.regex) {
    // First extract the selector region, then apply regex on that content
    let region = html;
    if (extractor.selector === "<title>") {
      const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (titleMatch) region = titleMatch[1];
    }
    const regex = new RegExp(extractor.regex, "is");
    const match = region.match(regex);
    if (match) content = match[1];
  } else if (extractor.selector) {
    // Simple selector: extract content between tags
    if (extractor.selector === "<title>") {
      const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
      if (match) content = match[1];
    }
  }

  // Apply transform if specified
  if (content && extractor.transform) {
    content = content.replace(
      new RegExp(extractor.transform.pattern, "g"),
      extractor.transform.replacement,
    );
  }

  // Clean up HTML entities and whitespace
  if (content) {
    content = decodeHtmlEntities(content).trim();
  }

  return content || undefined;
}

/** Scrape a job listing URL using the matching template */
export async function scrapeJob(url: string): Promise<ScrapedJob> {
  const template = findTemplate(url);
  if (!template) {
    const available = templates.map((t) => t.name).join(", ");
    throw new Error(
      `No template found for URL: ${url}\nAvailable templates: ${available}`,
    );
  }

  // --- Playwright-based extraction ---
  if (template.method === "playwright") {
    if (!template.playwrightExtract) {
      throw new Error(
        `Template "${template.name}" uses playwright method but has no playwrightExtract function.`,
      );
    }
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      const result = await template.playwrightExtract(page, url);
      return {
        title: result.title || "",
        company: result.company || "",
        location: result.location || "",
        description: result.description || "",
        sourceUrl: url,
        templateName: template.name,
        extra: result.extra || {},
      };
    } finally {
      await page.close();
    }
  }

  // --- HTTP-based extraction ---

  // Fetch the page
  const response = await fetch(url, {
    headers: template.headers || {},
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} fetching ${url} (template: ${template.name})`,
    );
  }

  const html = await response.text();

  // Extract core fields
  const title = extractField(html, template.fields.title) || "";
  const company = extractField(html, template.fields.company) || "";
  const location = extractField(html, template.fields.location) || "";

  // Try primary description, fall back to fallback
  let description = extractField(html, template.fields.description) || "";
  if (!description && template.fields.descriptionFallback) {
    description = extractField(html, template.fields.descriptionFallback) || "";
  }

  // Strip HTML tags from description
  if (description) {
    description = stripHtmlTags(description);
  }

  // Extract any extra fields (beyond the core 4 + descriptionFallback)
  const extra: Record<string, string> = {};
  for (const [key, extractor] of Object.entries(template.fields)) {
    if (["title", "company", "location", "description", "descriptionFallback"].includes(key)) {
      continue;
    }
    const value = extractField(html, extractor);
    if (value) extra[key] = value;
  }

  return {
    title,
    company,
    location,
    description,
    sourceUrl: url,
    templateName: template.name,
    extra,
  };
}

/** Escape special regex characters in a string */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Decode common HTML entities */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
}

/** Strip HTML tags, converting block elements to newlines */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
