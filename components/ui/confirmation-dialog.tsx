"use client"

import { useRef, type ComponentProps, type ReactNode } from "react"
import { AlertDialog } from "@base-ui/react/alert-dialog"
import { Button } from "@/components/ui/button"

export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  destructive = false,
  onConfirm,
  finalFocus,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  children: ReactNode
  confirmLabel: string
  destructive?: boolean
  onConfirm: () => void
  finalFocus?: ComponentProps<typeof AlertDialog.Popup>["finalFocus"]
}) {
  const cancelRef = useRef<HTMLButtonElement>(null)

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/10 backdrop-blur-[2px]" />
        <AlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <AlertDialog.Popup
            initialFocus={cancelRef}
            finalFocus={finalFocus}
            className="w-full max-w-sm rounded-chrome-lg border border-border/80 bg-background p-5 shadow-popup outline-none"
          >
            <AlertDialog.Title className="text-title font-semibold">{title}</AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-row text-muted-foreground [overflow-wrap:anywhere]">
              {children}
            </AlertDialog.Description>
            <div className="mt-5 flex justify-end gap-2">
              <AlertDialog.Close render={<Button ref={cancelRef} variant="outline" />}>Cancel</AlertDialog.Close>
              <Button
                variant={destructive ? "destructive" : "default"}
                onClick={() => {
                  onConfirm()
                  onOpenChange(false)
                }}
              >
                {confirmLabel}
              </Button>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
