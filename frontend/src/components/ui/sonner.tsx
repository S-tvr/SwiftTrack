import type { CSSProperties } from "react"
import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Hand-trimmed from the `base-nova` registry copy, which does **not** compile
 * here: it imports `next-themes` and `@/app/(create)/components/icon-placeholder`,
 * a Next.js route path that does not exist in a Vite project. `npx shadcn add
 * sonner` therefore writes a broken file rather than failing — the same family
 * of trap as the empty `form.json` (architecture.md § Stack Traps #1).
 *
 * Three deliberate departures from that copy, each measured:
 *
 * - **No `next-themes`.** Nothing in this app ever applies the `.dark` class,
 *   so it is light-only today. The registry's `theme="system"` would have made
 *   toasts follow the operating system while the page behind them stayed light.
 *   Sonner's own default is `"light"`, which is what the app actually is — so
 *   dropping the dependency fixes the mismatch instead of causing one. ⚠️ If a
 *   theme switcher is ever added, this is the line that has to come back.
 * - **Icons imported straight from `lucide-react`**, already a dependency.
 *   `IconPlaceholder` exists so the registry can swap icon libraries at install
 *   time; there is nothing to swap here.
 * - **No `cn-toast` class.** It is not defined in `index.css`, so it styled
 *   nothing. A dead class reads like a hook someone can style later, and there
 *   is no such hook.
 *
 * The CSS-variable mapping is kept verbatim — it is the whole reason to wrap
 * `Sonner` at all, tying a toast to the project's own tokens rather than to
 * sonner's built-in palette.
 */
function Toaster({ ...props }: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
