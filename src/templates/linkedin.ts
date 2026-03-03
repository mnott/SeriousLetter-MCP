/**
 * LinkedIn job listing template.
 *
 * Proven approach (2026-03-03): Raw HTTP with Chrome-like headers gets HTTP 200.
 * Key data lives in <title> and og:* meta tags. Full JD is in the description__text div.
 *
 * Title format: "{company} hiring {title} in {location} | LinkedIn"
 * og:title: same format
 * og:description: truncated job description
 * Full JD: <div class="description__text"> or <div class="show-more-less-html__markup">
 *
 * Warning: LinkedIn's search bar contains geolocation text (e.g., "Saint-Maurice")
 * that must NOT be confused with the job location. Always extract location from
 * the <title> tag pattern, not from arbitrary page elements.
 */

import type { SiteTemplate } from "./types.js";

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
      // Extract from <title> tag: "{company} hiring {title} in {location} | LinkedIn"
      // We grab the title portion between "hiring " and " in "
      selector: "<title>",
      regex: "hiring\\s+(.+?)\\s+in\\s+",
    },
    company: {
      // Extract company from <title>: "{company} hiring ..."
      selector: "<title>",
      regex: "^(.+?)\\s+hiring\\s+",
    },
    location: {
      // Extract location from <title>: "... in {location} | LinkedIn"
      selector: "<title>",
      regex: "\\s+in\\s+(.+?)\\s*\\|\\s*LinkedIn",
    },
    description: {
      // Try the full JD div first, fall back to og:description
      selector: 'class="show-more-less-html__markup"',
      regex: 'class="show-more-less-html__markup"[^>]*>([\\s\\S]*?)</div>',
    },
    descriptionFallback: {
      metaTag: "og:description",
    },
  },
};
