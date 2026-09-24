// Words for the three public offering pages — /womens-circle,
// /private-sessions and /coaching (and their /uk twins). One page per kind of
// work, so each can be found for what it is: an online women's circle, a
// private spiritual coaching session, ongoing coaching.
//
// Structure is shared, text is per language (see AGENTS.md). PRICES ARE NOT
// HERE on purpose: each page shows the live price of the offers she's pointed
// at it in Settings → Offers ("Its own page"), so a price change can never
// leave a page quoting the old one.
//
// Every factual claim below comes from her own storefront copy, the Terms /
// Privacy Policy (legal-copy.ts) or how the app actually behaves (reminder
// emails, per-Circle language). Don't add promises the practice hasn't made.
// Titles stay under 60 characters and descriptions under 158.

import type { LandingLang } from "./landing-copy";
import type { OfferPage } from "./landing-offers";

export type OfferingFaq = { q: string; a: string };

export type OfferingCopy = {
  metaTitle: string;
  metaDescription: string;
  /** Short name — breadcrumbs, "other ways" links, schema Service name. */
  name: string;
  eyebrow: string;
  h1: string;
  intro: string[];
  pricesTitle: string;
  includedTitle: string;
  included: string[];
  stepsTitle: string;
  steps: { h: string; p: string }[];
  forYouTitle: string;
  forYou: string[];
  faqTitle: string;
  faqs: OfferingFaq[];
  ctaTitle: string;
  ctaBody: string;
  ctaButton: string;
  /** Where the final button goes: the soonest bookable Circle, or her
   *  contact form. */
  ctaTarget: "circle" | "contact";
};

/** Words shared by all three pages. */
export type OfferingChrome = {
  home: string;
  moreAbout: string;
  otherWays: string;
  askNote: string;
  askLink: string;
  upcomingTitle: string;
  seatsLeft: (n: number) => string;
  full: string;
  holdSeat: string;
  noUpcoming: string;
  /** The final button when there's no Circle to book right now. */
  noteButton: string;
  circleLang: (lang: "en" | "uk") => string;
};

export const OFFERING_CHROME: Record<LandingLang, OfferingChrome> = {
  en: {
    home: "Svitlana · Soul Services",
    moreAbout: "More about this →",
    otherWays: "Other ways to work with me",
    askNote: "A question not answered here?",
    askLink: "Send me a note — I read every one myself.",
    upcomingTitle: "Upcoming Circles",
    seatsLeft: (n) => (n === 1 ? "1 seat left" : `${n} seats left`),
    full: "Full",
    holdSeat: "Hold my seat →",
    noUpcoming:
      "The next dates aren't posted yet. Send me a note and I'll tell you when the next Circle opens.",
    noteButton: "Send me a note →",
    circleLang: (l) => (l === "uk" ? "In Ukrainian" : "In English"),
  },
  uk: {
    home: "Світлана · Soul Services",
    moreAbout: "Докладніше →",
    otherWays: "Інші способи працювати зі мною",
    askNote: "Не знайшли відповіді на своє питання?",
    askLink: "Напишіть мені — кожен лист я читаю сама.",
    upcomingTitle: "Найближчі Кола",
    seatsLeft: (n) => {
      const m10 = n % 10;
      const m100 = n % 100;
      if (m10 === 1 && m100 !== 11) return `Залишилося ${n} місце`;
      if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14))
        return `Залишилося ${n} місця`;
      return `Залишилося ${n} місць`;
    },
    full: "Місць немає",
    holdSeat: "Забронювати місце →",
    noUpcoming:
      "Нові дати ще не опубліковані. Напишіть мені — і я повідомлю, коли відкриється наступне Коло.",
    noteButton: "Написати мені →",
    circleLang: (l) => (l === "uk" ? "Українською" : "Англійською"),
  },
};

export const OFFERING_COPY: Record<OfferPage, Record<LandingLang, OfferingCopy>> = {
  "womens-circle": {
    en: {
      metaTitle: "Online Women's Circle, Weekly | Svitlana Pavliuk",
      metaDescription:
        "A weekly online women's circle for women who carry everyone. One theme, about two hours, 10–20 women, in English or Ukrainian — join from anywhere in Canada.",
      name: "The Circle — a weekly online women's circle",
      eyebrow: "The Circle · weekly · online",
      h1: "A weekly women's circle, online",
      intro: [
        "The Circle is a weekly online women's circle for the ones who hold it all together — for your children, your partner, your team, your home — and have half-forgotten how to ask what they need themselves.",
        "Each week there's one theme, gently held by me. For about two hours, 10 to 20 women slow down together, feel held, and remember they're not alone. It happens by video, so you can join from anywhere in Canada.",
      ],
      pricesTitle: "Joining the Circle",
      includedTitle: "What a Circle evening includes",
      included: [
        "One theme each week, chosen and held by Svitlana",
        "About two hours together by video (usually Google Meet)",
        "A small group — 10 to 20 women",
        "Circles in English and in Ukrainian — every date shows which language it's held in",
        "A confirmation email with your link, plus reminders the day before and an hour before",
        "A private space: Circles are never recorded, and everyone keeps what's shared in confidence",
      ],
      stepsTitle: "How it works",
      steps: [
        {
          h: "Pick a date",
          p: "Choose an upcoming Circle below. Each one shows its date and time, its language, and how many seats are left.",
        },
        {
          h: "Reserve your seat",
          p: "Pay securely by card (through Stripe). Your seat is confirmed as soon as the payment goes through, and the confirmation email arrives with your link.",
        },
        {
          h: "Join from wherever you are",
          p: "At the time of the Circle, open the link from a quiet, private spot. Nothing to prepare — just arrive as you are.",
        },
      ],
      forYouTitle: "The Circle may be for you if…",
      forYou: [
        "You're the one everyone leans on — and you're running on empty.",
        "There's a knowing inside you, but you can't hear it over the noise.",
        "You've put yourself last for so long you're not sure who you are anymore.",
        "You'd like to begin gently, with other women, before going one-to-one.",
      ],
      faqTitle: "Questions about the Circle",
      faqs: [
        {
          q: "Who is the women's circle for?",
          a: "It's for women who carry a lot — mothers, partners, leaders, the ones everyone else leans on — and who want an evening to slow down and hear themselves again. You don't need any experience with circles, meditation or spiritual work. You need to be at least 18 to join. If you're not sure it's right for you, send me a note and we can talk it through first.",
        },
        {
          q: "Is the Circle online? Can I join from anywhere in Canada?",
          a: "Yes. Every Circle happens by video, usually on Google Meet, so you can join from anywhere — Edmonton, Toronto, Vancouver or a small town in between. The link arrives in your confirmation email. All you need is a working internet connection and a private, comfortable place to sit for about two hours, where you can speak freely.",
        },
        {
          q: "Is there a women's circle in Ukrainian?",
          a: "Each Circle has its own language — English or Ukrainian — and it's marked on every date, so you know which room you're joining before you pay. When you sign up for a Ukrainian Circle, the sign-up page, your confirmation and all the reminder emails come in Ukrainian too. If you don't see a Ukrainian date yet, send me a note and I'll let you know when one opens.",
        },
        {
          q: "What if I can't make it after I've paid?",
          a: "You can cancel with the link in your confirmation email any time before the Circle begins and get a full refund to your original payment method — it usually appears within 5–10 business days, depending on your bank. Once a Circle has started, or if you don't attend, the seat isn't refunded. If I ever cancel a Circle, everyone who paid is refunded in full.",
        },
        {
          q: "Is the Circle recorded?",
          a: "No. Circles are never recorded. It's a shared space, so I ask everyone to keep what others share in confidence, and not to record, photograph or screenshot the session or the other women in it. That's what makes it safe to speak honestly — about the things you might not say anywhere else.",
        },
        {
          q: "Is the Circle a therapy group?",
          a: "No. The Circle is spiritual guidance and emotional support — not medical, psychological or psychiatric treatment, and not a substitute for care from a licensed professional. Please keep seeing your doctor or therapist. If you're in crisis or thinking about harming yourself, call or text 9-8-8 (Suicide Crisis Helpline), call 911, or go to your nearest emergency room.",
        },
        {
          q: "Can I come every week?",
          a: "Yes. A monthly Circle pass can be arranged, as can payment plans and rates that meet your income. Just ask: send me a note and tell me what would make it possible for you to come regularly. Money shouldn't be the reason you keep putting yourself last.",
        },
      ],
      ctaTitle: "Give yourself one evening.",
      ctaBody:
        "You've spent so long holding space for everyone else. This one is for you — two hours, a circle of women, and a chance to hear your own voice again.",
      ctaButton: "Join this week's Circle →",
      ctaTarget: "circle",
    },
    uk: {
      metaTitle: "Жіноче коло онлайн щотижня | Світлана Павлюк",
      metaDescription:
        "Щотижневе жіноче коло онлайн для тих, хто тримає все на собі. Одна тема, близько двох годин, 10–20 жінок, українською чи англійською — з усієї Канади.",
      name: "Коло — щотижневе жіноче коло онлайн",
      eyebrow: "Коло · щотижня · онлайн",
      h1: "Щотижневе жіноче коло онлайн",
      intro: [
        "Коло — це щотижневе жіноче коло онлайн для тих, хто тримає все на собі: заради дітей, партнера, команди, дому — і майже забув, як спитати, що потрібно їй самій.",
        "Щотижня — одна тема, яку я лагідно тримаю. Близько двох годин 10–20 жінок разом сповільнюються, відчувають опору й згадують, що вони не самі. Зустрічі проходять у відеоформаті, тож долучитися можна з будь-якої точки Канади.",
      ],
      pricesTitle: "Як долучитися до Кола",
      includedTitle: "Що включає вечір у Колі",
      included: [
        "Одна тема щотижня — її обирає й тримає Світлана",
        "Близько двох годин разом у відеоформаті (зазвичай Google Meet)",
        "Невелика група — від 10 до 20 жінок",
        "Кола англійською та українською — біля кожної дати позначено мову",
        "Лист-підтвердження з посиланням і нагадування за день та за годину до зустрічі",
        "Безпечний простір: Кола ніколи не записуються, а все сказане залишається між нами",
      ],
      stepsTitle: "Як це відбувається",
      steps: [
        {
          h: "Оберіть дату",
          p: "Виберіть найближче Коло нижче. Біля кожного вказано дату й час, мову та кількість вільних місць.",
        },
        {
          h: "Забронюйте місце",
          p: "Оплатіть карткою — безпечно, через Stripe. Місце підтверджується одразу після оплати, і вам приходить лист із посиланням.",
        },
        {
          h: "Долучайтеся звідки завгодно",
          p: "У призначений час відкрийте посилання з тихого, затишного місця. Нічого готувати не потрібно — просто приходьте такою, як є.",
        },
      ],
      forYouTitle: "Коло може бути для вас, якщо…",
      forYou: [
        "Усі спираються на вас — а ви працюєте на порожньому баку.",
        "Усередині є знання, але ви не чуєте його за шумом.",
        "Ви так довго ставили себе останньою, що вже не певні, хто ви.",
        "Вам хочеться почати лагідно, разом з іншими жінками, перш ніж працювати віч-на-віч.",
      ],
      faqTitle: "Питання про Коло",
      faqs: [
        {
          q: "Для кого це жіноче коло?",
          a: "Для жінок, які несуть багато, — мам, партнерок, керівниць, тих, на кого спираються всі довкола, — і яким хочеться вечора, щоб сповільнитися й знову почути себе. Жодного досвіду з колами, медитацією чи духовними практиками не потрібно. Вам має бути щонайменше 18 років. Якщо сумніваєтеся, чи це для вас, напишіть мені — і ми спершу поговоримо.",
        },
        {
          q: "Коло проходить онлайн? Чи можна долучитися з будь-якого міста Канади?",
          a: "Так. Кожне Коло проходить у відеоформаті, зазвичай у Google Meet, тож долучитися можна звідки завгодно — з Едмонтона, Торонто, Ванкувера чи невеликого містечка. Посилання приходить у листі-підтвердженні. Потрібні лише стабільний інтернет і тихе, затишне місце, де ви зможете близько двох годин вільно говорити.",
        },
        {
          q: "Чи є жіноче коло українською мовою?",
          a: "Кожне Коло має свою мову — англійську або українську, — і вона позначена біля кожної дати, тож ви знаєте, до якої кімнати приєднуєтеся, ще до оплати. Якщо ви записуєтеся на українське Коло, сторінка реєстрації, підтвердження й усі нагадування теж приходять українською. Якщо української дати поки немає — напишіть мені, і я повідомлю, щойно вона з’явиться.",
        },
        {
          q: "Що робити, якщо після оплати я не зможу прийти?",
          a: "Ви можете скасувати участь за посиланням у листі-підтвердженні будь-коли до початку Кола й отримати повне повернення коштів на картку, якою платили, — зазвичай гроші надходять протягом 5–10 робочих днів, залежно від банку. Після початку Кола або якщо ви не прийшли, кошти не повертаються. Якщо Коло скасовую я, усім, хто оплатив, гроші повертаються повністю.",
        },
        {
          q: "Чи записується Коло?",
          a: "Ні. Кола ніколи не записуються. Це спільний простір, тож я прошу всіх зберігати почуте в довірі й не записувати, не фотографувати й не робити знімків екрана зустрічі чи інших учасниць. Саме це робить безпечним говорити чесно — про те, чого ви, можливо, не сказали б більше ніде.",
        },
        {
          q: "Коло — це група психотерапії?",
          a: "Ні. Коло — це духовний супровід та емоційна підтримка, а не медичне, психологічне чи психіатричне лікування, і воно не замінює допомоги ліцензованого фахівця. Будь ласка, продовжуйте ходити до свого лікаря чи терапевта. Якщо ви в кризі або думаєте про те, щоб заподіяти собі шкоду, зателефонуйте чи напишіть на 9-8-8, зателефонуйте 911 або зверніться до найближчого відділення невідкладної допомоги.",
        },
        {
          q: "Чи можна приходити щотижня?",
          a: "Так. Можна домовитися про місячний абонемент на Коло, а також про плани оплати й ціну з огляду на ваш дохід. Просто запитайте: напишіть мені, що допомогло б вам приходити регулярно. Гроші не мають бути причиною, чому ви знову ставите себе останньою.",
        },
      ],
      ctaTitle: "Подаруйте собі один вечір.",
      ctaBody:
        "Ви так довго тримали простір для всіх інших. Цей — для вас: дві години, коло жінок і нагода знову почути власний голос.",
      ctaButton: "Долучитися до Кола цього тижня →",
      ctaTarget: "circle",
    },
  },

  "private-sessions": {
    en: {
      metaTitle: "Private Spiritual Coaching Sessions | Svitlana Pavliuk",
      metaDescription:
        "A private spiritual coaching session with Svitlana Pavliuk — online anywhere in Canada, in person in Edmonton, or at a distance. In English or Ukrainian.",
      name: "Private spiritual coaching session",
      eyebrow: "One-to-one · your first yes",
      h1: "Private spiritual coaching, one conversation at a time",
      intro: [
        "A private spiritual coaching session is one conversation, just for you — a space to be witnessed, find clarity, and hear where your inner compass has been leading you. We can meet online from anywhere in Canada, in person in Edmonton, or at a distance, in English or in Ukrainian.",
        "I won't hand you answers — you already have them. I listen, I slow you down, I help you ground, and I guide you through your own filters until your voice comes through clear. Never judgmental. Always beside you.",
      ],
      pricesTitle: "Booking a session",
      includedTitle: "What your session includes",
      included: [
        "Undivided time, just the two of us",
        "Online by video (usually Google Meet), in person in Edmonton, or at a distance",
        "In English or in Ukrainian — whichever lets you speak most freely",
        "A confirmation with the time and how to join, and a reminder before we meet",
        "Free cancellation or rescheduling with at least 24 hours' notice",
      ],
      stepsTitle: "How it works",
      steps: [
        {
          h: "Send a note",
          p: "Tell me a little about what's bringing you here — a few words is enough. If you'd rather talk before booking, ask for a free, no-pressure call.",
        },
        {
          h: "We agree on a time",
          p: "Your session is booked once we've agreed a time and you've received a confirmation email with everything you need.",
        },
        {
          h: "We meet",
          p: "Online, in person or at a distance. You bring whatever is on your heart; I help you hear what you already know.",
        },
      ],
      forYouTitle: "A single session may be for you if…",
      forYou: [
        "You're facing a decision and can't hear your own answer over everyone else's.",
        "You want to be truly heard, by someone who won't judge.",
        "You'd like to feel what working with me is like before committing to more.",
      ],
      faqTitle: "Questions about private sessions",
      faqs: [
        {
          q: "What happens in a spiritual coaching session?",
          a: "We talk — and I listen closely, including to what sits underneath the words. I help you slow down and ground, then gently guide you through the filters that keep your own knowing quiet: the expectations, the noise, the habit of putting yourself last. I don't give you a verdict or a plan written by someone else. People I've worked with often describe leaving lighter, and clearer about what's true for them.",
        },
        {
          q: "Can we meet online, or in person in Edmonton?",
          a: "Both. Online sessions happen by video, usually on Google Meet, so you can join from anywhere in Canada — you just need a steady connection and a private, comfortable space. If you're in or near Edmonton, we can meet in person. Distance sessions are also possible. Tell me what suits you when you send your note, and we'll arrange it.",
        },
        {
          q: "Can I have my session in Ukrainian?",
          a: "Yes. I work in both English and Ukrainian, so you can speak in whichever language lets you say what you really mean — or move between the two. If you tell me you prefer Ukrainian, your booking confirmation, reminders and any other emails about your session can come in Ukrainian too.",
        },
        {
          q: "Is spiritual coaching the same as therapy?",
          a: "No. My work is spiritual guidance and emotional support. It isn't medical, psychological, psychiatric, legal or financial advice, diagnosis or treatment, and it doesn't replace care from a licensed professional — please keep seeing your doctor or therapist. If you're in crisis, call or text 9-8-8 (Suicide Crisis Helpline, Canada) or call 911.",
        },
        {
          q: "How do I cancel or reschedule a session?",
          a: "Just let me know. You can cancel or reschedule free of charge with at least 24 hours' notice. With less notice than that, or if you don't attend, the full session fee may be charged. If I ever need to move a session, I'll give you as much notice as I can and offer another time — and if it was already paid, you choose between a new time and a full refund.",
        },
        {
          q: "What if I want to keep going after one session?",
          a: "When one conversation isn't enough, ongoing coaching gives you a private session every week plus message support in between, either month to month or as a three-month journey. There's no need to decide now — come to one session, see how it feels, and we can talk about what comes next.",
        },
      ],
      ctaTitle: "Your first yes can be a small one.",
      ctaBody:
        "One conversation, just for you. Send me a few words about what's on your heart, and we'll find a time.",
      ctaButton: "Book a session →",
      ctaTarget: "contact",
    },
    uk: {
      metaTitle: "Індивідуальні сесії з духовним коучем | Світлана Павлюк",
      metaDescription:
        "Індивідуальна сесія духовного коучингу зі Світланою Павлюк — онлайн з усієї Канади, особисто в Едмонтоні або на відстані. Українською чи англійською.",
      name: "Індивідуальна сесія духовного коучингу",
      eyebrow: "Віч-на-віч · ваше перше «так»",
      h1: "Індивідуальний духовний коучинг — одна розмова за раз",
      intro: [
        "Індивідуальна сесія духовного коучингу — це одна розмова, лише для вас: простір, де вас побачать, де ви знайдете ясність і почуєте, куди вів вас ваш внутрішній компас. Ми можемо зустрітися онлайн з будь-якої точки Канади, особисто в Едмонтоні або на відстані — українською чи англійською.",
        "Я не даватиму вам відповідей — вони вже у вас є. Я слухаю, сповільнюю вас, допомагаю заземлитися й проводжу крізь ваші власні фільтри, доки ваш голос не зазвучить ясно. Без осуду. Завжди поруч.",
      ],
      pricesTitle: "Як записатися на сесію",
      includedTitle: "Що включає ваша сесія",
      included: [
        "Нерозділений час — лише ми вдвох",
        "Онлайн у відеоформаті (зазвичай Google Meet), особисто в Едмонтоні або на відстані",
        "Українською чи англійською — тією мовою, якою вам найлегше говорити",
        "Підтвердження з часом і способом підключення, а також нагадування перед зустріччю",
        "Безкоштовне скасування чи перенесення, якщо попередити щонайменше за 24 години",
      ],
      stepsTitle: "Як це відбувається",
      steps: [
        {
          h: "Напишіть мені",
          p: "Розкажіть трохи, що вас привело, — кількох слів достатньо. Якщо хочете спершу поговорити, попросіть про коротку безкоштовну розмову без тиску.",
        },
        {
          h: "Домовляємося про час",
          p: "Сесію заброньовано, щойно ми погодили час і ви отримали лист-підтвердження з усім необхідним.",
        },
        {
          h: "Зустрічаємося",
          p: "Онлайн, особисто чи на відстані. Ви приносите те, що на серці, а я допомагаю почути те, що ви вже знаєте.",
        },
      ],
      forYouTitle: "Окрема сесія може бути для вас, якщо…",
      forYou: [
        "Перед вами рішення, а власну відповідь не чути за голосами інших.",
        "Вам хочеться, щоб вас справді почули — без осуду.",
        "Ви хочете відчути, як це — працювати зі мною, перш ніж братися за більше.",
      ],
      faqTitle: "Питання про індивідуальні сесії",
      faqs: [
        {
          q: "Що відбувається на сесії духовного коучингу?",
          a: "Ми розмовляємо — і я уважно слухаю, зокрема те, що ховається під словами. Я допомагаю вам сповільнитися й заземлитися, а тоді лагідно проводжу крізь фільтри, які приглушують ваше власне знання: чужі очікування, шум, звичку ставити себе останньою. Я не виношу вердиктів і не даю плану, написаного кимось іншим. Люди, з якими я працювала, часто кажуть, що йдуть легшими й ясніше розуміють, що для них правда.",
        },
        {
          q: "Можна зустрітися онлайн чи особисто в Едмонтоні?",
          a: "І так, і так. Онлайн-сесії проходять у відеоформаті, зазвичай у Google Meet, тож долучитися можна з будь-якої точки Канади — потрібні лише стабільний інтернет і тихе, затишне місце. Якщо ви в Едмонтоні чи поблизу, можемо зустрітися особисто. Можлива й сесія на відстані. Напишіть, що вам зручніше, — і ми домовимося.",
        },
        {
          q: "Чи можна провести сесію українською?",
          a: "Так. Я працюю українською та англійською, тож ви можете говорити тією мовою, якою найлегше сказати те, що справді маєте на увазі, — або переходити з однієї на іншу. Якщо скажете, що вам зручніше українською, підтвердження, нагадування та інші листи про сесію теж можуть приходити українською.",
        },
        {
          q: "Духовний коучинг — це те саме, що психотерапія?",
          a: "Ні. Моя робота — це духовний супровід та емоційна підтримка. Це не медична, психологічна, психіатрична, юридична чи фінансова консультація, діагностика або лікування, і вона не замінює допомоги ліцензованого фахівця — будь ласка, продовжуйте ходити до свого лікаря чи терапевта. Якщо ви в кризі, зателефонуйте чи напишіть на 9-8-8 або зателефонуйте 911.",
        },
        {
          q: "Як скасувати чи перенести сесію?",
          a: "Просто повідомте мене. Скасувати чи перенести сесію можна безкоштовно, якщо попередити щонайменше за 24 години. Якщо попередити пізніше або не прийти, може стягуватися повна вартість сесії. Якщо перенести зустріч доведеться мені, я попереджу якомога раніше й запропоную інший час — а якщо сесію вже оплачено, ви обираєте між новим часом і повним поверненням коштів.",
        },
        {
          q: "А якщо після однієї сесії я захочу продовжити?",
          a: "Коли однієї розмови замало, тривалий коучинг дає вам приватну сесію щотижня й підтримку повідомленнями між ними — помісячно або у форматі тримісячної подорожі. Вирішувати зараз не потрібно: прийдіть на одну сесію, відчуйте, як вам, — і ми поговоримо, що далі.",
        },
      ],
      ctaTitle: "Ваше перше «так» може бути маленьким.",
      ctaBody:
        "Одна розмова, лише для вас. Напишіть кілька слів про те, що на серці, — і ми знайдемо час.",
      ctaButton: "Записатися на сесію →",
      ctaTarget: "contact",
    },
  },

  coaching: {
    en: {
      metaTitle: "Ongoing Spiritual Coaching Program | Svitlana Pavliuk",
      metaDescription:
        "Weekly private sessions with Svitlana Pavliuk, plus messages in between. Month to month or a 3-month journey — online across Canada, in English or Ukrainian.",
      name: "Ongoing spiritual coaching",
      eyebrow: "Go deeper · the ongoing relationship",
      h1: "Ongoing spiritual coaching, week by week",
      intro: [
        "Ongoing spiritual coaching is for when one conversation isn't enough — when you want someone beside you while real change unfolds. We meet privately every week, and between sessions you can message me by voice or text. I reply within a day.",
        "Whatever is asking for your attention — your purpose, your relationships, money and your sense of worth — you're no longer alone with your decisions. Week by week, we re-align your inner compass until trusting it feels natural again.",
      ],
      pricesTitle: "Two ways to go deeper",
      includedTitle: "What's included",
      included: [
        "A private session every week, just the two of us",
        "Message support between sessions — voice or text, with a reply within a day",
        "Online from anywhere in Canada, or in person in Edmonton",
        "In English or in Ukrainian",
        "Month to month, or committed for three months at the best rate",
      ],
      stepsTitle: "How we begin",
      steps: [
        {
          h: "Let's talk first",
          p: "A short, free call to feel into what you need and whether we're a fit. No pitch — just a chance to be heard.",
        },
        {
          h: "Choose your rhythm",
          p: "The monthly retainer, or the 3-month journey. Payment plans and income-based rates can be arranged — just ask.",
        },
        {
          h: "Walk it together",
          p: "Your first weekly session is booked, and from then on you have me beside you — in session and in between.",
        },
      ],
      forYouTitle: "Ongoing coaching may be for you if…",
      forYou: [
        "You're in the middle of a change and don't want to carry it alone.",
        "You've had a taste of hearing yourself clearly and want it to last.",
        "You know deep change unfolds over months, not moments.",
      ],
      faqTitle: "Questions about ongoing coaching",
      faqs: [
        {
          q: "What's the difference between the monthly retainer and the 3-month journey?",
          a: "They include the same things: a private session every week and message support in between. The monthly retainer lets you go one month at a time. The 3-month journey is a commitment to depth — because real change unfolds over months, not moments — and it's offered at the best rate. It's the most-loved way to work with me. If you're unsure, start with the free call and we'll choose together.",
        },
        {
          q: "How does message support between sessions work?",
          a: "Between our weekly sessions, you can send me a voice message or a text whenever something comes up — a decision you're weighing, a feeling you can't place, something you noticed. I reply within a day. It means you're not left holding everything alone until the next session, and the work keeps moving through your ordinary week.",
        },
        {
          q: "Can I start with a single session first?",
          a: "Yes. A single private session is a good way to feel what working with me is like before committing to more. If it feels right, we can talk about continuing weekly afterwards. There's also a free, no-pressure call if you'd simply like to talk first.",
        },
        {
          q: "Are payment plans available?",
          a: "Yes. Payment plans, and rates that meet your income, can be arranged — just ask. Card payments are handled securely by Stripe, and where we've agreed a payment plan or an adjusted rate, the terms we agreed are the ones that apply. I'd rather talk openly about money than have it stand between you and the support you need.",
        },
        {
          q: "Is this therapy, or financial advice?",
          a: "Neither. My work is spiritual guidance and emotional support. It isn't medical, psychological, psychiatric, legal or financial advice, diagnosis or treatment, and it doesn't replace a licensed professional — keep seeing your doctor, therapist or financial adviser. What I offer is space and guidance to hear what's true for you, so the decisions you make are really yours.",
        },
        {
          q: "Do you work with clients outside Edmonton?",
          a: "Yes. Most of my ongoing work can happen online, by video (usually Google Meet), so you can work with me from anywhere in Canada. Message support works the same wherever you are. If you live in or near Edmonton and would rather meet in person, we can arrange that too.",
        },
      ],
      ctaTitle: "You don't have to walk this alone.",
      ctaBody:
        "Start with a short, free conversation. We'll see what you need, whether we're a fit, and which rhythm feels right.",
      ctaButton: "Let's talk first →",
      ctaTarget: "contact",
    },
    uk: {
      metaTitle: "Тривалий духовний коучинг щотижня | Світлана Павлюк",
      metaDescription:
        "Щотижневі приватні сесії зі Світланою Павлюк і підтримка повідомленнями між ними. Помісячно або 3 місяці — онлайн по всій Канаді, українською чи англійською.",
      name: "Тривалий духовний коучинг",
      eyebrow: "Глибше · тривалі стосунки",
      h1: "Тривалий духовний коучинг — тиждень за тижнем",
      intro: [
        "Тривалий духовний коучинг — для тих випадків, коли однієї розмови замало, коли хочеться, щоб поруч хтось був, поки розгортаються справжні зміни. Ми зустрічаємося віч-на-віч щотижня, а між сесіями ви можете писати мені голосом або текстом. Я відповідаю протягом дня.",
        "Хай що просить вашої уваги — призначення, стосунки, гроші й відчуття власної цінності — ви більше не сам-на-сам зі своїми рішеннями. Тиждень за тижнем ми знову налаштовуємо ваш внутрішній компас, доки довіряти йому не стане природним.",
      ],
      pricesTitle: "Два способи заглибитися",
      includedTitle: "Що входить",
      included: [
        "Приватна сесія щотижня — лише ми вдвох",
        "Підтримка повідомленнями між сесіями — голос або текст, відповідь протягом дня",
        "Онлайн з будь-якої точки Канади або особисто в Едмонтоні",
        "Українською чи англійською",
        "Помісячно або з відданістю на три місяці — за найкращою ціною",
      ],
      stepsTitle: "З чого почати",
      steps: [
        {
          h: "Спершу поговорімо",
          p: "Коротка безкоштовна розмова, щоб відчути, що вам потрібно, і чи ми підходимо одна одній. Без продажів — лише нагода бути почутою.",
        },
        {
          h: "Оберіть свій ритм",
          p: "Місячний супровід або тримісячна подорож. Плани оплати й ціну з огляду на ваш дохід можна обговорити — просто запитайте.",
        },
        {
          h: "Ідемо разом",
          p: "Перша щотижнева сесія заброньована, і відтепер я поруч — і на сесіях, і між ними.",
        },
      ],
      forYouTitle: "Тривалий коучинг може бути для вас, якщо…",
      forYou: [
        "Ви посеред змін і не хочете нести їх сама.",
        "Ви вже відчули, як це — ясно чути себе, і хочете, щоб це залишилося.",
        "Ви знаєте, що глибокі зміни розгортаються місяцями, а не митями.",
      ],
      faqTitle: "Питання про тривалий коучинг",
      faqs: [
        {
          q: "Чим місячний супровід відрізняється від тримісячної подорожі?",
          a: "Вони включають те саме: приватну сесію щотижня й підтримку повідомленнями між сесіями. Місячний супровід дає змогу рухатися місяць за місяцем. Тримісячна подорож — це відданість глибині, бо справжні зміни розгортаються місяцями, а не митями, — і вона пропонується за найкращою ціною. Це найулюбленіший спосіб працювати зі мною. Якщо сумніваєтеся, почніть із безкоштовної розмови — і ми виберемо разом.",
        },
        {
          q: "Як працює підтримка повідомленнями між сесіями?",
          a: "Між нашими щотижневими сесіями ви можете надіслати мені голосове чи текстове повідомлення щоразу, коли щось виникає, — рішення, яке ви зважуєте, почуття, яке не вдається назвати, щось, що ви помітили. Я відповідаю протягом дня. Тож вам не доводиться тримати все самій до наступної зустрічі, і робота триває у ваших звичайних буднях.",
        },
        {
          q: "Чи можна почати з однієї сесії?",
          a: "Так. Окрема індивідуальна сесія — добрий спосіб відчути, як це — працювати зі мною, перш ніж братися за більше. Якщо відчуєте, що це ваше, ми поговоримо про щотижневу роботу. А якщо хочеться просто поговорити спершу, є й коротка безкоштовна розмова без тиску.",
        },
        {
          q: "Чи можна оплачувати частинами?",
          a: "Так. Плани оплати й ціну з огляду на ваш дохід можна обговорити — просто запитайте. Оплата карткою проходить безпечно через Stripe, а якщо ми домовилися про оплату частинами чи змінену ціну, діють саме ті умови, про які ми домовилися. Мені легше відкрито поговорити про гроші, ніж дозволити їм стати між вами й підтримкою, якої ви потребуєте.",
        },
        {
          q: "Це психотерапія чи фінансова консультація?",
          a: "Ні те, ні інше. Моя робота — це духовний супровід та емоційна підтримка. Це не медична, психологічна, психіатрична, юридична чи фінансова консультація, діагностика або лікування, і вона не замінює ліцензованого фахівця — продовжуйте звертатися до свого лікаря, терапевта чи фінансового радника. Я пропоную простір і супровід, щоб ви почули, що є правдою для вас, і ухвалювали справді свої рішення.",
        },
        {
          q: "Чи працюєте ви з клієнтами не з Едмонтона?",
          a: "Так. Більшість тривалої роботи може відбуватися онлайн, у відеоформаті (зазвичай у Google Meet), тож працювати зі мною можна з будь-якої точки Канади. Підтримка повідомленнями працює однаково, хай де ви є. Якщо ви живете в Едмонтоні чи поблизу й вам зручніше зустрічатися особисто, можемо домовитися й про це.",
        },
      ],
      ctaTitle: "Вам не потрібно йти цим шляхом самій.",
      ctaBody:
        "Почніть із короткої безкоштовної розмови. Ми побачимо, що вам потрібно, чи ми підходимо одна одній і який ритм вам до душі.",
      ctaButton: "Спершу поговорімо →",
      ctaTarget: "contact",
    },
  },
};
