import type { Metadata } from "next"
import { Connect } from "@/components/agent/connect"
export const metadata: Metadata = {
  title: "Connect an agent to Squig",
  description:
    "Give Codex, Claude and other MCP clients a shared wireframing canvas. Create a workspace key and start sketching together.",
  alternates: { canonical: "/connect" },
}
export default function Page() {
  return <Connect />
}
