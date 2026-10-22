import type { Metadata } from "next";
import Link from "next/link";
import { clsx } from "clsx";
import { EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/forms";
import { markNotificationsReadAction } from "@/app/actions/profile";
import { formatRelative } from "@/lib/time";
import { getDb } from "@/server/db/client";
import { listNotifications } from "@/server/services/notifications";
import { requireMember } from "@/server/session";

export const metadata: Metadata = { title: "Notifications" };

export default async function Notifications() {
  const user = await requireMember();
  const items = listNotifications(getDb(), user.id);
  const unread = items.some((n) => !n.read_at);
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader eyebrow="Notifications" title="Updates." >Both people on a date always receive the same updates.</PageHeader>
      {unread && (
        <form action={markNotificationsReadAction} className="mb-4 flex justify-end">
          <SubmitButton className="btn-quiet text-[13px]">Mark all as read</SubmitButton>
        </form>
      )}
      {items.length === 0 ? (
        <EmptyState title="All quiet.">Invitations, confirmations and reminders will appear here.</EmptyState>
      ) : (
        <ul className="card divide-y divide-line">
          {items.map((n) => {
            const body = (
              <div className="flex gap-4 px-5 py-4">
                <span className={clsx("mt-2 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-oxblood")} />
                <div className="min-w-0 flex-1">
                  <p className={clsx("text-[15px]", !n.read_at && "font-medium")}>{n.title}</p>
                  <p className="mt-0.5 text-[14px] leading-relaxed text-muted">{n.body}</p>
                  <p className="mt-1 text-[12px] text-muted">{formatRelative(n.created_at)}</p>
                </div>
              </div>
            );
            return <li key={n.id}>{n.link ? <Link href={n.link} className="block hover:bg-line/25">{body}</Link> : body}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
