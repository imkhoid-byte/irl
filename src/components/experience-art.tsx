import type { Category } from "@/lib/catalog";
import { clsx } from "clsx";

const PALETTES: Record<Category, { from: string; to: string; ink: string; glow: string }> = {
  coffee: { from: "#eadcc6", to: "#d6bc98", ink: "#4a2e1f", glow: "#f6ead6" },
  games: { from: "#d9dfcc", to: "#b5c19f", ink: "#2c3922", glow: "#eef1e4" },
  dinner: { from: "#5a1f29", to: "#2a0e13", ink: "#efd5c3", glow: "#8a3a3f" },
  art: { from: "#ebe5da", to: "#d3c9b8", ink: "#1a1715", glow: "#f7f3ec" },
  cooking: { from: "#f0dab9", to: "#ddb57f", ink: "#5a3517", glow: "#f8ead2" },
  outdoors: { from: "#f3cfa8", to: "#cf7f5d", ink: "#45200f", glow: "#fbe3c4" },
  music: { from: "#2a2530", to: "#141117", ink: "#e6d1a6", glow: "#4a3e52" },
  drinks: { from: "#dfe6e2", to: "#b2c5bf", ink: "#1d3530", glow: "#f1f5f3" },
};

function Motif({ category, ink }: { category: Category; ink: string }) {
  const s = { stroke: ink, strokeWidth: 2.2, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (category) {
    case "coffee":
      return (
        <g {...s}>
          <path d="M150 150h88v38a40 40 0 0 1-40 40h-8a40 40 0 0 1-40-40z" />
          <path d="M238 162h12a16 16 0 0 1 0 32h-14" />
          <path d="M175 128c-8-10 8-16 0-28M196 128c-8-10 8-16 0-28M217 128c-8-10 8-16 0-28" opacity=".7" />
          <path d="M120 246h170" />
          <rect x="268" y="196" width="58" height="12" rx="2" />
          <rect x="274" y="184" width="50" height="12" rx="2" />
          <rect x="264" y="208" width="62" height="12" rx="2" />
        </g>
      );
    case "games":
      return (
        <g {...s}>
          <path d="M210 232V96l52 18-52 20" />
          <ellipse cx="210" cy="234" rx="58" ry="10" />
          <circle cx="160" cy="214" r="9" />
          <path d="M120 250c30-16 70-20 90-18" opacity=".6" strokeDasharray="2 7" />
        </g>
      );
    case "dinner":
      return (
        <g {...s}>
          <circle cx="200" cy="176" r="56" />
          <circle cx="200" cy="176" r="38" opacity=".55" />
          <path d="M122 132v34a8 8 0 0 0 8 8v52M114 132v26M130 132v26" />
          <path d="M278 132c-14 12-14 40 0 46v48" />
          <path d="M300 92v28M300 92c-6 8-6 14 0 18 6-4 6-10 0-18" opacity=".85" />
          <path d="M292 120h16v16h-16z" />
        </g>
      );
    case "art":
      return (
        <g {...s}>
          <rect x="128" y="84" width="144" height="168" />
          <rect x="144" y="100" width="112" height="136" opacity=".45" />
          <circle cx="182" cy="150" r="22" fill={ink} fillOpacity=".9" stroke="none" />
          <path d="M160 214c22-30 44-36 80-18" />
          <path d="M226 118l18 52" />
        </g>
      );
    case "cooking":
      return (
        <g {...s}>
          <path d="M132 160h136v40a44 44 0 0 1-44 44h-48a44 44 0 0 1-44-44z" />
          <path d="M118 160h164" />
          <path d="M160 160c0-26 80-26 80 0" opacity=".7" />
          <path d="M170 130c10-14-4-22 6-34M200 126c10-14-4-22 6-34M230 130c10-14-4-22 6-34" opacity=".6" />
          <path d="M300 96l-46 74" />
        </g>
      );
    case "outdoors":
      return (
        <g {...s}>
          <circle cx="200" cy="168" r="44" fill={ink} fillOpacity=".12" />
          <path d="M100 196h200" />
          <path d="M120 214h160M140 230h120M164 246h72" opacity=".6" />
          <path d="M248 120l6-10 6 10M262 108l5-8 5 8" opacity=".7" />
        </g>
      );
    case "music":
      return (
        <g {...s}>
          <circle cx="190" cy="172" r="70" />
          <circle cx="190" cy="172" r="48" opacity=".4" />
          <circle cx="190" cy="172" r="26" opacity=".4" />
          <circle cx="190" cy="172" r="5" fill={ink} />
          <path d="M276 100v62a12 12 0 1 1-8-11M276 100l26-8v54a12 12 0 1 1-8-11" />
        </g>
      );
    case "drinks":
      return (
        <g {...s}>
          <path d="M150 112h100l-50 58z" />
          <path d="M200 170v62M172 236h56" />
          <circle cx="240" cy="110" r="16" opacity=".9" />
          <path d="M240 94v32M224 110h32" opacity=".5" />
          <path d="M170 128h60" opacity=".45" />
        </g>
      );
  }
}

export function ExperienceArt({ category, className, label }: { category: Category; className?: string; label?: string }) {
  const p = PALETTES[category];
  const gid = `g-${category}`;
  return (
    <div className={clsx("relative overflow-hidden", className)} role="img" aria-label={label ?? `${category} illustration`}>
      <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={p.from} />
            <stop offset="1" stopColor={p.to} />
          </linearGradient>
          <radialGradient id={`${gid}-glow`} cx=".3" cy=".25" r=".7">
            <stop offset="0" stopColor={p.glow} stopOpacity=".7" />
            <stop offset="1" stopColor={p.glow} stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="400" height="300" fill={`url(#${gid})`} />
        <rect width="400" height="300" fill={`url(#${gid}-glow)`} />
        <Motif category={category} ink={p.ink} />
      </svg>
      <div className="grain pointer-events-none absolute inset-0 mix-blend-multiply" />
    </div>
  );
}

export function categoryInk(category: Category) {
  return PALETTES[category].ink;
}
