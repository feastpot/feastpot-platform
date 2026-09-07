import { Badge } from '@feastpot/ui';
import type { AgeingState } from '@/lib/admin-ageing';

const classes: Record<AgeingState['tone'], string> = {
  neutral: 'bg-gray-100 text-gray-700',
  amber: 'bg-amber-100 text-amber-800',
  red: 'bg-red-100 text-red-800 font-semibold',
};

/** The only SLA presentation primitive used by admin queue rows. */
export function AdminAgeingBadge({ state }: { state: AgeingState | null }) {
  if (!state) return <span className="text-muted-foreground">Not ageing</span>;
  return (
    <Badge className={classes[state.tone]} data-tone={state.tone}>
      {state.label}
    </Badge>
  );
}
