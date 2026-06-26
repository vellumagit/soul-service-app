// Bilingual copy for the public storefront (landing page + lead form +
// the chrome around the dynamic Circles/Library sections).
//
// The landing page is hand-written marketing copy (not the Settings-driven
// fields — those aren't rendered on the current design), so the translation
// lives here as a typed dictionary. English is the default; Ukrainian is
// chosen via the EN·УКР toggle (cookie `landing_lang`, see landing-lang.ts).
//
// Headings that carry <em> emphasis are stored as ReactNode so the design's
// italic accent survives translation. Everything else is a plain string.

import type { ReactNode } from "react";

export type LandingLang = "en" | "uk";

export interface LandingCopy {
  nav: { signIn: string; workWithMe: string };
  hero: {
    eyebrow: string;
    title: ReactNode;
    sub: string;
    btnPrimary: string;
    btnGhost: string;
  };
  ache: {
    tag: string;
    title: ReactNode;
    body: ReactNode;
    feel1: string;
    feel2: string;
    feel3: string;
  };
  reframe: {
    tag: string;
    pull: ReactNode;
    body: string;
    signature: ReactNode;
  };
  about: {
    portraitPlaceholder: string;
    tag: string;
    title: string;
    p1: string;
    p2: ReactNode;
  };
  ways: {
    tag: string;
    title: ReactNode;
    body: string;
    note: string;
    perSession: string;
    perMonth: string;
    per3Months: string;
    aRealConversation: string;
    quiz: Offer;
    circle: Offer;
    single: Offer;
    retainer: Offer;
    journey: Offer;
    talk: Offer;
  };
  voices: {
    tag: string;
    title: ReactNode;
    v1: string;
    v1who: string;
    v2: string;
    v2who: string;
    v3: string;
    v3who: string;
    v4: string;
    v4who: string;
  };
  circles: {
    tag: string;
    title: ReactNode;
    body: string;
    minShort: string;
    seatsLeft: (n: number) => string;
    full: string;
    holdSeat: string;
    fullNextSoon: string;
    dateLocale: string;
  };
  library: {
    tag: string;
    title: ReactNode;
    body: string;
    minShort: string;
    video: string;
    requestAccess: string;
  };
  contact: { tag: string; title: ReactNode; body: string };
  final: {
    tag: string;
    title: ReactNode;
    body: string;
    btn: string;
    tagline: string;
  };
  footer: { subtitle: string; body: string; signin: string };
  // Lead-capture form (client component reads these).
  form: {
    nameLabel: string;
    emailLabel: string;
    windowsLabel: string;
    windowsHint: string;
    messageLabel: string;
    messagePlaceholder: string;
    submit: string;
    submitting: string;
    successTitle: string;
    successBody: string;
    errorGeneric: string;
    privacyNote: string;
  };
}

interface Offer {
  step: string;
  title: string;
  price: string; // the big number stays as-is (e.g. "$20", "Free")
  desc: string;
  cta: string;
}

const EN: LandingCopy = {
  nav: { signIn: "Sign in", workWithMe: "Work with me" },
  hero: {
    eyebrow: "For those who carry everyone but themselves",
    title: (
      <>
        You point the way for everyone. Let&apos;s <em>recalibrate</em> your
        compass again.
      </>
    ),
    sub: "Gentle guidance for the ones who hold it all together — to hear what's true for you. Empowered by empathy, guided home to your own knowing.",
    btnPrimary: "Find your way in",
    btnGhost: "Send a note first",
  },
  ache: {
    tag: "Does this feel familiar?",
    title: (
      <>
        You make a hundred decisions a day — and somewhere in the giving, your{" "}
        <em>own voice</em> gets quiet.
      </>
    ),
    body: (
      <>
        For your children. Your partner. Your team. Your home. You&apos;ve
        become so good at knowing what everyone else needs that you&apos;ve
        half-forgotten how to ask what <em>you</em> need — or whether
        you&apos;d even trust the answer.
      </>
    ),
    feel1: "I'm the one everyone leans on — and I'm running on empty.",
    feel2: "There's a knowing inside me. I just can't hear it over the noise.",
    feel3: "I've put myself last so long, I'm not sure who I am anymore.",
  },
  reframe: {
    tag: "There's nothing wrong with you",
    pull: (
      <>
        Your compass isn&apos;t broken. It&apos;s just been{" "}
        <em>out of alignment.</em>
      </>
    ),
    body: "My work is simple. I help you get quiet enough to hear your own knowing again — and gentle enough with yourself to finally trust it. I don't hand you answers. You already have them. I help you remember what you already know.",
    signature: (
      <>
        &ldquo;I feel <em>with</em> you. That&apos;s what makes it safe to feel
        yourself again.&rdquo;
      </>
    ),
  },
  about: {
    portraitPlaceholder: "A warm photo of Svitlana goes here",
    tag: "Who I am",
    title: "I had to find my own way home first.",
    p1: "Fifteen years ago I came to Canada carrying anxiety I couldn't name and a knowing I didn't yet trust. I spent years searching outside myself for answers — until I learned the answers were already in me, waiting to be heard.",
    p2: (
      <>
        Now others do what I once had to: come home to themselves. People have
        called me{" "}
        <strong>a messenger of the truth</strong> — not because I have your
        answers, but because I help you hear your own. My work is gentle. I
        listen, I slow you down, I help you ground, and I guide you through your
        own filters until your voice comes through clear. Never judgmental.
        Always beside you.
      </>
    ),
  },
  ways: {
    tag: "Ways to work together",
    title: (
      <>
        Begin gently. Go as deep as you&apos;re <em>ready</em> for.
      </>
    ),
    body: "Every step is a small, comfortable “yes”. Start with a free reflection or a single evening in the Circle — and walk further when it feels right.",
    note: "A monthly Circle pass, payment plans, and rates that meet your income can be arranged — just ask.",
    perSession: "/ session",
    perMonth: "/ month",
    per3Months: "/ 3 months",
    aRealConversation: "/ a real conversation",
    quiz: {
      step: "Start free",
      title: "The Quiz & Workbook",
      price: "Free",
      desc: "A quiet reflection to find which way your inner compass is pointing — with a guided workbook to begin coming home to yourself.",
      cta: "Coming soon",
    },
    circle: {
      step: "Weekly · in a circle of women",
      title: "The Circle",
      price: "$20",
      desc: "A guided weekly group for people carrying a lot — one theme each week, gently held by Svitlana. Slow down, feel held, and remember you're not alone. 10–20 of you, ~2 hours, online.",
      cta: "Join this week's Circle →",
    },
    single: {
      step: "One-to-one · your first yes",
      title: "A Single Session",
      price: "$150",
      desc: "One conversation, just for you — in person, online, or distance. A space to be witnessed, find clarity, and hear where your compass has been leading you.",
      cta: "Book a session →",
    },
    retainer: {
      step: "Go deeper · the ongoing relationship",
      title: "Monthly Retainer",
      price: "$1,000",
      desc: "A weekly private session, plus message support between sessions (voice or text — I reply within a day). You're no longer alone with your decisions. I re-align your inner compass.",
      cta: "Begin together →",
    },
    journey: {
      step: "★ The real journey home",
      title: "The 3-Month Journey",
      price: "$2,700",
      desc: "Everything in the retainer, committed for depth — because the real and deep change unfolds over months, not moments. The most-loved way to work with me, at the best rate.",
      cta: "Start the journey →",
    },
    talk: {
      step: "Not sure where to start?",
      title: "Let's talk first",
      price: "Free",
      desc: "A short, no-pressure call to feel into what's right for you. No pitch — just a chance to be heard and to see if we're a fit.",
      cta: "Reach out →",
    },
  },
  voices: {
    tag: "In their own words",
    title: (
      <>
        What people feel after our time <em>together</em>.
      </>
    ),
    v1: "I knew it was it — and now you said it.",
    v1who: "— in her own words",
    v2: "You said what was the truth for me.",
    v2who: "— in her own words",
    v3: "I felt lighter, moved, touched — more connected to myself than I've been in years.",
    v3who: "— someone Svitlana worked with",
    v4: "I came in feeling like a burden. I left with a smile, lighter — I'd heard the truth.",
    v4who: "— someone Svitlana worked with",
  },
  circles: {
    tag: "Coming up",
    title: (
      <>
        Upcoming <em>Circles</em>.
      </>
    ),
    body: "Small group gatherings, by warm invitation. Hold a seat and I'll be in touch with everything you need.",
    minShort: "min",
    seatsLeft: (n) => `${n} seat${n === 1 ? "" : "s"} left`,
    full: "full",
    holdSeat: "Hold a seat →",
    fullNextSoon: "Full · next one soon",
    dateLocale: "en-US",
  },
  library: {
    tag: "On demand",
    title: (
      <>
        The <em>Library</em>.
      </>
    ),
    body: "Recorded workshops and replays to revisit on your own time. Request access, settle up, and your private link arrives by email.",
    minShort: "min",
    video: "video",
    requestAccess: "Request access →",
  },
  contact: {
    tag: "Send a note",
    title: (
      <>
        Curious? Curious. Reach <em>out</em>.
      </>
    ),
    body: "A few words is enough. I read every note myself and reply within a few days, usually sooner.",
  },
  final: {
    tag: "It's your turn now",
    title: (
      <>
        You&apos;ve spent so long caring for everyone else.{" "}
        <em>Give yourself</em> this.
      </>
    ),
    body: "Your inner compass is still there, waiting. Let's find it together — gently, at your pace, with someone beside you the whole way.",
    btn: "Find your way in",
    tagline: "Give yourself love.",
  },
  footer: {
    subtitle: "Soul Services",
    body: "Gentle guidance coming home to you.",
    signin: "Already working with me? Sign in →",
  },
  form: {
    nameLabel: "Your name",
    emailLabel: "Email",
    windowsLabel: "Times she has open soon (optional)",
    windowsHint:
      "Tap one to attach it to your note — she'll confirm with you either way.",
    messageLabel: "What brings you here? (optional)",
    messagePlaceholder:
      "A few words is enough — whatever you're carrying, however unformed.",
    submit: "Send your note",
    submitting: "Sending…",
    successTitle: "Thank you for reaching out.",
    successBody:
      "Your note arrived. I'll reply within a few days — usually sooner. Take a quiet breath.",
    errorGeneric: "Something went sideways sending that. Try once more?",
    privacyNote: "Your note goes directly to the practitioner. Nothing is shared.",
  },
};

const UK: LandingCopy = {
  nav: { signIn: "Увійти", workWithMe: "Попрацювати зі мною" },
  hero: {
    eyebrow: "Для тих, хто тримає всіх, окрім себе",
    title: (
      <>
        Ви вказуєте шлях усім. Час знову <em>відкалібрувати</em> ваш компас.
      </>
    ),
    sub: "М’яка підтримка для тих, хто тримає все на собі — щоб почути, що є правдою для вас. З опорою на емпатію, дорогою додому до власного знання.",
    btnPrimary: "Знайти свій шлях",
    btnGhost: "Спершу написати",
  },
  ache: {
    tag: "Це відчуття знайоме?",
    title: (
      <>
        Ви приймаєте сотні рішень щодня — і десь у цій віддачі ваш{" "}
        <em>власний голос</em> затихає.
      </>
    ),
    body: (
      <>
        Заради дітей. Партнера. Команди. Дому. Ви так добре навчилися знати, що
        потрібно всім іншим, що майже забули спитати, що потрібно <em>вам</em> —
        і чи довірилися б ви взагалі відповіді.
      </>
    ),
    feel1: "Усі спираються на мене — а я працюю на порожньому баку.",
    feel2: "Усередині є знання. Я просто не чую його за шумом.",
    feel3: "Я так довго ставила себе останньою, що вже не певна, хто я.",
  },
  reframe: {
    tag: "З вами все гаразд",
    pull: (
      <>
        Ваш компас не зламаний. Він просто <em>збився з налаштування.</em>
      </>
    ),
    body: "Моя робота проста. Я допомагаю вам стишитися настільки, щоб знову почути власне знання — і бути достатньо лагідними до себе, щоб нарешті йому довіритися. Я не даю вам відповідей. Вони вже у вас є. Я допомагаю згадати те, що ви вже знаєте.",
    signature: (
      <>
        «Я відчуваю <em>разом</em> із вами. Саме це робить безпечним знову
        відчути себе.»
      </>
    ),
  },
  about: {
    portraitPlaceholder: "Тут буде тепле фото Світлани",
    tag: "Хто я",
    title: "Спершу мені довелося самій знайти дорогу додому.",
    p1: "П’ятнадцять років тому я приїхала до Канади з тривогою, яку не могла назвати, і знанням, якому ще не довіряла. Роками я шукала відповіді ззовні — аж доки не зрозуміла, що відповіді вже були в мені й чекали, щоб їх почули.",
    p2: (
      <>
        Тепер інші роблять те, що колись мусила я: повертаються додому до
        себе. Мене називали{" "}
        <strong>посланницею правди</strong> — не тому, що я маю ваші відповіді,
        а тому, що допомагаю почути власні. Моя робота лагідна. Я слухаю,
        сповільнюю вас, допомагаю заземлитися й проводжу крізь ваші власні
        фільтри, доки ваш голос не зазвучить ясно. Без осуду. Завжди поруч.
      </>
    ),
  },
  ways: {
    tag: "Як ми можемо працювати разом",
    title: (
      <>
        Почніть лагідно. Заглиблюйтеся настільки, наскільки <em>готові</em>.
      </>
    ),
    body: "Кожен крок — маленьке, комфортне «так». Почніть із безкоштовної рефлексії чи одного вечора в Колі — і йдіть далі, коли відчуєте, що час.",
    note: "Місячний абонемент на Коло, плани оплати та ставки з огляду на ваш дохід можна влаштувати — просто запитайте.",
    perSession: "/ сеанс",
    perMonth: "/ місяць",
    per3Months: "/ 3 місяці",
    aRealConversation: "/ справжня розмова",
    quiz: {
      step: "Почати безкоштовно",
      title: "Тест і робочий зошит",
      price: "Безкоштовно",
      desc: "Тиха рефлексія, щоб побачити, куди вказує ваш внутрішній компас — із робочим зошитом, аби почати повертатися додому до себе.",
      cta: "Незабаром",
    },
    circle: {
      step: "Щотижня · у колі жінок",
      title: "Коло",
      price: "$20",
      desc: "Щотижнева група для людей, які несуть багато — одна тема щотижня, лагідно тримана Світланою. Сповільнитися, відчути опору й згадати, що ви не самі. 10–20 учасників, ~2 години, онлайн.",
      cta: "Долучитися до Кола цього тижня →",
    },
    single: {
      step: "Один на один · ваше перше «так»",
      title: "Окремий сеанс",
      price: "$150",
      desc: "Одна розмова, лише для вас — особисто, онлайн або на відстані. Простір, де вас побачать, знайдете ясність і почуєте, куди вів вас ваш компас.",
      cta: "Записатися на сеанс →",
    },
    retainer: {
      step: "Глибше · тривалі стосунки",
      title: "Місячний супровід",
      price: "$1,000",
      desc: "Щотижневий приватний сеанс плюс підтримка повідомленнями між сеансами (голос або текст — відповідаю протягом дня). Ви більше не сам-на-сам зі своїми рішеннями. Я знову налаштовую ваш внутрішній компас.",
      cta: "Почати разом →",
    },
    journey: {
      step: "★ Справжня дорога додому",
      title: "Тримісячна подорож",
      price: "$2,700",
      desc: "Усе, що в супроводі, але з відданістю глибині — бо справжні й глибокі зміни розгортаються місяцями, а не митями. Найулюбленіший спосіб працювати зі мною, за найкращою ціною.",
      cta: "Почати подорож →",
    },
    talk: {
      step: "Не знаєте, з чого почати?",
      title: "Спершу поговорімо",
      price: "Безкоштовно",
      desc: "Коротка розмова без тиску, щоб відчути, що вам підходить. Без продажів — лише нагода бути почутою й побачити, чи ми підходимо одна одній.",
      cta: "Звернутися →",
    },
  },
  voices: {
    tag: "Їхніми словами",
    title: (
      <>
        Що люди відчувають після нашого часу <em>разом</em>.
      </>
    ),
    v1: "Я знала, що це воно — а тепер ви це сказали.",
    v1who: "— її словами",
    v2: "Ви сказали те, що було правдою для мене.",
    v2who: "— її словами",
    v3: "Я відчула легкість, зворушення, дотик — більше зв’язку із собою, ніж за багато років.",
    v3who: "— людина, з якою працювала Світлана",
    v4: "Я прийшла з відчуттям тягаря. Пішла з усмішкою, легша — я почула правду.",
    v4who: "— людина, з якою працювала Світлана",
  },
  circles: {
    tag: "Незабаром",
    title: (
      <>
        Найближчі <em>Кола</em>.
      </>
    ),
    body: "Невеликі групові зустрічі за теплим запрошенням. Забронюйте місце — і я надішлю все, що потрібно.",
    minShort: "хв",
    seatsLeft: (n) => `${n} ${ukSeats(n)}`,
    full: "немає місць",
    holdSeat: "Забронювати місце →",
    fullNextSoon: "Місць немає · наступне скоро",
    dateLocale: "uk-UA",
  },
  library: {
    tag: "На вимогу",
    title: (
      <>
        <em>Бібліотека</em>.
      </>
    ),
    body: "Записані майстерні та повтори, щоб переглянути у власний час. Надішліть запит, оплатіть — і приватне посилання прийде на пошту.",
    minShort: "хв",
    video: "відео",
    requestAccess: "Запросити доступ →",
  },
  contact: {
    tag: "Напишіть",
    title: (
      <>
        Цікаво? Цікаво. <em>Напишіть</em>.
      </>
    ),
    body: "Кількох слів достатньо. Я читаю кожну записку сама й відповідаю протягом кількох днів, зазвичай швидше.",
  },
  final: {
    tag: "Тепер ваша черга",
    title: (
      <>
        Ви так довго дбали про всіх інших. <em>Подаруйте собі</em> це.
      </>
    ),
    body: "Ваш внутрішній компас досі тут і чекає. Знайдімо його разом — лагідно, у вашому темпі, із кимось поруч на всьому шляху.",
    btn: "Знайти свій шлях",
    tagline: "Подаруйте собі любов.",
  },
  footer: {
    subtitle: "Soul Services",
    body: "Лагідна підтримка на шляху додому до себе.",
    signin: "Уже працюєте зі мною? Увійти →",
  },
  form: {
    nameLabel: "Ваше ім’я",
    emailLabel: "Електронна пошта",
    windowsLabel: "Час, який скоро вільний (необов’язково)",
    windowsHint:
      "Торкніться, щоб додати до записки — вона все одно підтвердить із вами.",
    messageLabel: "Що вас привело? (необов’язково)",
    messagePlaceholder:
      "Кількох слів достатньо — що б ви не несли, навіть нечітко.",
    submit: "Надіслати записку",
    submitting: "Надсилаю…",
    successTitle: "Дякую, що звернулися.",
    successBody:
      "Ваша записка надійшла. Я відповім протягом кількох днів — зазвичай швидше. Зробіть тихий вдих.",
    errorGeneric: "Щось пішло не так під час надсилання. Спробуєте ще раз?",
    privacyNote: "Ваша записка йде напряму до практика. Нічим не діляться.",
  },
};

// Ukrainian plural for "місце" (seat): 1 місце, 2–4 місця, 5+ місць
// (with the usual 11–14 exception).
function ukSeats(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "місце вільне";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14))
    return "місця вільні";
  return "місць вільно";
}

export function getLandingCopy(lang: LandingLang): LandingCopy {
  return lang === "uk" ? UK : EN;
}
