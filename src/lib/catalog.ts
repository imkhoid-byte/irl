export const CATEGORIES = {
  coffee: { label: "Coffee & books", short: "Coffee" },
  games: { label: "Playful", short: "Games" },
  dinner: { label: "Dinner", short: "Dinner" },
  art: { label: "Art & culture", short: "Art" },
  cooking: { label: "Cooking class", short: "Cooking" },
  outdoors: { label: "Outdoors", short: "Outdoors" },
  music: { label: "Live music", short: "Music" },
  drinks: { label: "Drinks (zero-proof options)", short: "Drinks" },
} as const;
export type Category = keyof typeof CATEGORIES;
export const CATEGORY_KEYS = Object.keys(CATEGORIES) as Category[];

export const INTENTIONS = {
  long_term: "A long-term relationship",
  open_to_long_term: "Open to something long-term",
  see_where_it_goes: "Seeing where it goes",
  something_casual: "Something casual",
} as const;
export type Intention = keyof typeof INTENTIONS;
export const INTENTION_KEYS = Object.keys(INTENTIONS) as Intention[];

export const GENDERS = { woman: "Woman", man: "Man", nonbinary: "Nonbinary" } as const;
export type Gender = keyof typeof GENDERS;
export const GENDER_KEYS = Object.keys(GENDERS) as Gender[];

export const INTERESTS = [
  "Architecture", "Bookshops", "Ceramics", "Chess", "Cinema", "Climbing", "Coffee", "Cooking",
  "Cycling", "Dancing", "Design", "Film photography", "Gardening", "Hiking", "History", "Jazz",
  "Languages", "Museums", "Natural wine", "Poetry", "Running", "Science", "Tennis", "Theatre",
  "Travel", "Vinyl", "Yoga", "Zero-proof cocktails", "Board games", "Live comedy",
] as const;

export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const TIMES = { morning: "Mornings", afternoon: "Afternoons", evening: "Evenings" } as const;
export type TimeOfDay = keyof typeof TIMES;

export function timeOfDay(minutes: number): TimeOfDay {
  if (minutes < 12 * 60) return "morning";
  if (minutes < 17 * 60) return "afternoon";
  return "evening";
}

export const REPORT_KINDS = {
  harassment: "Harassment or unwanted behaviour",
  misconduct: "Inappropriate conduct on a date",
  safety: "I felt unsafe",
  fake_profile: "Fake or misleading profile",
  no_show: "They didn't show up",
  other: "Something else",
} as const;
export type ReportKind = keyof typeof REPORT_KINDS | "emergency" | "support";
