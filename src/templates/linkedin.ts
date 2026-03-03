/**
 * LinkedIn job listing template.
 *
 * Proven approach (2026-03-03): Raw HTTP with Chrome-like headers gets HTTP 200.
 * Key data lives in <title> and og:* meta tags. Full JD is in the description__text div.
 *
 * Title tag varies by subdomain locale:
 *   www.linkedin.com  → "{company} hiring {title} in {location} | LinkedIn"
 *   ch.linkedin.com   → "{company} sucht {title} in {location} | LinkedIn"
 *   de.linkedin.com   → "{company} sucht {title} in {location} | LinkedIn"
 *   fr.linkedin.com   → "{company} recrute pour des postes de {title} ({location}) | LinkedIn"
 *
 * The regex uses alternation to handle all known locale verbs.
 *
 * Warning: LinkedIn's search bar contains geolocation text (e.g., "Saint-Maurice")
 * that must NOT be confused with the job location. Always extract location from
 * the <title> tag pattern, not from arbitrary page elements.
 */

import type { SiteTemplate } from "./types.js";

// Locale verb patterns: "hiring" (en), "sucht" (de), "recrute pour des postes de" (fr)
const VERB_PATTERN = "(?:hiring|sucht|recrute pour des postes de)";

export const linkedinTemplate: SiteTemplate = {
  name: "LinkedIn",
  urlPattern: /linkedin\.com\/jobs\/view\//,
  method: "http",
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "max-age=0",
  },
  fields: {
    title: {
      // Greedy .+ captures full title, backtracks to last " in " or "(" before "| LinkedIn"
      // Handles parens in titles like "(Data Management & Datenplattformen Fokus)"
      selector: "<title>",
      regex: `${VERB_PATTERN}\\s+(.+)\\s+(?:in\\s+|\\()[^|]+\\|\\s*LinkedIn`,
    },
    company: {
      // Company is always before the locale verb
      selector: "<title>",
      regex: `^(.+?)\\s+${VERB_PATTERN}\\s+`,
    },
    location: {
      // Greedy .* consumes everything before the LAST " in " or "(" to find location
      // en/de: "... in {location} | LinkedIn"
      // fr:    "... ({location}) | LinkedIn"
      selector: "<title>",
      regex: "(?:.*\\bin\\s+|.*\\()(.+?)\\)?\\s*\\|\\s*LinkedIn",
    },
    description: {
      selector: 'class="show-more-less-html__markup"',
      regex: 'class="show-more-less-html__markup"[^>]*>([\\s\\S]*?)</div>',
    },
    descriptionFallback: {
      metaTag: "og:description",
    },
  },
};
