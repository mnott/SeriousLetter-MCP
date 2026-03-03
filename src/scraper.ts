/**
 * Template-based scraping engine.
 *
 * Given a URL, matches it against registered site templates, fetches the HTML
 * with the template's headers, and extracts structured fields using the
 * template's field extractors.
 *
 * No AI model needed — extraction is deterministic.
 */

import type { SiteTemplate, ScrapedJob, FieldExtractor } from "./templates/types.js";
import { linkedinTemplate } from "./templates/linkedin.js";

/** All registered site templates */
const templates: SiteTemplate[] = [linkedinTemplate];

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

  if (template.method !== "http") {
    throw new Error(
      `Template "${template.name}" requires ${template.method} method, which is not yet implemented.`,
    );
  }

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
