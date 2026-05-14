// Simple i18n. Three locales, one dictionary per locale, a tiny `t()` helper.
//
// Design: typed keys (so missing translations are a compile error), English
// fallback when a key is missing in a non-English dict, and no external lib —
// next-intl is overkill for a single-tenant app of this size.
//
// Adding a new key: declare it in `TranslationKey`, then fill it in for all
// three dictionaries. TypeScript will catch missing ones.

export const LOCALES = ["en", "ru", "uk"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/** Display name in the language's own script (autonym). */
export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  uk: "Українська",
};

/** Compact 2-letter code for chips/badges. */
export const LOCALE_SHORT: Record<Locale, string> = {
  en: "EN",
  ru: "RU",
  uk: "UK",
};

export function isLocale(s: unknown): s is Locale {
  return typeof s === "string" && (LOCALES as readonly string[]).includes(s);
}

/** Coerce an unknown string to a Locale, falling back to English. */
export function asLocale(s: unknown): Locale {
  return isLocale(s) ? s : DEFAULT_LOCALE;
}

// ─────────────────────────────────────────────────────────────────────────────
// Translation keys — keep grouped by surface for readability.
// ─────────────────────────────────────────────────────────────────────────────

export type TranslationKey =
  // Nav
  | "nav.today"
  | "nav.clients"
  | "nav.calendar"
  | "nav.payments"
  | "nav.settings"
  // Sidebar footer
  | "sidebar.yourSpace"
  | "sidebar.signOut"
  | "sidebar.signingOut"
  // Sign-in page
  | "signin.title"
  | "signin.subtitle"
  | "signin.emailLabel"
  | "signin.submit"
  | "signin.submitting"
  | "signin.helpText"
  | "signin.tagline"
  // Home / Today
  | "home.title"
  | "home.firstRun.title"
  | "home.firstRun.body"
  | "home.sectionTodaySessions"
  | "home.sectionNeedsAttention"
  | "home.emptyToday"
  // Clients page
  | "clients.title"
  | "clients.newClient"
  // Calendar page
  | "calendar.title"
  | "calendar.thisWeek"
  // Payments page
  | "payments.title"
  // Settings page
  | "settings.title"
  | "settings.subtitle"
  // Common action buttons
  | "action.save"
  | "action.saving"
  | "action.cancel"
  | "action.delete"
  | "action.edit"
  | "action.close"
  | "action.scheduleSession"
  | "action.logPastSession"
  | "action.newClient"
  | "action.editProfile"
  // Common form labels
  | "form.fullName"
  | "form.email"
  | "form.phone"
  | "form.city"
  | "form.dateTime"
  | "form.duration"
  | "form.notes"
  | "form.language"
  // Settings — language section
  | "settings.language.section"
  | "settings.language.uiLanguageLabel"
  | "settings.language.uiLanguageHint"
  // Client — language field
  | "client.preferredLanguage"
  | "client.preferredLanguageHint"
  | "client.preferredLanguageFollow"
  // Email composer
  | "email.templateLanguageBadge"
  | "email.noTemplatesForLanguage"
  | "email.showAllLanguages";

// ─────────────────────────────────────────────────────────────────────────────
// Dictionaries
// ─────────────────────────────────────────────────────────────────────────────

const en: Record<TranslationKey, string> = {
  // Nav
  "nav.today": "Today",
  "nav.clients": "Clients",
  "nav.calendar": "Calendar",
  "nav.payments": "Payments",
  "nav.settings": "Settings",
  // Sidebar footer
  "sidebar.yourSpace": "your space",
  "sidebar.signOut": "Sign out",
  "sidebar.signingOut": "Signing out…",
  // Sign-in page
  "signin.title": "Sign in",
  "signin.subtitle": "Quiet space for your client work.",
  "signin.emailLabel": "Email",
  "signin.submit": "Enter",
  "signin.submitting": "Signing in…",
  "signin.helpText":
    "Type the email on your access list. You'll stay signed in for 30 days.",
  "signin.tagline": "Made for Svitlana, with care.",
  // Home / Today
  "home.title": "Today",
  "home.firstRun.title": "This is your space.",
  "home.firstRun.body":
    "Everyone you work with lives here — their details, their sessions, anything you'd want to remember. Make it yours over time. Add your first client to start.",
  "home.sectionTodaySessions": "Today's sessions",
  "home.sectionNeedsAttention": "Needs your attention",
  "home.emptyToday": "Nothing on the schedule today.",
  // Clients page
  "clients.title": "Clients",
  "clients.newClient": "New client",
  // Calendar page
  "calendar.title": "Calendar",
  "calendar.thisWeek": "This week",
  // Payments page
  "payments.title": "Payments",
  // Settings page
  "settings.title": "Settings",
  "settings.subtitle":
    "Business info, automations, integrations, and reusable templates.",
  // Common actions
  "action.save": "Save",
  "action.saving": "Saving…",
  "action.cancel": "Cancel",
  "action.delete": "Delete",
  "action.edit": "Edit",
  "action.close": "Close",
  "action.scheduleSession": "Schedule session",
  "action.logPastSession": "Log past session",
  "action.newClient": "New client",
  "action.editProfile": "Edit profile",
  // Common form labels
  "form.fullName": "Full name",
  "form.email": "Email",
  "form.phone": "Phone",
  "form.city": "City",
  "form.dateTime": "Date & time",
  "form.duration": "Duration",
  "form.notes": "Notes",
  "form.language": "Language",
  // Settings — language section
  "settings.language.section": "Language",
  "settings.language.uiLanguageLabel": "App language",
  "settings.language.uiLanguageHint":
    "The language the app's menus, buttons, and headings are shown in.",
  // Client — language field
  "client.preferredLanguage": "Preferred language",
  "client.preferredLanguageHint":
    "Used when emailing this client — templates filter to this language.",
  "client.preferredLanguageFollow": "Follow app language",
  // Email composer
  "email.templateLanguageBadge": "Language",
  "email.noTemplatesForLanguage":
    "No templates in this language. Showing all templates.",
  "email.showAllLanguages": "Show all languages",
};

const ru: Record<TranslationKey, string> = {
  // Nav
  "nav.today": "Сегодня",
  "nav.clients": "Клиенты",
  "nav.calendar": "Календарь",
  "nav.payments": "Платежи",
  "nav.settings": "Настройки",
  // Sidebar footer
  "sidebar.yourSpace": "ваше пространство",
  "sidebar.signOut": "Выйти",
  "sidebar.signingOut": "Выход…",
  // Sign-in page
  "signin.title": "Войти",
  "signin.subtitle": "Тихое пространство для вашей работы с клиентами.",
  "signin.emailLabel": "Электронная почта",
  "signin.submit": "Войти",
  "signin.submitting": "Входим…",
  "signin.helpText":
    "Введите email из списка доступа. Вы останетесь в системе на 30 дней.",
  "signin.tagline": "Сделано для Светланы, с заботой.",
  // Home / Today
  "home.title": "Сегодня",
  "home.firstRun.title": "Это ваше пространство.",
  "home.firstRun.body":
    "Здесь живёт каждый, с кем вы работаете — их данные, их сессии, всё, что вы хотите помнить. Со временем сделайте его своим. Начните с добавления первого клиента.",
  "home.sectionTodaySessions": "Сегодняшние сессии",
  "home.sectionNeedsAttention": "Требует вашего внимания",
  "home.emptyToday": "На сегодня ничего не запланировано.",
  // Clients page
  "clients.title": "Клиенты",
  "clients.newClient": "Новый клиент",
  // Calendar page
  "calendar.title": "Календарь",
  "calendar.thisWeek": "Эта неделя",
  // Payments page
  "payments.title": "Платежи",
  // Settings page
  "settings.title": "Настройки",
  "settings.subtitle":
    "Данные бизнеса, автоматизации, интеграции и шаблоны.",
  // Common actions
  "action.save": "Сохранить",
  "action.saving": "Сохраняем…",
  "action.cancel": "Отмена",
  "action.delete": "Удалить",
  "action.edit": "Изменить",
  "action.close": "Закрыть",
  "action.scheduleSession": "Назначить сессию",
  "action.logPastSession": "Внести прошлую сессию",
  "action.newClient": "Новый клиент",
  "action.editProfile": "Изменить профиль",
  // Common form labels
  "form.fullName": "Полное имя",
  "form.email": "Электронная почта",
  "form.phone": "Телефон",
  "form.city": "Город",
  "form.dateTime": "Дата и время",
  "form.duration": "Длительность",
  "form.notes": "Заметки",
  "form.language": "Язык",
  // Settings — language section
  "settings.language.section": "Язык",
  "settings.language.uiLanguageLabel": "Язык приложения",
  "settings.language.uiLanguageHint":
    "Язык, на котором отображаются меню, кнопки и заголовки.",
  // Client — language field
  "client.preferredLanguage": "Предпочитаемый язык",
  "client.preferredLanguageHint":
    "Используется при отправке писем — шаблоны фильтруются по этому языку.",
  "client.preferredLanguageFollow": "Как в приложении",
  // Email composer
  "email.templateLanguageBadge": "Язык",
  "email.noTemplatesForLanguage":
    "Нет шаблонов на этом языке. Показываю все шаблоны.",
  "email.showAllLanguages": "Показать все языки",
};

const uk: Record<TranslationKey, string> = {
  // Nav
  "nav.today": "Сьогодні",
  "nav.clients": "Клієнти",
  "nav.calendar": "Календар",
  "nav.payments": "Платежі",
  "nav.settings": "Налаштування",
  // Sidebar footer
  "sidebar.yourSpace": "ваш простір",
  "sidebar.signOut": "Вийти",
  "sidebar.signingOut": "Вихід…",
  // Sign-in page
  "signin.title": "Увійти",
  "signin.subtitle": "Тихий простір для вашої роботи з клієнтами.",
  "signin.emailLabel": "Електронна пошта",
  "signin.submit": "Увійти",
  "signin.submitting": "Входимо…",
  "signin.helpText":
    "Введіть email зі списку доступу. Ви залишитесь у системі на 30 днів.",
  "signin.tagline": "Зроблено для Світлани, з турботою.",
  // Home / Today
  "home.title": "Сьогодні",
  "home.firstRun.title": "Це ваш простір.",
  "home.firstRun.body":
    "Тут живе кожен, з ким ви працюєте — їхні дані, їхні сесії, усе, що ви хочете пам'ятати. З часом зробіть його своїм. Почніть із додавання першого клієнта.",
  "home.sectionTodaySessions": "Сьогоднішні сесії",
  "home.sectionNeedsAttention": "Потребує вашої уваги",
  "home.emptyToday": "На сьогодні нічого не заплановано.",
  // Clients page
  "clients.title": "Клієнти",
  "clients.newClient": "Новий клієнт",
  // Calendar page
  "calendar.title": "Календар",
  "calendar.thisWeek": "Цей тиждень",
  // Payments page
  "payments.title": "Платежі",
  // Settings page
  "settings.title": "Налаштування",
  "settings.subtitle":
    "Дані бізнесу, автоматизації, інтеграції та шаблони.",
  // Common actions
  "action.save": "Зберегти",
  "action.saving": "Зберігаємо…",
  "action.cancel": "Скасувати",
  "action.delete": "Видалити",
  "action.edit": "Редагувати",
  "action.close": "Закрити",
  "action.scheduleSession": "Запланувати сесію",
  "action.logPastSession": "Внести минулу сесію",
  "action.newClient": "Новий клієнт",
  "action.editProfile": "Редагувати профіль",
  // Common form labels
  "form.fullName": "Повне ім'я",
  "form.email": "Електронна пошта",
  "form.phone": "Телефон",
  "form.city": "Місто",
  "form.dateTime": "Дата і час",
  "form.duration": "Тривалість",
  "form.notes": "Нотатки",
  "form.language": "Мова",
  // Settings — language section
  "settings.language.section": "Мова",
  "settings.language.uiLanguageLabel": "Мова застосунку",
  "settings.language.uiLanguageHint":
    "Мова, якою відображаються меню, кнопки та заголовки.",
  // Client — language field
  "client.preferredLanguage": "Бажана мова",
  "client.preferredLanguageHint":
    "Використовується при надсиланні листів — шаблони фільтруються за цією мовою.",
  "client.preferredLanguageFollow": "Як у застосунку",
  // Email composer
  "email.templateLanguageBadge": "Мова",
  "email.noTemplatesForLanguage":
    "Немає шаблонів цією мовою. Показую всі шаблони.",
  "email.showAllLanguages": "Показати всі мови",
};

const dictionaries: Record<Locale, Record<TranslationKey, string>> = {
  en,
  ru,
  uk,
};

/**
 * Translate a key for the given locale. Falls back to English if the key is
 * missing in the target locale, and to the key itself as last resort (so
 * missing strings are obvious in dev).
 */
export function t(locale: Locale, key: TranslationKey): string {
  return dictionaries[locale]?.[key] ?? en[key] ?? key;
}
