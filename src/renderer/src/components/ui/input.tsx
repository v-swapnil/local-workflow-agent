import * as React from "react"

import { cn } from "@renderer/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-ink-700/60 bg-ink-900/40 px-3 py-2 text-base text-ink-100 placeholder:text-ink-500 transition-colors hover:border-ink-600 focus-visible:outline-none focus-visible:border-amber/50 focus-visible:ring-1 focus-visible:ring-amber/20 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
