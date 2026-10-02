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
    flag: '⚑ ගුරුවරයාගෙන් අසන්න', flagNote: 'ගැටලුව කුමක්ද? (අත්‍යවශ්‍ය නැත)', flagSend: 'යවන්න', flagCancel: 'අවලංගු කරන්න',
    flagSent: 'දැනටමත් යවා ඇත', flagWaiting: 'ගුරුවරයාගේ පිළිතුර බලාපොරොත්තුවෙන්', teacherReply: 'ගුරුවරයාගේ පිළිතුර',
    flagReviewed: 'ගුරුවරයෙකු විසින් සමාලෝචනය කරන ලදී', classes: 'පන්ති', lessons: 'පාඩම්',
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
    flag: '⚑ Ask a teacher', flagNote: "What's wrong? (optional)", flagSend: 'Send', flagCancel: 'Cancel',
    flagSent: 'Already sent', flagWaiting: "Waiting for a teacher's reply", teacherReply: "Teacher's reply",
    flagReviewed: 'Reviewed by a teacher', classes: 'Classes', lessons: 'Lessons',
  },
} satisfies Record<Lang, Record<string, string>>;
