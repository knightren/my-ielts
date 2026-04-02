import baseVocabulary from './base-vocabulary'
import themeVocabulary from './vocabulary'

function withSource(chapters: Record<string, any>, source: string) {
  return Object.fromEntries(
    Object.entries(chapters).map(([key, value]) => [key, {
      source,
      ...value,
    }]),
  )
}

const chapterMap = {
  ...withSource(baseVocabulary as Record<string, any>, 'base3000'),
  ...withSource(themeVocabulary as Record<string, any>, 'theme'),
}

export default chapterMap
