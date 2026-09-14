"use client"
import { create } from "zustand"

// Only failures need persistent chrome. Scope them to the open document so
// switching files cannot carry a cloud error into an unrelated local sketch.
export const useCanvasSyncIssue = create<{
  issue: { docId: string; message: string } | null
  localFile: { docId: string; path: string; status: string } | null
  canLeaveLocalFile: (() => boolean) | null
}>(() => ({ issue: null, localFile: null, canLeaveLocalFile: null }))
