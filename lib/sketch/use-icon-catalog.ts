"use client"

// A React view onto the icon catalog: the returned number bumps whenever a
// weight chunk arrives, so anything drawing icons re-renders when the real
// paths land. Kept apart from icon-catalog.ts so non-React code (node tests,
// the export pipeline) never pulls React in.

import { useSyncExternalStore } from "react"
import { iconCatalogVersion, subscribeIconCatalog } from "./icon-catalog"

export function useIconCatalogVersion(): number {
  return useSyncExternalStore(subscribeIconCatalog, iconCatalogVersion, iconCatalogVersion)
}
