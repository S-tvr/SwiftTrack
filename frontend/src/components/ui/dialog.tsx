"use client"

import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        data-slot="dialog-content"
        className={cn(
          // ⚠️ Three classes work together here and none is decorative. All of
          // this was measured in headless Chrome, not reasoned about:
          //
          // `max-h` — the popup is centred by `-translate-y-1/2`, so content
          // taller than the viewport pushes its top to a *negative* offset.
          // Being `position: fixed`, the page cannot scroll there: the title and
          // the first field become unreachable. Measured at −58px on a 397px
          // viewport without this.
          //
          // `grid-rows-[minmax(0,1fr)]` — the load-bearing one, and the reason a
          // first attempt at this shipped broken. A grid's implicit row is sized
          // `auto`, whose `min-height` is also `auto`, so the row refuses to
          // shrink below its content and the cap above does nothing. Measured:
          // without it the body reported `overflows: false` and simply spilled
          // out of `overflow-hidden` — clipped with **no scrollbar**, which is
          // worse than the bug it was meant to fix.
          //
          // `overflow-hidden` — keeps `rounded-xl` clipping `DialogFooter`'s
          // negative-margin bleed. Safe only because `DialogBody` scrolls.
          //
          // `dvh`, not `vh`: on mobile `vh` measures the viewport *without*
          // browser chrome, which is exactly the height that is not available.
          //
          // Verified with all three in place: Save stayed fully visible at
          // viewports from 317px to 797px, with every validation error showing.
          "fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] grid-rows-[minmax(0,1fr)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-hidden rounded-xl bg-popover p-4 text-sm text-popover-foreground ring-1 ring-foreground/10 duration-100 outline-none sm:max-w-sm data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="absolute top-2 right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon
            />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

/**
 * The scrolling middle of a tall dialog. Wrap the fields in this and leave the
 * header and footer outside it.
 *
 * ⚠️ **The scroller goes here, never on `DialogContent`.** Putting
 * `overflow-y-auto` on the popup itself would clip `DialogFooter`'s `-mx-4
 * -mb-4` bleed away from the popup edge, break its rounded bottom corners, and
 * scroll the absolutely-positioned close button out of reach. Scrolling the
 * middle instead pins the header, the close button and the footer for free —
 * no sticky positioning needed.
 *
 * `-mx-4 px-4` is the same bleed idiom `DialogFooter` uses: it lets a focus ring
 * on an input reach the popup's true edge instead of being clipped, and puts the
 * scrollbar at the edge rather than inset.
 *
 * ⚠️ `min-h-0` is needed **here and on the `<form>`** between this and the
 * popup. A flex item will not shrink below its content height without it, and
 * one missing link in that chain makes the cap on `DialogContent` inert — which
 * is exactly how the first version of this shipped broken.
 */
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn(
        "-mx-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "-mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t bg-muted/50 p-4 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn(
        "font-heading text-base leading-none font-medium",
        className
      )}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "text-sm text-muted-foreground *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
