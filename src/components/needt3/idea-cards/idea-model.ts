/**
 * Idea cards: the design lab's own model. The real rules (how often a card
 * shows, where ideas come from, what "Take it" writes) live in the openspec
 * change `idea-cards`; nothing here talks to a server or decides anything.
 */
export type IdeaVariant = 1 | 2 | 3;
export type IdeaLayout = "phone" | "desktop";
export type IdeaPhase = "idea" | "took" | "skipped" | "gone";
export type IdeaLang = "en" | "ru";
export type IdeaIconKey = "news" | "watch";

export interface IdeaData {
  id: string;
  icon: IdeaIconKey;
  /** The object's own colour: the idea's project. */
  hue: string;
  project: string;
  minutes: number;
  title: Record<IdeaLang, string>;
  /** The task it becomes when taken. */
  task: Record<IdeaLang, string>;
}

export const IDEAS: readonly IdeaData[] = [
  {
    id: "ai-news",
    icon: "news",
    hue: "var(--hue-violet)",
    project: "Learning",
    minutes: 15,
    title: {
      en: "Catch up on AI agents news?",
      ru: "Посмотреть новости про AI-агентов?",
    },
    task: {
      en: "Catch up on AI agents news",
      ru: "Посмотреть новости про AI-агентов",
    },
  },
  {
    id: "breakdown",
    icon: "watch",
    hue: "var(--hue-orange)",
    project: "Inspiration",
    minutes: 20,
    title: {
      en: "Watch a breakdown?",
      ru: "Посмотреть разбор?",
    },
    task: { en: "Watch a breakdown", ru: "Посмотреть разбор" },
  },
];

export const COPY: Record<
  IdeaLang,
  {
    idea: string;
    slot: string;
    optional: string;
    take: string;
    skip: string;
    added: string;
    hidden: string;
    moved: (n: number) => string;
    undo: string;
    min: string;
  }
> = {
  en: {
    idea: "Idea",
    slot: "Idea for today",
    optional: "Optional",
    take: "Take it",
    skip: "Skip",
    added: "Added to Today",
    hidden: "Hidden for 7 days",
    moved: (n) => `Moved ${n} overdue tasks to ideas`,
    undo: "Undo",
    min: "min",
  },
  ru: {
    idea: "Идея",
    slot: "Идея на сегодня",
    optional: "Не обязательно",
    take: "Взять",
    skip: "Пропустить",
    added: "Добавлено на сегодня",
    hidden: "Скрыто на 7 дней",
    moved: (n) => `Просроченных задач перенесено в идеи: ${n}`,
    undo: "Отменить",
    min: "мин",
  },
};
