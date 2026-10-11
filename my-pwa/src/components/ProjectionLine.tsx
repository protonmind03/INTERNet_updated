import { formatDate } from "../lib/format";
import type { Projection } from "../lib/useProjections";

/**
 * One line saying when a student is projected to finish, or why they are
 * at risk. Nothing is shown for a student with no hours left, or while the
 * projection is not known. `who` words it for the reader: "You" on the
 * student's own dashboard, otherwise left out.
 */
export default function ProjectionLine({
  projection,
  own = false,
  className = "",
}: {
  projection: Projection | undefined;
  own?: boolean;
  className?: string;
}) {
  if (!projection || projection.remaining_hours <= 0) return null;

  if (projection.at_risk) {
    return (
      <p className={`text-xs font-medium text-amber-800 ${className}`}>
        At risk:{" "}
        {projection.projected_finish
          ? `projected to finish ${formatDate(projection.projected_finish)}, after the term ends.`
          : projection.risk_reason.replace(/^./, (letter) => letter.toLowerCase())}
      </p>
    );
  }
  if (!projection.projected_finish) return null;
  return (
    <p className={`text-xs text-slate-500 ${className}`}>
      {own ? "At your scheduled hours you finish" : "Projected finish"}{" "}
      {own ? "on " : ""}
      {formatDate(projection.projected_finish)}
      {own ? ". Holidays are already left out." : ""}
    </p>
  );
}
