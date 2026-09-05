import type { Metadata } from "next"
import { Review } from "@/components/agent/review"
export const metadata: Metadata = {
  title: "Review a Squig wireframe",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
  alternates: { canonical: "/review" },
}
export default function Page() {
  return <Review />
}
