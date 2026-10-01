export type Lang = 'si' | 'en';

export const t = {
  si: {
    title: 'A/L ගුරු සහායක', subject: 'විෂයය', placeholder: 'ඔබේ ප්‍රශ්නය මෙහි ලියන්න…', send: 'යවන්න',
    sources: 'මූලාශ්‍ර', page: 'පිටුව', thinking: 'සිතමින්…', logout: 'ඉවත් වන්න',
    error: 'දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න.',
    limit: 'අද දින ප්‍රශ්න සීමාව ඉක්මවා ඇත. හෙට නැවත උත්සාහ කරන්න.',
    noSubjects: 'තවම විෂයයන් නොමැත.',
    empty: 'විෂයයක් තෝරා ප්‍රශ්නයක් අසන්න. සිංහල, English හෝ Singlish භාවිතා කළ හැක.',
    newChat: 'නව සංවාදය', history: 'ඉතිහාසය', delete: 'මකන්න',
    confirmDelete: 'මෙම සංවාදය මකන්නද?', removed: 'ඉවත් කර ඇත',
  },
  en: {
    title: 'A/L Tutor', subject: 'Subject', placeholder: 'Type your question…', send: 'Send',
    sources: 'Sources', page: 'page', thinking: 'Thinking…', logout: 'Log out',
    error: 'Something went wrong. Please try again.',
    limit: "You've reached today's question limit. Try again tomorrow.",
    noSubjects: 'No subjects yet.',
    empty: 'Pick a subject and ask a question in Sinhala, English or Singlish.',
    newChat: 'New chat', history: 'History', delete: 'Delete',
    confirmDelete: 'Delete this conversation?', removed: 'removed',
  },
} satisfies Record<Lang, Record<string, string>>;
