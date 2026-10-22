"use client";

import { useState, useTransition } from "react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";
import { CATEGORIES, CATEGORY_KEYS, DAYS, GENDERS, GENDER_KEYS, INTENTIONS, INTENTION_KEYS, INTERESTS, TIMES } from "@/lib/catalog";
import type { ActionState } from "@/lib/action-state";
import { FormMessage } from "./forms";
import { PhotoManager } from "./photo-manager";

export type ProfileValues = {
  firstName: string;
  birthDate: string;
  gender: string;
  interestedIn: string[];
  ageMin: number;
  ageMax: number;
  bio: string;
  interests: string[];
  intention: string;
  neighborhoodId: string;
  travelRadiusKm: number;
  preferredCategories: string[];
  preferredDays: string[];
  preferredTimes: string[];
  budgetMaxCents: number;
  dietaryNotes: string;
  accessibilityNotes: string;
  confirmAdult?: boolean;
  acceptGuidelines?: boolean;
};

type Form = UseFormReturn<ProfileValues>;

function Chips({ form, name, options, max }: { form: Form; name: "interestedIn" | "interests" | "preferredCategories" | "preferredDays" | "preferredTimes"; options: [string, string][]; max?: number }) {
  const value = (form.watch(name) as string[]) ?? [];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([key, label]) => {
        const on = value.includes(key);
        return (
          <button
            key={key}
            type="button"
            aria-pressed={on}
            className={clsx("chip", on && "chip-on")}
            onClick={() => {
              const next = on ? value.filter((v) => v !== key) : max && value.length >= max ? [...value.slice(1), key] : [...value, key];
              form.setValue(name, next, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

function Err({ form, name }: { form: Form; name: keyof ProfileValues }) {
  const msg = form.formState.errors[name]?.message;
  return msg ? <p className="mt-1.5 text-[13px] text-oxblood">{String(msg)}</p> : null;
}

const need = (n: number, msg: string) => (v: unknown) => (Array.isArray(v) && v.length >= n) || msg;

export function AboutSection({ form }: { form: Form }) {
  return (
    <div className="space-y-5">
      <div>
        <label className="label" htmlFor="firstName">First name</label>
        <input id="firstName" className="field" autoComplete="given-name" {...form.register("firstName", { required: "Add your first name." })} />
        <p className="mt-1.5 text-[12px] text-muted">Only your first name is ever shown.</p>
        <Err form={form} name="firstName" />
      </div>
      <div>
        <label className="label" htmlFor="birthDate">Date of birth</label>
        <input id="birthDate" type="date" className="field" {...form.register("birthDate", { required: "Enter your date of birth." })} />
        <p className="mt-1.5 text-[12px] text-muted">Others see your age, never your birthday.</p>
        <Err form={form} name="birthDate" />
      </div>
      <div>
        <p className="label">I am a</p>
        <div className="flex flex-wrap gap-2">
          {GENDER_KEYS.map((g) => (
            <label key={g} className={clsx("chip", form.watch("gender") === g && "chip-on")}>
              <input type="radio" value={g} className="sr-only" {...form.register("gender", { required: "Choose one." })} />
              {GENDERS[g]}
            </label>
          ))}
        </div>
        <Err form={form} name="gender" />
      </div>
    </div>
  );
}

export function MeetSection({ form }: { form: Form }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="label">I&apos;d like to meet</p>
        {void form.register("interestedIn", { validate: need(1, "Choose who you'd like to meet.") })}
        <Chips form={form} name="interestedIn" options={GENDER_KEYS.map((g) => [g, GENDERS[g] === "Man" ? "Men" : GENDERS[g] === "Woman" ? "Women" : "Nonbinary people"])} />
        <Err form={form} name="interestedIn" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="ageMin">Age from</label>
          <input id="ageMin" type="number" min={18} max={99} className="field" {...form.register("ageMin", { valueAsNumber: true, min: { value: 18, message: "18 or over." } })} />
          <Err form={form} name="ageMin" />
        </div>
        <div>
          <label className="label" htmlFor="ageMax">to</label>
          <input id="ageMax" type="number" min={18} max={99} className="field" {...form.register("ageMax", { valueAsNumber: true })} />
          <Err form={form} name="ageMax" />
        </div>
      </div>
      <div>
        <p className="label">What I&apos;m looking for</p>
        <div className="grid gap-2">
          {INTENTION_KEYS.map((k) => (
            <label key={k} className={clsx("flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-[15px] transition", form.watch("intention") === k ? "border-ink bg-paper" : "border-line-strong hover:border-ink")}>
              {INTENTIONS[k]}
              <input type="radio" value={k} className="accent-oxblood" {...form.register("intention", { required: "Choose one." })} />
            </label>
          ))}
        </div>
        <Err form={form} name="intention" />
      </div>
    </div>
  );
}

export function ProfileSection({ form, photoIds }: { form: Form; photoIds: string[] }) {
  const bio = form.watch("bio") ?? "";
  return (
    <div className="space-y-6">
      <div>
        <p className="label">Photos</p>
        <PhotoManager photoIds={photoIds} />
        <p className="mt-2 text-[12px] text-muted">Clear, recent photos of you. Up to 4. You can add them later, too.</p>
      </div>
      <div>
        <label className="label" htmlFor="bio">A short bio</label>
        <textarea id="bio" rows={4} maxLength={300} className="field resize-none" placeholder="What would make a great first date with you?" {...form.register("bio", { required: "Write a sentence or two.", minLength: { value: 20, message: "Write at least 20 characters." } })} />
        <p className="mt-1 text-right text-[12px] text-muted">{bio.length}/300</p>
        <Err form={form} name="bio" />
      </div>
      <div>
        <p className="label">Three interests</p>
        {void form.register("interests", { validate: (v) => (Array.isArray(v) && v.length === 3) || "Pick exactly three." })}
        <Chips form={form} name="interests" options={INTERESTS.map((i) => [i, i])} max={3} />
        <Err form={form} name="interests" />
      </div>
    </div>
  );
}

export function DatesSection({ form, neighborhoods }: { form: Form; neighborhoods: { id: string; name: string }[] }) {
  const budget = form.watch("budgetMaxCents") ?? 5000;
  const radius = form.watch("travelRadiusKm") ?? 8;
  return (
    <div className="space-y-6">
      <div>
        <p className="label">Dates I&apos;d enjoy</p>
        {void form.register("preferredCategories", { validate: need(1, "Pick at least one.") })}
        <Chips form={form} name="preferredCategories" options={CATEGORY_KEYS.map((c) => [c, CATEGORIES[c].label])} />
        <Err form={form} name="preferredCategories" />
      </div>
      <div>
        <p className="label">Days that work</p>
        {void form.register("preferredDays", { validate: need(1, "Pick at least one day.") })}
        <Chips form={form} name="preferredDays" options={DAYS.map((d) => [d, d])} />
        <Err form={form} name="preferredDays" />
      </div>
      <div>
        <p className="label">Times that work</p>
        {void form.register("preferredTimes", { validate: need(1, "Pick at least one.") })}
        <Chips form={form} name="preferredTimes" options={Object.entries(TIMES)} />
        <Err form={form} name="preferredTimes" />
      </div>
      <div>
        <label className="label" htmlFor="budget">Budget for my half: up to ${Math.round(budget / 100)}</label>
        <input id="budget" type="range" min={1000} max={20000} step={500} className="w-full accent-oxblood" {...form.register("budgetMaxCents", { valueAsNumber: true })} />
      </div>
      <div>
        <label className="label" htmlFor="hood">General area</label>
        <select id="hood" className="field" {...form.register("neighborhoodId", { required: "Choose your general area." })}>
          <option value="">Choose a neighbourhood</option>
          {neighborhoods.map((n) => (
            <option key={n.id} value={n.id}>{n.name}</option>
          ))}
        </select>
        <p className="mt-1.5 text-[12px] text-muted">We only ever store and show a neighbourhood — never your address.</p>
        <Err form={form} name="neighborhoodId" />
      </div>
      <div>
        <label className="label" htmlFor="radius">Willing to travel: {radius} km</label>
        <input id="radius" type="range" min={1} max={30} className="w-full accent-oxblood" {...form.register("travelRadiusKm", { valueAsNumber: true })} />
      </div>
    </div>
  );
}

export function PrivateSection({ form }: { form: Form }) {
  return (
    <div className="space-y-5">
      <p className="rounded-xl bg-line/40 px-4 py-3 text-[13px] leading-relaxed text-ink-soft">
        Optional and private. Shared only with the venue when a date is confirmed — never with the other person.
      </p>
      <div>
        <label className="label" htmlFor="dietary">Food allergies or dietary needs</label>
        <textarea id="dietary" rows={2} maxLength={300} className="field resize-none" {...form.register("dietaryNotes")} />
      </div>
      <div>
        <label className="label" htmlFor="access">Accessibility requirements</label>
        <textarea id="access" rows={2} maxLength={300} className="field resize-none" {...form.register("accessibilityNotes")} />
      </div>
    </div>
  );
}

function Agreement({ form }: { form: Form }) {
  return (
    <div className="space-y-3 border-t border-line pt-5">
      <label className="flex items-start gap-3 text-[14px] leading-relaxed">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-oxblood" {...form.register("confirmAdult", { required: "You must confirm you're 18 or older." })} />
        I confirm I&apos;m 18 or older.
      </label>
      <Err form={form} name="confirmAdult" />
      <label className="flex items-start gap-3 text-[14px] leading-relaxed">
        <input type="checkbox" className="mt-1 h-4 w-4 accent-oxblood" {...form.register("acceptGuidelines", { required: "Please agree to the community guidelines." })} />
        <span>
          I agree to the <a href="/policies#guidelines" target="_blank" className="underline">community guidelines</a> and understand the <a href="/policies#payments" target="_blank" className="underline">payment and cancellation policy</a>.
        </span>
      </label>
      <Err form={form} name="acceptGuidelines" />
    </div>
  );
}

const STEPS = [
  { key: "about", title: "First, the basics.", fields: ["firstName", "birthDate", "gender"] },
  { key: "meet", title: "Who you'd like to meet.", fields: ["interestedIn", "ageMin", "ageMax", "intention"] },
  { key: "profile", title: "Your profile.", fields: ["bio", "interests"] },
  { key: "dates", title: "Your kind of date.", fields: ["preferredCategories", "preferredDays", "preferredTimes", "budgetMaxCents", "neighborhoodId", "travelRadiusKm"] },
  { key: "private", title: "Anything we should know?", fields: ["dietaryNotes", "accessibilityNotes", "confirmAdult", "acceptGuidelines"] },
] as const;

export function OnboardingWizard({
  neighborhoods,
  photoIds,
  defaults,
  action,
}: {
  neighborhoods: { id: string; name: string }[];
  photoIds: string[];
  defaults: Partial<ProfileValues>;
  action: (payload: Record<string, unknown>) => Promise<ActionState>;
}) {
  const form = useForm<ProfileValues>({
    defaultValues: { interestedIn: [], interests: [], preferredCategories: [], preferredDays: [], preferredTimes: [], ageMin: 25, ageMax: 40, budgetMaxCents: 5000, travelRadiusKm: 8, dietaryNotes: "", accessibilityNotes: "", ...defaults },
  });
  const [step, setStep] = useState(0);
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const current = STEPS[step];

  const next = async () => {
    const ok = await form.trigger(current.fields as unknown as (keyof ProfileValues)[]);
    if (!ok) return;
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    start(async () => setState(await action(form.getValues())));
  };

  return (
    <div>
      <div className="mb-8 flex gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
        {STEPS.map((s, i) => (
          <span key={s.key} className={clsx("h-1 flex-1 rounded-full transition", i <= step ? "bg-oxblood" : "bg-line")} />
        ))}
      </div>
      <p className="eyebrow mb-3">Step {step + 1} of {STEPS.length}</p>
      <h1 className="display mb-8 text-[44px]">{current.title}</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void next();
        }}
        className="animate-rise"
        key={current.key}
      >
        {current.key === "about" && <AboutSection form={form} />}
        {current.key === "meet" && <MeetSection form={form} />}
        {current.key === "profile" && <ProfileSection form={form} photoIds={photoIds} />}
        {current.key === "dates" && <DatesSection form={form} neighborhoods={neighborhoods} />}
        {current.key === "private" && (
          <div className="space-y-6">
            <PrivateSection form={form} />
            <Agreement form={form} />
          </div>
        )}
        <div className="mt-6 empty:hidden">
          <FormMessage state={state} />
        </div>
        <div className="mt-8 flex items-center justify-between gap-3">
          {step > 0 ? (
            <button type="button" className="btn-quiet" onClick={() => setStep(step - 1)}>
              Back
            </button>
          ) : (
            <span />
          )}
          <button type="submit" className="btn-primary min-w-36" disabled={pending}>
            {pending ? "Saving…" : step === STEPS.length - 1 ? "Start finding dates" : "Continue"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ProfileEditor({
  neighborhoods,
  defaults,
  action,
}: {
  neighborhoods: { id: string; name: string }[];
  defaults: ProfileValues;
  action: (payload: Record<string, unknown>) => Promise<ActionState>;
}) {
  const form = useForm<ProfileValues>({ defaultValues: defaults });
  const [state, setState] = useState<ActionState>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <form
      onSubmit={form.handleSubmit((values) =>
        start(async () => {
          const r = await action(values);
          setState(r);
          if (r?.success) router.refresh();
        }),
      )}
      className="space-y-12"
    >
      {[
        ["About you", <AboutSection key="a" form={form} />],
        ["Who you'd like to meet", <MeetSection key="m" form={form} />],
        ["Bio & interests", <div key="p" className="space-y-6"><BioOnly form={form} /></div>],
        ["Your kind of date", <DatesSection key="d" form={form} neighborhoods={neighborhoods} />],
        ["Private needs", <PrivateSection key="x" form={form} />],
      ].map(([title, node]) => (
        <section key={String(title)}>
          <h2 className="display mb-5 text-[28px]">{title}</h2>
          {node}
        </section>
      ))}
      <div className="sticky bottom-20 z-10 flex items-center justify-end gap-3 rounded-2xl border border-line bg-paper/95 p-3 backdrop-blur sm:bottom-4">
        <div className="mr-auto empty:hidden">
          <FormMessage state={state} />
        </div>
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save profile"}
        </button>
      </div>
    </form>
  );
}

function BioOnly({ form }: { form: Form }) {
  const bio = form.watch("bio") ?? "";
  return (
    <>
      <div>
        <label className="label" htmlFor="bio">Bio</label>
        <textarea id="bio" rows={4} maxLength={300} className="field resize-none" {...form.register("bio", { required: "Write a sentence or two.", minLength: { value: 20, message: "Write at least 20 characters." } })} />
        <p className="mt-1 text-right text-[12px] text-muted">{bio.length}/300</p>
        <Err form={form} name="bio" />
      </div>
      <div>
        <p className="label">Three interests</p>
        {void form.register("interests", { validate: (v) => (Array.isArray(v) && v.length === 3) || "Pick exactly three." })}
        <Chips form={form} name="interests" options={INTERESTS.map((i) => [i, i])} max={3} />
        <Err form={form} name="interests" />
      </div>
    </>
  );
}
