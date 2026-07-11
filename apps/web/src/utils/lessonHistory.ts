export interface SavedLesson {
  id: string;
  topic: string;
  audience: string;
  duration?: string;
  difficulty?: string;
  teachingStyle?: string;
  learningObjectives: string[];
  slides: any[];
  summary: string;
  worksheet: { question: string; answer?: string }[];
  savedAt: string;
}

export const LESSON_HISTORY_KEY = 'autometa_lesson_history';
export const LESSON_HISTORY_LIMIT = 12;

export const formatRelativeTime = (iso: string): string => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};
