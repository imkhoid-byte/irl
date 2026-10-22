"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <h1 className="display text-[48px]">Something went wrong.</h1>
      <p className="mt-3 max-w-sm text-[15px] text-muted">Nothing was charged. Please try again.</p>
      <button onClick={reset} className="btn-dark mt-8">Try again</button>
    </main>
  );
}
