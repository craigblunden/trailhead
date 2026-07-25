import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatShortDate, type ActivityEntry } from "@/lib/jobs";

export function ActivityCard({ entries }: { entries: ActivityEntry[] }) {
  return (
    <Card
      role="region"
      aria-labelledby="activity-heading"
      className="[--card-spacing:--spacing(5)]"
    >
      <CardHeader>
        <CardTitle className="text-lg">
          <h2 id="activity-heading">Activity</h2>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing logged yet.</p>
        ) : (
          <ol>
            {entries.map((entry, index) => (
              <li
                key={entry.id}
                className="relative flex gap-3 pb-4 last:pb-0"
              >
                {index < entries.length - 1 && (
                  // Connector from this dot down to the next one.
                  <span
                    aria-hidden="true"
                    className="absolute top-3.5 bottom-0 left-[3.5px] w-px bg-border"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-primary"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{entry.label}</span>
                  <time
                    dateTime={entry.date}
                    className="block text-xs text-muted-foreground"
                  >
                    {formatShortDate(entry.date)}
                  </time>
                </span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
