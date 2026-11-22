import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-[4px] border px-2 py-0.5 text-[11px] font-medium leading-4 tracking-[0.01em] whitespace-nowrap transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary/[0.06] text-primary border-primary/15",
        muted: "bg-muted text-muted-foreground border-border",
        cobalt: "bg-accent-blue-soft text-accent-blue border-accent-blue/20",
        emerald: "bg-emerald-soft text-emerald border-emerald/20",
        amber: "bg-amber-soft text-amber border-amber/20",
        crimson: "bg-crimson-soft text-crimson border-crimson/20",
        outline: "bg-card text-foreground border-border-strong",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
