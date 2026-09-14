import type { Metadata } from "next"
import { Connect } from "@/components/agent/connect"
export const metadata: Metadata = {
  title: "Connect an agent to Squig",
  description:
    "Invite your own agent to the Squig canvas you already have open. Sketch together with automatic local saves and no account or cloud canvas storage.",
  alternates: { canonical: "/connect" },
}
export default function Page() {
  return <Connect />
}
