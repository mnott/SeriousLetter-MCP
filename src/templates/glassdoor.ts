/**
 * Glassdoor job listing template (Playwright-based).
 *
 * Glassdoor blocks HTTP scraping (403) and renders empty pages on direct URL
 * navigation. The working approach:
 *
 * 1. Navigate directly to the job listing URL in a headless browser
 * 2. Wait for the job detail content to render (JS-driven)
 * 3. Extract structured data from the rendered DOM
 *
 * If direct navigation yields an empty page (anti-bot), fall back to:
 * - Navigate to Glassdoor's job search page first (establish cookies/context)
 * - Then navigate to the actual job URL
 *
 * Tested 2026-03-04: Successfully extracts title, company, location, salary,
 * and full description (Aufgaben/Anforderungen/Benefits sections).
 */

import type { Page } from "playwright";
import type { SiteTemplate, ScrapedJob } from "./types.js";

/** Try multiple selectors, return text content of the first match. */
async function textFromSelectors(page: Page, selectors: string[]): Promise<string> {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if (await loc.count() > 0) {
      const text = await loc.textContent();
      if (text?.trim()) return text.trim();
    }
  }
  return "";
}

/** Strip HTML tags from innerHTML, converting block elements to newlines. */
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract structured job data from a rendered Glassdoor page. */
async function extractJobData(page: Page): Promise<Partial<ScrapedJob>> {
  const extra: Record<string, string> = {};

  const title = await textFromSelectors(page, [
    '[data-test="job-title"]',
    ".JobDetails_jobTitle__Rw_gn",
    "h1",
  ]);

  const company = await textFromSelectors(page, [
    '[data-test="employer-name"]',
    "header h4",
    ".EmployerProfile_compactEmployerName__LE242",
    ".JobDetails_companyName__mSMKs a",
  ]);

  const location = await textFromSelectors(page, [
    '[data-test="location"]',
    ".JobDetails_location__mSg5h",
    ".LocationAndWorkTypes_location__yePvI",
  ]);

  // Salary (optional)
  const salary = await textFromSelectors(page, [
    '[data-test="salary-estimate"]',
    ".SalaryEstimate_averageEstimate__xF_7h",
  ]);
  if (salary) extra.salary = salary;

  // Employment type (optional)
  const empType = await textFromSelectors(page, ['[data-test="employment-type"]']);
  if (empType) extra.employmentType = empType;

  // Description: get innerHTML and strip tags
  let description = "";
  const descSelectors = [
    '[data-test="job-description"]',
    ".JobDetails_jobDescription__uW_fK",
    ".JobDetails_jobDescriptionWrapper__BTDTA",
  ];
  for (const sel of descSelectors) {
    const loc = page.locator(sel).first();
    if (await loc.count() > 0) {
      const html = await loc.innerHTML();
      if (html?.trim()) {
        description = stripHtml(html);
        break;
      }
    }
  }

  return { title, company, location, description, extra };
}

export const glassdoorTemplate: SiteTemplate = {
  name: "Glassdoor",
  // Match glassdoor.com, glassdoor.ch, glassdoor.de, etc.
  // Handles both /job-listing/ and /partner/jobListing.htm URL patterns
  urlPattern: /glassdoor\.\w+\/(?:job-listing\/|partner\/jobListing\.htm)/,
  method: "playwright",
  // Fields are unused for playwright templates — playwrightExtract handles everything.
  // We provide stub extractors to satisfy the type.
  fields: {
    title: { selector: "<title>" },
    company: { selector: "<title>" },
    location: { selector: "<title>" },
    description: { selector: "<title>" },
  },

  async playwrightExtract(page: Page, url: string): Promise<Partial<ScrapedJob>> {
    // Anti-detection: override navigator.webdriver before any navigation
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      // Remove automation-related properties
      Object.defineProperty(navigator, "plugins", {
        get: () => [1, 2, 3, 4, 5],
      });
      (globalThis as Record<string, unknown>).chrome = { runtime: {} };
    });

    // Set a realistic viewport and user-agent to avoid bot detection
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.setExtraHTTPHeaders({
      "Accept-Language": "en-US,en;q=0.9,de;q=0.8,fr;q=0.7",
    });

    // Attempt 1: Navigate directly to the job URL
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Wait for either the job detail to render or a timeout
    try {
      await page.waitForSelector(
        '[data-test="job-title"], .JobDetails_jobTitle__Rw_gn, h1',
        { timeout: 8000 },
      );
    } catch {
      // Direct navigation may have rendered an empty page.
      // Fall back: visit the Glassdoor job search page first to establish
      // cookies/JS context, then navigate to the job URL.
      const domain = new URL(url).origin;
      await page.goto(`${domain}/Job/jobs.htm`, {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
      // Brief wait for cookies/JS to settle
      await page.waitForTimeout(2000);

      // Now retry the actual job URL
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForSelector(
        '[data-test="job-title"], .JobDetails_jobTitle__Rw_gn, h1',
        { timeout: 10000 },
      );
    }

    // Accept cookies dialog if it appears (common on Glassdoor)
    try {
      const cookieButton = page.locator('button[id="onetrust-accept-btn-handler"]');
      if (await cookieButton.isVisible({ timeout: 1000 })) {
        await cookieButton.click();
      }
    } catch {
      // No cookie dialog — continue
    }

    // Small delay to ensure dynamic content finishes rendering
    await page.waitForTimeout(1500);

    return extractJobData(page);
  },
};
