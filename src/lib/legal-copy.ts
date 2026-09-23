// Privacy Policy + Terms of Service — the text behind /privacy and /terms.
//
// Bilingual like every public page: STRUCTURE is shared (the section ids and
// their order, in LEGAL_SECTIONS), TEXT is per language. assertParity() makes
// a missing or extra Ukrainian section fail loudly instead of rendering a page
// that silently drops a clause in one language.
//
// Facts these documents state — keep them TRUE when the app changes:
//   - who we share data with (the processor list in privacy "sharing")
//   - AI note drafting + the notetaker bot (privacy "ai")
//   - Google Analytics only on public pages (privacy "cookies")
//   - 24h 1-on-1 cancellation; Circle refund before start (terms)
// If you add a processor or change a policy, update BOTH languages and bump
// LEGAL_UPDATED.

import type { LandingLang } from "./landing-copy";

export const LEGAL_UPDATED = "2026-09-23";
export const LEGAL_CONTACT = "hello@svit.live";

export type LegalSection = { id: string; h: string; p?: string[]; list?: string[] };
export type LegalDoc = {
  metaTitle: string;
  title: string;
  updatedLabel: string;
  intro: string;
  sections: LegalSection[];
};
export type LegalChrome = {
  back: string;
  privacy: string;
  terms: string;
  questions: string;
};

export const LEGAL_SECTIONS = {
  privacy: [
    "who", "collect", "use", "sharing", "ai", "cookies", "retention",
    "rights", "security", "age", "changes", "contact",
  ],
  terms: [
    "about", "services", "eligibility", "sessions", "circles", "payments",
    "online", "resources", "conduct", "ip", "liability", "law", "changes",
    "contact",
  ],
} as const;

const C = LEGAL_CONTACT;

const en: { privacy: LegalDoc; terms: LegalDoc; chrome: LegalChrome } = {
  chrome: {
    back: "← Back to the main page",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    questions: `Questions? Write to ${C}.`,
  },
  privacy: {
    metaTitle: "Privacy Policy · Svitlana's Soul Services",
    title: "Privacy Policy",
    updatedLabel: "Last updated",
    intro:
      "What you share with me is personal, and I treat it that way. This policy explains what information I collect through this website and my work with you, why, who helps me handle it, and the choices you have.",
    sections: [
      {
        id: "who",
        h: "Who I am",
        p: [
          `This website and the services on it are provided by Svitlana Pavliuk, operating as Svitlana's Soul Services, in Edmonton, Alberta, Canada ("I", "me"). I am responsible for your personal information under Alberta's Personal Information Protection Act (PIPA) and, where it applies, Canada's Personal Information Protection and Electronic Documents Act (PIPEDA). You can reach me about anything in this policy at ${C}.`,
        ],
      },
      {
        id: "collect",
        h: "What I collect",
        list: [
          "When you write to me through the contact form: your name, email address, your message, the time you'd prefer to talk, and the language you're reading in.",
          "When you take the quiz: your answers, and your name and email if you ask for the workbook.",
          "When you ask for a free resource: your name, email address and language.",
          "When you join a Circle: your name and email address, and a record of your payment. Card payments are handled by Stripe — I never see or store your full card number.",
          "When we work together one-to-one: your contact details and anything you choose to share, such as your birthday, time zone, preferred language, what you're working on, and my notes from our sessions. With your knowledge, this can include a recording or transcript of an online session (see “AI and session notes” below), and files we exchange.",
          "When you use your personal space (the client portal): your sign-in email and when you last signed in.",
          "When you visit the public website: basic usage information collected by Google Analytics (see “Cookies and analytics” below).",
        ],
      },
      {
        id: "use",
        h: "How I use it",
        list: [
          "To reply to you, book and hold your sessions and Circle seats, and send you the confirmations, reminders and links you need to attend.",
          "To keep notes that let me support you well from one session to the next.",
          "To take payment and issue refunds.",
          "To send you a resource you asked for and, for some resources, one or two follow-up emails. You can ask me to stop these at any time.",
          "To understand, in aggregate, how people find and use the website so I can improve it.",
          "To meet legal and accounting obligations.",
        ],
        p: [
          "I don't sell your information, and I don't use it for anything unrelated to the reasons above without asking you first.",
        ],
      },
      {
        id: "sharing",
        h: "Who helps me handle it",
        p: [
          "I use a small number of trusted service providers to run this practice. Each receives only what it needs to do its job:",
        ],
        list: [
          "Vercel and Neon — host this website and its database, where your information is stored.",
          "Google — Calendar and Meet for scheduling and online sessions, and Google Analytics for website statistics.",
          "Stripe — card payments and refunds.",
          "Resend — delivers the emails this website sends.",
          "Anthropic and Groq — AI services that help me turn session recordings and voice notes into written notes.",
          "Recall.ai — the meeting notetaker that can join an online one-to-one session to record it.",
          "These providers may store or process information outside Canada, including in the United States, where it may be subject to the laws of that country. I choose providers that protect information to a standard comparable to Canadian law.",
          "I may also disclose information if the law requires it, or where there is a serious and immediate risk to someone's safety.",
        ],
      },
      {
        id: "ai",
        h: "AI and session notes",
        p: [
          "To be fully present with you rather than writing during our time together, I may use a notetaker that joins an online one-to-one session and records it. It appears as a participant in the call, and I tell clients about it. You can ask me not to use it — for one session or always — and I will respect that.",
          "Recordings, transcripts and voice notes may be processed by AI services (listed above) solely to draft my session notes. The notes are kept in your private file and shared with you only when I choose to share a note to your personal space.",
          "Circles are not recorded.",
        ],
      },
      {
        id: "cookies",
        h: "Cookies and analytics",
        list: [
          "A language cookie remembers whether you're reading in English or Ukrainian.",
          "If you have a personal space, a sign-in cookie keeps you signed in.",
          "Google Analytics sets cookies on the public pages of this website — the main page, the quiz, Circle sign-up pages and free-resource pages — to count visits and see which pages are useful. It is never used in your personal space or anywhere behind a sign-in. You can block these cookies in your browser settings, or use Google's opt-out browser add-on at tools.google.com/dlpage/gaoptout.",
        ],
      },
      {
        id: "retention",
        h: "How long I keep it",
        p: [
          "I keep your information for as long as we're working together and afterwards for as long as I reasonably need it for my records, accounting and legal obligations. Enquiries that don't lead to working together, and free-resource sign-ups, are deleted on request. When information is no longer needed, I delete it or make it anonymous.",
        ],
      },
      {
        id: "rights",
        h: "Your choices and rights",
        list: [
          "You can ask to see the personal information I hold about you, and to have it corrected.",
          "You can withdraw your consent — for example, to reminders, follow-up emails, or recording — and I will stop, subject to any legal requirement to keep records.",
          "You can ask me to delete your information.",
          `To do any of this, write to ${C}. I'll respond within 30 days.`,
          "If you're not satisfied with my response, you can contact the Office of the Information and Privacy Commissioner of Alberta (oipc.ab.ca).",
        ],
      },
      {
        id: "security",
        h: "Keeping it safe",
        p: [
          "Your information is stored with reputable providers, sent over encrypted connections, and accessible only to me behind a secure sign-in. Sign-in links to your personal space are personal — please don't forward them. No system is perfectly secure, but I take reasonable care to protect what you share.",
        ],
      },
      {
        id: "age",
        h: "Age",
        p: [
          "My services are for adults. I don't knowingly collect information from anyone under 18.",
        ],
      },
      {
        id: "changes",
        h: "Changes to this policy",
        p: [
          "If I change this policy, I'll update the date at the top of this page. If a change significantly affects how I use information you've already given me, I'll let you know.",
        ],
      },
      {
        id: "contact",
        h: "Contact",
        p: [`Svitlana Pavliuk · Svitlana's Soul Services · Edmonton, Alberta, Canada · ${C}`],
      },
    ],
  },
  terms: {
    metaTitle: "Terms of Service · Svitlana's Soul Services",
    title: "Terms of Service",
    updatedLabel: "Last updated",
    intro:
      "These terms explain how booking, payment and our work together happen. By using this website, joining a Circle or booking a session, you agree to them. They're written to be read — if anything is unclear, just ask.",
    sections: [
      {
        id: "about",
        h: "Who you're working with",
        p: [
          `Svitlana's Soul Services is operated by Svitlana Pavliuk in Edmonton, Alberta, Canada ("I", "me"). You can reach me at ${C}.`,
        ],
      },
      {
        id: "services",
        h: "What my work is — and isn't",
        p: [
          "I offer spiritual guidance and emotional support: one-to-one sessions, group Circles, and free reflections and resources. My work is meant to help you slow down, reflect and hear your own inner voice.",
          "My work is not medical, psychological, psychiatric, legal or financial advice, diagnosis or treatment, and it is not a substitute for care from a licensed professional. Please keep seeing your doctor or therapist, and don't stop or change any treatment because of our work. I don't promise any particular result.",
          "If you are in crisis or thinking about harming yourself, please call or text 9-8-8 (Suicide Crisis Helpline, Canada), call 911, or go to your nearest emergency room. I'm not able to provide emergency support.",
        ],
      },
      {
        id: "eligibility",
        h: "Who can book",
        p: ["You must be at least 18 years old to book a session or join a Circle."],
      },
      {
        id: "sessions",
        h: "One-to-one sessions",
        list: [
          "A session is booked once we've agreed a time and you've received a confirmation.",
          "You can cancel or reschedule free of charge with at least 24 hours' notice.",
          "If you cancel with less than 24 hours' notice, or don't attend, the full session fee may be charged.",
          "If I need to cancel or move a session, I'll give you as much notice as I can and offer another time. If a session I cancel was already paid for, you choose between a new time and a full refund.",
          "If you arrive late, the session still ends at its scheduled time.",
        ],
      },
      {
        id: "circles",
        h: "Circles",
        list: [
          "Your seat is confirmed once payment is received (or, for a free Circle, once I confirm your sign-up).",
          "You can cancel using the link in your confirmation email any time before the Circle begins, and receive a full refund to your original payment method. Refunds are issued by me and usually appear within 5–10 business days, depending on your bank.",
          "Seats aren't refunded once a Circle has begun, or if you don't attend.",
          "If I cancel a Circle, everyone who paid is refunded in full. If I move it, you'll be told the new time and can cancel for a full refund if it doesn't suit you.",
          "Circles are shared spaces. Please keep what others share in confidence, and don't record, photograph or screenshot the session or other participants.",
        ],
      },
      {
        id: "payments",
        h: "Prices and payment",
        p: [
          "Prices are as shown on this website or agreed with me at the time of booking. Card payments are processed securely by Stripe. Where I've offered a payment plan or adjusted rate, the terms we agreed apply.",
        ],
      },
      {
        id: "online",
        h: "Online sessions",
        p: [
          "Online sessions and Circles take place by video (usually Google Meet). You're responsible for a working internet connection and a private, comfortable space to join from. If a technical problem on my side stops a session, we'll find a new time at no charge.",
          "With your knowledge, a notetaker may join an online one-to-one session to record it so I can keep accurate notes. You can ask me not to use it. How recordings are handled is explained in the Privacy Policy.",
        ],
      },
      {
        id: "resources",
        h: "Free resources and your personal space",
        p: [
          "Workbooks, recordings and other resources I share are for your personal use. Please don't resell, republish or share them publicly.",
          "If you have a personal space (client portal), your sign-in links are for you alone — please don't forward them. You're responsible for keeping access to your email account secure.",
        ],
      },
      {
        id: "conduct",
        h: "Respect",
        p: [
          "I ask everyone to treat each other with kindness. I may decline or end a booking, or remove someone from a Circle, if their behaviour is abusive, disruptive or unsafe for others. If I remove you from a Circle you've paid for before it takes place, you'll be refunded.",
        ],
      },
      {
        id: "ip",
        h: "Content on this website",
        p: [
          "The words, images, recordings and materials on this website and in my resources belong to me or are used with permission. You're welcome to share links to them.",
        ],
      },
      {
        id: "liability",
        h: "Responsibility",
        p: [
          "You take part in sessions and Circles by your own choice and remain responsible for your own decisions and wellbeing. To the fullest extent the law allows, I'm not liable for indirect or consequential losses arising from my services or this website, and my total liability to you for any claim is limited to the amount you paid me for the service it concerns. Nothing in these terms limits any rights you have under consumer protection law that can't be limited.",
        ],
      },
      {
        id: "law",
        h: "Governing law",
        p: [
          "These terms are governed by the laws of the Province of Alberta and the federal laws of Canada that apply there. If we disagree about something, I'd much rather talk it through with you first.",
        ],
      },
      {
        id: "changes",
        h: "Changes to these terms",
        p: [
          "I may update these terms from time to time; the date at the top of this page shows the latest version. The terms that apply to a booking are the ones in place when you made it.",
        ],
      },
      {
        id: "contact",
        h: "Contact",
        p: [`Svitlana Pavliuk · Svitlana's Soul Services · Edmonton, Alberta, Canada · ${C}`],
      },
    ],
  },
};

const uk: typeof en = {
  chrome: {
    back: "← На головну",
    privacy: "Політика конфіденційності",
    terms: "Умови надання послуг",
    questions: `Є питання? Пишіть на ${C}.`,
  },
  privacy: {
    metaTitle: "Політика конфіденційності · Svitlana's Soul Services",
    title: "Політика конфіденційності",
    updatedLabel: "Останнє оновлення",
    intro:
      "Те, чим ви зі мною ділитеся, — особисте, і я ставлюся до цього саме так. Ця політика пояснює, яку інформацію я збираю через цей сайт і під час нашої роботи, навіщо, хто допомагає мені з нею працювати і який вибір маєте ви.",
    sections: [
      {
        id: "who",
        h: "Хто я",
        p: [
          `Цей сайт і послуги на ньому надає Світлана Павлюк, яка працює як Svitlana's Soul Services, в Едмонтоні, Альберта, Канада («я»). Я відповідаю за вашу особисту інформацію відповідно до Закону Альберти про захист особистої інформації (PIPA) та, де це застосовно, федерального закону Канади PIPEDA. З будь-яких питань щодо цієї політики пишіть мені на ${C}.`,
        ],
      },
      {
        id: "collect",
        h: "Що я збираю",
        list: [
          "Коли ви пишете мені через контактну форму: ваше ім’я, адресу електронної пошти, повідомлення, зручний для розмови час і мову, якою ви читаєте сайт.",
          "Коли ви проходите тест: ваші відповіді, а також ім’я та email, якщо ви просите робочий зошит.",
          "Коли ви просите безкоштовний матеріал: ваше ім’я, email і мову.",
          "Коли ви приєднуєтеся до Кола: ваше ім’я, email і запис про оплату. Оплату карткою обробляє Stripe — я ніколи не бачу і не зберігаю повний номер вашої картки.",
          "Коли ми працюємо індивідуально: ваші контактні дані та все, чим ви вирішите поділитися, — наприклад, день народження, часовий пояс, бажана мова, над чим ви працюєте, а також мої нотатки з наших сесій. З вашого відома це може включати запис або розшифровку онлайн-сесії (див. «ШІ та нотатки сесій» нижче) і файли, якими ми обмінюємося.",
          "Коли ви користуєтеся своїм особистим простором (порталом клієнта): email для входу і час останнього входу.",
          "Коли ви відвідуєте публічні сторінки сайту: базову інформацію про відвідування, яку збирає Google Analytics (див. «Файли cookie та аналітика» нижче).",
        ],
      },
      {
        id: "use",
        h: "Як я це використовую",
        list: [
          "Щоб відповісти вам, забронювати й утримати ваші сесії та місця в Колі, а також надіслати підтвердження, нагадування й посилання, потрібні для участі.",
          "Щоб вести нотатки, які допомагають мені добре підтримувати вас від сесії до сесії.",
          "Щоб приймати оплату й повертати кошти.",
          "Щоб надіслати матеріал, який ви попросили, а для деяких матеріалів — один-два листи після нього. Ви можете будь-коли попросити мене більше їх не надсилати.",
          "Щоб у загальному вигляді розуміти, як люди знаходять сайт і користуються ним, і робити його кращим.",
          "Щоб виконувати юридичні та бухгалтерські зобов’язання.",
        ],
        p: [
          "Я не продаю вашу інформацію і не використовую її ні для чого, не пов’язаного з наведеним вище, не запитавши вас спершу.",
        ],
      },
      {
        id: "sharing",
        h: "Хто допомагає мені з нею працювати",
        p: [
          "Для роботи практики я користуюся кількома надійними постачальниками послуг. Кожен отримує лише те, що потрібно для його роботи:",
        ],
        list: [
          "Vercel і Neon — розміщують цей сайт і його базу даних, де зберігається ваша інформація.",
          "Google — Календар і Meet для планування та онлайн-сесій, а також Google Analytics для статистики сайту.",
          "Stripe — оплата карткою та повернення коштів.",
          "Resend — доставляє листи, які надсилає цей сайт.",
          "Anthropic і Groq — сервіси штучного інтелекту, які допомагають мені перетворювати записи сесій і голосові нотатки на письмові нотатки.",
          "Recall.ai — сервіс для нотаток, який може приєднатися до індивідуальної онлайн-сесії, щоб її записати.",
          "Ці постачальники можуть зберігати або обробляти інформацію за межами Канади, зокрема у США, де на неї можуть поширюватися закони цієї країни. Я обираю постачальників, які захищають інформацію на рівні, порівнянному з канадським законодавством.",
          "Я також можу розкрити інформацію, якщо цього вимагає закон або якщо існує серйозна й безпосередня загроза чиїйсь безпеці.",
        ],
      },
      {
        id: "ai",
        h: "ШІ та нотатки сесій",
        p: [
          "Щоб бути повністю присутньою з вами, а не писати під час нашої зустрічі, я можу використовувати помічника для нотаток, який приєднується до індивідуальної онлайн-сесії і записує її. Його видно як учасника дзвінка, і я повідомляю про нього клієнтам. Ви можете попросити мене не використовувати його — на одну сесію чи завжди, — і я це поважатиму.",
          "Записи, розшифровки та голосові нотатки можуть оброблятися сервісами ШІ (перелічено вище) виключно для того, щоб скласти чернетку моїх нотаток. Нотатки зберігаються у вашій приватній картці, і я ділюся ними з вами лише тоді, коли вирішую додати нотатку у ваш особистий простір.",
          "Кола не записуються.",
        ],
      },
      {
        id: "cookies",
        h: "Файли cookie та аналітика",
        list: [
          "Мовний файл cookie запам’ятовує, чи читаєте ви англійською, чи українською.",
          "Якщо у вас є особистий простір, файл cookie для входу зберігає ваш вхід.",
          "Google Analytics встановлює файли cookie на публічних сторінках сайту — головній, тесті, сторінках запису до Кола та сторінках безкоштовних матеріалів, — щоб рахувати відвідування і бачити, які сторінки корисні. Він ніколи не використовується у вашому особистому просторі чи будь-де після входу. Ви можете заблокувати ці файли cookie в налаштуваннях браузера або встановити розширення Google для відмови: tools.google.com/dlpage/gaoptout.",
        ],
      },
      {
        id: "retention",
        h: "Як довго я це зберігаю",
        p: [
          "Я зберігаю вашу інформацію, поки ми працюємо разом, а після цього — стільки, скільки обґрунтовано потрібно для моїх записів, бухгалтерії та юридичних зобов’язань. Звернення, які не переросли у спільну роботу, і підписки на безкоштовні матеріали видаляю на ваш запит. Коли інформація більше не потрібна, я її видаляю або знеособлюю.",
        ],
      },
      {
        id: "rights",
        h: "Ваш вибір і ваші права",
        list: [
          "Ви можете попросити переглянути особисту інформацію, яку я про вас зберігаю, і виправити її.",
          "Ви можете відкликати свою згоду — наприклад, на нагадування, листи після матеріалів чи запис, — і я припиню, з урахуванням юридичних вимог щодо зберігання записів.",
          "Ви можете попросити мене видалити вашу інформацію.",
          `Для цього напишіть на ${C}. Я відповім протягом 30 днів.`,
          "Якщо моя відповідь вас не задовольнить, ви можете звернутися до Уповноваженого з питань інформації та приватності Альберти (oipc.ab.ca).",
        ],
      },
      {
        id: "security",
        h: "Як я це захищаю",
        p: [
          "Ваша інформація зберігається в надійних постачальників, передається зашифрованими з’єднаннями і доступна лише мені після захищеного входу. Посилання для входу у ваш особистий простір — персональні, будь ласка, не пересилайте їх. Жодна система не є абсолютно захищеною, але я докладаю розумних зусиль, щоб берегти те, чим ви ділитеся.",
        ],
      },
      {
        id: "age",
        h: "Вік",
        p: [
          "Мої послуги призначені для дорослих. Я свідомо не збираю інформацію від осіб, молодших 18 років.",
        ],
      },
      {
        id: "changes",
        h: "Зміни до цієї політики",
        p: [
          "Якщо я зміню цю політику, я оновлю дату вгорі сторінки. Якщо зміна суттєво вплине на те, як я використовую вже надану вами інформацію, я вам повідомлю.",
        ],
      },
      {
        id: "contact",
        h: "Контакти",
        p: [`Світлана Павлюк · Svitlana's Soul Services · Едмонтон, Альберта, Канада · ${C}`],
      },
    ],
  },
  terms: {
    metaTitle: "Умови надання послуг · Svitlana's Soul Services",
    title: "Умови надання послуг",
    updatedLabel: "Останнє оновлення",
    intro:
      "Ці умови пояснюють, як відбуваються бронювання, оплата і наша спільна робота. Користуючись цим сайтом, приєднуючись до Кола чи бронюючи сесію, ви з ними погоджуєтеся. Вони написані так, щоб їх можна було прочитати, — якщо щось незрозуміло, просто запитайте.",
    sections: [
      {
        id: "about",
        h: "З ким ви працюєте",
        p: [
          `Svitlana's Soul Services веде Світлана Павлюк в Едмонтоні, Альберта, Канада («я»). Мені можна написати на ${C}.`,
        ],
      },
      {
        id: "services",
        h: "Чим є моя робота — і чим не є",
        p: [
          "Я пропоную духовний супровід та емоційну підтримку: індивідуальні сесії, групові Кола, а також безкоштовні рефлексії та матеріали. Моя робота має допомогти вам сповільнитися, поміркувати й почути власний внутрішній голос.",
          "Моя робота не є медичною, психологічною, психіатричною, юридичною чи фінансовою консультацією, діагностикою чи лікуванням і не замінює допомоги ліцензованого фахівця. Будь ласка, продовжуйте звертатися до свого лікаря чи терапевта і не припиняйте й не змінюйте жодного лікування через нашу роботу. Я не обіцяю якогось конкретного результату.",
          "Якщо ви в кризі або думаєте про те, щоб заподіяти собі шкоду, зателефонуйте чи надішліть повідомлення на 9-8-8 (Лінія допомоги в кризі, Канада), зателефонуйте 911 або зверніться до найближчого відділення невідкладної допомоги. Я не можу надавати екстрену допомогу.",
        ],
      },
      {
        id: "eligibility",
        h: "Хто може бронювати",
        p: ["Щоб забронювати сесію або приєднатися до Кола, вам має бути щонайменше 18 років."],
      },
      {
        id: "sessions",
        h: "Індивідуальні сесії",
        list: [
          "Сесію заброньовано, щойно ми погодили час і ви отримали підтвердження.",
          "Ви можете безкоштовно скасувати або перенести сесію, попередивши щонайменше за 24 години.",
          "Якщо ви скасовуєте менш ніж за 24 години або не приходите, може бути стягнуто повну вартість сесії.",
          "Якщо мені потрібно скасувати чи перенести сесію, я попереджу якомога раніше і запропоную інший час. Якщо скасована мною сесія вже була оплачена, ви обираєте між новим часом і повним поверненням коштів.",
          "Якщо ви запізнюєтеся, сесія все одно завершується у запланований час.",
        ],
      },
      {
        id: "circles",
        h: "Кола",
        list: [
          "Ваше місце підтверджено, щойно надійшла оплата (або, для безкоштовного Кола, щойно я підтвердила ваш запис).",
          "Ви можете скасувати участь за посиланням у листі-підтвердженні будь-коли до початку Кола й отримати повне повернення коштів на той самий спосіб оплати. Повернення здійснюю я, і зазвичай кошти надходять протягом 5–10 робочих днів залежно від вашого банку.",
          "Після початку Кола або якщо ви не прийшли, кошти за місце не повертаються.",
          "Якщо я скасовую Коло, усім, хто оплатив, кошти повертаються в повному обсязі. Якщо я переношу його, вам повідомлять новий час, і ви зможете скасувати участь із повним поверненням, якщо він вам не підходить.",
          "Коло — це спільний простір. Будь ласка, зберігайте в таємниці те, чим діляться інші, і не записуйте, не фотографуйте й не робіть знімків екрана сесії чи інших учасниць.",
        ],
      },
      {
        id: "payments",
        h: "Ціни та оплата",
        p: [
          "Ціни — такі, як зазначено на цьому сайті або погоджено зі мною під час бронювання. Оплату карткою безпечно обробляє Stripe. Якщо я запропонувала план оплати або змінену ставку, діють умови, про які ми домовилися.",
        ],
      },
      {
        id: "online",
        h: "Онлайн-сесії",
        p: [
          "Онлайн-сесії та Кола проходять у відеоформаті (зазвичай у Google Meet). Ви відповідаєте за робоче інтернет-з’єднання та приватне, зручне місце, з якого приєднуєтеся. Якщо сесія не відбулася через технічну проблему з мого боку, ми знайдемо новий час без оплати.",
          "З вашого відома до індивідуальної онлайн-сесії може приєднатися помічник для нотаток, щоб записати її, — так я можу вести точні нотатки. Ви можете попросити мене не використовувати його. Як обробляються записи, пояснено в Політиці конфіденційності.",
        ],
      },
      {
        id: "resources",
        h: "Безкоштовні матеріали та ваш особистий простір",
        p: [
          "Робочі зошити, записи та інші матеріали, якими я ділюся, призначені для вашого особистого користування. Будь ласка, не перепродавайте, не публікуйте повторно й не поширюйте їх публічно.",
          "Якщо у вас є особистий простір (портал клієнта), посилання для входу призначені лише для вас — будь ласка, не пересилайте їх. Ви відповідаєте за безпеку доступу до своєї електронної пошти.",
        ],
      },
      {
        id: "conduct",
        h: "Повага",
        p: [
          "Я прошу всіх ставитися одне до одного з добротою. Я можу відмовити в бронюванні чи припинити його або попросити когось залишити Коло, якщо поведінка людини образлива, заважає іншим чи небезпечна для них. Якщо я виключаю вас з оплаченого Кола до його початку, кошти буде повернено.",
        ],
      },
      {
        id: "ip",
        h: "Матеріали на цьому сайті",
        p: [
          "Тексти, зображення, записи та матеріали на цьому сайті й у моїх ресурсах належать мені або використовуються з дозволу. Ви можете вільно ділитися посиланнями на них.",
        ],
      },
      {
        id: "liability",
        h: "Відповідальність",
        p: [
          "Ви берете участь у сесіях і Колах за власним вибором і залишаєтеся відповідальними за власні рішення та самопочуття. Наскільки це дозволяє закон, я не несу відповідальності за непрямі чи похідні збитки, пов’язані з моїми послугами чи цим сайтом, а моя загальна відповідальність перед вами за будь-якою вимогою обмежується сумою, яку ви сплатили мені за відповідну послугу. Ніщо в цих умовах не обмежує прав, які ви маєте за законодавством про захист прав споживачів і які не можуть бути обмежені.",
        ],
      },
      {
        id: "law",
        h: "Застосовне право",
        p: [
          "Ці умови регулюються законами провінції Альберта та федеральними законами Канади, що там застосовуються. Якщо в нас виникне розбіжність, я значно охочіше спершу обговорю її з вами.",
        ],
      },
      {
        id: "changes",
        h: "Зміни до цих умов",
        p: [
          "Я можу час від часу оновлювати ці умови; дата вгорі сторінки показує останню версію. До бронювання застосовуються умови, чинні на момент, коли ви його зробили.",
        ],
      },
      {
        id: "contact",
        h: "Контакти",
        p: [`Світлана Павлюк · Svitlana's Soul Services · Едмонтон, Альберта, Канада · ${C}`],
      },
    ],
  },
};

function assertParity(doc: "privacy" | "terms") {
  const want = LEGAL_SECTIONS[doc].join(",");
  for (const [lang, d] of [["en", en[doc]], ["uk", uk[doc]]] as const) {
    const got = d.sections.map((s) => s.id).join(",");
    if (got !== want) throw new Error(`legal-copy: ${lang} ${doc} sections [${got}] ≠ [${want}]`);
    for (const s of d.sections) {
      if (!s.h.trim() || !(s.p?.length || s.list?.length)) {
        throw new Error(`legal-copy: ${lang} ${doc} section "${s.id}" is empty`);
      }
    }
  }
}
assertParity("privacy");
assertParity("terms");

export function getLegalCopy(lang: LandingLang) {
  return lang === "uk" ? uk : en;
}
