import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-900 text-white flex flex-col items-center justify-center p-6 text-center font-sans">
      <h2 className="text-2xl font-bold mb-4">404 - Page Not Found</h2>
      <p className="text-slate-400 mb-6">Could not find the requested resource</p>
      <Link href="/" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg font-semibold transition">
        Return to Dashboard
      </Link>
    </div>
  );
}
