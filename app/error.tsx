'use client';
import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
      <h2 className="text-2xl font-bold text-rose-500 mb-4">Something went wrong!</h2>
      <p className="text-slate-400 mb-6">{error.message || 'An unexpected error occurred.'}</p>
      <div className="flex gap-4">
        <button
          onClick={() => reset()}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg font-semibold transition"
        >
          Try again
        </button>
        <Link href="/" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
