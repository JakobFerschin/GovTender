import * as React from "react";
import { cn } from "@/lib/cn";

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "muted";
}

function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        variant === "default" &&
          "bg-primary/5 text-primary border border-primary/10",
        variant === "muted" &&
          "bg-muted text-muted-foreground border border-border",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
