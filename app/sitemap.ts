import type { MetadataRoute } from "next"
import { pages } from "@/lib/agent/docs"
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/docs", "/connect", ...pages.map((p) => `/docs/${p.slug}`)].map(
    (path) => ({ url: `https://squig.sh${path}` }),
  )
}
