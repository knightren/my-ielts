<!-- eslint-disable eslint-comments/no-unlimited-disable -->
<script setup generic="T extends any, O extends any">
import chapterMap from './chapter-map'
import { requestProgressSync } from '~/composables/useAuth'
import { touchProgressTimestamp } from '~/lib/progress-sync'

const CHAPTER_KEY = 'vocabulary_chapter'
const VOCABULARY_GOAL_MODE_KEY = 'vocabulary_goal_mode'
const VOCABULARY_VIEW_KEY = 'vocabulary_view'
const VOCABULARY_FLASHCARD_STATUS_KEY = 'vocabulary_flashcard_statuses'
const VOCABULARY_FLASHCARD_REVIEWED_AT_KEY = 'vocabulary_flashcard_reviewed_at'
const VOCABULARY_FLASHCARD_MEMORY_COUNT_KEY = 'vocabulary_flashcard_memory_counts'
const VOCABULARY_FLASHCARD_MASTERED_AT_KEY = 'vocabulary_flashcard_mastered_at'
const VOCABULARY_FLASHCARD_MASTERED_CHECK_COUNT_KEY = 'vocabulary_flashcard_mastered_check_counts'
const VOCABULARY_EXAMPLE_TRANSLATIONS_KEY = 'vocabulary_example_translations'
const BASE_VOCAB_SOURCE_NOTE = '来自《3000词汇表》，已按更易记忆的方式重新归类'
const IELTS_65_CORE_THEME_CHAPTERS = [
  '01_自然地理',
  '03_动物保护',
  '05_学校教育',
  '06_科技发明',
  '08_语言演化',
  '12_饮食健康',
  '13_建筑场所',
  '14_交通旅行',
  '15_国家政府',
  '16_社会经济',
  '17_法律法规',
  '21_身心健康',
]
const IELTS_55_TO_65_BASE_KEEP_CHAPTERS = [
  'B06_学校工作与商业',
  'B07_社会法律与政府',
  'B09_自然环境与动植物',
  'B11_核心动作动词',
  'B12_思维表达与社交',
  'B13_核心描述形容词',
  'B14_高频名词补充',
]

const isTrainingModel = ref(false)
const isShowMeaning = ref(true)
const isAutoPlayWordAudio = ref(true)
const isOnlyShowErrors = ref(false)
const isFinishTraining = ref(false)
const isShowSource = ref(false)
const activeView = ref(localStorage.getItem(VOCABULARY_VIEW_KEY) || 'flashcard')
const vocabularyGoalMode = ref(localStorage.getItem(VOCABULARY_GOAL_MODE_KEY) || 'ielts-55-to-65')
const planningDays = ref(7)
const flashcardIndex = ref(0)
const flashcardFlipped = ref(false)
/** 正面：回忆自评，翻面核对前必选 */
const flashcardPretest = ref(null)
const activePlanLabel = ref('')
const activePlanWordKeys = ref([])
const flashcardOrder = ref([])
const flashcardReviewOptions = reactive({
  reviewMode: 'active',
  shuffle: false,
  autoNextAfterFlip: false,
})
const flashcardStatuses = reactive({})
const flashcardReviewedAt = reactive({})
const flashcardMemoryCounts = reactive({})
const flashcardMasteredAt = reactive({})
const flashcardMasteredCheckCounts = reactive({})
const exampleTranslations = reactive({})
const exampleTranslationVisible = reactive({})
const exampleTranslationLoading = reactive({})
const exampleTranslationErrors = reactive({})
const flashcardFullscreenEl = ref(null)
const isFlashcardFullscreen = ref(false)
const dictionaryCache = new Map()
const currentFlashcardPhoneticRequestId = ref(0)
const flashcardBackPhonetic = ref('')
const flashcardBackPhoneticLoading = ref(false)
let autoNextTimer = null

const trainingStats = ref('')
const keyword = ref('')
const allChapters = Object.keys(chapterMap)
const storedCategory = localStorage.getItem(CHAPTER_KEY)
const visibleChapters = computed(() => {
  if (vocabularyGoalMode.value === 'all')
    return allChapters

  if (vocabularyGoalMode.value === 'ielts-55-to-65') {
    return allChapters.filter((chapterKey) => {
      const chapter = chapterMap[chapterKey]
      if (chapter?.source === 'base3000')
        return IELTS_55_TO_65_BASE_KEEP_CHAPTERS.includes(chapterKey)
      return IELTS_65_CORE_THEME_CHAPTERS.includes(chapterKey)
    })
  }

  return allChapters.filter((chapterKey) => {
    const chapter = chapterMap[chapterKey]
    if (chapter?.source === 'base3000')
      return true
    return IELTS_65_CORE_THEME_CHAPTERS.includes(chapterKey)
  })
})
const category = ref(
  storedCategory && visibleChapters.value.includes(storedCategory)
    ? storedCategory
    : visibleChapters.value[0],
)
const vocabularyGoalSummary = computed(() => {
  const visible = new Set(visibleChapters.value)
  const totalWords = allChapters.reduce((sum, chapterKey) => {
    if (!visible.has(chapterKey))
      return sum
    return sum + (chapterMap[chapterKey]?.words?.flat()?.length || 0)
  }, 0)

  return {
    chapterCount: visibleChapters.value.length,
    totalWords,
  }
})

const loaded = ref(false)
const refVocabulary = reactive(chapterMap)
const currentChapter = computed(() => refVocabulary[category.value])
const chapterWords = computed(() => currentChapter.value?.words.flat() || [])
const wordList = computed(() => {
  const result = structuredClone(chapterMap) // deep clone
  // const keywordValue = keyword.value.trim().toLowerCase()
  const categoryValue = category.value

  if (categoryValue !== '') {
    // for (const key in result) {
    //   if (key !== categoryValue)
    //     delete result[key]
    // }
    return { [categoryValue]: result[categoryValue] }
  }

  /* if (keywordValue !== '') {
    for (const key in result) {
      const category = result[key]
      const words = []
      category.words.forEach((group) => {
        words.push(group.filter((item) => {
          return item.word.toLowerCase().includes(keywordValue)
        }))
      })
      category.words = words
    }
  } */
  return {}
})

watch(category, (newVal, oldVal) => {
  // console.log(newVal, oldVal)
  localStorage.setItem(CHAPTER_KEY, newVal)
  activePlanLabel.value = ''
  activePlanWordKeys.value = []
  flashcardIndex.value = 0
  flashcardFlipped.value = false
  flashcardPretest.value = null
  flashcardReviewOptions.reviewMode = 'active'
  clearAutoNextTimer()
})

watch(vocabularyGoalMode, (value) => {
  localStorage.setItem(VOCABULARY_GOAL_MODE_KEY, value)
  if (!visibleChapters.value.includes(category.value))
    category.value = visibleChapters.value[0]
})

watch(visibleChapters, (chapters) => {
  if (!chapters.length)
    return
  if (!chapters.includes(category.value))
    category.value = chapters[0]
})

watch(activeView, (value) => {
  localStorage.setItem(VOCABULARY_VIEW_KEY, value)
  flashcardFlipped.value = false
  flashcardPretest.value = null
  clearAutoNextTimer()
  if (value !== 'flashcard')
    exitFlashcardFullscreen()
})

const flashcards = computed(() => {
  let cards = chapterWords.value.map(item => ({
    ...item,
    chapter: category.value,
    statusKey: `${category.value}::${item.word[0].toLowerCase()}`,
  }))

  if (activePlanWordKeys.value.length) {
    const keys = new Set(activePlanWordKeys.value)
    cards = cards.filter(card => keys.has(card.statusKey))
  }

  return cards
})

const filteredFlashcards = computed(() => {
  const cards = flashcards.value
  if (flashcardReviewOptions.reviewMode === 'all')
    return cards
  if (flashcardReviewOptions.reviewMode === 'active')
    return cards.filter((card) => {
      const status = getFlashcardStatus(card.statusKey)
      return status !== 'mastered' || isFlashcardDueForMasteredCheck(card.statusKey)
    })
  if (flashcardReviewOptions.reviewMode === 'unknown')
    return cards.filter(card => getFlashcardStatus(card.statusKey) === 'unknown')
  if (flashcardReviewOptions.reviewMode === 'mastered')
    return cards.filter(card => getFlashcardStatus(card.statusKey) === 'mastered')
  return cards.filter(card => !getFlashcardStatus(card.statusKey))
})

const flashcardDeck = computed(() => {
  const cards = filteredFlashcards.value
  if (!flashcardReviewOptions.shuffle)
    return cards

  const byKey = new Map(cards.map(card => [card.statusKey, card]))
  const orderedCards = flashcardOrder.value
    .map(key => byKey.get(key))
    .filter(Boolean)

  if (orderedCards.length === cards.length)
    return orderedCards

  const remainingCards = cards.filter(card => !flashcardOrder.value.includes(card.statusKey))
  return [...orderedCards, ...remainingCards]
})

const currentFlashcard = computed(() => flashcardDeck.value[flashcardIndex.value] || null)
const currentMemoryAid = computed(() => getMemoryAid(currentFlashcard.value))

const flashcardStats = computed(() => {
  const today = getTodayKey()
  const cards = flashcards.value
  const known = cards.filter(card => getFlashcardStatus(card.statusKey) === 'known').length
  const unknown = cards.filter(card => getFlashcardStatus(card.statusKey) === 'unknown').length
  const masteredByUser = cards.filter(card => getFlashcardStatus(card.statusKey) === 'mastered').length
  const masteredDue = cards.filter(card => isFlashcardDueForMasteredCheck(card.statusKey)).length
  const reviewedToday = cards.filter(card => flashcardReviewedAt[card.statusKey] === today).length
  const fivePlus = cards.filter(card => getFlashcardMemoryCount(card.statusKey) >= 5).length
  const tenPlus = cards.filter(card => getFlashcardMemoryCount(card.statusKey) >= 10).length
  const overlearned = cards.filter(card => getFlashcardMemoryCount(card.statusKey) >= 20).length

  return {
    total: cards.length,
    known,
    unknown,
    masteredByUser,
    masteredDue,
    unmarked: cards.length - known - unknown - masteredByUser,
    reviewedToday,
    fivePlus,
    tenPlus,
    overlearned,
  }
})

const chapterPlanTarget = computed(() => currentChapter.value?.source === 'base3000' ? 10 : 8)
const chapterSummaries = computed(() => {
  return visibleChapters.value.map((chapterKey) => {
    const words = refVocabulary[chapterKey]?.words?.flat() || []
    let unfamiliar = 0
    let reviewing = 0
    let mastered = 0
    let dueMastered = 0

    words.forEach((item) => {
      const statusKey = `${chapterKey}::${item.word[0].toLowerCase()}`
      const status = getFlashcardStatus(statusKey)

      if (status === 'mastered') {
        mastered++
        if (isFlashcardDueForMasteredCheck(statusKey))
          dueMastered++
        return
      }

      if (status === 'known') {
        reviewing++
        return
      }

      unfamiliar++
    })

    return {
      key: chapterKey,
      total: words.length,
      unfamiliar,
      reviewing,
      mastered,
      dueMastered,
    }
  })
})

const currentChapterSummary = computed(() => {
  return chapterSummaries.value.find(item => item.key === category.value) || {
    key: category.value,
    total: 0,
    unfamiliar: 0,
    reviewing: 0,
    mastered: 0,
    dueMastered: 0,
  }
})

const chapterPlan = computed(() => {
  const totalDays = Math.max(1, Math.min(60, Number(planningDays.value) || 7))
  const outstandingWords = chapterWords.value
    .map((item) => {
      const statusKey = `${category.value}::${item.word[0].toLowerCase()}`
      const status = getFlashcardStatus(statusKey)
      const isDueMastered = status === 'mastered' && isFlashcardDueForMasteredCheck(statusKey)

      return {
        ...item,
        statusKey,
        isDueMastered,
        remaining: isDueMastered
          ? 1
          : Math.max(chapterPlanTarget.value - getFlashcardMemoryCount(statusKey), 0),
      }
    })
    .filter((item) => {
      if (item.isDueMastered)
        return true
      return item.remaining > 0 && getFlashcardStatus(item.statusKey) !== 'mastered'
    })

  const chunks = Array.from({ length: totalDays }, () => [])
  outstandingWords.forEach((item, index) => {
    chunks[index % totalDays].push(item)
  })

  const days = chunks.map((words, index) => ({
    dayNumber: index + 1,
    words,
    totalWords: words.length,
    totalRemainingHits: words.reduce((sum, item) => sum + item.remaining, 0),
    suggestions: buildChapterPlanSuggestions(index + 1, totalDays, words),
  }))

  return {
    totalDays,
    outstandingWords: outstandingWords.length,
    totalRemainingHits: outstandingWords.reduce((sum, item) => sum + item.remaining, 0),
    days,
  }
})

watch([filteredFlashcards, () => flashcardReviewOptions.shuffle], ([cards]) => {
  if (!cards.length) {
    flashcardIndex.value = 0
    flashcardFlipped.value = false
    flashcardPretest.value = null
    flashcardOrder.value = []
    return
  }

  const currentKey = currentFlashcard.value?.statusKey || ''
  if (flashcardReviewOptions.shuffle)
    flashcardOrder.value = buildFlashcardOrder(cards, currentKey)
  else
    flashcardOrder.value = cards.map(card => card.statusKey)

  if (flashcardIndex.value >= cards.length)
    flashcardIndex.value = 0
}, { immediate: true })

function calcStats() {
  let error = 0
  let missing = 0
  let correct = 0
  if (isTrainingModel.value) {
    const cur = refVocabulary[category.value]
    // 遍历所有单词的属性
    for (const group of cur.words) {
      for (const item of group) {
        if (item.spellValue) {
          if (item.spellError)
            error++
          else
            correct++
        }
        else { missing++ }
      }
    }
  }
  return `${missing} 个未完成，${correct} 个正确，${error} 个错误`
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10)
}

function parseDateKey(value) {
  if (typeof value !== 'string' || !value)
    return null

  const time = Date.parse(value)
  return Number.isNaN(time) ? null : time
}

function getMasteredCheckCount(statusKey) {
  const value = flashcardMasteredCheckCounts[statusKey]
  return Number.isFinite(value) ? value : 0
}

function getMasteredReviewIntervalDays(statusKey) {
  const checkCount = getMasteredCheckCount(statusKey)
  if (checkCount <= 0)
    return 7
  if (checkCount === 1)
    return 30
  return 90
}

function isFlashcardDueForMasteredCheck(statusKey) {
  if (getFlashcardStatus(statusKey) !== 'mastered')
    return false

  const masteredAt = parseDateKey(flashcardMasteredAt[statusKey])
  if (!masteredAt)
    return true

  const intervalDays = getMasteredReviewIntervalDays(statusKey)
  const nextCheckAt = masteredAt + intervalDays * 24 * 60 * 60 * 1000
  return Date.now() >= nextCheckAt
}

function getMasteredReviewHint(statusKey) {
  if (getFlashcardStatus(statusKey) !== 'mastered')
    return ''

  if (isFlashcardDueForMasteredCheck(statusKey))
    return '熟词抽查已到期，建议现在核验一次。'

  const intervalDays = getMasteredReviewIntervalDays(statusKey)
  return `已进入熟词低频维护队列，下一次抽查间隔 ${intervalDays} 天。`
}

function normalizeWord(rawWord) {
  return String(rawWord || '').trim()
}

function normalizeVocabularyDisplayText(rawText) {
  const text = String(rawText || '').trim()
  if (!text || text === '-' || text === BASE_VOCAB_SOURCE_NOTE)
    return ''
  return text
}

function getVocabularyExampleText(item) {
  return normalizeVocabularyDisplayText(item?.example)
}

function getVocabularyExtraText(item) {
  return normalizeVocabularyDisplayText(item?.extra)
}

function getExampleTranslationKey(itemOrText) {
  if (typeof itemOrText === 'string')
    return normalizeVocabularyDisplayText(itemOrText)
  return getVocabularyExampleText(itemOrText)
}

function getExampleTranslation(itemOrText) {
  const key = getExampleTranslationKey(itemOrText)
  return key ? exampleTranslations[key] || '' : ''
}

function isExampleTranslationVisible(itemOrText) {
  const key = getExampleTranslationKey(itemOrText)
  return key ? Boolean(exampleTranslationVisible[key]) : false
}

function isExampleTranslationLoading(itemOrText) {
  const key = getExampleTranslationKey(itemOrText)
  return key ? Boolean(exampleTranslationLoading[key]) : false
}

function getExampleTranslationError(itemOrText) {
  const key = getExampleTranslationKey(itemOrText)
  return key ? exampleTranslationErrors[key] || '' : ''
}

function persistExampleTranslations() {
  localStorage.setItem(VOCABULARY_EXAMPLE_TRANSLATIONS_KEY, JSON.stringify(exampleTranslations))
}

async function fetchExampleTranslation(exampleText) {
  const key = getExampleTranslationKey(exampleText)
  if (!key || exampleTranslations[key] || exampleTranslationLoading[key])
    return

  exampleTranslationLoading[key] = true
  exampleTranslationErrors[key] = ''

  try {
    const response = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=${encodeURIComponent(key)}`)
    if (!response.ok)
      throw new Error('translate_failed')

    const data = await response.json()
    const translated = Array.isArray(data?.[0])
      ? data[0].map(part => String(part?.[0] || '')).join('').trim()
      : ''

    if (!translated)
      throw new Error('empty_translation')

    exampleTranslations[key] = translated
    persistExampleTranslations()
  }
  catch {
    exampleTranslationErrors[key] = '翻译获取失败，请稍后重试。'
  }
  finally {
    exampleTranslationLoading[key] = false
  }
}

async function toggleExampleTranslation(itemOrText) {
  const key = getExampleTranslationKey(itemOrText)
  if (!key)
    return

  const nextVisible = !exampleTranslationVisible[key]
  exampleTranslationVisible[key] = nextVisible
  if (nextVisible && !exampleTranslations[key])
    await fetchExampleTranslation(key)
}

function buildLookupTokens(rawWord) {
  return normalizeWord(rawWord)
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
}

const MEMORY_AID_CHUNK_PRESETS = {
  policy: 'public policy 公共政策',
  budget: 'on a tight budget 预算紧张',
  climate: 'climate change 气候变化',
  environment: 'natural environment 自然环境',
  government: 'local government 地方政府',
  academic: 'academic vocabulary 学术词汇',
  education: 'higher education 高等教育',
  employment: 'job opportunities 就业机会',
  research: 'carry out research 开展研究',
  legal: 'legal advice 法律建议',
  economy: 'economic growth 经济增长',
  application: 'submit an application 提交申请',
  appointment: 'make an appointment 预约',
  conference: 'academic conference 学术会议',
  contract: 'sign a contract 签合同',
  degree: 'bachelor\'s degree 学士学位',
  document: 'supporting documents 证明材料',
  examination: 'sit an examination 参加考试',
  institution: 'educational institution 教育机构',
  organization: 'non-profit organization 非营利组织',
  society: 'modern society 现代社会',
  violence: 'domestic violence 家庭暴力',
  atmosphere: 'upper atmosphere 高层大气',
  global: 'global issue 全球性问题',
  forest: 'rain forest 雨林',
}

const MEMORY_AID_FORMATION_PRESETS = {
  transport: {
    parts: [
      { text: 'trans-', meaning: '跨越' },
      { text: 'port', meaning: '搬运' },
    ],
    bridge: '跨着把东西搬到别处',
  },
  import: {
    parts: [
      { text: 'im-', meaning: '向内' },
      { text: 'port', meaning: '搬运' },
    ],
    bridge: '把东西往里搬',
  },
  export: {
    parts: [
      { text: 'ex-', meaning: '向外' },
      { text: 'port', meaning: '搬运' },
    ],
    bridge: '把东西往外运出去',
  },
  inspect: {
    parts: [
      { text: 'in-', meaning: '向内' },
      { text: 'spect', meaning: '看' },
    ],
    bridge: '往里面仔细看',
  },
  respect: {
    parts: [
      { text: 're-', meaning: '回过来' },
      { text: 'spect', meaning: '看' },
    ],
    bridge: '回过头认真看待别人',
  },
  construct: {
    parts: [
      { text: 'con-', meaning: '共同、聚在一起' },
      { text: 'struct', meaning: '建造' },
    ],
    bridge: '把东西一起搭建起来',
  },
  destructive: {
    parts: [
      { text: 'de-', meaning: '拆开、向下' },
      { text: 'struct', meaning: '结构、建造' },
      { text: '-ive', meaning: '具有某种性质的' },
    ],
    bridge: '把原有结构拆掉',
  },
  employee: {
    parts: [
      { text: 'employ', meaning: '雇用、使用' },
      { text: '-ee', meaning: '接受动作的人' },
    ],
    bridge: '被雇用的人',
  },
  unemployment: {
    parts: [
      { text: 'un-', meaning: '没有' },
      { text: 'employ', meaning: '雇用、工作' },
      { text: '-ment', meaning: '状态、结果' },
    ],
    bridge: '没有被雇用的状态',
  },
  employer: {
    parts: [
      { text: 'employ', meaning: '雇用、使用' },
      { text: '-er', meaning: '做这个动作的人' },
    ],
    bridge: '雇用别人的一方',
  },
  education: {
    parts: [
      { text: 'educ', meaning: '引导、带出' },
      { text: '-ation', meaning: '过程、结果' },
    ],
    bridge: '把能力一步步带出来的过程',
  },
  educational: {
    parts: [
      { text: 'educ', meaning: '引导、带出' },
      { text: '-ation', meaning: '过程、结果' },
      { text: '-al', meaning: '与……有关的' },
    ],
    bridge: '和教育这个过程有关的',
  },
  application: {
    parts: [
      { text: 'apply', meaning: '应用、使用、申请' },
      { text: '-ation', meaning: '过程、结果' },
    ],
    bridge: '把申请或使用这件事落实成一个过程',
  },
  organization: {
    parts: [
      { text: 'organ', meaning: '器官、部分' },
      { text: '-ize', meaning: '使成形、使有条理' },
      { text: '-ation', meaning: '过程、结果' },
    ],
    bridge: '把各部分组织起来形成整体',
  },
  institution: {
    parts: [
      { text: 'in-', meaning: '进入、向内' },
      { text: 'stit', meaning: '站立、建立' },
      { text: '-tion', meaning: '结果、状态' },
    ],
    bridge: '把制度和结构立起来，形成正式机构',
  },
  economic: {
    parts: [
      { text: 'econom', meaning: '经济、管理家庭开支' },
      { text: '-ic', meaning: '与……有关的' },
    ],
    bridge: '和经济运行有关的',
  },
  examination: {
    parts: [
      { text: 'ex-', meaning: '向外、彻底' },
      { text: 'amin', meaning: '查看、检查' },
      { text: '-ation', meaning: '过程、结果' },
    ],
    bridge: '把能力全面查验一遍',
  },
}

const MEMORY_AID_PREFIX_RULES = [
  { match: 'inter', meaning: '在……之间、相互' },
  { match: 'trans', meaning: '跨越、转移' },
  { match: 'super', meaning: '在上、超出' },
  { match: 'under', meaning: '在下、不足' },
  { match: 'sub', meaning: '下面、次级' },
  { match: 'pre', meaning: '在前、预先' },
  { match: 'post', meaning: '在后、之后' },
  { match: 're', meaning: '再、回、重新' },
  { match: 'un', meaning: '不、没有' },
  { match: 'in', meaning: '不、向内' },
  { match: 'im', meaning: '不、向内' },
  { match: 'il', meaning: '不' },
  { match: 'ir', meaning: '不' },
  { match: 'dis', meaning: '分开、反向、不' },
  { match: 'mis', meaning: '错误地' },
  { match: 'anti', meaning: '反对' },
  { match: 'pro', meaning: '向前、支持' },
  { match: 'con', meaning: '共同、加强' },
  { match: 'com', meaning: '共同、加强' },
  { match: 'de', meaning: '向下、拆开、离开' },
  { match: 'ex', meaning: '向外' },
]

const MEMORY_AID_SUFFIX_RULES = [
  { match: 'ization', meaning: '……化的过程或结果' },
  { match: 'ation', meaning: '过程、结果' },
  { match: 'ition', meaning: '过程、结果' },
  { match: 'tion', meaning: '行为、结果、状态' },
  { match: 'sion', meaning: '行为、结果、状态' },
  { match: 'ment', meaning: '状态、结果' },
  { match: 'ness', meaning: '性质、状态' },
  { match: 'ity', meaning: '性质、特征' },
  { match: 'ize', meaning: '使……化、使成形' },
  { match: 'ism', meaning: '主义、现象' },
  { match: 'ist', meaning: '从事者、某类人' },
  { match: 'ship', meaning: '关系、状态' },
  { match: 'ee', meaning: '接受动作的人' },
  { match: 'er', meaning: '做动作的人或物' },
  { match: 'ic', meaning: '与……有关的' },
  { match: 'able', meaning: '能够……的' },
  { match: 'ible', meaning: '能够……的' },
  { match: 'ive', meaning: '具有……性质的' },
  { match: 'ous', meaning: '充满……的' },
  { match: 'ful', meaning: '充满……的' },
  { match: 'less', meaning: '没有……的' },
  { match: 'al', meaning: '与……有关的' },
  { match: 'ary', meaning: '与……有关的' },
  { match: 'ory', meaning: '具有……性质的' },
]

const MEMORY_AID_ROOT_RULES = [
  { match: 'spect', meaning: '看', bridge: '从“看”延伸到“仔细看、回看”' },
  { match: 'vis', meaning: '看', bridge: '从“看”延伸到“看见、可见”' },
  { match: 'vid', meaning: '看', bridge: '从“看”延伸到“看见、可见”' },
  { match: 'dict', meaning: '说', bridge: '从“说出来”延伸到“表达、命令、说明”' },
  { match: 'scribe', meaning: '写', bridge: '从“写下来”延伸到“记录、描述”' },
  { match: 'script', meaning: '写', bridge: '从“写下来”延伸到“记录、描述”' },
  { match: 'duc', meaning: '引导、带出', bridge: '从“引导出来”延伸到“教育、产生、引出”' },
  { match: 'duct', meaning: '引导、带出', bridge: '从“引导出来”延伸到“教育、产生、引出”' },
  { match: 'ploy', meaning: '使用、雇用', bridge: '从“使用某人做事”延伸到“雇用、就业”' },
  { match: 'port', meaning: '搬运', bridge: '从“搬运”延伸到“运输、输入、输出”' },
  { match: 'tract', meaning: '拉', bridge: '从“拉过去”延伸到“吸引、牵引”' },
  { match: 'struct', meaning: '建造、结构', bridge: '从“搭建结构”延伸到“建造或破坏结构”' },
  { match: 'organ', meaning: '器官、部分、组织', bridge: '从“各部分形成整体”延伸到“组织、机构”' },
  { match: 'stit', meaning: '站立、建立', bridge: '从“立起来”延伸到“建立、设立”' },
  { match: 'amin', meaning: '查看、检查', bridge: '从“仔细查看”延伸到“检查、考试”' },
  { match: 'econom', meaning: '经济、管理开支', bridge: '从“管理家庭开支”延伸到“经济活动”' },
  { match: 'form', meaning: '形状、形成', bridge: '从“形成形状”延伸到“形成、构成”' },
  { match: 'ject', meaning: '扔、投', bridge: '从“扔出去”延伸到“投射、抛出”' },
  { match: 'gress', meaning: '走、前进', bridge: '从“往前走”延伸到“进展、过程”' },
  { match: 'grad', meaning: '步、级', bridge: '从“一级一级走”延伸到“程度、阶段”' },
  { match: 'press', meaning: '压、按', bridge: '从“压下去”延伸到“施压、压迫”' },
  { match: 'serve', meaning: '服务、提供', bridge: '从“提供服务”延伸到“服务、保存、保留”' },
  { match: 'cede', meaning: '走、让', bridge: '从“走开或让出去”延伸到“让步、转让”' },
  { match: 'ceed', meaning: '走、前进', bridge: '从“往前走”延伸到“继续、前进”' },
  { match: 'cess', meaning: '走、让', bridge: '从“走开或让出去”延伸到“让步、转让”' },
  { match: 'mit', meaning: '送、放出', bridge: '从“送出去”延伸到“提交、发出、允许”' },
  { match: 'miss', meaning: '送、放出', bridge: '从“送出去”延伸到“发射、错过”' },
  { match: 'rupt', meaning: '断裂', bridge: '从“断开”延伸到“打破、破裂”' },
  { match: 'tain', meaning: '拿住、保持', bridge: '从“拿住”延伸到“保持、维持”' },
  { match: 'tent', meaning: '拿住、伸展', bridge: '从“拿住或拉开”延伸到“保持、延伸”' },
]

function findMemoryAidChunk(extraText, lowerWord) {
  const preset = MEMORY_AID_CHUNK_PRESETS[lowerWord]
  if (preset)
    return preset

  if (!extraText)
    return ''

  const segments = extraText
    .split(/[；;]+/)
    .map(item => item.trim())
    .filter(Boolean)

  const matched = segments.find(segment => {
    const englishPart = segment.match(/^[A-Za-z][A-Za-z' -]*/)
    const phrase = englishPart?.[0]?.trim().toLowerCase() || ''
    if (!phrase.includes(lowerWord))
      return false
    if (phrase === lowerWord)
      return false
    return phrase.includes(' ')
  })

  return matched || ''
}

function buildGenericFormationAid(lowerWord, meaning) {
  const prefix = MEMORY_AID_PREFIX_RULES.find(rule => lowerWord.startsWith(rule.match) && lowerWord.length - rule.match.length >= 3)
  const suffix = MEMORY_AID_SUFFIX_RULES.find(rule => lowerWord.endsWith(rule.match) && lowerWord.length - rule.match.length >= 3)
  const root = MEMORY_AID_ROOT_RULES.find(rule => lowerWord.includes(rule.match))

  if (!root)
    return null

  const parts = []
  if (prefix)
    parts.push({ text: `${prefix.match}-`, meaning: prefix.meaning })
  parts.push({ text: root.match, meaning: root.meaning })
  if (suffix)
    parts.push({ text: `-${suffix.match}`, meaning: suffix.meaning })

  const bridgeParts = []
  if (prefix)
    bridgeParts.push(prefix.meaning)
  bridgeParts.push(root.meaning)
  const bridge = `${root.bridge}；先从「${bridgeParts.join(' + ')}」想到这个方向，再引申到“${meaning}”。`

  return {
    type: 'formation',
    title: '词根词缀',
    parts,
    bridge,
    final: meaning,
  }
}

function buildAssociationAid(card, lowerWord, meaning) {
  const typeText = String(card?.pos || '').toLowerCase()
  if (typeText.includes('v')) {
    return {
      type: 'association',
      title: '联想',
      content: `先把它放回一个动作场景里，直接记成“做出 ${meaning} 这个动作”。`,
    }
  }

  if (typeText.includes('adj')) {
    return {
      type: 'association',
      title: '联想',
      content: `把它当成给事物贴的标签，看到词就想到“${meaning} 这种特征”。`,
    }
  }

  return {
    type: 'association',
    title: '联想',
    content: `先用一个最常见的使用场景记住它：${meaning}。`,
  }
}

function getMemoryAid(card) {
  if (!card) {
    return {
      type: 'association',
      title: '联想',
      content: '',
    }
  }

  const word = normalizeWord(card.word?.[0])
  const lowerWord = word.toLowerCase()
  const meaning = String(card.meaning || '').split('；').filter(Boolean)[0] || '核心含义'
  const extraText = getVocabularyExtraText(card)

  if (buildLookupTokens(word).length > 1) {
    return {
      type: 'chunk',
      title: '词块',
      content: `${word} = ${meaning}`,
    }
  }

  const presetFormation = MEMORY_AID_FORMATION_PRESETS[lowerWord]
  if (presetFormation) {
    return {
      type: 'formation',
      title: '词根词缀',
      parts: presetFormation.parts,
      bridge: `从「${presetFormation.parts.map(part => part.meaning).join(' + ')}」想到“${presetFormation.bridge}”，引申为“${meaning}”。`,
      final: meaning,
    }
  }

  const genericFormation = buildGenericFormationAid(lowerWord, meaning)
  if (genericFormation)
    return genericFormation

  const chunk = findMemoryAidChunk(extraText, lowerWord)
  if (chunk) {
    return {
      type: 'chunk',
      title: '词块',
      content: chunk,
    }
  }

  return buildAssociationAid(card, lowerWord, meaning)
}

function buildFlashcardOrder(cards, currentKey = '') {
  const keys = cards.map(card => card.statusKey)
  const remaining = keys.filter(key => key !== currentKey)

  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = remaining[i]
    remaining[i] = remaining[j]
    remaining[j] = temp
  }

  if (currentKey && keys.includes(currentKey))
    return [currentKey, ...remaining]

  return remaining
}

function getFlashcardStatus(statusKey) {
  return flashcardStatuses[statusKey] || ''
}

function getFlashcardMemoryCount(statusKey) {
  const value = flashcardMemoryCounts[statusKey]
  return Number.isFinite(value) ? value : 0
}

function persistFlashcardState() {
  touchProgressTimestamp()
  localStorage.setItem(VOCABULARY_FLASHCARD_STATUS_KEY, JSON.stringify(flashcardStatuses))
  localStorage.setItem(VOCABULARY_FLASHCARD_REVIEWED_AT_KEY, JSON.stringify(flashcardReviewedAt))
  localStorage.setItem(VOCABULARY_FLASHCARD_MEMORY_COUNT_KEY, JSON.stringify(flashcardMemoryCounts))
  localStorage.setItem(VOCABULARY_FLASHCARD_MASTERED_AT_KEY, JSON.stringify(flashcardMasteredAt))
  localStorage.setItem(VOCABULARY_FLASHCARD_MASTERED_CHECK_COUNT_KEY, JSON.stringify(flashcardMasteredCheckCounts))
  requestProgressSync()
}

function loadFlashcardState() {
  for (const [key, target] of [
    [VOCABULARY_FLASHCARD_STATUS_KEY, flashcardStatuses],
    [VOCABULARY_FLASHCARD_REVIEWED_AT_KEY, flashcardReviewedAt],
    [VOCABULARY_FLASHCARD_MEMORY_COUNT_KEY, flashcardMemoryCounts],
    [VOCABULARY_FLASHCARD_MASTERED_AT_KEY, flashcardMasteredAt],
    [VOCABULARY_FLASHCARD_MASTERED_CHECK_COUNT_KEY, flashcardMasteredCheckCounts],
  ]) {
    const raw = localStorage.getItem(key)
    if (!raw)
      continue
    try {
      Object.assign(target, JSON.parse(raw))
    }
    catch {
    }
  }

  const translationRaw = localStorage.getItem(VOCABULARY_EXAMPLE_TRANSLATIONS_KEY)
  if (translationRaw) {
    try {
      Object.assign(exampleTranslations, JSON.parse(translationRaw))
    }
    catch {
    }
  }
}

function getMemoryStageMeta(statusKey, _chapterLabel = '') {
  if (getFlashcardStatus(statusKey) === 'mastered') {
    return {
      key: 'mastered-by-user',
      label: '熟词直过',
      hint: getMasteredReviewHint(statusKey),
      className: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300',
    }
  }
  const count = getFlashcardMemoryCount(statusKey)
  if (count >= 20) {
    return {
      key: 'mastered',
      label: '烂熟于心',
      hint: '已达到 20 次以上正确回忆',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
    }
  }
  if (count >= 10) {
    return {
      key: 'ten-plus',
      label: '10+ 次',
      hint: '已达到 10 次以上正确回忆',
      className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300',
    }
  }
  if (count >= 5) {
    return {
      key: 'five-plus',
      label: '5+ 次',
      hint: '已达到 5 次以上正确回忆',
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
    }
  }
  return {
    key: 'warming-up',
    label: '未达 5 次',
    hint: '继续记背，先冲到 5 次',
    className: 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300',
  }
}

function extractDictionaryMeta(entries) {
  if (!Array.isArray(entries) || entries.length === 0)
    return { phonetic: '' }

  const phonetic = entries
    .flatMap(entry => [entry.phonetic, ...(entry.phonetics || []).map(item => item.text)])
    .find(Boolean) || ''

  return { phonetic }
}

async function fetchDictionaryToken(token) {
  const key = token.toLowerCase()
  if (!key)
    return null

  if (!dictionaryCache.has(key)) {
    const request = fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(key)}`)
      .then(async (response) => {
        if (!response.ok)
          return null
        const data = await response.json()
        return extractDictionaryMeta(data)
      })
      .catch(() => null)
    dictionaryCache.set(key, request)
  }

  return dictionaryCache.get(key)
}

async function fetchPhoneticForRawWord(rawWord) {
  const tokens = buildLookupTokens(rawWord)
  if (!tokens.length)
    return ''

  const metas = await Promise.all(tokens.map(fetchDictionaryToken))
  return metas
    .map(meta => String(meta?.phonetic || '').replace(/^\/|\/$/g, '').trim())
    .filter(Boolean)
    .join(' / ')
}

async function loadCurrentFlashcardPhonetic() {
  const rawWord = currentFlashcard.value?.word?.[0] || ''
  if (!rawWord) {
    flashcardBackPhonetic.value = ''
    flashcardBackPhoneticLoading.value = false
    return
  }

  const requestId = currentFlashcardPhoneticRequestId.value + 1
  currentFlashcardPhoneticRequestId.value = requestId
  flashcardBackPhoneticLoading.value = true

  const phonetic = await fetchPhoneticForRawWord(rawWord)
  if (requestId !== currentFlashcardPhoneticRequestId.value)
    return

  flashcardBackPhonetic.value = phonetic
  flashcardBackPhoneticLoading.value = false
}

watch(
  () => currentFlashcard.value?.statusKey,
  () => {
    void loadCurrentFlashcardPhonetic()
  },
  { immediate: true },
)

function moveFlashcard(step) {
  const cards = flashcardDeck.value
  if (!cards.length)
    return
  clearAutoNextTimer()
  flashcardIndex.value = (flashcardIndex.value + step + cards.length) % cards.length
  flashcardFlipped.value = false
  flashcardPretest.value = null
}

function randomFlashcard() {
  const cards = flashcardDeck.value
  if (cards.length < 2)
    return

  let nextIndex = flashcardIndex.value
  while (nextIndex === flashcardIndex.value)
    nextIndex = Math.floor(Math.random() * cards.length)

  clearAutoNextTimer()
  flashcardIndex.value = nextIndex
  flashcardFlipped.value = false
  flashcardPretest.value = null
}

function selectFlashcardPretestAndFlip(pretest) {
  if (!currentFlashcard.value || flashcardFlipped.value)
    return
  flashcardPretest.value = pretest
  flashcardFlipped.value = true
  clearAutoNextTimer()
  if (pretest === 'unknown') {
    markFlashcard('unknown')
    if (flashcardReviewOptions.autoNextAfterFlip)
      scheduleAutoNext()
    else
      clearAutoNextTimer()
  }
}

/** 仅背面 → 正面（正面翻面完全由选认识/不认识或 K/U 触发） */
function flipFlashcard() {
  if (!currentFlashcard.value || !flashcardFlipped.value)
    return
  flashcardFlipped.value = false
  flashcardPretest.value = null
  clearAutoNextTimer()
}

function onFlashcardShellClick() {
  if (flashcardFlipped.value)
    flipFlashcard()
}

function markFlashcard(status) {
  const card = currentFlashcard.value
  if (!card)
    return
  flashcardStatuses[card.statusKey] = status
  flashcardReviewedAt[card.statusKey] = getTodayKey()
  if (status === 'known')
    flashcardMemoryCounts[card.statusKey] = getFlashcardMemoryCount(card.statusKey) + 1
  if (status !== 'mastered') {
    delete flashcardMasteredAt[card.statusKey]
    delete flashcardMasteredCheckCounts[card.statusKey]
  }
  persistFlashcardState()
}

function markFlashcardMastered() {
  const card = currentFlashcard.value
  if (!card)
    return
  flashcardStatuses[card.statusKey] = 'mastered'
  flashcardReviewedAt[card.statusKey] = getTodayKey()
  flashcardMasteredAt[card.statusKey] = new Date().toISOString()
  flashcardMasteredCheckCounts[card.statusKey] = getMasteredCheckCount(card.statusKey)
  persistFlashcardState()
  if (flashcardReviewOptions.autoNextAfterFlip)
    scheduleAutoNext()
}

function confirmMasteredRetention(success) {
  const card = currentFlashcard.value
  if (!card)
    return

  flashcardReviewedAt[card.statusKey] = getTodayKey()
  if (success) {
    flashcardStatuses[card.statusKey] = 'mastered'
    flashcardMasteredAt[card.statusKey] = new Date().toISOString()
    flashcardMasteredCheckCounts[card.statusKey] = getMasteredCheckCount(card.statusKey) + 1
    flashcardMemoryCounts[card.statusKey] = getFlashcardMemoryCount(card.statusKey) + 1
  }
  else {
    flashcardStatuses[card.statusKey] = 'unknown'
    delete flashcardMasteredAt[card.statusKey]
    delete flashcardMasteredCheckCounts[card.statusKey]
  }

  persistFlashcardState()
}

/** 背面：仅「正面认识」时需核对；对=我认识并累计次数，错=不认识 */
function confirmFlashcardBack(isCorrect) {
  if (!currentFlashcard.value || !flashcardFlipped.value || flashcardPretest.value !== 'known')
    return
  if (getFlashcardStatus(currentFlashcard.value.statusKey) === 'mastered')
    confirmMasteredRetention(isCorrect)
  else if (isCorrect)
    markFlashcard('known')
  else
    markFlashcard('unknown')
  if (flashcardReviewOptions.autoNextAfterFlip)
    scheduleAutoNext()
  else
    clearAutoNextTimer()
}

function clearAllVocabularyFlashcardProgress() {
  if (!confirm('确定清除全部词汇闪卡的学习记录？所有章节的「认识/不认识」标记与记忆次数将清空，且无法恢复。'))
    return
  for (const k of Object.keys(flashcardStatuses))
    delete flashcardStatuses[k]
  for (const k of Object.keys(flashcardReviewedAt))
    delete flashcardReviewedAt[k]
  for (const k of Object.keys(flashcardMemoryCounts))
    delete flashcardMemoryCounts[k]
  for (const k of Object.keys(flashcardMasteredAt))
    delete flashcardMasteredAt[k]
  for (const k of Object.keys(flashcardMasteredCheckCounts))
    delete flashcardMasteredCheckCounts[k]
  persistFlashcardState()
  flashcardFlipped.value = false
  flashcardPretest.value = null
  clearAutoNextTimer()
}

function clearAutoNextTimer() {
  if (autoNextTimer) {
    clearTimeout(autoNextTimer)
    autoNextTimer = null
  }
}

function scheduleAutoNext() {
  clearAutoNextTimer()
  autoNextTimer = setTimeout(() => {
    moveFlashcard(1)
    autoNextTimer = null
  }, 1800)
}

function setReviewMode(mode) {
  flashcardReviewOptions.reviewMode = mode
  flashcardFlipped.value = false
  flashcardPretest.value = null
  clearAutoNextTimer()
}

function formatPlanWordPreview(words, max = 6) {
  if (!words.length)
    return '今天以复习已学内容为主。'
  const preview = words.slice(0, max).map(item => item.word[0]).join('、')
  return words.length > max ? `${preview} 等 ${words.length} 个词` : preview
}

function buildChapterPlanSuggestions(dayNumber, totalDays, words) {
  return [
    `上午先用列表模式过一遍这些词：${formatPlanWordPreview(words, 5)}`,
    '中午或下午切到闪卡模式，先看词再回忆中文义，翻面核对后点「对」累计次数。',
    '晚上用打字练习再过一轮，优先处理白天仍然犹豫的词。',
    dayNumber === totalDays
      ? '最后一天重点清空“未达 10 次”的词，并把最核心的基础词尽量冲到“烂熟于心”。'
      : '睡前再刷一次闪卡，把今天真正能秒答的词都再确认一轮。',
  ]
}

function startPlanFlashcards(day) {
  activePlanWordKeys.value = day.words.map(item => item.statusKey)
  activePlanLabel.value = `${category.value} · 第 ${day.dayNumber} 天任务`
  activeView.value = 'flashcard'
  flashcardReviewOptions.reviewMode = 'active'
  flashcardReviewOptions.shuffle = true
  flashcardIndex.value = 0
  flashcardFlipped.value = false
  flashcardPretest.value = null
}

function clearPlanFlashcards() {
  activePlanWordKeys.value = []
  activePlanLabel.value = ''
  flashcardReviewOptions.reviewMode = 'active'
}

function getFullscreenElement() {
  if (typeof document === 'undefined')
    return null

  return document.fullscreenElement || document.webkitFullscreenElement || null
}

function syncFlashcardFullscreenState() {
  isFlashcardFullscreen.value = getFullscreenElement() === flashcardFullscreenEl.value
}

async function requestFlashcardFullscreen(element) {
  if (element?.requestFullscreen)
    await element.requestFullscreen()
  else if (element?.webkitRequestFullscreen)
    await element.webkitRequestFullscreen()
}

async function exitFlashcardFullscreen() {
  if (typeof document === 'undefined' || getFullscreenElement() !== flashcardFullscreenEl.value)
    return

  if (document.exitFullscreen)
    await document.exitFullscreen()
  else if (document.webkitExitFullscreen)
    await document.webkitExitFullscreen()
}

async function toggleFlashcardFullscreen() {
  const element = flashcardFullscreenEl.value
  if (!element || typeof document === 'undefined')
    return

  try {
    if (getFullscreenElement() === element)
      await exitFlashcardFullscreen()
    else
      await requestFlashcardFullscreen(element)
  }
  catch {
  }
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement))
    return false

  const tagName = target.tagName.toLowerCase()
  return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || target.isContentEditable
}

function handleVocabularyFlashcardKeydown(event) {
  if (activeView.value !== 'flashcard')
    return false
  if (isTypingTarget(event.target))
    return false

  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    if (flashcardFlipped.value)
      flipFlashcard()
    return true
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    moveFlashcard(-1)
    return true
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    moveFlashcard(1)
    return true
  }

  if (event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (!flashcardFlipped.value)
      selectFlashcardPretestAndFlip('known')
    else if (flashcardPretest.value === 'known')
      confirmFlashcardBack(true)
    return true
  }

  if (event.key.toLowerCase() === 'u') {
    event.preventDefault()
    if (!flashcardFlipped.value)
      selectFlashcardPretestAndFlip('unknown')
    else if (flashcardPretest.value === 'known')
      confirmFlashcardBack(false)
    return true
  }

  if (event.key.toLowerCase() === 'r') {
    event.preventDefault()
    randomFlashcard()
    return true
  }

  if (event.key.toLowerCase() === 'm') {
    event.preventDefault()
    markFlashcardMastered()
    return true
  }

  return false
}

onMounted(() => {
  loaded.value = true
  loadFlashcardState()
  syncFlashcardFullscreenState()
  document.addEventListener('fullscreenchange', syncFlashcardFullscreenState)
  document.addEventListener('webkitfullscreenchange', syncFlashcardFullscreenState)

  // 只能同时播放一个音频
  const audioTags = document.getElementsByTagName('audio')
  for (const audio of audioTags) {
    audio.onplay = () => {
      for (const _audio of audioTags) {
        _audio.blur()
        if (audio !== _audio)
          _audio.pause()
      }
    }
  }
})

onBeforeUnmount(() => {
  clearAutoNextTimer()
  document.removeEventListener('fullscreenchange', syncFlashcardFullscreenState)
  document.removeEventListener('webkitfullscreenchange', syncFlashcardFullscreenState)
})

onUpdated(() => {
  // 音频再切换 SRC 之后需要调用一下 load() 不然看不到效果
  for (const el of document.getElementsByTagName('audio'))
    el.load()
})

document.addEventListener('keydown', (ev) => {
  if (handleVocabularyFlashcardKeydown(ev))
    return

  // 激活的那个音频可以通过方向键进行快进/退
  if (['ArrowLeft', 'ArrowRight', ' '].includes(ev.key)) {
    ev.preventDefault()
    const audioTags = document.getElementsByTagName('audio')
    const keyMap = {
      ArrowLeft: -5,
      ArrowRight: 5,
    }
    for (const audioTag of audioTags) {
      audioTag.blur()
      if (keyMap[ev.key]) {
        const step = keyMap[ev.key]
        audioTag.currentTime = audioTag.currentTime + step
        // console.log(step, audioT ag.currentTime)
      }
      if (ev.key === ' ') {
        if (audioTag.paused)
          audioTag.play()
        else
          audioTag.pause()
      }
    }
  }
})

let audio = null
function play(audioPath) {
  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  audio = document.createElement('audio')
  audio.src = audioPath
  audio.play()
}

function hasChapterAudio(categoryKey) {
  const chapter = refVocabulary[categoryKey]
  return chapter?.source === 'theme' && chapter?.audio
}

function getWordAudioPath(categoryKey, word) {
  const chapter = refVocabulary[categoryKey]
  if (chapter?.source === 'base3000')
    return `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(word)}&type=1`
  return `vocabulary/audio/${categoryKey}/${word}.mp3`
}

function copyText(item) {
  const text = `${item.word} ${item.pos} ${item.meaning}`
  navigator.clipboard.writeText(text)
}

function onInputKeydown(e) {
  e.stopPropagation()
  const { key, target } = e
  // console.log(key, target.id)
  if (key === 'Enter') {
    // 切换到下一个 input
    document.getElementById((Number(target.id) + 1).toString())?.focus()
  }
}

function onInputFocusIn(e, audioPath) {
  if (isAutoPlayWordAudio.value)
    play(audioPath)
}

function onInputFocusOut(e, item) {
  const { target } = e
  const spellValue = target.value.toLowerCase().trim()
  if (spellValue.length < 1) {
    item.spellValue = ''
    item.spellError = false
  }
  else {
    item.spellValue = spellValue
    item.spellError = !item.word.map(v => v.toLowerCase().trim()).includes(spellValue)
  }
  trainingStats.value = calcStats()
}

function getInputStyleClass(item) {
  const cls = {
    error: 'ml-4 bg-red-50 border border-red-500 text-red-900 placeholder-red-700 text-sm rounded-lg focus:ring-red-500 dark:bg-gray-700 focus:border-red-500 inline-block p-2.5 dark:text-red-500 dark:placeholder-red-500 dark:border-red-500',
    normal: 'ml-4 inline-block border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400',
    success: 'ml-4 bg-green-50 border border-green-500 text-green-900 dark:text-green-400 placeholder-green-700 dark:placeholder-green-500 text-sm rounded-lg focus:ring-green-500 focus:border-green-500 inline-block p-2.5 dark:bg-gray-700 dark:border-green-500',
  }
  if (isFinishTraining.value) {
    if (item.spellError)
      return cls.error
    if (item.spellValue.length > 0 && !item.spellError)
      return cls.success
  }
  return cls.normal
}

function copyAllError() {
  const words = refVocabulary[category.value].words
  const errorWords = []
  for (const group of words) {
    for (const item of group) {
      if (item.spellError)
        errorWords.push(`${item.word} ${item.pos} ${item.meaning}`)
    }
  }
  navigator.clipboard.writeText(errorWords.join('\n\n'))
}
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <!-- Card header -->
      <div class="items-center justify-between lg:flex">
        <div class="mb-4 lg:mb-0">
          <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
            雅思词汇真经
          </h3>
          <span class="text-base font-normal text-gray-500 dark:text-gray-400">涵盖雅思必备核心词，逻辑词群记忆法</span>
        </div>
        <div class="items-center sm:flex">
          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
              :class="vocabularyGoalMode === 'ielts-55-to-65'
                ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300'
                : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
              @click="vocabularyGoalMode = 'ielts-55-to-65'"
            >
              5.5→6.5 冲刺词
            </button>
            <button
              type="button"
              class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
              :class="vocabularyGoalMode === 'ielts-65-core'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300'
                : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
              @click="vocabularyGoalMode = 'ielts-65-core'"
            >
              6.5 核心词
            </button>
            <button
              type="button"
              class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
              :class="vocabularyGoalMode === 'all'
                ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-300'
                : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
              @click="vocabularyGoalMode = 'all'"
            >
              全部词库
            </button>
            <select
              v-model="category"
              class="block w-full flex-1 border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400"
            >
              <!-- <option value="">
                全部章节
              </option> -->
              <option v-for="chapterKey in visibleChapters" :key="chapterKey" :value="chapterKey">
                {{ chapterKey }}
              </option>
            </select>
            <button
              type="button"
              class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
              :class="activeView === 'list'
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
              @click="activeView = 'list'"
            >
              列表模式
            </button>
            <button
              type="button"
              class="group rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition"
              :class="activeView === 'flashcard'
                ? 'border-orange-300 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-200 dark:border-orange-400/40 dark:from-orange-500 dark:to-amber-500 dark:text-white'
                : 'border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-300 hover:bg-orange-100 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20'"
              @click="activeView = 'flashcard'"
            >
              <span class="inline-flex items-center gap-2">
                <span class="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-current dark:bg-black/10">
                  Flash
                </span>
                <span>闪卡模式</span>
                <span class="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-current dark:bg-black/10">
                  推荐
                </span>
              </span>
            </button>
            <button
              type="button"
              class="rounded-full border px-3 py-1.5 text-xs font-medium transition"
              :class="activeView === 'plan'
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
              @click="activeView = 'plan'"
            >
              规划模式
            </button>
            <!-- <input type="text" name="email" class="ml-3 block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-gray-900 dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 sm:text-sm dark:text-white focus:ring-primary-500 dark:focus:border-primary-500 dark:focus:ring-primary-500 dark:placeholder-gray-400" placeholder="关键词"> -->
            <!-- <div class="relative ml-2 flex-1">
              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg class="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
                </svg>
              </div>
              <input v-model="keyword" type="search"
                class="block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 pl-10 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400"
                placeholder="Search">
            </div> -->
            <label v-if="activeView === 'list'" class="ml-2 inline-flex cursor-pointer items-center">
              <input v-model="isTrainingModel" type="checkbox" class="peer sr-only">
              <div
                class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800 rtl:peer-checked:after:-translate-x-full"
              />
              <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">练习模式</span>
            </label>
            <label v-if="activeView === 'list' && isTrainingModel" class="ml-2 inline-flex cursor-pointer items-center">
              <input v-model="isShowMeaning" type="checkbox" class="peer sr-only">
              <div
                class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800 rtl:peer-checked:after:-translate-x-full"
              />
              <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">释义</span>
            </label>
            <label v-if="activeView === 'list' && isTrainingModel" class="ml-2 inline-flex cursor-pointer items-center">
              <input v-model="isShowSource" type="checkbox" class="peer sr-only">
              <div
                class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800 rtl:peer-checked:after:-translate-x-full"
              />
              <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">原词</span>
            </label>
            <label v-if="activeView === 'list' && isTrainingModel" class="ml-2 inline-flex cursor-pointer items-center">
              <input v-model="isAutoPlayWordAudio" type="checkbox" class="peer sr-only">
              <div
                class="peer relative h-6 w-11 rounded-full bg-gray-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:border after:border-gray-300 dark:border-gray-600 after:rounded-full after:bg-white dark:bg-gray-700 peer-checked:bg-blue-600 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 after:transition-all after:content-[''] peer-checked:after:translate-x-full peer-checked:after:border-white dark:peer-focus:ring-blue-800 rtl:peer-checked:after:-translate-x-full"
              />
              <span class="ms-3 text-sm font-medium text-gray-900 dark:text-gray-300">自动播放</span>
            </label>
            <span v-if="activeView === 'flashcard' || activeView === 'plan'" class="ml-2 text-xs text-gray-500 dark:text-gray-400">
              {{
                activeView === 'flashcard'
                  ? '点击橙色闪卡按钮后可进入强化记忆模式'
                  : activeView === 'plan'
                    ? '按天拆分学习任务，照着执行即可'
                    : ''
              }}
            </span>
          </div>
        </div>
      </div>
      <div class="mt-6 space-y-4">
        <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-500/30 dark:bg-emerald-500/10">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p class="text-xs font-semibold tracking-wide uppercase text-emerald-700 dark:text-emerald-300">
                当前目标词库
              </p>
              <h4 class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {{
                  vocabularyGoalMode === 'ielts-55-to-65'
                    ? '5.5 → 6.5 冲刺词'
                    : vocabularyGoalMode === 'ielts-65-core'
                      ? '雅思 6.5 核心词'
                      : '全部词库'
                }}
              </h4>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                {{
                  vocabularyGoalMode === 'ielts-55-to-65'
                    ? '基于 6.5 核心词再去掉一批明显基础词，默认更适合当前约 5.5 分、想节省复习时间的用户。'
                    : vocabularyGoalMode === 'ielts-65-core'
                    ? '保留全部基础词，并优先保留教育、科技、环境、社会、法律、健康等雅思高频主题词。'
                    : '显示项目中的全部词表，包含核心词和扩展主题词。'
                }}
              </p>
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              {{ vocabularyGoalSummary.chapterCount }} 个词表 · {{ vocabularyGoalSummary.totalWords }} 个词
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-600 dark:bg-slate-900/40">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p class="text-xs font-semibold tracking-wide uppercase text-slate-500 dark:text-slate-400">
                当前词表概览
              </p>
              <h4 class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                {{ currentChapterSummary.key }}
              </h4>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                生词含未标记和不认识；复习中表示已认识但还在常规复习；熟词表示已进入低频维护。
              </p>
            </div>
            <div class="text-sm text-gray-500 dark:text-gray-400">
              共 {{ currentChapterSummary.total }} 个词
            </div>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-4">
            <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-950/60">
              <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">生词</p>
              <p class="mt-1 text-lg font-semibold text-amber-700 dark:text-amber-300">{{ currentChapterSummary.unfamiliar }}</p>
            </div>
            <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-950/60">
              <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">复习中</p>
              <p class="mt-1 text-lg font-semibold text-blue-700 dark:text-blue-300">{{ currentChapterSummary.reviewing }}</p>
            </div>
            <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-950/60">
              <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">熟词</p>
              <p class="mt-1 text-lg font-semibold text-teal-700 dark:text-teal-300">{{ currentChapterSummary.mastered }}</p>
            </div>
            <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-950/60">
              <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">待抽查熟词</p>
              <p class="mt-1 text-lg font-semibold text-cyan-700 dark:text-cyan-300">{{ currentChapterSummary.dueMastered }}</p>
            </div>
          </div>
        </div>

        <div class="rounded-2xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p class="text-xs font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">
                全部词表进度
              </p>
              <h4 class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                按词表查看积压
              </h4>
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                直接看当前目标词库里每个词表的生词、复习中和熟词数量，点击卡片可切换。
              </p>
            </div>
          </div>

          <div class="mt-4 grid gap-3 xl:grid-cols-4 lg:grid-cols-3 sm:grid-cols-2">
            <button
              v-for="summary in chapterSummaries"
              :key="summary.key"
              type="button"
              class="rounded-2xl border p-4 text-left transition"
              :class="summary.key === category
                ? 'border-blue-300 bg-blue-50 shadow-sm dark:border-blue-500/40 dark:bg-blue-500/10'
                : 'border-gray-200 bg-gray-50 hover:border-blue-200 hover:bg-blue-50/60 dark:border-gray-700 dark:bg-slate-900/40 dark:hover:border-blue-500/30 dark:hover:bg-blue-500/5'"
              @click="category = summary.key"
            >
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-gray-900 dark:text-white">
                    {{ summary.key }}
                  </p>
                  <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    共 {{ summary.total }} 个词
                  </p>
                </div>
                <span
                  v-if="summary.dueMastered"
                  class="rounded-full bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300"
                >
                  抽查 {{ summary.dueMastered }}
                </span>
              </div>
              <div class="mt-4 grid grid-cols-3 gap-2 text-sm">
                <div class="rounded-xl bg-amber-50 px-3 py-2 dark:bg-amber-500/10">
                  <p class="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-300">生词</p>
                  <p class="mt-1 font-semibold text-amber-800 dark:text-amber-200">{{ summary.unfamiliar }}</p>
                </div>
                <div class="rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-500/10">
                  <p class="text-[11px] uppercase tracking-wide text-blue-700 dark:text-blue-300">复习中</p>
                  <p class="mt-1 font-semibold text-blue-800 dark:text-blue-200">{{ summary.reviewing }}</p>
                </div>
                <div class="rounded-xl bg-teal-50 px-3 py-2 dark:bg-teal-500/10">
                  <p class="text-[11px] uppercase tracking-wide text-teal-700 dark:text-teal-300">熟词</p>
                  <p class="mt-1 font-semibold text-teal-800 dark:text-teal-200">{{ summary.mastered }}</p>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
      <div
        v-if="activeView === 'flashcard' && activePlanWordKeys.length"
        class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm dark:border-sky-500/30 dark:bg-sky-500/10"
      >
        <div>
          <p class="text-xs font-semibold tracking-wide uppercase text-sky-700 dark:text-sky-300">
            当前任务闪卡
          </p>
          <p class="mt-1 font-medium text-gray-900 dark:text-white">
            {{ activePlanLabel }}
          </p>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
            当前只显示这次计划里安排的单词。
          </p>
        </div>
        <button
          type="button"
          class="rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 dark:border-sky-500/30 dark:bg-slate-900 dark:text-sky-300 dark:hover:bg-slate-800"
          @click="clearPlanFlashcards"
        >
          查看全部闪卡
        </button>
      </div>

      <div v-if="activeView === 'list'" class="mt-6 flex flex-col">
        <div class="overflow-x-auto rounded-lg">
          <div class="inline-block min-w-full align-middle">
            <div class="overflow-hidden shadow sm:rounded-lg">
              <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-600">
                <thead class="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      #
                    </th>
                    <th class="p-4 text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      <br>
                    </th>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      词
                    </th>
                    <th class="w-0 text-left text-xs font-medium text-gray-500 dark:text-white">
                      词性
                    </th>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      词义
                    </th>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      例句
                    </th>
                    <th class="p-4 text-left text-xs font-medium tracking-wider text-gray-500 dark:text-white">
                      拓展
                    </th>
                  </tr>
                </thead>
                <tbody class="bg-white dark:bg-gray-800">
                  <tr class="bg-hex-f3f3f3">
                    <td
                      colspan="7"
                      class="px-4 py-6 text-sm font-normal text-gray-900 dark:bg-gray-500 dark:text-white"
                    >
                      <div class="flex flex-row">
                        <div class="flex flex-1 items-center">
                          <span class="text-lg">{{ category }}</span>
                          （ {{ refVocabulary[category].groupCount }} 组 {{ refVocabulary[category].wordCount }} 个词 ）
                        </div>
                        <div v-if="hasChapterAudio(category)" class="justify-items-end">
                          <audio controls class="chapter">
                            <source :src="`vocabulary/audio/${refVocabulary[category].audio}`" type="audio/mpeg">
                          </audio>
                        </div>
                      </div>
                    </td>
                  </tr>
                  <template v-for="(wordGroup, i) of refVocabulary[category].words" :key="wordGroup.label">
                    <tr
                      v-for="item of wordGroup"
                      v-show="(isTrainingModel && (isOnlyShowErrors ? item.spellError : true)) || !isTrainingModel" :id="`tr_${item.id}`"
                      :key="item.id"
                      :class="{ 'bg-gray-50 dark:bg-gray-700': item.id % 2 === 0, [`group-color-${i % 15}`]: true }" class="text-sm text-gray-900 dark:text-white"
                    >
                      <td class="p-4">
                        {{ item.id }}
                      </td>
                      <td>
                        <i
                          class="i-ph-speaker-simple-high-bold inline-block cursor-pointer"
                          @click="play(getWordAudioPath(category, item.word[0]))"
                        />

                        <template v-if="isTrainingModel">
                          <i
                            :class="`${item.showSource ? 'i-ph-eye-slash-bold' : 'i-ph-eye-bold'} inline-block cursor-pointer ml-4`"
                            title="显示原词" @click="item.showSource = !item.showSource"
                          />
                          <input
                            :id="item.id" autocomplete="off" :class="getInputStyleClass(item)"
                            type="text"
                            @focusout="onInputFocusOut($event, item)" 
                            @focusin="onInputFocusIn($event, getWordAudioPath(category, item.word[0]))" 
                            @keydown="onInputKeydown"
                          >
                        </template>
                      </td>
                      <td class="group relative whitespace-nowrap p-4">
                        <div v-if="!isTrainingModel || item.showSource || (isTrainingModel && isOnlyShowErrors && item.spellError) || isShowSource">
                          <p v-for="w in item.word" :key="w">
                            <a
                              class="hover:underline" :title="`在剑桥词典中查询 ${w}`" target="_blank"
                              :href="`https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${w}`"
                            >{{ w }}</a>
                          </p>
                          <div
                            class="absolute right-0 top-0 hidden h-100% items-center group-hover:flex"
                            @click="copyText(item)"
                          >
                            <i class="i-ph-copy block cursor-pointer px-4" />
                          </div>
                        </div>
                      </td>
                      <td style="font-style: italic; font-family: times;">
                        {{ item.pos }}
                      </td>
                      <td class="p-4">
                        {{ isShowMeaning ? item.meaning : '' }}
                      </td>
                      <td class="p-4">
                        <template v-if="!isTrainingModel && getVocabularyExampleText(item)">
                          <p>
                            {{ getVocabularyExampleText(item) }}
                          </p>
                          <button
                            type="button"
                            class="mt-2 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                            @click="toggleExampleTranslation(item)"
                          >
                            {{
                              isExampleTranslationLoading(item)
                                ? '翻译中...'
                                : isExampleTranslationVisible(item)
                                  ? '收起翻译'
                                  : '翻译'
                            }}
                          </button>
                          <p
                            v-if="isExampleTranslationVisible(item) && getExampleTranslation(item)"
                            class="mt-2 text-sm text-slate-600 dark:text-slate-300"
                          >
                            {{ getExampleTranslation(item) }}
                          </p>
                          <p
                            v-else-if="isExampleTranslationVisible(item) && getExampleTranslationError(item)"
                            class="mt-2 text-sm text-rose-600 dark:text-rose-300"
                          >
                            {{ getExampleTranslationError(item) }}
                          </p>
                        </template>
                      </td>
                      <td class="p-4">
                        {{ isTrainingModel ? '' : getVocabularyExtraText(item) }}
                      </td>
                    </tr>
                  </template>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
      <div v-else-if="activeView === 'flashcard'" class="mt-6">
        <div class="grid mb-4 gap-3 xl:grid-cols-8 lg:grid-cols-4 sm:grid-cols-2">
          <div class="rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-gray-700/50">
            <p class="text-xs tracking-wide uppercase text-gray-500 dark:text-gray-400">
              总词数
            </p>
            <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
              {{ flashcardStats.total }}
            </p>
          </div>
          <div class="rounded-xl bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-500/10">
            <p class="text-xs tracking-wide uppercase text-emerald-700 dark:text-emerald-300">
              我认识
            </p>
            <p class="mt-1 text-lg font-semibold text-emerald-800 dark:text-emerald-200">
              {{ flashcardStats.known }}
            </p>
          </div>
          <div class="rounded-xl bg-teal-50 px-4 py-3 text-sm dark:bg-teal-500/10">
            <p class="text-xs tracking-wide uppercase text-teal-700 dark:text-teal-300">
              主动标熟
            </p>
            <p class="mt-1 text-lg font-semibold text-teal-800 dark:text-teal-200">
              {{ flashcardStats.masteredByUser }}
            </p>
          </div>
          <div class="rounded-xl bg-cyan-50 px-4 py-3 text-sm dark:bg-cyan-500/10">
            <p class="text-xs tracking-wide uppercase text-cyan-700 dark:text-cyan-300">
              待抽查熟词
            </p>
            <p class="mt-1 text-lg font-semibold text-cyan-800 dark:text-cyan-200">
              {{ flashcardStats.masteredDue }}
            </p>
          </div>
          <div class="rounded-xl bg-amber-50 px-4 py-3 text-sm dark:bg-amber-500/10">
            <p class="text-xs tracking-wide uppercase text-amber-700 dark:text-amber-300">
              不认识
            </p>
            <p class="mt-1 text-lg font-semibold text-amber-800 dark:text-amber-200">
              {{ flashcardStats.unknown }}
            </p>
          </div>
          <div class="rounded-xl bg-blue-50 px-4 py-3 text-sm dark:bg-blue-500/10">
            <p class="text-xs tracking-wide uppercase text-blue-700 dark:text-blue-300">
              未标记
            </p>
            <p class="mt-1 text-lg font-semibold text-blue-800 dark:text-blue-200">
              {{ flashcardStats.unmarked }}
            </p>
          </div>
          <div class="rounded-xl bg-purple-50 px-4 py-3 text-sm dark:bg-purple-500/10">
            <p class="text-xs tracking-wide uppercase text-purple-700 dark:text-purple-300">
              今日复习进度
            </p>
            <p class="mt-1 text-lg font-semibold text-purple-800 dark:text-purple-200">
              {{ flashcardStats.reviewedToday }} / {{ flashcardStats.total }}
            </p>
          </div>
          <div class="rounded-xl bg-amber-50 px-4 py-3 text-sm dark:bg-amber-500/10">
            <p class="text-xs tracking-wide uppercase text-amber-700 dark:text-amber-300">
              5+ 次
            </p>
            <p class="mt-1 text-lg font-semibold text-amber-800 dark:text-amber-200">
              {{ flashcardStats.fivePlus }}
            </p>
          </div>
          <div class="rounded-xl bg-blue-50 px-4 py-3 text-sm dark:bg-blue-500/10">
            <p class="text-xs tracking-wide uppercase text-blue-700 dark:text-blue-300">
              10+ 次
            </p>
            <p class="mt-1 text-lg font-semibold text-blue-800 dark:text-blue-200">
              {{ flashcardStats.tenPlus }}
            </p>
          </div>
          <div class="rounded-xl bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-500/10">
            <p class="text-xs tracking-wide uppercase text-emerald-700 dark:text-emerald-300">
              烂熟于心
            </p>
            <p class="mt-1 text-lg font-semibold text-emerald-800 dark:text-emerald-200">
              {{ flashcardStats.overlearned }}
            </p>
          </div>
        </div>

        <div class="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="border rounded-full px-3 py-1 text-xs font-medium transition"
            :class="flashcardReviewOptions.reviewMode === 'active'
              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
              : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
            @click="setReviewMode('active')"
          >
            常规复习
          </button>
          <button
            type="button"
            class="border rounded-full px-3 py-1 text-xs font-medium transition"
            :class="flashcardReviewOptions.reviewMode === 'all'
              ? 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-500/30 dark:bg-slate-500/10 dark:text-slate-300'
              : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
            @click="setReviewMode('all')"
          >
            全部单词
          </button>
          <button
            type="button"
            class="border rounded-full px-3 py-1 text-xs font-medium transition"
            :class="flashcardReviewOptions.reviewMode === 'unknown'
              ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300'
              : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
            @click="setReviewMode('unknown')"
          >
            只复习“不认识”
          </button>
          <button
            type="button"
            class="border rounded-full px-3 py-1 text-xs font-medium transition"
            :class="flashcardReviewOptions.reviewMode === 'unmarked'
              ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300'
              : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
            @click="setReviewMode('unmarked')"
          >
            只复习“未标记”
          </button>
          <button
            type="button"
            class="border rounded-full px-3 py-1 text-xs font-medium transition"
            :class="flashcardReviewOptions.reviewMode === 'mastered'
              ? 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300'
              : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
            @click="setReviewMode('mastered')"
          >
            只看熟词
          </button>
          <button
            type="button"
            class="border rounded-full px-3 py-1 text-xs font-medium transition"
            :class="flashcardReviewOptions.shuffle
              ? 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300'
              : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
            @click="flashcardReviewOptions.shuffle = !flashcardReviewOptions.shuffle"
          >
            {{ flashcardReviewOptions.shuffle ? '自动打乱复习中' : '自动打乱复习' }}
          </button>
          <button
            type="button"
            class="border rounded-full px-3 py-1 text-xs font-medium transition"
            :class="flashcardReviewOptions.autoNextAfterFlip
              ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300'
              : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
            @click="flashcardReviewOptions.autoNextAfterFlip = !flashcardReviewOptions.autoNextAfterFlip"
          >
            {{ flashcardReviewOptions.autoNextAfterFlip ? '确认后自动下一张中' : '确认后自动下一张' }}
          </button>
          <button
            type="button"
            class="border rounded-full border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
            @click="clearAllVocabularyFlashcardProgress"
          >
            清除闪卡学习记录
          </button>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            `U`=不认识并翻面且已自动记入不认识；正面 `K`=认识翻面后背面 `K`/`U` 选对错；`M`=标熟词并默认跳过常规复习；`Space`/`Enter` 仅背面翻回正面；`←/→` 切卡，`R` 随机
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            正面选「不认识」翻面即记入不认识；选「认识」后点「错」也会标记为不认识，可用「只复习不认识」筛选
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            「常规复习」默认隐藏熟词，但到期抽查的熟词会自动回到队列；如需检查，可切到「只看熟词」或「全部单词」
          </span>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            当前词库：{{ category }}
          </span>
        </div>

        <div
          v-if="currentFlashcard"
          ref="flashcardFullscreenEl"
          class="mx-auto max-w-6xl w-full"
          :class="isFlashcardFullscreen ? 'max-w-none h-full w-full flex flex-col justify-center bg-gray-950 px-4 py-6 sm:px-8' : ''"
        >
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400" :class="isFlashcardFullscreen ? 'text-gray-300' : ''">
            <div class="flex items-center gap-3">
              <span class="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-700">{{ category }}</span>
              <span>{{ flashcardIndex + 1 }} / {{ flashcardDeck.length }}</span>
              <span
                class="rounded-full border px-3 py-1 font-medium"
                :class="getMemoryStageMeta(currentFlashcard.statusKey, category).className"
                :title="getMemoryStageMeta(currentFlashcard.statusKey, category).hint"
              >
                {{ getMemoryStageMeta(currentFlashcard.statusKey, category).label }}
              </span>
              <span class="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                已记住 {{ getFlashcardMemoryCount(currentFlashcard.statusKey) }} 次
              </span>
              <span
                class="rounded-full px-3 py-1"
                :class="getFlashcardStatus(currentFlashcard.statusKey) === 'known'
                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                  : getFlashcardStatus(currentFlashcard.statusKey) === 'unknown'
                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                    : getFlashcardStatus(currentFlashcard.statusKey) === 'mastered'
                      ? 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300'
                    : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'"
              >
                {{
                  getFlashcardStatus(currentFlashcard.statusKey) === 'known'
                    ? '已标记：我认识'
                    : getFlashcardStatus(currentFlashcard.statusKey) === 'unknown'
                      ? '已标记：不认识'
                      : getFlashcardStatus(currentFlashcard.statusKey) === 'mastered'
                        ? '已标记：熟词直过'
                      : '未标记'
                }}
              </span>
              <span
                v-if="getFlashcardStatus(currentFlashcard.statusKey) === 'mastered'"
                class="rounded-full px-3 py-1"
                :class="isFlashcardDueForMasteredCheck(currentFlashcard.statusKey)
                  ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-500/10 dark:text-cyan-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'"
              >
                {{ isFlashcardDueForMasteredCheck(currentFlashcard.statusKey) ? '抽查到期' : '低频维护中' }}
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                @click="toggleFlashcardFullscreen"
              >
                {{ isFlashcardFullscreen ? '退出全屏' : '全屏' }}
              </button>
              <button
                type="button"
                class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                @click="moveFlashcard(-1)"
              >
                上一张
              </button>
              <button
                type="button"
                class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                @click="randomFlashcard"
              >
                随机
              </button>
              <button
                type="button"
                class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                @click="moveFlashcard(1)"
              >
                下一张
              </button>
            </div>
          </div>

          <button
            type="button"
            class="w-full border border-sky-200 rounded-2xl bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-100 p-8 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-sky-700/60 dark:from-slate-800 dark:via-sky-900/40 dark:to-slate-900 dark:hover:border-blue-500/40"
            :class="[
              isFlashcardFullscreen ? 'min-h-[calc(100vh-9rem)] border-sky-300 from-sky-100 via-blue-50 to-cyan-100 dark:border-sky-700 dark:from-slate-900 dark:via-sky-950/70 dark:to-slate-950' : '',
              flashcardFlipped ? 'cursor-pointer' : '',
            ]"
            @click="onFlashcardShellClick"
          >
            <div v-if="!flashcardFlipped" class="min-h-[320px] flex flex-col items-center justify-center text-center">
              <p class="mb-6 text-3xl font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">
                Flashcard Front
              </p>
              <div class="mb-6 flex flex-wrap items-center justify-center gap-3 text-xl">
                <span
                  class="rounded-full border px-4 py-1.5 font-medium"
                  :class="getMemoryStageMeta(currentFlashcard.statusKey, category).className"
                >
                  {{ getMemoryStageMeta(currentFlashcard.statusKey, category).label }}
                </span>
                <span class="rounded-full bg-slate-100 px-4 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  已记住 {{ getFlashcardMemoryCount(currentFlashcard.statusKey) }} 次
                </span>
              </div>
              <h4 class="text-[6.75rem] leading-none font-bold text-gray-900 dark:text-white">
                {{ currentFlashcard.word[0] }}
              </h4>
              <p class="mt-6 text-3xl text-gray-500 dark:text-gray-400">
                {{ currentFlashcard.pos }}
              </p>
              <p class="mt-8 text-lg text-gray-500 dark:text-gray-400">
                <kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800">K</kbd> 认识 → 翻面后需对照释义点「对/错」；
                <kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800">U</kbd> 不认识 → 翻面即记入「不认识」，直接看释义即可
              </p>
              <p v-if="getFlashcardStatus(currentFlashcard.statusKey) === 'mastered'" class="mt-4 text-lg text-cyan-700 dark:text-cyan-300">
                这张卡已在熟词队列中。到期时会回到常规复习做低频抽查。
              </p>
              <div class="mt-8 flex flex-wrap items-center justify-center gap-4" @click.stop>
                <button
                  type="button"
                  class="rounded-xl border-2 border-gray-200 bg-white px-8 py-4 text-2xl font-semibold text-gray-700 transition hover:border-emerald-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  @click="selectFlashcardPretestAndFlip('known')"
                >
                  认识
                  <span class="mt-1 block text-sm font-normal opacity-70">K</span>
                </button>
                <button
                  type="button"
                  class="rounded-xl border-2 border-gray-200 bg-white px-8 py-4 text-2xl font-semibold text-gray-700 transition hover:border-amber-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                  @click="selectFlashcardPretestAndFlip('unknown')"
                >
                  不认识
                  <span class="mt-1 block text-sm font-normal opacity-70">U</span>
                </button>
                <button
                  type="button"
                  class="rounded-xl border-2 border-teal-200 bg-teal-50 px-8 py-4 text-2xl font-semibold text-teal-700 transition hover:border-teal-300 dark:border-teal-500/40 dark:bg-teal-500/15 dark:text-teal-200"
                  @click="markFlashcardMastered"
                >
                  熟词直过
                  <span class="mt-1 block text-sm font-normal opacity-70">M · 跳过常规复习</span>
                </button>
              </div>
              <p class="mt-8 text-xl text-amber-600 dark:text-amber-400">
                选认识后：背面用 <kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800">K</kbd>（对）/ <kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800">U</kbd>（错）；<kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800">M</kbd> 可直接标熟词；<kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800">Space</kbd> 可翻回正面
              </p>
            </div>

            <div v-else class="min-h-[320px]">
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                  <p class="text-3xl font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">
                    Flashcard Back
                  </p>
                  <p v-if="flashcardPretest === 'known'" class="mt-2 text-xl text-gray-600 dark:text-gray-300">
                    {{
                      getFlashcardStatus(currentFlashcard.statusKey) === 'mastered'
                        ? '这是一次熟词抽查——请对照释义，用「对 / 错」判断是否仍能稳定回忆'
                        : '你正面选了「认识」——请对照释义，用「对 / 错」判断回忆是否准确'
                    }}
                  </p>
                  <p v-else class="mt-2 text-xl text-amber-800 dark:text-amber-200">
                    你已选「不认识」：已自动记入「不认识」，请认真阅读下方释义与例句
                  </p>
                  <h4 class="mt-3 text-7xl leading-none font-bold text-gray-900 dark:text-white">
                    {{ currentFlashcard.word[0] }}
                  </h4>
                  <p class="phonetic-text mt-4 text-2xl font-medium text-sky-700 dark:text-sky-300">
                    /{{ flashcardBackPhoneticLoading ? '...' : (flashcardBackPhonetic || '暂未查到') }}/
                  </p>
                  <p class="mt-4 text-3xl text-gray-500 dark:text-gray-400">
                    {{ currentFlashcard.pos }} · {{ currentFlashcard.meaning }}
                  </p>
                  <div class="mt-5 flex flex-wrap items-center gap-3 text-xl">
                    <span
                      class="rounded-full border px-4 py-1.5 font-medium"
                      :class="getMemoryStageMeta(currentFlashcard.statusKey, category).className"
                    >
                      {{ getMemoryStageMeta(currentFlashcard.statusKey, category).label }}
                    </span>
                    <span class="rounded-full bg-slate-100 px-4 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      已记住 {{ getFlashcardMemoryCount(currentFlashcard.statusKey) }} 次
                    </span>
                    <span class="text-lg text-gray-500 dark:text-gray-400">
                      {{ getMemoryStageMeta(currentFlashcard.statusKey, category).hint }}
                    </span>
                    <span v-if="getFlashcardStatus(currentFlashcard.statusKey) === 'mastered'" class="text-lg text-cyan-700 dark:text-cyan-300">
                      已通过抽查 {{ getMasteredCheckCount(currentFlashcard.statusKey) }} 次
                    </span>
                  </div>
                </div>
                <div class="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center" @click.stop>
                  <template v-if="flashcardPretest === 'known'">
                    <button
                      type="button"
                      class="border border-emerald-300 rounded-lg bg-emerald-50 px-5 py-3 text-2xl font-semibold text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/25"
                      @click="confirmFlashcardBack(true)"
                    >
                      对
                      <span class="mt-1 block text-sm font-normal opacity-80">{{ getFlashcardStatus(currentFlashcard.statusKey) === 'mastered' ? '抽查通过 → 继续留在熟词队列 · 快捷键 K' : '与背面一致 → 我认识 · 快捷键 K' }}</span>
                    </button>
                    <button
                      type="button"
                      class="border border-red-300 rounded-lg bg-red-50 px-5 py-3 text-2xl font-semibold text-red-800 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-500/25"
                      @click="confirmFlashcardBack(false)"
                    >
                      错
                      <span class="mt-1 block text-sm font-normal opacity-80">{{ getFlashcardStatus(currentFlashcard.statusKey) === 'mastered' ? '抽查失败 → 降级为不认识并回到常规复习 · 快捷键 U' : '记错了 → 标记不认识 · 快捷键 U' }}</span>
                    </button>
                  </template>
                  <button
                    type="button"
                    class="border border-teal-300 rounded-lg bg-teal-50 px-5 py-3 text-2xl font-semibold text-teal-800 dark:border-teal-500/40 dark:bg-teal-500/15 dark:text-teal-200 hover:bg-teal-100 dark:hover:bg-teal-500/25"
                    @click="markFlashcardMastered"
                  >
                    标为熟词
                    <span class="mt-1 block text-sm font-normal opacity-80">跳过常规复习 · 快捷键 M</span>
                  </button>
                  <button
                    type="button"
                    class="i-carbon-volume-up-filled text-5xl text-gray-500 dark:text-gray-400 hover:text-blue-600"
                    :title="`播放 ${currentFlashcard.word[0]} 发音`"
                    @click="play(getWordAudioPath(category, currentFlashcard.word[0]))"
                  />
                </div>
              </div>

                <div class="mt-8 space-y-7 text-3xl text-gray-700 dark:text-gray-200">
                <div class="rounded-xl bg-blue-50 px-4 py-4 dark:bg-blue-500/10">
                  <p class="text-2xl font-medium tracking-wide uppercase text-blue-700 dark:text-blue-300">
                    {{ currentMemoryAid.title }}
                  </p>
                  <template v-if="currentMemoryAid.type === 'formation'">
                    <div class="mt-3 space-y-3 text-blue-900 dark:text-blue-100">
                      <div class="flex flex-wrap gap-2">
                        <span
                          v-for="part in currentMemoryAid.parts"
                          :key="part.text"
                          class="rounded-full bg-white/80 px-3 py-1 text-2xl font-medium dark:bg-slate-900/40"
                        >
                          {{ part.text }} = {{ part.meaning }}
                        </span>
                      </div>
                      <p class="leading-[1.5]">
                        {{ currentMemoryAid.bridge }}
                      </p>
                      <p class="text-2xl font-medium">
                        词义：{{ currentMemoryAid.final }}
                      </p>
                    </div>
                  </template>
                  <p v-else class="mt-3 leading-[1.5] text-blue-900 dark:text-blue-100">
                    {{ currentMemoryAid.content }}
                  </p>
                </div>
                <div @click.stop>
                  <template v-if="getVocabularyExampleText(currentFlashcard)">
                  <div class="flex flex-wrap items-center gap-3">
                    <p class="text-2xl font-medium tracking-wide uppercase text-gray-500 dark:text-gray-400">
                      例句
                    </p>
                    <button
                      type="button"
                      class="rounded-md border border-blue-200 bg-blue-50 px-3 py-1 text-sm font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20"
                      @click.stop="toggleExampleTranslation(currentFlashcard)"
                    >
                      {{
                        isExampleTranslationLoading(currentFlashcard)
                          ? '翻译中...'
                          : isExampleTranslationVisible(currentFlashcard)
                            ? '收起翻译'
                            : '翻译'
                      }}
                    </button>
                  </div>
                  <p class="mt-3 leading-[1.5]">
                    {{ getVocabularyExampleText(currentFlashcard) }}
                  </p>
                  <p
                    v-if="isExampleTranslationVisible(currentFlashcard) && getExampleTranslation(currentFlashcard)"
                    class="mt-3 rounded-xl bg-slate-50 px-4 py-3 text-[0.9em] text-slate-700 dark:bg-slate-800/70 dark:text-slate-200"
                  >
                    {{ getExampleTranslation(currentFlashcard) }}
                  </p>
                  <p
                    v-else-if="isExampleTranslationVisible(currentFlashcard) && getExampleTranslationError(currentFlashcard)"
                    class="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-[0.9em] text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
                  >
                    {{ getExampleTranslationError(currentFlashcard) }}
                  </p>
                  </template>
                </div>
                <div>
                  <template v-if="getVocabularyExtraText(currentFlashcard)">
                  <p class="text-2xl font-medium tracking-wide uppercase text-gray-500 dark:text-gray-400">
                    补充
                  </p>
                  <p class="mt-3 leading-[1.5]">
                    {{ getVocabularyExtraText(currentFlashcard) }}
                  </p>
                  </template>
                </div>
              </div>
            </div>
          </button>
        </div>
        <div v-else class="border border-gray-300 rounded-xl border-dashed px-6 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          当前筛选条件下没有可用单词，请调整章节或筛选后再试。
        </div>
      </div>
      <div v-else-if="activeView === 'plan'" class="mt-6 space-y-4">
        <div class="rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-500/30 dark:bg-sky-500/10">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p class="text-xs font-semibold tracking-wide uppercase text-sky-700 dark:text-sky-300">Study Planner</p>
              <h4 class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{{ category }} 学习规划</h4>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">按天拆分这个词表的任务，并把每天任务直接送进闪卡模式。</p>
              <p class="mt-2 text-sm text-teal-700 dark:text-teal-300">已标为熟词的单词默认不进入计划。</p>
              <p class="mt-2 text-sm text-cyan-700 dark:text-cyan-300">但到期抽查的熟词会重新进入计划，每次按 1 次核验计算。</p>
            </div>
            <label class="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
              <span>计划天数</span>
              <input v-model="planningDays" type="number" min="1" max="60" class="w-24 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-sky-400 dark:border-sky-500/30 dark:bg-slate-900 dark:text-white">
            </label>
          </div>
          <div class="mt-4 grid gap-3 lg:grid-cols-4 sm:grid-cols-2">
            <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-900/70">
              <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">当前词数</p>
              <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ chapterWords.length }}</p>
            </div>
            <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-900/70">
              <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">未达标词数</p>
              <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ chapterPlan.outstandingWords }}</p>
            </div>
            <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-900/70">
              <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">剩余记忆次数</p>
              <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ chapterPlan.totalRemainingHits }}</p>
            </div>
            <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-900/70">
              <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">目标次数</p>
              <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">每词 {{ chapterPlanTarget }} 次</p>
            </div>
          </div>
        </div>

        <div
          v-for="day in chapterPlan.days"
          :key="day.dayNumber"
          class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
        >
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">Day {{ day.dayNumber }}</p>
              <h5 class="mt-1 text-xl font-bold text-gray-900 dark:text-white">第 {{ day.dayNumber }} 天任务</h5>
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">今天安排 {{ day.totalWords }} 个重点词，还需补 {{ day.totalRemainingHits }} 次正确记忆。</p>
            </div>
            <button
              type="button"
              class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:disabled:bg-gray-900 dark:disabled:text-gray-500"
              :disabled="!day.totalWords"
              @click="startPlanFlashcards(day)"
            >
              {{ day.totalWords ? '开始当天闪卡' : '今天以复习已学内容为主' }}
            </button>
          </div>
          <div class="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900/40 dark:text-gray-300">
            <p>建议词：{{ formatPlanWordPreview(day.words, 8) }}</p>
          </div>
          <div class="mt-4 rounded-xl bg-slate-50 px-4 py-4 dark:bg-slate-900/60">
            <p class="text-sm font-semibold text-gray-900 dark:text-white">当天具体学习建议</p>
            <ul class="mt-3 ml-5 list-disc space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <li v-for="tip in day.suggestions" :key="tip">{{ tip }}</li>
            </ul>
          </div>
        </div>
      </div>
      
      <!-- Card Footer -->
      <div class="flex items-center justify-between pt-3 sm:pt-6">
        <div>
          <p v-if="activeView === 'list' && isTrainingModel">
            {{ trainingStats }}
          </p>
        </div>
        <div v-if="activeView === 'list' && isTrainingModel" class="flex-shrink-0">
          <button
            type="button"
            class="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            @click="isFinishTraining = true"
          >
            完成练习
          </button>
          <button
            type="button"
            class="ml-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            @click="isOnlyShowErrors = !isOnlyShowErrors"
          >
            {{ isOnlyShowErrors ? '展示所有' : '仅展示错词' }}
          </button>
          <button
            type="button"
            class="ml-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
            @click="copyAllError"
          >
            拷贝错词
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Gentium+Plus:wght@400;700&display=swap');

.phonetic-text {
  font-family: 'Gentium Plus', 'Charis SIL', 'Doulos SIL', 'Times New Roman', 'Noto Sans', 'Segoe UI Symbol', 'Arial Unicode MS', serif;
  letter-spacing: 0.01em;
  font-variant-ligatures: none;
  font-feature-settings: 'liga' 0, 'clig' 0;
}
</style>
