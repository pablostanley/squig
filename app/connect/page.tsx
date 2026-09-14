import type { Metadata } from "next"
import { Connect } from "@/components/agent/connect"
export const metadata: Metadata = {
  title: "Connect an agent to Squig",
  description:
    "Connect your own agent to a local Squig file. Use MCP or a browser agent and sketch together without an account or cloud canvas storage.",
  alternates: { canonical: "/connect" },
}
export default function Page() {
  return <Connect />
}
