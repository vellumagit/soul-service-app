// The "Find your compass" quiz — Svitlana's self-selection lead magnet.
//
// Marketing job (not a real assessment): mirror the taker's state back in her
// voice — the "you said what was true for me" moment — then point them at ONE
// door. Two of the five outcomes are FILTERS: "not this season" (gently sorts
// out the merely-curious) and a safety branch (redirects acute distress to real
// support instead of a sales funnel).
//
// Pure module (no "server-only") so the client Quiz component and the server
// action both import the questions + scoring. EN only for v1; a UK pass can
// follow the same shape.

export type QuizState = "keeper" | "seeker" | "diver" | "notyet";
export type QuizResultKey = QuizState | "safety";

export type QuizOption = {
  label: string;
  /** Points toward each state. Highest total wins. */
  weights?: Partial<Record<QuizState, number>>;
  /** Picking this forces the safety result regardless of score. */
  crisis?: boolean;
};

export type QuizQuestion = {
  id: string;
  prompt: string;
  options: QuizOption[];
};

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "why",
    prompt: "What made you take this today?",
    options: [
      { label: "Just curious — or a friend sent it", weights: { notyet: 2 } },
      { label: "Something in me is quietly shifting", weights: { seeker: 2 } },
      { label: "I'm running on empty, and I know it", weights: { keeper: 2 } },
      { label: "I'm ready to finally do the deeper work", weights: { diver: 2 } },
    ],
  },
  {
    id: "hour",
    prompt:
      "Imagine a whole hour that's entirely yours — no one needing anything. What rises up?",
    options: [
      { label: "Relief I can almost taste", weights: { seeker: 1, keeper: 1 } },
      { label: "I wouldn't know what to do with it", weights: { keeper: 2 } },
      { label: "A flicker of guilt", weights: { keeper: 2 } },
      { label: "Sounds nice, but I'm basically fine", weights: { notyet: 2 } },
    ],
  },
  {
    id: "voice",
    prompt: "How close can you hear your own voice right now?",
    options: [
      { label: "Clear — I mostly trust it", weights: { notyet: 1, diver: 1 } },
      { label: "It's there, but faint under the noise", weights: { seeker: 2 } },
      { label: "I've lost it under everyone else's", weights: { keeper: 2 } },
      { label: "I want to hear it — and go all the way in", weights: { diver: 2 } },
    ],
  },
  {
    id: "change",
    prompt: "When you picture change, what do you want?",
    options: [
      { label: "Someone beside me, so I'm not alone in it", weights: { keeper: 2 } },
      { label: "One honest conversation to hear what's true", weights: { seeker: 2 } },
      { label: "To go all the way — real, lasting change", weights: { diver: 2 } },
      { label: "I'm not sure I want change yet", weights: { notyet: 2 } },
    ],
  },
  {
    id: "day",
    prompt: "How much of your day goes to everyone else?",
    options: [
      { label: "Almost all of it — I come last", weights: { keeper: 2 } },
      { label: "Most of it, but I'm starting to notice", weights: { seeker: 1, keeper: 1 } },
      { label: "A fair amount — it's manageable", weights: { notyet: 2 } },
      { label: "I've been protecting my own space lately", weights: { diver: 1, notyet: 1 } },
    ],
  },
  {
    id: "holding",
    prompt: "And honestly — how are you holding up lately?",
    options: [
      { label: "Tired, but okay", weights: { keeper: 1 } },
      { label: "Heavy. I'm carrying a lot", weights: { keeper: 1, seeker: 1 } },
      { label: "Numb — going through the motions", weights: { keeper: 1, seeker: 1 } },
      { label: "I'm struggling and could use real support right now", crisis: true },
    ],
  },
];

/** How the recommended "door" resolves to a link in the UI. */
export type QuizDoorKind = "circle" | "contact" | "explore";

export type QuizResult = {
  key: QuizResultKey;
  kicker: string;
  title: string;
  mirror: string[]; // 1–2 short paragraphs, in her voice
  door: { kind: QuizDoorKind; label: string; note: string } | null;
  /** Show the "send me the workbook" email capture after the result. */
  showWorkbook: boolean;
};

export const QUIZ_RESULTS: Record<QuizResultKey, QuizResult> = {
  keeper: {
    key: "keeper",
    kicker: "Your reflection",
    title: "You're the one everyone leans on.",
    mirror: [
      "You've become so good at knowing what everyone else needs that your own voice has gone quiet. You give and give — and somewhere in it, you stopped asking what you need, or whether you'd even trust the answer.",
      "There's nothing wrong with you. Your compass isn't broken — it's just been pointed outward a long time. And the gentlest way back is not to do it alone.",
    ],
    door: {
      kind: "circle",
      label: "Hold a seat in the next Circle",
      note: "A weekly evening in a small circle of women carrying a lot — slow down, feel held, and remember you're not the only one.",
    },
    showWorkbook: true,
  },
  seeker: {
    key: "seeker",
    kicker: "Your reflection",
    title: "There's a knowing in you that you can't quite hear.",
    mirror: [
      "You can feel it — a truth underneath all the noise. Something's shifting, and part of you already senses what it is. You just can't hear it clearly yet over everything you're holding.",
      "You don't need someone to hand you answers. You need space quiet enough to hear your own.",
    ],
    door: {
      kind: "contact",
      label: "Book a single session",
      note: "One honest conversation, just for you — to slow down and hear where your compass has been pointing all along.",
    },
    showWorkbook: true,
  },
  diver: {
    key: "diver",
    kicker: "Your reflection",
    title: "You're ready to come home to yourself.",
    mirror: [
      "You've circled this long enough. You're not looking for a quick fix or a nice idea — you want the real, deep change that only unfolds over time.",
      "This is the work of coming all the way back to your own knowing, with someone beside you the whole way.",
    ],
    door: {
      kind: "contact",
      label: "Begin the Journey",
      note: "The 3-month journey — weekly depth, held closely. The most-loved way to work together.",
    },
    showWorkbook: true,
  },
  notyet: {
    key: "notyet",
    kicker: "Your reflection",
    title: "Not this season — and that's okay.",
    mirror: [
      "From what you shared, you're steadier than you might think. You're not running on empty, and you're not in a season that's asking you to tear anything down.",
      "There's no pressure here. Keep this reflection. If a day comes when the noise gets louder than your own voice, you'll know where to find me.",
    ],
    door: {
      kind: "explore",
      label: "Look around the site",
      note: "See the ways we could work together — whenever the time is right.",
    },
    showWorkbook: true,
  },
  safety: {
    key: "safety",
    kicker: "A gentle pause",
    title: "Be gentle with yourself right now.",
    mirror: [
      "Thank you for being honest about how heavy it's been. What you're carrying sounds like more than a quiet reflection can hold — and you deserve real, present support.",
      "This work isn't a substitute for that kind of care. Please reach out to someone who can be with you properly.",
    ],
    door: null,
    showWorkbook: false,
  },
};

/** Score a set of answers (option index per question, aligned to
 *  QUIZ_QUESTIONS order; null = unanswered) into a result key.
 *  A crisis pick always wins; otherwise the highest-weighted state, with ties
 *  broken toward the gentler entry (keeper → seeker → diver → notyet). */
export function scoreQuiz(answers: (number | null)[]): QuizResultKey {
  for (let i = 0; i < QUIZ_QUESTIONS.length; i++) {
    const idx = answers[i];
    if (idx == null) continue;
    if (QUIZ_QUESTIONS[i].options[idx]?.crisis) return "safety";
  }

  const totals: Record<QuizState, number> = {
    keeper: 0,
    seeker: 0,
    diver: 0,
    notyet: 0,
  };
  for (let i = 0; i < QUIZ_QUESTIONS.length; i++) {
    const idx = answers[i];
    if (idx == null) continue;
    const w = QUIZ_QUESTIONS[i].options[idx]?.weights;
    if (!w) continue;
    for (const k of Object.keys(w) as QuizState[]) {
      totals[k] += w[k] ?? 0;
    }
  }

  const order: QuizState[] = ["keeper", "seeker", "diver", "notyet"];
  let best: QuizState = "keeper";
  let bestVal = -1;
  for (const k of order) {
    if (totals[k] > bestVal) {
      best = k;
      bestVal = totals[k];
    }
  }
  return best;
}

/** Human label for a result key — used to tag the lead ("Quiz · …"). */
export function quizResultLabel(key: QuizResultKey): string {
  return QUIZ_RESULTS[key].title;
}
