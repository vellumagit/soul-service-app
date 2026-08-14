// The "Find your compass" quiz — Svitlana's self-selection lead magnet.
//
// Marketing job (not a real assessment): mirror the taker's state back in her
// voice — the "you said what was true for me" moment — then point them at ONE
// door. Two of the five outcomes are FILTERS: "not this season" (gently sorts
// out the merely-curious) and a safety branch (redirects acute distress to real
// support instead of a sales funnel).
//
// Pure module (no "server-only") so the client Quiz component and the server
// action both import the questions + scoring. Bilingual: every DISPLAY string
// carries both English and Ukrainian, resolved per-visitor via getQuizContent()
// / getQuizQuestions() / getQuizResults(). SCORING is language-independent — the
// weights + crisis flag live once and drive scoreQuiz() the same in either
// language. QUIZ_QUESTIONS / QUIZ_RESULTS stay EN-resolved so the scorer, the
// lead-tagging label, and any other importer keep working unchanged.

import type { LandingLang } from "./landing-copy";

export type QuizState = "keeper" | "seeker" | "diver" | "notyet";
export type QuizResultKey = QuizState | "safety";

// A display string in both languages. Blank/whitespace in the chosen language
// falls back to the other so a half-filled translation never reaches the page
// (same rule the landing copy + overrides follow).
type Bi = { en: string; uk: string };

function pick(pair: Bi, lang: LandingLang): string {
  const primary = lang === "uk" ? pair.uk : pair.en;
  const fallback = lang === "uk" ? pair.en : pair.uk;
  return primary.trim() || fallback;
}

// ── Public (resolved) shapes the Quiz component + scorer consume. Text is
// already resolved to one language; `weights`/`crisis` are language-independent.

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

// ── Source of truth: every display string carries both languages. The weights +
// crisis flag are identical across languages (they drive scoring, which is
// language-independent), so they live here once, next to the English label.

type QuizOptionSrc = {
  label: Bi;
  weights?: Partial<Record<QuizState, number>>;
  crisis?: boolean;
};

type QuizQuestionSrc = {
  id: string;
  prompt: Bi;
  options: QuizOptionSrc[];
};

const QUIZ_QUESTIONS_SRC: QuizQuestionSrc[] = [
  {
    id: "why",
    prompt: {
      en: "What made you take this today?",
      uk: "Що привело вас сюди сьогодні?",
    },
    options: [
      {
        label: {
          en: "Just curious — or a friend sent it",
          uk: "Просто цікаво — або подруга надіслала",
        },
        weights: { notyet: 2 },
      },
      {
        label: {
          en: "Something in me is quietly shifting",
          uk: "Щось у мені тихо зрушується",
        },
        weights: { seeker: 2 },
      },
      {
        label: {
          en: "I'm running on empty, and I know it",
          uk: "Я на порожньому баку — і знаю це",
        },
        weights: { keeper: 2 },
      },
      {
        label: {
          en: "I'm ready to finally do the deeper work",
          uk: "Я готова нарешті на глибшу внутрішню роботу",
        },
        weights: { diver: 2 },
      },
    ],
  },
  {
    id: "hour",
    prompt: {
      en: "Imagine a whole hour that's entirely yours — no one needing anything. What rises up?",
      uk: "Уявіть цілу годину, яка належить тільки вам — коли нікому нічого від вас не треба. Що піднімається всередині?",
    },
    options: [
      {
        label: {
          en: "Relief I can almost taste",
          uk: "Полегшення, яке майже відчутне на смак",
        },
        weights: { seeker: 1, keeper: 1 },
      },
      {
        label: {
          en: "I wouldn't know what to do with it",
          uk: "Я б не знала, що з нею робити",
        },
        weights: { keeper: 2 },
      },
      {
        label: { en: "A flicker of guilt", uk: "Проблиск провини" },
        weights: { keeper: 2 },
      },
      {
        label: {
          en: "Sounds nice, but I'm basically fine",
          uk: "Звучить приємно, але загалом зі мною все гаразд",
        },
        weights: { notyet: 2 },
      },
    ],
  },
  {
    id: "voice",
    prompt: {
      en: "How close can you hear your own voice right now?",
      uk: "Наскільки близько ви зараз чуєте власний голос?",
    },
    options: [
      {
        label: {
          en: "Clear — I mostly trust it",
          uk: "Ясно — і я здебільшого йому довіряю",
        },
        weights: { notyet: 1, diver: 1 },
      },
      {
        label: {
          en: "It's there, but faint under the noise",
          uk: "Він є, але ледь чутний за шумом",
        },
        weights: { seeker: 2 },
      },
      {
        label: {
          en: "I've lost it under everyone else's",
          uk: "Я загубила його під голосами всіх інших",
        },
        weights: { keeper: 2 },
      },
      {
        label: {
          en: "I want to hear it — and go all the way in",
          uk: "Хочу почути його — і пройти весь шлях углиб",
        },
        weights: { diver: 2 },
      },
    ],
  },
  {
    id: "change",
    prompt: {
      en: "When you picture change, what do you want?",
      uk: "Коли ви уявляєте зміни — чого вам хочеться?",
    },
    options: [
      {
        label: {
          en: "Someone beside me, so I'm not alone in it",
          uk: "Когось поруч, щоб не бути в цьому самій",
        },
        weights: { keeper: 2 },
      },
      {
        label: {
          en: "One honest conversation to hear what's true",
          uk: "Однієї чесної розмови, щоб почути, що є правдою",
        },
        weights: { seeker: 2 },
      },
      {
        label: {
          en: "To go all the way — real, lasting change",
          uk: "Пройти весь шлях — справжні, тривкі зміни",
        },
        weights: { diver: 2 },
      },
      {
        label: {
          en: "I'm not sure I want change yet",
          uk: "Я ще не певна, що хочу змін",
        },
        weights: { notyet: 2 },
      },
    ],
  },
  {
    id: "day",
    prompt: {
      en: "How much of your day goes to everyone else?",
      uk: "Скільки вашого дня йде на всіх інших?",
    },
    options: [
      {
        label: {
          en: "Almost all of it — I come last",
          uk: "Майже весь — я завжди остання",
        },
        weights: { keeper: 2 },
      },
      {
        label: {
          en: "Most of it, but I'm starting to notice",
          uk: "Більшість, але я вже починаю це помічати",
        },
        weights: { seeker: 1, keeper: 1 },
      },
      {
        label: {
          en: "A fair amount — it's manageable",
          uk: "Чимало, але з цим можна впоратися",
        },
        weights: { notyet: 2 },
      },
      {
        label: {
          en: "I've been protecting my own space lately",
          uk: "Останнім часом я оберігаю свій простір",
        },
        weights: { diver: 1, notyet: 1 },
      },
    ],
  },
  {
    id: "holding",
    prompt: {
      en: "And honestly — how are you holding up lately?",
      uk: "І чесно — як ви тримаєтеся останнім часом?",
    },
    options: [
      {
        label: { en: "Tired, but okay", uk: "Втомлена, але тримаюся" },
        weights: { keeper: 1 },
      },
      {
        label: {
          en: "Heavy. I'm carrying a lot",
          uk: "Важко. Я несу багато",
        },
        weights: { keeper: 1, seeker: 1 },
      },
      {
        label: {
          en: "Numb — going through the motions",
          uk: "Заціпеніло — просто живу за інерцією",
        },
        weights: { keeper: 1, seeker: 1 },
      },
      {
        label: {
          en: "I'm struggling and could use real support right now",
          uk: "Мені важко, і зараз мені справді потрібна підтримка",
        },
        crisis: true,
      },
    ],
  },
];

type QuizResultSrc = {
  key: QuizResultKey;
  kicker: Bi;
  title: Bi;
  mirror: Bi[];
  door: { kind: QuizDoorKind; label: Bi; note: Bi } | null;
  showWorkbook: boolean;
};

const QUIZ_RESULTS_SRC: Record<QuizResultKey, QuizResultSrc> = {
  keeper: {
    key: "keeper",
    kicker: { en: "Your reflection", uk: "Ваше відображення" },
    title: {
      en: "You're the one everyone leans on.",
      uk: "Ви — та, на кого спираються всі.",
    },
    mirror: [
      {
        en: "You've become so good at knowing what everyone else needs that your own voice has gone quiet. You give and give — and somewhere in it, you stopped asking what you need, or whether you'd even trust the answer.",
        uk: "Ви так добре навчилися відчувати, що потрібно всім іншим, що ваш власний голос затих. Ви віддаєте й віддаєте — і десь у цьому перестали питати, що потрібно вам, і чи довірилися б ви взагалі відповіді.",
      },
      {
        en: "There's nothing wrong with you. Your compass isn't broken — it's just been pointed outward a long time. And the gentlest way back is not to do it alone.",
        uk: "З вами все гаразд. Ваш компас не зламаний — він просто давно спрямований назовні. І найлагідніший шлях назад — не йти ним самій.",
      },
    ],
    door: {
      kind: "circle",
      label: {
        en: "Hold a seat in the next Circle",
        uk: "Забронювати місце в наступному Колі",
      },
      note: {
        en: "A weekly evening in a small circle of women carrying a lot — slow down, feel held, and remember you're not the only one.",
        uk: "Щотижневий вечір у невеликому колі жінок, які несуть багато, — сповільнитися, відчути опору й згадати, що ви не єдина.",
      },
    },
    showWorkbook: true,
  },
  seeker: {
    key: "seeker",
    kicker: { en: "Your reflection", uk: "Ваше відображення" },
    title: {
      en: "There's a knowing in you that you can't quite hear.",
      uk: "У вас є знання, яке ви поки не зовсім чуєте.",
    },
    mirror: [
      {
        en: "You can feel it — a truth underneath all the noise. Something's shifting, and part of you already senses what it is. You just can't hear it clearly yet over everything you're holding.",
        uk: "Ви це відчуваєте — правду під усім шумом. Щось зрушується, і частина вас уже вгадує, що саме. Ви просто ще не чуєте цього ясно за всім, що несете.",
      },
      {
        en: "You don't need someone to hand you answers. You need space quiet enough to hear your own.",
        uk: "Вам не потрібен хтось, хто дасть вам відповіді. Вам потрібен простір, достатньо тихий, щоб почути власні.",
      },
    ],
    door: {
      kind: "contact",
      label: { en: "Book a single session", uk: "Записатися на окремий сеанс" },
      note: {
        en: "One honest conversation, just for you — to slow down and hear where your compass has been pointing all along.",
        uk: "Одна чесна розмова, лише для вас — сповільнитися й почути, куди весь цей час вказував ваш компас.",
      },
    },
    showWorkbook: true,
  },
  diver: {
    key: "diver",
    kicker: { en: "Your reflection", uk: "Ваше відображення" },
    title: {
      en: "You're ready to come home to yourself.",
      uk: "Ви готові повернутися додому до себе.",
    },
    mirror: [
      {
        en: "You've circled this long enough. You're not looking for a quick fix or a nice idea — you want the real, deep change that only unfolds over time.",
        uk: "Ви кружляли навколо цього достатньо довго. Ви не шукаєте швидкого рішення чи гарної ідеї — ви хочете справжніх, глибоких змін, які розгортаються лише з часом.",
      },
      {
        en: "This is the work of coming all the way back to your own knowing, with someone beside you the whole way.",
        uk: "Це робота повернення — аж до самого власного знання — із кимось поруч на всьому шляху.",
      },
    ],
    door: {
      kind: "contact",
      label: { en: "Begin the Journey", uk: "Почати подорож" },
      note: {
        en: "The 3-month journey — weekly depth, held closely. The most-loved way to work together.",
        uk: "Тримісячна подорож — щотижнева глибина, дбайливо тримана. Найулюбленіший спосіб працювати разом.",
      },
    },
    showWorkbook: true,
  },
  notyet: {
    key: "notyet",
    kicker: { en: "Your reflection", uk: "Ваше відображення" },
    title: {
      en: "Not this season — and that's okay.",
      uk: "Зараз не ваша пора — і це нормально.",
    },
    mirror: [
      {
        en: "From what you shared, you're steadier than you might think. You're not running on empty, and you're not in a season that's asking you to tear anything down.",
        uk: "Із того, чим ви поділилися, ви стійкіші, ніж вам може здаватися. Ви не на порожньому баку, і зараз не та пора, яка просить вас щось руйнувати.",
      },
      {
        en: "There's no pressure here. Keep this reflection. If a day comes when the noise gets louder than your own voice, you'll know where to find me.",
        uk: "Тут немає жодного тиску. Збережіть це відображення. Якщо настане день, коли шум стане гучнішим за ваш власний голос, — ви знатимете, де мене знайти.",
      },
    ],
    door: {
      kind: "explore",
      label: { en: "Look around the site", uk: "Роззирнутися сайтом" },
      note: {
        en: "See the ways we could work together — whenever the time is right.",
        uk: "Подивіться, як ми могли б працювати разом — коли настане слушний час.",
      },
    },
    showWorkbook: true,
  },
  safety: {
    key: "safety",
    kicker: { en: "A gentle pause", uk: "Лагідна пауза" },
    title: {
      en: "Be gentle with yourself right now.",
      uk: "Будьте зараз лагідні до себе.",
    },
    mirror: [
      {
        en: "Thank you for being honest about how heavy it's been. What you're carrying sounds like more than a quiet reflection can hold — and you deserve real, present support.",
        uk: "Дякую, що чесно сказали, наскільки важко вам було. Те, що ви несете, — це більше, ніж може вмістити тиха рефлексія, і ви заслуговуєте на справжню, живу підтримку.",
      },
      {
        en: "This work isn't a substitute for that kind of care. Please reach out to someone who can be with you properly.",
        uk: "Ця робота не замінить такої турботи. Будь ласка, зверніться до когось, хто зможе бути поруч із вами по-справжньому.",
      },
    ],
    door: null,
    showWorkbook: false,
  },
};

// ── Resolvers: turn a bilingual source entry into the resolved shape the UI
// already consumes, with EN fallback when the chosen language is blank.

function resolveQuestion(q: QuizQuestionSrc, lang: LandingLang): QuizQuestion {
  return {
    id: q.id,
    prompt: pick(q.prompt, lang),
    options: q.options.map((o) => ({
      label: pick(o.label, lang),
      weights: o.weights,
      crisis: o.crisis,
    })),
  };
}

function resolveResult(r: QuizResultSrc, lang: LandingLang): QuizResult {
  return {
    key: r.key,
    kicker: pick(r.kicker, lang),
    title: pick(r.title, lang),
    mirror: r.mirror.map((m) => pick(m, lang)),
    door: r.door
      ? {
          kind: r.door.kind,
          label: pick(r.door.label, lang),
          note: pick(r.door.note, lang),
        }
      : null,
    showWorkbook: r.showWorkbook,
  };
}

export function getQuizQuestions(lang: LandingLang): QuizQuestion[] {
  return QUIZ_QUESTIONS_SRC.map((q) => resolveQuestion(q, lang));
}

export function getQuizResults(
  lang: LandingLang
): Record<QuizResultKey, QuizResult> {
  return {
    keeper: resolveResult(QUIZ_RESULTS_SRC.keeper, lang),
    seeker: resolveResult(QUIZ_RESULTS_SRC.seeker, lang),
    diver: resolveResult(QUIZ_RESULTS_SRC.diver, lang),
    notyet: resolveResult(QUIZ_RESULTS_SRC.notyet, lang),
    safety: resolveResult(QUIZ_RESULTS_SRC.safety, lang),
  };
}

/** Everything the Quiz component needs, resolved for one language in one call. */
export function getQuizContent(lang: LandingLang): {
  questions: QuizQuestion[];
  results: Record<QuizResultKey, QuizResult>;
} {
  return { questions: getQuizQuestions(lang), results: getQuizResults(lang) };
}

// EN-resolved constants. scoreQuiz reads weights/crisis (identical across
// languages) off these, and quizResultLabel keeps tagging leads in English for
// the practitioner's inbox — so both stay stable regardless of the visitor's
// language.
export const QUIZ_QUESTIONS: QuizQuestion[] = getQuizQuestions("en");
export const QUIZ_RESULTS: Record<QuizResultKey, QuizResult> =
  getQuizResults("en");

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

/** Human label for a result key — used to tag the lead ("Quiz · …"). Always
 *  English: this is practitioner-facing (her inbox), not visitor-facing. */
export function quizResultLabel(key: QuizResultKey): string {
  return QUIZ_RESULTS[key].title;
}
