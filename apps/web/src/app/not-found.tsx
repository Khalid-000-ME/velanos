import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="content-width py-20">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-sm text-[var(--ink-3)]">
        That vault, agent or incident is not in the index.
      </p>
      <Link href="/" className="mt-6 inline-block text-sm font-medium underline decoration-[var(--green)] decoration-2 underline-offset-4">
        Back to Discover
      </Link>
    </div>
  );
}
