"use client";

import { useActionState, useSyncExternalStore } from "react";
import { useFormStatus } from "react-dom";
import { clsx } from "clsx";
import type { ActionState } from "@/lib/action-state";

export function SubmitButton({ children, pendingText, className = "btn-primary", name, value, disabled }: { children: React.ReactNode; pendingText?: string; className?: string; name?: string; value?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled} name={name} value={value} aria-busy={pending}>
      {pending && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {pending ? (pendingText ?? children) : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state?.error && !state?.success) return null;
  return (
    <p role={state.error ? "alert" : "status"} className={clsx("rounded-xl px-4 py-3 text-[14px]", state.error ? "bg-blush text-oxblood" : "bg-sage text-sage-ink")}>
      {state.error ?? state.success}
    </p>
  );
}

/** A form bound to a server action, showing its error/success state inline. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: (prev: ActionState, form: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={className} key={resetOnSuccess && state?.success ? state.success : undefined}>
      {children}
      <div className="mt-3 empty:hidden">
        <FormMessage state={state} />
      </div>
    </form>
  );
}

function subscribeClock(cb: () => void) {
  const t = setInterval(cb, 30_000);
  return () => clearInterval(t);
}

export function Countdown({ to, className }: { to: string; className?: string }) {
  // A 30-second clock; null during server render so hydration matches.
  const now = useSyncExternalStore(subscribeClock, () => Math.floor(Date.now() / 30_000) * 30_000, () => null);
  if (now === null) return <span className={className}>&nbsp;</span>;
  const ms = new Date(to).getTime() - now;
  if (ms <= 0) return <span className={className}>Now</span>;
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return (
    <span className={className}>
      {d > 0 && `${d}d `}
      {h}h {String(m).padStart(2, "0")}m
    </span>
  );
}

export function ConfirmButton({ children, message, className = "btn-ghost" }: { children: React.ReactNode; message: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={className}
      disabled={pending}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
