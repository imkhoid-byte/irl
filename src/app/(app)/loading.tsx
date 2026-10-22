export default function Loading() {
  return (
    <div className="animate-pulse space-y-6" aria-busy="true" aria-label="Loading">
      <div className="h-4 w-24 rounded-full bg-line" />
      <div className="h-14 w-2/3 rounded-2xl bg-line/70" />
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-80 bg-line/30" />
        ))}
      </div>
    </div>
  );
}
