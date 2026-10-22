"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removePhotoAction, uploadPhotoAction } from "@/app/actions/profile";

/** Upload/remove profile photos. Uses buttons (not nested forms) so it can live inside another form. */
export function PhotoManager({ photoIds }: { photoIds: string[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const upload = (file: File) =>
    start(async () => {
      setError(null);
      const fd = new FormData();
      fd.set("photo", file);
      const r = await uploadPhotoAction(null, fd);
      if (r?.error) setError(r.error);
      router.refresh();
    });

  const remove = (photoId: string) =>
    start(async () => {
      const fd = new FormData();
      fd.set("photoId", photoId);
      await removePhotoAction(fd);
      router.refresh();
    });

  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {photoIds.map((id) => (
          <div key={id} className="group relative aspect-[4/5] overflow-hidden rounded-xl bg-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/photos/${id}`} alt="" className="h-full w-full object-cover" />
            <button type="button" onClick={() => remove(id)} disabled={pending} className="absolute right-1.5 top-1.5 rounded-full bg-ink/70 px-2 py-0.5 text-[11px] text-paper">
              Remove
            </button>
          </div>
        ))}
        {photoIds.length < 4 && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={pending}
            className="flex aspect-[4/5] flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line-strong text-[12px] text-muted transition hover:border-ink hover:text-ink"
          >
            <span className="text-[22px] leading-none">{pending ? "…" : "+"}</span>
            {pending ? "Uploading" : "Add photo"}
          </button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = "";
        }}
      />
      {error && <p className="mt-2 text-[13px] text-oxblood">{error}</p>}
    </div>
  );
}
