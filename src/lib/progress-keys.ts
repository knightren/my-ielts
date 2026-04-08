/** 与词汇 / 阅读 / 打字页 localStorage 键一致，用于云端同步 */
export const PROGRESS_STORAGE_KEYS = [
  'progress_last_modified_at',
  'listening_179_view',
  'listening_179_flashcard_statuses',
  'listening_179_flashcard_reviewed_at',
  'listening_179_flashcard_memory_counts',
  'vocabulary_chapter',
  'vocabulary_view',
  'vocabulary_flashcard_statuses',
  'vocabulary_flashcard_reviewed_at',
  'vocabulary_flashcard_memory_counts',
  'vocabulary_typing_progress',
  'reading-538-flashcard-statuses',
  'reading-538-flashcard-reviewed-at',
  'reading-538-flashcard-memory-counts',
  'vocabulary_typing_chapter',
  'listening_179_practice_state',
] as const

export type ProgressStorageKey = (typeof PROGRESS_STORAGE_KEYS)[number]

export type ProgressPayload = Partial<Record<ProgressStorageKey, string>>
