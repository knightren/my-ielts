import baseVocabulary from './base-vocabulary'
import baseVocabularyOverrides from './base-vocabulary-overrides'
import themeVocabulary from './vocabulary'

function withSource(chapters: Record<string, any>, source: string) {
  return Object.fromEntries(
    Object.entries(chapters).map(([key, value]) => [key, {
      source,
      ...value,
    }]),
  )
}

function applyBaseOverrides(chapters: Record<string, any>, overrides: Record<string, Record<string, { example?: string, extra?: string }>>) {
  return Object.fromEntries(
    Object.entries(chapters).map(([chapterKey, chapterValue]) => {
      const chapterOverrides = overrides[chapterKey]
      if (!chapterOverrides)
        return [chapterKey, chapterValue]

      return [chapterKey, {
        ...chapterValue,
        words: (chapterValue.words || []).map((group: any[]) =>
          group.map((item) => {
            const override = chapterOverrides[String(item.word?.[0] || '').toLowerCase()]
            return override ? { ...item, ...override } : item
          }),
        ),
      }]
    }),
  )
}

const chapterMap = {
  ...withSource(applyBaseOverrides(baseVocabulary as Record<string, any>, baseVocabularyOverrides), 'base3000'),
  ...withSource(themeVocabulary as Record<string, any>, 'theme'),
}

export default chapterMap
