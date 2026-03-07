/**
 * Site template definitions for deterministic job scraping.
 *
 * Each job board has a predictable HTML structure. Templates map that structure
 * to structured fields without needing an AI model — just CSS selectors, regex,
 * and meta tag lookups.
 *
 * For JS-heavy sites (method: "playwright"), the template provides a
 * `playwrightExtract` function that drives a headless browser instead.
 */

import type { Page } from "playwright";

/** How to extract a single field from the HTML */
export interface FieldExtractor {
  /** CSS selector to find the element (uses regex on raw HTML since we don't have a DOM parser) */
  selector?: string;
  /** Regex pattern to extract from matched content — first capture group is the value */
  regex?: string;
  /** Meta tag name (e.g., "og:title") — shorthand for <meta property="..." content="..."> */
  metaTag?: string;
  /** Post-processing regex to clean the extracted value (applied after extraction) */
  transform?: {
    pattern: string;
    replacement: string;
  };
}

/** A complete site template for scraping a job board */
export interface SiteTemplate {
  /** Human-readable name (e.g., "LinkedIn") */
  name: string;
  /** Regex pattern to match URLs this template handles */
  urlPattern: RegExp;
  /** HTTP method — 'http' for simple fetch, 'playwright' for JS-heavy sites */
  method: "http" | "playwright";
  /** HTTP headers to send (e.g., Chrome-like headers for LinkedIn) */
  headers?: Record<string, string>;
  /** Field extractors — map field names to extraction rules */
  fields: {
    title: FieldExtractor;
    company: FieldExtractor;
    location: FieldExtractor;
    description: FieldExtractor;
    [key: string]: FieldExtractor;
  };
  /**
   * Custom Playwright extraction function for JS-heavy sites.
   * Receives a Playwright Page and the target URL. Handles navigation,
   * waiting, and extraction — returns partial ScrapedJob fields.
   * Only used when method is "playwright".
   */
  playwrightExtract?: (page: Page, url: string) => Promise<Partial<ScrapedJob>>;
}

/** Result of scraping a job listing */
export interface ScrapedJob {
  /** Job title */
  title: string;
  /** Company name */
  company: string;
  /** Job location */
  location: string;
  /** Job description (may be truncated for meta-tag-only extraction) */
  description: string;
  /** Original URL that was scraped */
  sourceUrl: string;
  /** Which template was used */
  templateName: string;
  /** Any additional fields extracted */
  extra: Record<string, string>;
}
