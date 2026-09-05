import type { MetadataRoute } from "next"
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/docs/", "/llms.txt", "/llms-full.txt", "/openapi.json"],
      disallow: ["/api/", "/review", "/mcp"],
    },
    sitemap: "https://squig.sh/sitemap.xml",
  }
}
