import Link from "next/link";
import { Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-5 text-center">
      <Logo />
      <h1 className="display mt-10 text-[56px]">Not here.</h1>
      <p className="mt-3 max-w-sm text-[15px] text-muted">This page doesn&apos;t exist, or it isn&apos;t yours to see.</p>
      <Link href="/discover" className="btn-dark mt-8">Back to dates</Link>
    </main>
  );
}
