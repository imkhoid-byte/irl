import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/forms";
import { DemoBadge, Notice } from "@/components/ui";
import { demoLoginAction, loginAction } from "@/app/actions/auth";
import { currentUser } from "@/server/session";
import { isDemoMode } from "@/server/context";

export const metadata: Metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; changed?: string }> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect("/discover");
  return (
    <div className="animate-rise">
      <h1 className="display text-[48px]">Welcome back.</h1>
      <p className="mt-2 text-[15px] text-muted">Sign in to see your dates.</p>
      {sp.changed && <Notice tone="good" className="mt-6">Password changed. Please sign in again.</Notice>}
      <ActionForm action={loginAction} className="mt-8 space-y-4">
        <input type="hidden" name="next" value={sp.next ?? ""} />
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required className="field" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" name="password" type="password" autoComplete="current-password" required className="field" />
        </div>
        <SubmitButton className="btn-dark w-full" pendingText="Signing in…">Sign in</SubmitButton>
      </ActionForm>
      <p className="mt-6 text-[14px] text-muted">
        New here? <Link href="/register" className="text-ink underline underline-offset-4">Create an account</Link>
      </p>

      {isDemoMode() && (
        <div className="mt-10 rounded-2xl border border-dashed border-line-strong p-5">
          <div className="flex items-center justify-between">
            <p className="text-[14px] font-medium">Try the demo</p>
            <DemoBadge />
          </div>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Sign in as a seeded account. Password for all: <code className="rounded bg-line/60 px-1">showup-demo</code>
          </p>
          <form action={demoLoginAction} className="mt-4 grid grid-cols-3 gap-2">
            <button name="who" value="ava" className="btn-ghost px-3 py-2 text-[13px]">Ava</button>
            <button name="who" value="ben" className="btn-ghost px-3 py-2 text-[13px]">Ben</button>
            <button name="who" value="admin" className="btn-ghost px-3 py-2 text-[13px]">Admin</button>
          </form>
          <p className="mt-3 text-[12px] leading-relaxed text-muted">Tip: open Ben in a private window to play both sides of a date.</p>
        </div>
      )}
    </div>
  );
}
