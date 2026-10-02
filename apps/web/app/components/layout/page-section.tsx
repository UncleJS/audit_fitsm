import type { ReactNode } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../ui/cn";

export default function PageSection({
  title,
  description,
  eyebrow,
  action,
  children,
  className,
  contentClassName,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <Card className={className}>
      <CardHeader className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-300">{eyebrow}</p> : null}
          <div>
            <CardTitle>{title}</CardTitle>
            {description ? <CardDescription className="mt-2 max-w-3xl">{description}</CardDescription> : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </CardHeader>
      <CardContent className={cn("space-y-4", contentClassName)}>{children}</CardContent>
    </Card>
  );
}
