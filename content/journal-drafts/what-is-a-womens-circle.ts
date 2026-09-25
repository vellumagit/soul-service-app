import type { Article } from "@/lib/journal";

// Targets "women's circle" / "what is a women's circle" (Canada) and leads to
// /womens-circle. Facts about HER Circle only from the storefront + Terms:
// weekly, one theme, ~2 hours, 10–20 women, online by video, English or
// Ukrainian, never recorded, confidentiality asked of everyone.

export const womensCircle: Article = {
  slug: "what-is-a-womens-circle",
  status: "draft",
  published: "2026-09-24",
  updated: "2026-09-24",
  leadsTo: "womens-circle",
  en: {
    title: "What is a women's circle? And what really happens in one",
    metaTitle: "What Is a Women's Circle? What Happens in One | Svitlana",
    metaDescription:
      "A women's circle is a small group of women who gather to slow down, share and be heard. What happens in one, what it isn't, and how to know if you're ready.",
    excerpt:
      "A women's circle is simpler than it sounds — and often more powerful. What happens in one, what it isn't, and how to tell if you're ready for your first.",
    body: `A women's circle is a small group of women who come together to slow down, share what's true for them, and be heard without being fixed. There's no stage, no expert at the front of the room and no right way to feel. There's a circle — sometimes around a candle, sometimes on a screen — and a few hours where nobody needs anything from you.

If you've never been to one, the idea can feel either very appealing or slightly strange. Both are normal. Here's what a women's circle actually is, what happens inside one, and how to know whether it's for you.

## A women's circle, simply put

Women have gathered in circles for as long as there have been women — around fires, kitchen tables and cradles. A modern women's circle keeps the shape and the spirit of that: everyone sits at an equal distance from the centre, everyone has a turn to speak, and everyone else listens.

What makes it different from a coffee with friends is the **intention**. A circle is held on purpose. Someone guides it, there's usually a theme, and there are a few simple agreements — like keeping what's shared private — that make it safe to say the things you don't say anywhere else.

## What happens in a women's circle

Every circle has its own rhythm, but most move through the same gentle arc:

- **Arriving.** A few minutes to land — a breath, a moment of quiet, a chance to leave the day at the door.
- **A theme.** The guide offers something to reflect on: rest, worth, boundaries, grief, what you're carrying, what you're ready to put down.
- **Sharing and listening.** Each woman speaks when it's her turn, for as long or as briefly as she likes. Nobody interrupts, advises or compares. You're simply witnessed.
- **Closing.** The circle ends as intentionally as it began, so you leave a little lighter rather than suddenly back in the rush.

In the Circle I hold, there's one theme each week, we meet online for about two hours, and there are usually between 10 and 20 women. That's enough voices to remind you you're not alone — and few enough that yours is heard.

## What a women's circle is not

It helps to know what you're *not* walking into:

- **It isn't therapy.** A circle is spiritual and emotional support, not treatment. If you're struggling with your mental health, a circle can sit alongside professional care — never replace it.
- **It isn't a class.** Nobody is grading you, and there's nothing to get right.
- **It isn't a performance.** You don't need a moving story or the perfect words. "I'm tired" is a complete share.
- **It isn't a place where you get fixed.** That's the relief. For once, no one is trying to solve you — and you're not trying to solve anyone else.

## Who women's circles are for

Circles tend to call to women who hold everything together: mothers, partners, daughters caring for parents, the ones who run the team and remember everyone's birthday. Women who are so practised at knowing what everyone else needs that they've half-forgotten how to ask what they need themselves.

You don't need to be "spiritual", and you don't need any experience with meditation or ritual. You only need a little curiosity, and a willingness to be in the room — even quietly.

## Can an online women's circle feel the same?

This is the most common worry, and it's a fair one. Sitting in a real circle has a warmth that a screen can't fully copy.

But online circles have their own gifts. You join from your own space, in comfortable clothes, with a cup of tea and no drive home. Women who live far from each other — in different cities, different provinces, different time zones — can sit in the same circle. And for many women, being in their own home makes it easier, not harder, to open up.

My Circle meets by video, usually on Google Meet, so women can join from anywhere in Canada. Each Circle is held in English or in Ukrainian, and the language is marked on every date. Circles are never recorded, and everyone is asked to keep what's shared in confidence — the same care as a room, just without the room.

## How to know if you're ready for your first circle

You might be ready if:

- You're the one everyone leans on, and you're running on empty.
- There's a knowing inside you that you can't hear over the noise.
- You'd like support, but one-to-one work feels like a big first step.
- You want to feel less alone — without having to explain everything.

You don't have to be ready to share. Plenty of women spend their first circle mostly listening, and that's a full and valuable way to take part.

If you'd like to try one, you can [join the weekly women's Circle online](/womens-circle) — one evening, one theme, and a circle of women who understand. And if you'd rather talk first, [a private session](/private-sessions) is a gentle place to start.`,
    faqs: [
      {
        q: "Do I have to talk in a women's circle?",
        a: "In a well-held circle, sharing is an invitation, not a requirement. Many women spend their first circle mostly listening, and that's a full way to take part — being witnessed as you listen is part of the medicine. When you do speak, it can be as short as a sentence. Nobody will push you, and nobody will comment on what you say.",
      },
      {
        q: "What should I bring to an online women's circle?",
        a: "A quiet, private space where you can speak freely for about two hours, a steady internet connection, and anything that helps you feel settled — a blanket, a cup of tea, a candle, a notebook. Headphones help if others are home. You don't need to prepare anything or know the theme in advance. Just arrive as you are.",
      },
      {
        q: "Is a women's circle religious?",
        a: "No. A women's circle is a way of gathering, not a religion. Some circles draw on spiritual traditions or rituals, but you don't need to hold any particular beliefs to belong. Women of every faith — and none — sit in circles together. What matters is respect for each other's experience, and the willingness to listen.",
      },
      {
        q: "Is what I share in a circle kept private?",
        a: "It should be. Confidentiality is the foundation of any circle: what's shared in the circle stays in the circle. In my Circle, everyone is asked to keep what others share in confidence, and not to record, photograph or screenshot the session or the other women in it. Circles are never recorded.",
      },
    ],
  },
  uk: {
    title: "Що таке жіноче коло і що насправді в ньому відбувається",
    metaTitle: "Що таке жіноче коло і що в ньому відбувається | Світлана",
    metaDescription:
      "Жіноче коло — це невелика група жінок, які збираються, щоб сповільнитися, поділитися й бути почутими. Що в ньому відбувається і як зрозуміти, чи ви готові.",
    excerpt:
      "Жіноче коло простіше, ніж здається, — і часто глибше. Що в ньому відбувається, чим воно не є і як зрозуміти, що ви готові до першого.",
    body: `Жіноче коло — це невелика група жінок, які збираються разом, щоб сповільнитися, поділитися тим, що для них правдиве, і бути почутими — без того, щоб їх хтось «виправляв». Тут немає сцени, немає експерта перед залою і немає «правильного» способу почуватися. Є коло — іноді довкола свічки, іноді на екрані — і кілька годин, коли ніхто нічого від вас не потребує.

Якщо ви ніколи не були в колі, ця ідея може здаватися або дуже привабливою, або трохи дивною. І те, і те — нормально. Ось що таке жіноче коло насправді, що в ньому відбувається і як зрозуміти, чи воно для вас.

## Жіноче коло — простими словами

Жінки збиралися в кола відтоді, як існують жінки, — довкола вогнищ, кухонних столів і колисок. Сучасне жіноче коло зберігає цю форму й цей дух: усі сидять на однаковій відстані від центру, кожна має свою чергу говорити, а решта слухає.

Від кави з подругами коло відрізняє **намір**. Коло тримають свідомо. Хтось його веде, зазвичай є тема, і є кілька простих домовленостей — наприклад, що все сказане залишається між нами, — завдяки яким безпечно говорити те, чого ви не кажете більше ніде.

## Що відбувається в жіночому колі

Кожне коло має свій ритм, але більшість проходить ту саму лагідну дугу:

- **Прибуття.** Кілька хвилин, щоб приземлитися, — вдих, мить тиші, змога залишити день за дверима.
- **Тема.** Ведуча пропонує, над чим поміркувати: відпочинок, власна цінність, межі, горе, те, що ви несете, і те, що готові відпустити.
- **Ділитися й слухати.** Кожна жінка говорить, коли настає її черга, — стільки, скільки хоче, або зовсім коротко. Ніхто не перебиває, не радить і не порівнює. Вас просто бачать і чують.
- **Завершення.** Коло закінчується так само свідомо, як почалося, — щоб ви пішли трохи легшою, а не раптом знову опинилися в поспіху.

У Колі, яке веду я, щотижня одна тема, ми зустрічаємося онлайн приблизно на дві години, і зазвичай нас від 10 до 20. Достатньо голосів, щоб нагадати: ви не сама, — і достатньо мало, щоб ваш голос почули.

## Чим жіноче коло не є

Корисно знати, куди ви *не* йдете:

- **Це не терапія.** Коло — це духовна й емоційна підтримка, а не лікування. Якщо вам важко з психічним здоров’ям, коло може бути поруч із професійною допомогою — але ніколи не замість неї.
- **Це не заняття.** Вас ніхто не оцінює, і нічого не треба зробити «правильно».
- **Це не виступ.** Не потрібні зворушлива історія чи ідеальні слова. «Я втомилася» — це повноцінне висловлювання.
- **Це не місце, де вас «лагодять».** І в цьому полегшення. Хоч раз ніхто не намагається вас розв’язати — і ви не розв’язуєте нікого іншого.

## Для кого жіночі кола

Кола зазвичай кличуть жінок, які тримають усе на собі: мам, партнерок, доньок, що доглядають батьків, тих, хто керує командою й пам’ятає про всі дні народження. Жінок, які так добре навчилися знати, що потрібно всім іншим, що майже забули спитати, що потрібно їм самим.

Не треба бути «духовною» і не потрібен досвід медитацій чи ритуалів. Потрібні лише трохи цікавості й готовність бути в колі — навіть мовчки.

## Чи може онлайн-коло відчуватися так само?

Це найчастіше хвилювання, і воно слушне. Живе коло має тепло, яке екран не може повністю передати.

Але онлайн-кола мають свої дари. Ви долучаєтеся зі свого простору, у зручному одязі, з чашкою чаю й без дороги додому. Жінки, які живуть далеко одна від одної, — у різних містах, провінціях, часових поясах — можуть сидіти в одному колі. А багатьом жінкам удома відкритися не важче, а легше.

Моє Коло зустрічається у відеоформаті, зазвичай у Google Meet, тож долучитися можна з будь-якої точки Канади. Кожне Коло проходить англійською або українською, і мова позначена біля кожної дати. Кола ніколи не записуються, а всіх просять зберігати почуте в довірі — та сама турбота, що й у кімнаті, тільки без кімнати.

## Як зрозуміти, що ви готові до першого кола

Можливо, ви готові, якщо:

- Усі спираються на вас, а ви працюєте на порожньому баку.
- Усередині є знання, але ви не чуєте його за шумом.
- Вам потрібна підтримка, але індивідуальна робота здається завеликим першим кроком.
- Вам хочеться почуватися менш самотньою — без потреби все пояснювати.

Не обов’язково бути готовою ділитися. Багато жінок на першому колі здебільшого слухають — і це повноцінна й цінна участь.

Якщо хочете спробувати, можна [долучитися до щотижневого жіночого Кола онлайн](/uk/womens-circle) — один вечір, одна тема й коло жінок, які розуміють. А якщо хочеться спершу поговорити, [індивідуальна сесія](/uk/private-sessions) — лагідне місце для початку.`,
    faqs: [
      {
        q: "Чи обов’язково говорити в жіночому колі?",
        a: "У добре тримановому колі ділитися — це запрошення, а не вимога. Багато жінок на першому колі здебільшого слухають, і це повноцінна участь: бути присутньою й чути інших — теж частина цілющого. Коли ви все ж заговорите, це може бути одне речення. Ніхто не тиснутиме й не коментуватиме сказане.",
      },
      {
        q: "Що підготувати до онлайн-кола?",
        a: "Тихе, приватне місце, де ви зможете близько двох годин вільно говорити, стабільний інтернет і все, що допомагає вам заспокоїтися, — плед, чашку чаю, свічку, блокнот. Якщо вдома є інші люди, згодяться навушники. Нічого готувати чи знати тему заздалегідь не потрібно. Просто приходьте такою, як є.",
      },
      {
        q: "Жіноче коло — це щось релігійне?",
        a: "Ні. Жіноче коло — це спосіб збиратися разом, а не релігія. Деякі кола спираються на духовні традиції чи ритуали, але вам не потрібні якісь особливі переконання, щоб бути в колі. Разом сидять жінки різних віросповідань — і ті, хто не сповідує жодного. Важать повага до досвіду одна одної та готовність слухати.",
      },
      {
        q: "Чи залишається сказане в колі приватним?",
        a: "Має залишатися. Конфіденційність — основа будь-якого кола: що сказано в колі, залишається в колі. У моєму Колі всіх просять зберігати почуте в довірі й не записувати, не фотографувати й не робити знімків екрана зустрічі чи інших учасниць. Кола ніколи не записуються.",
      },
    ],
  },
};
