"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { clsx } from "clsx";

type Option = [string, string];
type Filter = { key: string; label: string; options: Option[] };

export function FilterBar({ filters }: { filters: Filter[] }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    start(() => router.replace(`${path}?${next.toString()}`, { scroll: false }));
  };
  const active = filters.filter((f) => params.get(f.key)).length;
  return (
    <div className={clsx("transition-opacity", pending && "opacity-60")}>
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
        {filters.map((f) => {
          const value = params.get(f.key) ?? "";
          return (
            <label key={f.key} className={clsx("relative shrink-0 rounded-full border text-[13px] transition", value ? "border-ink bg-ink text-paper" : "border-line-strong text-ink-soft hover:border-ink")}>
              <span className="sr-only">{f.label}</span>
              <select value={value} onChange={(e) => set(f.key, e.target.value)} className="cursor-pointer appearance-none bg-transparent py-2 pl-4 pr-8 outline-none">
                <option value="">{f.label}</option>
                {f.options.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[10px]">▾</span>
            </label>
          );
        })}
        {active > 0 && (
          <button type="button" onClick={() => start(() => router.replace(path, { scroll: false }))} className="shrink-0 px-3 text-[13px] text-muted underline underline-offset-4 hover:text-ink">
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
