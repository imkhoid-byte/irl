import Link from "next/link";
import { ExperienceArt } from "@/components/experience-art";
import { DemoBadge } from "@/components/ui";
import { POLICY } from "@/lib/policy";
import { formatMoney } from "@/lib/money";

const SAMPLES = [
  { category: "coffee" as const, title: "Coffee & a bookstore", when: "Saturday, 11:00 AM · 90 minutes", total: 2400 },
  { category: "games" as const, title: "A little friendly competition", when: "Indoor mini golf · Friday, 7:00 PM", total: 7000 },
  { category: "dinner" as const, title: "Dinner without the small talk", when: "Chef-selected dinner · Thursday, 7:30 PM", total: 12000 },
  { category: "art" as const, title: "Art, then a drink", when: "Gallery visit + a drink · Sunday, 3:00 PM", total: 5000 },
];

const STEPS = [
  { n: "01", title: "Pick your plan", body: "Choose the kind of date you would actually enjoy — a time, a place, a price. All decided up front." },
  { n: "02", title: "Match on intention", body: "Meet someone who's interested in the same experience and willing to commit to it." },
  { n: "03", title: "Show up", body: "We coordinate the details. You bring yourself." },
];

const DIFFERENT = [
  { title: "No endless conversations", body: "There's no inbox. Every match exists to become a date with a time and a place." },
  { title: "No exchanging numbers", body: "You don't need anyone's phone number or handle. Both of you get the same itinerary and updates." },
  { title: "Both people commit", body: "Each person pays their own half. Neither subsidises the other — and both have a reason to show up." },
  { title: "Real dates, real intentions", body: "No vanity metrics, no swipe streaks. We measure success by dates that actually happen." },
];

export default function Landing() {
  const fee = POLICY.defaultServiceFeeCents;
  return (
    <main>
      {/* Hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 lg:grid-cols-[1.15fr_1fr] lg:pt-20">
        <div className="animate-rise">
          <p className="eyebrow mb-6">The dating app that gets you offline</p>
          <h1 className="display text-[60px] sm:text-[84px] lg:text-[96px]">
            Less texting.
            <br />
            <em className="text-oxblood">More chemistry.</em>
          </h1>
          <p className="mt-7 max-w-md text-[17px] leading-relaxed text-ink-soft">
            Meet someone who&apos;s already said yes to the date. Pick an experience, match on mutual intent, and let us handle the rest.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link href="/register" className="btn-primary px-7 py-3.5">Find my date</Link>
            <Link href="#how" className="btn-ghost px-7 py-3.5">How it works</Link>
          </div>
          <p className="mt-6 text-[13px] text-muted">
            Demo accounts available on the <Link href="/login" className="underline underline-offset-4 hover:text-ink">sign-in page</Link>.
          </p>
        </div>

        <div className="relative mx-auto h-[540px] w-full max-w-[440px] animate-rise [animation-delay:120ms]">
          <div className="absolute right-0 top-0 w-[78%] rotate-[3deg] overflow-hidden rounded-[28px] border border-line bg-paper shadow-[0_30px_60px_-30px_rgba(26,23,21,0.35)]">
            <ExperienceArt category="dinner" className="aspect-[4/3]" />
            <div className="p-5">
              <p className="eyebrow">Thursday · 7:30 PM</p>
              <p className="display mt-2 text-[26px]">Dinner without the small talk</p>
              <p className="mt-2 text-[13px] text-muted">{formatMoney(12000)} total · {formatMoney(6000)} each</p>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 w-[74%] -rotate-[4deg] overflow-hidden rounded-[28px] border border-line bg-paper shadow-[0_30px_60px_-30px_rgba(26,23,21,0.4)]">
            <ExperienceArt category="coffee" className="aspect-[16/10]" />
            <div className="p-5">
              <p className="display text-[24px]">Coffee &amp; a bookstore</p>
              <div className="mt-3 flex items-center gap-2 text-[13px]">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sage text-[11px] text-sage-ink">✓</span>
                <span className="text-ink-soft">Both committed · It&apos;s a date</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Manifesto */}
      <section className="bg-ink text-paper">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
          <p className="display max-w-5xl text-[40px] sm:text-[60px]">
            You don&apos;t match to talk. <em className="text-[#d9a3a3]">You match to show up.</em>
          </p>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl scroll-mt-20 px-5 py-24 sm:px-8">
        <p className="eyebrow mb-4">How it works</p>
        <h2 className="display max-w-2xl text-[44px] sm:text-[56px]">Three steps. Zero small talk.</h2>
        <div className="mt-14 grid gap-px overflow-hidden rounded-3xl border border-line bg-line sm:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="bg-paper p-8">
              <p className="font-display text-[56px] leading-none text-oxblood">{s.n}</p>
              <p className="display mt-8 text-[28px]">{s.title}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Different */}
      <section className="border-y border-line bg-paper">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="eyebrow mb-4">Why it&apos;s different</p>
            <h2 className="display text-[44px] sm:text-[52px]">Built for the date, not the app.</h2>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-muted">
              Most dating apps are designed to keep you swiping. ONCE is designed to get you out the door — and then get out of the way.
            </p>
          </div>
          <div className="grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {DIFFERENT.map((d) => (
              <div key={d.title} className="border-t border-ink pt-5">
                <p className="text-[17px] font-medium">{d.title}</p>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{d.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Samples */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow mb-4">Dates worth leaving home for</p>
            <h2 className="display text-[44px] sm:text-[52px]">Every match comes with a plan.</h2>
          </div>
          <DemoBadge>Sample concepts · not live inventory</DemoBadge>
        </div>
        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {SAMPLES.map((s) => (
            <article key={s.title} className="card overflow-hidden">
              <ExperienceArt category={s.category} className="aspect-[4/3]" />
              <div className="p-5">
                <p className="display text-[24px]">{s.title}</p>
                <p className="mt-2 text-[13px] text-muted">{s.when}</p>
                <p className="mt-4 text-[14px]">
                  {formatMoney(s.total)} total · <span className="font-medium">{formatMoney(s.total / 2)} each</span>
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Payments transparency */}
      <section id="payments" className="scroll-mt-20 bg-blush/60">
        <div className="mx-auto grid max-w-6xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-2">
          <div>
            <p className="eyebrow mb-4">Before you sign up: how paying works</p>
            <h2 className="display text-[44px] sm:text-[52px]">Fifty-fifty. Fully transparent.</h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-ink-soft">
              You always see the exact amount, the venue area, the time and the cancellation terms before you commit. Nothing is charged until you both have.
            </p>
            <ol className="mt-8 space-y-5 text-[15px]">
              {[
                ["Invite or accept", "Free. Saying yes to an invitation doesn't charge anyone."],
                ["Both commit", `Each of you confirms the exact plan and places a hold for your half plus the ${formatMoney(fee)} service fee.`],
                ["It's a date", "Once both holds succeed and the venue is secured, both payments are taken and the date is confirmed."],
                ["If it doesn't come together", "If either person doesn't commit in time or a payment fails, every hold is released. Nobody pays alone."],
              ].map(([t, b], i) => (
                <li key={t} className="flex gap-4">
                  <span className="mt-0.5 font-display text-[22px] leading-none text-oxblood">{i + 1}</span>
                  <span>
                    <span className="font-medium">{t}.</span> <span className="text-ink-soft">{b}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="space-y-5">
            <div className="card p-7">
              <p className="eyebrow">Example · an $80 date</p>
              <dl className="mt-4 divide-y divide-line text-[15px]">
                <div className="flex justify-between py-3"><dt className="text-muted">Date total</dt><dd>$80</dd></div>
                <div className="flex justify-between py-3"><dt className="text-muted">You pay your half</dt><dd>$40</dd></div>
                <div className="flex justify-between py-3"><dt className="text-muted">They pay their half</dt><dd>$40</dd></div>
                <div className="flex justify-between py-3"><dt className="text-muted">ONCE service fee (each)</dt><dd>{formatMoney(fee)}</dd></div>
                <div className="flex justify-between py-3 font-medium"><dt>You pay in total</dt><dd>{formatMoney(4000 + fee)}</dd></div>
              </dl>
            </div>
            <div className="card p-7">
              <p className="eyebrow">Cancellations</p>
              <ul className="mt-4 space-y-3 text-[15px] leading-relaxed text-ink-soft">
                <li><span className="font-medium text-ink">Before the deadline</span> (usually 24 hours before): full refund for both of you, fee included.</li>
                <li><span className="font-medium text-ink">After the deadline:</span> the person who cancels gets {POLICY.defaultLateCancelRefundPct}% of their half back; the other person gets everything back.</li>
                <li><span className="font-medium text-ink">Safety or venue issues:</span> always a full refund for both.</li>
              </ul>
              <Link href="/policies" className="btn-quiet mt-5">Read the full policy</Link>
            </div>
          </div>
        </div>
      </section>

      {/* Safety */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="eyebrow mb-4">Safety</p>
            <h2 className="display text-[44px] sm:text-[52px]">Public places. Private details.</h2>
          </div>
          <div className="grid gap-6 text-[15px] leading-relaxed text-ink-soft sm:grid-cols-2">
            <p>First dates happen at public venues. The venue address is shared only once a date is confirmed, and your home location is never stored or shown.</p>
            <p>Block or report anyone, at any time. Reports are reviewed by people, kept private, and never shown to the person you reported.</p>
            <p>A one-tap help button sits on every date, plus a private check-in afterwards to ask how it went and whether you felt safe.</p>
            <p>We work hard to make dates safer, but no platform can guarantee anyone&apos;s safety. Trust your instincts. <Link href="/policies#safety" className="underline underline-offset-4">Safety guidance</Link>.</p>
          </div>
        </div>
      </section>

      <section className="px-5 pb-24 sm:px-8">
        <div className="mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-oxblood px-8 py-16 text-center text-paper sm:py-20">
          <h2 className="display mx-auto max-w-3xl text-[46px] sm:text-[64px]">Your next first date already has a time and a place.</h2>
          <Link href="/register" className="btn mt-9 bg-paper px-8 py-3.5 text-ink hover:bg-ivory">Find my date</Link>
        </div>
      </section>
    </main>
  );
}
