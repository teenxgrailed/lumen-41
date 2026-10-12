/* Parts: a small progress ring beside "1/2" ($P/task.jsx `TkPartRing`).
   The fill's transition lives in src/styles/v3-overrides/motion.css. */
export function PartRing({ done, total }: { done: number; total: number }) {
  const circumference = 2 * Math.PI * 4.5;
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 12 12"
      className="tk-ring"
      aria-hidden="true"
    >
      <circle cx={6} cy={6} r={4.5} className="tk-ring-track" />
      <circle
        cx={6}
        cy={6}
        r={4.5}
        className="tk-ring-fill"
        strokeDasharray={circumference}
        strokeDashoffset={
          circumference * (1 - (total ? Math.min(done / total, 1) : 0))
        }
      />
    </svg>
  );
}
