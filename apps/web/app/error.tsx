"use client";

export default function AppError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-10 sm:px-6 lg:px-8">
      <h1 className="text-xl font-semibold text-slate-50">Something went wrong</h1>
      <p className="mt-2 text-sm text-slate-300" role="alert">
        The page could not be displayed. Try again.
      </p>
      <button
        type="button"
        className="mt-4 rounded-xl border border-slate-700 px-3 py-2 text-sm text-slate-100"
        onClick={() => reset()}
      >
        Try again
      </button>
    </main>
  );
}
