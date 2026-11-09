export function ReporterActivityIndicator({ active }: { active?: boolean }) {
  if (!active) return null;
  return (
    <span
      role="img"
      aria-label="New reporter activity"
      title="New reporter activity"
      className="mr-2 inline-block size-2 shrink-0 rounded-full bg-primary"
    />
  );
}
