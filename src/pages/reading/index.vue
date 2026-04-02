<script setup>
import keywordMarkdown from './538keyword.md?raw'
import words from './reading538words'

const ws = reactive(words)

const activeTab = ref('keywords')
const activeKeywordView = ref('list')
const planningDays = ref(7)
const activePlanLabel = ref('')
const activePlanWordKeys = ref([])
const flashcardCategoryFilter = ref('all')
const keyword = ref('')
const columnVisibility = reactive({
  word: true,
  type: true,
  meaning: true,
  synonyms: true,
})
const flashcardIndex = ref(0)
const flashcardFlipped = ref(false)
const flashcardPretest = ref(null)
const flashcardReviewOptions = reactive({
  reviewMode: 'all',
  shuffle: false,
  autoNextAfterFlip: false,
})
const flashcardStatuses = reactive({})
const flashcardReviewedAt = reactive({})
const flashcardMemoryCounts = reactive({})
const flashcardOrder = ref([])
const flashcardFullscreenEl = ref(null)
const isFlashcardFullscreen = ref(false)
const FLASHCARD_STATUS_STORAGE_KEY = 'reading-538-flashcard-statuses'
const FLASHCARD_REVIEWED_AT_STORAGE_KEY = 'reading-538-flashcard-reviewed-at'
const FLASHCARD_MEMORY_COUNT_STORAGE_KEY = 'reading-538-flashcard-memory-counts'
let autoNextTimer = null
const scoreTable = [
  ['39-40', '9.0'],
  ['37-38', '8.5'],
  ['35-36', '8.0'],
  ['33-34', '7.5'],
  ['30-32', '7.0'],
  ['27-29', '6.5'],
  ['23-26', '6.0'],
  ['20-22', '5.5'],
  ['16-19', '5.0'],
  ['13-15', '4.5'],
  ['10-12', '4.0'],
  ['6-9', '3.5'],
  ['4-5', '3.0'],
  ['3', '2.5'],
  ['2', '2.0'],
  ['1', '1.0'],
  ['absent', '0.0'],
]
const questionTypes = [
  {
    title: '1. 判断类',
    subtitle: 'TRUE / FALSE / NOT GIVEN',
    points: [
      'TRUE = 与原文一致',
      'FALSE = 与原文相反',
      'NOT GIVEN = 原文没说',
    ],
  },
  {
    title: '2. 填空类',
    subtitle: 'gap-fill / sentence completion / summary',
    points: [
      '答案基本按顺序',
      '通常是原词或词形变化',
      '注意字数限制',
    ],
  },
  {
    title: '3. 选择题',
    subtitle: 'multiple choice',
    points: [
      '干扰项多',
      '常用“同义替换 + 偷换概念”',
    ],
  },
  {
    title: '4. 匹配题',
    subtitle: 'matching headings / matching information',
    points: [
      '不按顺序',
      '最耗时间',
      '强依赖段落主旨理解',
    ],
  },
]
const passageFeatures = [
  {
    title: 'Passage 1',
    content: '生活类 / 科普类',
    features: ['结构清晰', '词汇较简单', '题目偏细节'],
    goal: '尽量全对（12-13 题）',
  },
  {
    title: 'Passage 2',
    content: '说明文 / 社会 / 科技',
    features: ['信息量增加', '开始出现复杂句'],
    goal: '稳定拿分（10-11 题）',
  },
  {
    title: 'Passage 3',
    content: '学术 / 抽象 / 观点类',
    features: ['长难句多', '同义替换极多', '干扰强'],
    goal: '保证基础（7-9 题）',
  },
]
const coreTips = [
  {
    title: '1. 顺序原则（80% 题型适用）',
    desc: '大多数题目按文章顺序出现',
    action: '定位 → 精读 → 出答案 → 立刻下一题',
  },
  {
    title: '2. 同义替换是核心',
    desc: '阅读不是找原词，而是找同义词、解释表达和改写句',
    action: '阅读 ≠ 读懂文章，而是识别改写',
  },
  {
    title: '3. 关键词定位',
    desc: '读题时必须划名词、数字、专有名词',
    action: '用关键词去文章中“找位置”',
  },
  {
    title: '4. 段落主旨能力',
    desc: '尤其针对 matching headings，要抓段落核心句',
    action: '首句 / 尾句优先，先看主旨再看细节',
  },
  {
    title: '5. 不要逐字精读',
    desc: '错误做法是从头读到尾；正确做法是带着题目去读',
    action: '目的性阅读，而不是全文精读',
  },
  {
    title: '6. 时间分配',
    desc: 'Passage 1：15-18 min；Passage 2：18-20 min；Passage 3：22-25 min',
    action: '前两篇控时，给 Passage 3 留足空间',
  },
  {
    title: '7. 卡题原则',
    desc: '不要卡题超过 1 分钟',
    action: '不会 → 标记 → 跳过 → 最后回来',
  },
]
const commonMistakes = [
  '把 NOT GIVEN 当 FALSE',
  '没看字数限制',
  '拼写错误',
  '过度推理（阅读只看文本，不靠常识）',
  '在难题上浪费时间',
]
const summaryList = [
  'Do real practice tests: 做整套真题训练',
  'Read questions first: 先读题再读文章',
  'Locate → read → answer → move: 定位 → 精读 → 作答 → 前进',
  'Focus on paraphrase: 重点训练同义替换',
  'Don’t aim to understand everything: 不需要完全读懂全文',
  'Accuracy + Speed = 高分',
]
const exampleMap = createExampleMap(keywordMarkdown)
const wordMetaMap = createWordMetaMap(words, exampleMap)
const categoryPlanTargets = {
  '第 1 类考点词': 20,
  '第 2 类考点词': 10,
  '第 3 类考点词': 10,
}

const filteredCategories = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query)
    return ws

  return ws
    .map(cat => ({
      ...cat,
      words: cat.words.filter((row) => {
        const haystack = [
          normalizeWord(row[1]),
          row[2].join(' '),
          row[3].join(' '),
          row[4].join(' '),
          row[5],
        ].join(' ').toLowerCase()
        return haystack.includes(query)
      }),
    }))
    .filter(cat => cat.words.length > 0)
})

const searchedFlashcards = computed(() => {
  const cards = filteredCategories.value.flatMap(cat =>
    cat.words.map(row => ({
      ...createMetaFromRow(row),
      index: row[0],
      category: cat.title,
      require: cat.require,
      statusKey: normalizeWord(row[1]).toLowerCase(),
    })),
  )

  return cards
})

const filteredFlashcards = computed(() => {
  let cards = searchedFlashcards.value
  if (activePlanWordKeys.value.length) {
    const activeKeys = new Set(activePlanWordKeys.value)
    cards = cards.filter(card => activeKeys.has(card.statusKey))
  }

  if (flashcardCategoryFilter.value !== 'all')
    cards = cards.filter(card => card.category === flashcardCategoryFilter.value)

  if (flashcardReviewOptions.reviewMode === 'all')
    return cards

  if (flashcardReviewOptions.reviewMode === 'unknown')
    return cards.filter(card => getFlashcardStatus(card.word) === 'unknown')

  return cards.filter(card => !getFlashcardStatus(card.word))
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

const currentFlashcard = computed(() => {
  return flashcardDeck.value[flashcardIndex.value] || null
})

const flashcardStats = computed(() => {
  const cards = searchedFlashcards.value
  const today = getTodayKey()
  const known = cards.filter(card => getFlashcardStatus(card.word) === 'known').length
  const unknown = cards.filter(card => getFlashcardStatus(card.word) === 'unknown').length
  const unmarked = cards.length - known - unknown
  const reviewedToday = cards.filter(card => flashcardReviewedAt[card.statusKey] === today).length
  const fivePlus = cards.filter(card => getFlashcardMemoryCount(card.word) >= 5).length
  const tenPlus = cards.filter(card => getFlashcardMemoryCount(card.word) >= 10).length
  const mastered = cards.filter(card => getFlashcardMemoryCount(card.word) >= 20).length

  return {
    total: cards.length,
    known,
    unknown,
    unmarked,
    reviewedToday,
    fivePlus,
    tenPlus,
    mastered,
  }
})

const keywordPlan = computed(() => {
  const totalDays = Math.max(1, Math.min(60, Number(planningDays.value) || 7))

  const categoryPlans = ws.map((cat) => {
    const targetCount = categoryPlanTargets[cat.title] || 10
    const outstandingWords = cat.words
      .map(row => ({
        index: row[0],
        word: row[1],
        memoryCount: getFlashcardMemoryCount(row[1]),
        remaining: Math.max(targetCount - getFlashcardMemoryCount(row[1]), 0),
      }))
      .filter(item => item.remaining > 0)

    const chunks = Array.from({ length: totalDays }, () => [])
    outstandingWords.forEach((item, idx) => {
      chunks[idx % totalDays].push(item)
    })

    return {
      title: cat.title,
      require: cat.require,
      targetCount,
      totalWords: cat.words.length,
      outstandingWords,
      chunks,
      completed: outstandingWords.length === 0,
    }
  })

  const days = Array.from({ length: totalDays }, (_, index) => {
    const dayNumber = index + 1
    const tasks = categoryPlans.map((plan) => {
      const wordsForDay = plan.chunks[index] || []
      const targetWordCount = wordsForDay.length
      const remainingHits = wordsForDay.reduce((sum, item) => sum + item.remaining, 0)

      return {
        title: plan.title,
        require: plan.require,
        targetCount: plan.targetCount,
        wordsForDay,
        targetWordCount,
        remainingHits,
      }
    })

    const totalWords = tasks.reduce((sum, task) => sum + task.targetWordCount, 0)
    const totalRemainingHits = tasks.reduce((sum, task) => sum + task.remainingHits, 0)

    return {
      dayNumber,
      tasks,
      totalWords,
      totalRemainingHits,
      suggestions: buildPlanSuggestions(dayNumber, totalDays, tasks, totalRemainingHits),
    }
  })

  return {
    totalDays,
    categoryPlans,
    days,
    outstandingWords: categoryPlans.reduce((sum, plan) => sum + plan.outstandingWords.length, 0),
    totalRemainingHits: categoryPlans.reduce((sum, plan) => sum + plan.outstandingWords.reduce((acc, item) => acc + item.remaining, 0), 0),
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

const dictionaryCache = new Map()
const currentToastRequestId = ref(0)
const wordToast = reactive({
  visible: false,
  loading: false,
  word: '',
  rawWord: '',
  phonetic: '',
  syllables: '',
  example: '',
  memoryHint: '',
  meaning: '',
  type: '',
  note: '',
  error: '',
  positionStyle: {
    top: '24px',
    left: '24px',
  },
})

let audio = null

function normalizeWord(word) {
  return word.replace(/\*/g, '').trim()
}

function toggleColumn(columnKey) {
  columnVisibility[columnKey] = !columnVisibility[columnKey]
}

function getTodayKey() {
  return new Date().toISOString().slice(0, 10)
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

function getFlashcardStatus(word) {
  return flashcardStatuses[normalizeWord(word).toLowerCase()] || ''
}

function getFlashcardMemoryCount(word) {
  const value = flashcardMemoryCounts[normalizeWord(word).toLowerCase()]
  return Number.isFinite(value) ? value : 0
}

function persistFlashcardStatuses() {
  if (typeof window === 'undefined')
    return
  window.localStorage.setItem(FLASHCARD_STATUS_STORAGE_KEY, JSON.stringify(flashcardStatuses))
}

function persistFlashcardReviewedAt() {
  if (typeof window === 'undefined')
    return
  window.localStorage.setItem(FLASHCARD_REVIEWED_AT_STORAGE_KEY, JSON.stringify(flashcardReviewedAt))
}

function persistFlashcardMemoryCounts() {
  if (typeof window === 'undefined')
    return
  window.localStorage.setItem(FLASHCARD_MEMORY_COUNT_STORAGE_KEY, JSON.stringify(flashcardMemoryCounts))
}

function loadFlashcardStatuses() {
  if (typeof window === 'undefined')
    return

  const raw = window.localStorage.getItem(FLASHCARD_STATUS_STORAGE_KEY)
  if (!raw)
    return

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object')
      Object.assign(flashcardStatuses, parsed)
  }
  catch {
  }
}

function loadFlashcardReviewedAt() {
  if (typeof window === 'undefined')
    return

  const raw = window.localStorage.getItem(FLASHCARD_REVIEWED_AT_STORAGE_KEY)
  if (!raw)
    return

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object')
      Object.assign(flashcardReviewedAt, parsed)
  }
  catch {
  }
}

function loadFlashcardMemoryCounts() {
  if (typeof window === 'undefined')
    return

  const raw = window.localStorage.getItem(FLASHCARD_MEMORY_COUNT_STORAGE_KEY)
  if (!raw)
    return

  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object')
      Object.assign(flashcardMemoryCounts, parsed)
  }
  catch {
  }
}

function setKeywordView(view) {
  activeKeywordView.value = view
  flashcardFlipped.value = false
  flashcardPretest.value = null
  clearAutoNextTimer()
  if (view !== 'flashcard')
    exitFlashcardFullscreen()
}

function clearPlanFlashcardFocus() {
  activePlanLabel.value = ''
  activePlanWordKeys.value = []
  flashcardCategoryFilter.value = 'all'
}

function startPlanFlashcards(day, task = null) {
  const selectedWords = task
    ? task.wordsForDay
    : day.tasks.flatMap(item => item.wordsForDay)

  const keys = selectedWords
    .map(item => normalizeWord(item.word).toLowerCase())
    .filter(Boolean)

  activePlanWordKeys.value = [...new Set(keys)]
  activePlanLabel.value = task
    ? `第 ${day.dayNumber} 天 · ${task.title}`
    : `第 ${day.dayNumber} 天全部任务`
  activeKeywordView.value = 'flashcard'
  flashcardReviewOptions.reviewMode = 'all'
  flashcardReviewOptions.shuffle = true
  flashcardCategoryFilter.value = task ? task.title : 'all'
  keyword.value = ''
  flashcardIndex.value = 0
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

function markFlashcard(status) {
  const card = currentFlashcard.value
  if (!card)
    return

  flashcardStatuses[card.statusKey] = status
  flashcardReviewedAt[card.statusKey] = getTodayKey()
  if (status === 'known') {
    flashcardMemoryCounts[card.statusKey] = getFlashcardMemoryCount(card.word) + 1
    persistFlashcardMemoryCounts()
  }
  persistFlashcardStatuses()
  persistFlashcardReviewedAt()
}

function confirmFlashcardBack(isCorrect) {
  if (!currentFlashcard.value || !flashcardFlipped.value || flashcardPretest.value !== 'known')
    return
  if (isCorrect)
    markFlashcard('known')
  else
    markFlashcard('unknown')
  if (flashcardReviewOptions.autoNextAfterFlip)
    scheduleAutoNext()
  else
    clearAutoNextTimer()
}

function clearAllReadingFlashcardProgress() {
  if (!confirm('确定清除阅读 538 全部闪卡学习记录？所有词的标记与记忆次数将清空，且无法恢复。'))
    return
  for (const k of Object.keys(flashcardStatuses))
    delete flashcardStatuses[k]
  for (const k of Object.keys(flashcardReviewedAt))
    delete flashcardReviewedAt[k]
  for (const k of Object.keys(flashcardMemoryCounts))
    delete flashcardMemoryCounts[k]
  persistFlashcardStatuses()
  persistFlashcardReviewedAt()
  persistFlashcardMemoryCounts()
  flashcardFlipped.value = false
  flashcardPretest.value = null
  clearAutoNextTimer()
}

function getMemoryStageMeta(word, category = '') {
  const count = getFlashcardMemoryCount(word)

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
      hint: category.includes('第 1 类') ? '第 1 类还建议继续冲到 20 次以上' : '已达到 10 次以上正确回忆',
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

function getCategoryProgressSummary(category) {
  const counts = category.words.map(row => getFlashcardMemoryCount(row[1]))
  return {
    total: counts.length,
    fivePlus: counts.filter(count => count >= 5).length,
    tenPlus: counts.filter(count => count >= 10).length,
    mastered: counts.filter(count => count >= 20).length,
  }
}

function formatPlanWordPreview(wordsForDay, max = 6) {
  if (!wordsForDay.length)
    return '今天这一类以复习已学内容为主。'

  const preview = wordsForDay.slice(0, max).map(item => `${item.index}.${normalizeWord(item.word)}`).join('、')
  const extra = wordsForDay.length > max ? ` 等 ${wordsForDay.length} 个词` : ''
  return `${preview}${extra}`
}

function buildPlanSuggestions(dayNumber, totalDays, tasks, totalRemainingHits) {
  const classOneTask = tasks.find(task => task.title.includes('第 1 类'))
  const classTwoTask = tasks.find(task => task.title.includes('第 2 类'))
  const classThreeTask = tasks.find(task => task.title.includes('第 3 类'))
  const introFocus = tasks
    .filter(task => task.targetWordCount > 0)
    .map(task => `${task.title} ${task.targetWordCount} 个`)
    .join('，') || '复习已学单词'

  const intensity = totalRemainingHits >= 80 ? '高强度冲刺日' : totalRemainingHits >= 40 ? '标准推进日' : '巩固收口日'

  return [
    `${intensity}：今天优先处理 ${introFocus}。如果时间紧，先保第 1 类，再做第 2、3 类新增任务。`,
    `上午建议先用列表模式过一遍新任务词，尤其是第 1 类；今日第 1 类重点：${formatPlanWordPreview(classOneTask?.wordsForDay || [], 4)}`,
    `下午切到闪卡模式，优先复习“不认识”和“未达 5 次”的词；第 2 类建议先攻：${formatPlanWordPreview(classTwoTask?.wordsForDay || [], 5)}`,
    `晚上用练习模式做拼写和同义替换输入；第 3 类建议集中做这些词：${formatPlanWordPreview(classThreeTask?.wordsForDay || [], 5)}`,
    dayNumber === totalDays
      ? '最后一天先清空“未达标”和“不认识”，再冲刺第 1 类到“烂熟于心”，第 2、3 类至少保持在 10+ 次。'
      : '结束前回到闪卡模式，给今天真正答对的词在背面点「对」，让次数累计到本地记录里。',
  ]
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

function handleFlashcardKeydown(event) {
  if (activeTab.value !== 'keywords' || activeKeywordView.value !== 'flashcard')
    return
  if (isTypingTarget(event.target))
    return

  if (event.key === ' ' || event.key === 'Enter') {
    event.preventDefault()
    if (flashcardFlipped.value)
      flipFlashcard()
    return
  }

  if (event.key === 'ArrowLeft') {
    event.preventDefault()
    moveFlashcard(-1)
    return
  }

  if (event.key === 'ArrowRight') {
    event.preventDefault()
    moveFlashcard(1)
    return
  }

  if (event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (!flashcardFlipped.value)
      selectFlashcardPretestAndFlip('known')
    else if (flashcardPretest.value === 'known')
      confirmFlashcardBack(true)
    return
  }

  if (event.key.toLowerCase() === 'u') {
    event.preventDefault()
    if (!flashcardFlipped.value)
      selectFlashcardPretestAndFlip('unknown')
    else if (flashcardPretest.value === 'known')
      confirmFlashcardBack(false)
    return
  }

  if (event.key.toLowerCase() === 'r') {
    event.preventDefault()
    randomFlashcard()
  }
}

onMounted(() => {
  loadFlashcardStatuses()
  loadFlashcardReviewedAt()
  loadFlashcardMemoryCounts()
  syncFlashcardFullscreenState()
  window.addEventListener('keydown', handleFlashcardKeydown)
  document.addEventListener('fullscreenchange', syncFlashcardFullscreenState)
  document.addEventListener('webkitfullscreenchange', syncFlashcardFullscreenState)
})

onBeforeUnmount(() => {
  clearAutoNextTimer()
  window.removeEventListener('keydown', handleFlashcardKeydown)
  document.removeEventListener('fullscreenchange', syncFlashcardFullscreenState)
  document.removeEventListener('webkitfullscreenchange', syncFlashcardFullscreenState)
})

function createExampleMap(markdown) {
  const map = new Map()
  for (const line of markdown.split('\n')) {
    if (!line.startsWith('| '))
      continue
    if (line.includes('考点词') || line.startsWith('|---'))
      continue

    const parts = line.split('|').map(part => part.trim())
    if (parts.length < 8)
      continue

    const word = normalizeWord(parts[2])
    const example = parts[6]
    if (word && example)
      map.set(word.toLowerCase(), example)
  }
  return map
}

function createWordMetaMap(categories, examples) {
  const map = new Map()

  for (const category of categories) {
    for (const row of category.words) {
      const word = normalizeWord(row[1])
      if (!word)
        continue

      map.set(word.toLowerCase(), {
        word,
        rawWord: row[1],
        type: row[2].filter(Boolean).join(' / ') || '词组',
        meaning: row[3].join('；'),
        synonyms: row[4].filter(Boolean),
        note: row[5] || '',
        example: examples.get(word.toLowerCase()) || '',
      })
    }
  }

  return map
}

function play(word) {
  const normalizedWord = normalizeWord(word)
  if (!normalizedWord)
    return

  if (audio) {
    audio.pause()
    audio.currentTime = 0
  }
  audio = document.createElement('audio')
  audio.src = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(normalizedWord)}&type=1`
  audio.play()
}

function closeWordToast() {
  wordToast.visible = false
}

function buildMemoryHint(meta) {
  const word = normalizeWord(meta.word)
  const meaning = meta.meaning.split('；').filter(Boolean)[0] || '核心含义'
  const synonym = meta.synonyms?.[0] || ''
  const typeText = meta.type.toLowerCase()
  const lowerWord = word.toLowerCase()

  const affixHints = [
    { test: lowerWord.endsWith('tion') || lowerWord.endsWith('sion'), text: '看到词尾 -tion / -sion，先提醒自己它大概率是一个“名词结果/过程”。' },
    { test: lowerWord.endsWith('ment'), text: '看到词尾 -ment，把它先当成“某种结果、状态或事物”来记。' },
    { test: lowerWord.endsWith('ity'), text: '词尾 -ity 常把形容词变成抽象名词，适合和“性质、状态”联想。' },
    { test: lowerWord.endsWith('ive'), text: '词尾 -ive 常见于形容词，先把它理解成“具有某种倾向或特征的”。' },
    { test: lowerWord.endsWith('ous') || lowerWord.endsWith('ful'), text: '词尾本身就很像形容词信号，记忆时先把它放进“描述特征”的语境里。' },
    { test: lowerWord.endsWith('ly'), text: '词尾 -ly 往往提示它和“方式、程度”有关，适合放进动作场景里记。' },
    { test: lowerWord.startsWith('re'), text: '前缀 re- 常带“再、回、重新”的感觉，背的时候先抓这个方向。' },
    { test: lowerWord.startsWith('inter'), text: '前缀 inter- 常有“在……之间、相互”的意思，可以联想到互动关系。' },
    { test: lowerWord.startsWith('sub'), text: '前缀 sub- 常有“下、次级、再细分”的意味，记忆时先抓层级感。' },
    { test: lowerWord.startsWith('trans'), text: '前缀 trans- 常有“传递、跨越、转移”的意思，适合联想变化或移动。' },
  ]

  const matchedAffixHint = affixHints.find(item => item.test)?.text

  if (buildLookupTokens(word).length > 1)
    return `把 "${word}" 当成整块表达记，不要拆开死记。先抓住“${meaning}”这个整体意思，再回想它在例句里的使用场景。`

  if (matchedAffixHint)
    return `${matchedAffixHint} 再把 ${word} 和“${meaning}”绑定${synonym ? `，顺手联想同义替换 ${synonym}` : ''}。`

  if (typeText.includes('v'))
    return `把 ${word} 当成一个动作来记，先记“${meaning}”，再在脑中重放例句里“谁做了这个动作”。`

  if (typeText.includes('adj'))
    return `把 ${word} 当成“给名词贴标签”的描述词来记，先记“${meaning}”，再想它修饰的是哪类人或事物。`

  if (typeText.includes('adv'))
    return `把 ${word} 放进动作里记，重点感受它如何补充“怎么发生、到什么程度”。`

  return `先把 ${word} 和“${meaning}”一对一绑定${synonym ? `，再用同义替换 ${synonym}` : ''}和例句一起复现这个词。`
}

function createMetaFromRow(row) {
  const word = normalizeWord(row[1])
  return {
    word,
    rawWord: row[1],
    type: row[2].filter(Boolean).join(' / ') || '词组',
    meaning: row[3].join('；'),
    synonyms: row[4].filter(Boolean),
    note: row[5] || '',
    example: exampleMap.get(word.toLowerCase()) || '',
  }
}

function createMetaFromSynonym(synonym, row) {
  const normalizedSynonym = normalizeWord(synonym)
  const storedMeta = wordMetaMap.get(normalizedSynonym.toLowerCase())
  if (storedMeta)
    return storedMeta

  const baseWord = normalizeWord(row[1])
  const baseMeaning = row[3].join('；')
  return {
    word: normalizedSynonym,
    rawWord: synonym,
    type: '同义替换',
    meaning: `近义联想：${baseMeaning}`,
    synonyms: [baseWord],
    note: `该词作为 ${baseWord} 的同义替换出现，可和原考点词对照记忆。`,
    example: exampleMap.get(normalizedSynonym.toLowerCase()) || '',
  }
}

function getTypingPracticeChapter(title) {
  return `阅读 538 - ${title}`
}

function getWordCardPosition(target) {
  const rect = target.getBoundingClientRect()
  const viewportWidth = window.innerWidth
  const viewportHeight = window.innerHeight
  const cardWidth = Math.min(viewportWidth * 0.92, 448)
  const estimatedHeight = 360
  const gap = 12

  let left = rect.right + gap
  if (left + cardWidth > viewportWidth - 16)
    left = rect.left - cardWidth - gap
  if (left < 16)
    left = Math.max(16, Math.min(rect.left, viewportWidth - cardWidth - 16))

  let top = rect.top + rect.height / 2 - estimatedHeight / 2
  top = Math.max(16, Math.min(top, viewportHeight - estimatedHeight - 16))

  return {
    top: `${top}px`,
    left: `${left}px`,
  }
}

function buildLookupTokens(rawWord) {
  return normalizeWord(rawWord)
    .split(/\s+/)
    .map(token => token.trim())
    .filter(Boolean)
}

function splitTokenIntoSyllables(token) {
  const normalizedToken = token.toLowerCase().replace(/[^a-z]/g, '')
  if (!normalizedToken)
    return token
  if (normalizedToken.length <= 3)
    return token

  const vowels = 'aeiouy'
  const parts = []
  let start = 0
  let i = 0

  while (i < normalizedToken.length) {
    while (i < normalizedToken.length && !vowels.includes(normalizedToken[i]))
      i++
    while (i < normalizedToken.length && vowels.includes(normalizedToken[i]))
      i++

    if (i >= normalizedToken.length)
      break

    const consonantStart = i
    while (i < normalizedToken.length && !vowels.includes(normalizedToken[i]))
      i++

    const consonantCount = i - consonantStart
    if (i >= normalizedToken.length)
      break

    let boundary = consonantStart
    if (consonantCount > 1)
      boundary = consonantStart + consonantCount - 1

    if (boundary <= start || boundary >= token.length)
      continue

    parts.push(token.slice(start, boundary))
    start = boundary
    i = boundary
  }

  parts.push(token.slice(start))

  return parts
    .filter(Boolean)
    .join(' · ')
}

function splitWordIntoSyllables(rawWord) {
  return buildLookupTokens(rawWord)
    .map((token) => {
      if (token.includes('-'))
        return token.split('-').map(splitTokenIntoSyllables).join(' - ')
      return splitTokenIntoSyllables(token)
    })
    .join(' / ')
}

function extractDictionaryMeta(entries) {
  if (!Array.isArray(entries) || entries.length === 0)
    return { phonetic: '', example: '' }

  const phonetic = entries
    .flatMap(entry => [entry.phonetic, ...(entry.phonetics || []).map(item => item.text)])
    .find(Boolean) || ''

  const example = entries
    .flatMap(entry => entry.meanings || [])
    .flatMap(meaning => meaning.definitions || [])
    .map(definition => definition.example)
    .find(Boolean) || ''

  return { phonetic, example }
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

async function showWordToast(meta, event) {
  const rawWord = meta.rawWord || meta.word
  const normalizedWord = normalizeWord(rawWord)
  const typeText = meta.type || '词组'
  const meaningText = meta.meaning || ''
  const localExample = meta.example || exampleMap.get(normalizedWord.toLowerCase()) || ''
  const currentTarget = event?.currentTarget
  const positionStyle = currentTarget instanceof HTMLElement ? getWordCardPosition(currentTarget) : wordToast.positionStyle
  const requestId = currentToastRequestId.value + 1
  currentToastRequestId.value = requestId

  wordToast.visible = true
  wordToast.loading = true
  wordToast.word = normalizedWord
  wordToast.rawWord = rawWord
  wordToast.phonetic = ''
  wordToast.syllables = splitWordIntoSyllables(normalizedWord)
  wordToast.example = localExample
  wordToast.memoryHint = buildMemoryHint({
    word: normalizedWord,
    meaning: meaningText,
    synonyms: meta.synonyms || [],
    type: typeText,
  })
  wordToast.meaning = meaningText
  wordToast.type = typeText
  wordToast.note = meta.note || ''
  wordToast.error = ''
  wordToast.positionStyle = positionStyle

  const tokens = buildLookupTokens(rawWord)
  const metas = await Promise.all(tokens.map(fetchDictionaryToken))

  if (requestId !== currentToastRequestId.value)
    return

  const phonetic = metas
    .map(meta => meta?.phonetic)
    .filter(Boolean)
    .join(' / ')

  const apiExample = metas
    .map(meta => meta?.example)
    .find(Boolean) || ''

  wordToast.phonetic = phonetic
  if (!wordToast.example)
    wordToast.example = apiExample
  if (!phonetic)
    wordToast.error = '未查到音标，已展示本地记忆信息。'
  wordToast.loading = false
}
</script>

<template>
  <div class="px-4 pt-6 2xl:px-0">
    <div class="border border-gray-200 rounded-lg bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-6">
      <ul class="rounded-lg text-center text-sm font-medium text-gray-500 shadow sm:flex divide-x divide-gray-200 dark:text-gray-400 dark:divide-gray-700">
        <li class="w-full">
          <button
            type="button"
            class="inline-block w-full rounded-l-lg p-4"
            :class="activeTab === 'concepts'
              ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
              : 'bg-white text-gray-500 dark:bg-gray-800 dark:text-gray-400'"
            @click="activeTab = 'concepts'"
          >
            IELTS 阅读基本概念
          </button>
        </li>
        <li class="w-full">
          <button
            type="button"
            class="inline-block w-full rounded-r-lg p-4"
            :class="activeTab === 'keywords'
              ? 'bg-gray-100 text-gray-900 dark:bg-gray-700 dark:text-white'
              : 'bg-white text-gray-500 dark:bg-gray-800 dark:text-gray-400'"
            @click="activeTab = 'keywords'"
          >
            阅读 538 考点词
          </button>
        </li>
      </ul>

      <div v-if="activeTab === 'concepts'" class="pt-6 text-gray-500 dark:text-gray-400">
        <h3 class="mb-4 text-xl font-semibold text-black dark:text-white">
          概述
        </h3>
        <div class="mb-6">
          <p>了解雅思阅读考试结构，以及应对阅读的核心原则与技巧。</p>
        </div>

        <h3 class="mb-4 text-xl font-semibold text-black dark:text-white">
          评分表
        </h3>
        <table class="w-full text-center text-sm text-gray-500 dark:text-gray-400">
          <tbody>
            <tr class="border bg-white dark:border-gray-700 dark:bg-gray-800">
              <td v-for="v in scoreTable" :key="v[0]" class="border px-4 py-3">
                {{ v[0] }}
              </td>
            </tr>
            <tr class="border bg-white dark:border-gray-700 dark:bg-gray-800">
              <td v-for="v in scoreTable" :key="v[0]" class="border px-4 py-3">
                {{ v[1] }}
              </td>
            </tr>
          </tbody>
        </table>

        <h3 class="my-4 text-xl font-semibold text-black dark:text-white">
          基本规则
        </h3>
        <ul class="mb-6 ml-6 list-disc space-y-1">
          <li>时限 60 min（无额外时间）</li>
          <li>3 篇文章</li>
          <li>40 个题（一般错 10 个以内 ≈ 7 分）</li>
          <li>难度递增（Passage 1 → Passage 3）</li>
          <li>答案不一定完全按顺序出现，尤其是匹配题</li>
        </ul>

        <h3 class="my-4 text-xl font-semibold text-black dark:text-white">
          常见题型
        </h3>
        <div class="mb-6 space-y-5">
          <div v-for="item in questionTypes" :key="item.title">
            <h4 class="text-lg font-semibold text-black dark:text-white">
              {{ item.title }}
            </h4>
            <p class="mt-1 text-sm">
              {{ item.subtitle }}
            </p>
            <ul class="ml-6 mt-2 list-disc space-y-1">
              <li v-for="point in item.points" :key="point">
                {{ point }}
              </li>
            </ul>
          </div>
        </div>

        <h3 class="my-4 text-xl font-semibold text-black dark:text-white">
          Passage 特点
        </h3>
        <div class="mb-6 space-y-5">
          <div v-for="item in passageFeatures" :key="item.title">
            <h4 class="text-lg font-semibold text-black dark:text-white">
              {{ item.title }}
            </h4>
            <p class="mt-1">
              内容：{{ item.content }}
            </p>
            <ul class="ml-6 mt-2 list-disc space-y-1">
              <li v-for="feature in item.features" :key="feature">
                {{ feature }}
              </li>
            </ul>
            <p class="mt-2">
              <strong>目标：</strong>{{ item.goal }}
            </p>
          </div>
        </div>

        <h3 class="my-4 text-xl font-semibold text-black dark:text-white">
          核心技巧
        </h3>
        <div class="mb-6 space-y-5">
          <div v-for="item in coreTips" :key="item.title">
            <h4 class="text-lg font-semibold text-black dark:text-white">
              {{ item.title }}
            </h4>
            <p class="mt-1">
              {{ item.desc }}
            </p>
            <p class="mt-2 font-medium text-gray-700 dark:text-gray-200">
              {{ item.action }}
            </p>
          </div>
        </div>

        <h3 class="my-4 text-xl font-semibold text-black dark:text-white">
          常见错误
        </h3>
        <ul class="mb-6 ml-6 list-disc space-y-1">
          <li v-for="item in commonMistakes" :key="item">
            {{ item }}
          </li>
        </ul>

        <h3 class="my-4 text-xl font-semibold text-black dark:text-white">
          总结
        </h3>
        <ul class="ml-6 list-disc space-y-1">
          <li v-for="item in summaryList" :key="item">
            {{ item }}
          </li>
        </ul>
      </div>

      <div v-else class="pt-6">
        <div class="items-center justify-between lg:flex">
          <div class="mb-4 lg:mb-0">
            <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
              阅读 538 考点词
            </h3>
            <span class="text-base font-normal text-gray-500 dark:text-gray-400">列表浏览与闪卡记背可自由切换</span>
          </div>
          <div class="items-center gap-2 sm:flex">
            <button
              type="button"
              class="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
              @click="$router.push('/reading/538practice')"
            >
              练习
            </button>
            <div class="relative mt-2 min-w-[220px] flex-1 sm:mt-0">
              <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg class="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                  <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
                </svg>
              </div>
              <input
                v-model="keyword"
                type="search"
                class="block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 pl-10 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400"
                placeholder="Search"
              >
            </div>
          </div>
        </div>

        <div class="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            class="border rounded-full px-3 py-1.5 text-xs font-medium transition"
            :class="activeKeywordView === 'list'
              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
              : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
            @click="setKeywordView('list')"
          >
            列表模式
          </button>
          <button
            type="button"
            class="group rounded-full border px-4 py-2 text-sm font-semibold shadow-sm transition"
            :class="activeKeywordView === 'flashcard'
              ? 'border-orange-300 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-200 dark:border-orange-400/40 dark:from-orange-500 dark:to-amber-500 dark:text-white'
              : 'border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-300 hover:bg-orange-100 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20'"
            @click="setKeywordView('flashcard')"
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
            class="border rounded-full px-3 py-1.5 text-xs font-medium transition"
            :class="activeKeywordView === 'plan'
              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
              : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
            @click="setKeywordView('plan')"
          >
            规划模式
          </button>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            {{
              activeKeywordView === 'flashcard'
                ? '点击橙色闪卡按钮后可进入强化记忆模式'
                : activeKeywordView === 'plan'
                  ? '按天拆分学习任务，照着执行即可'
                  : '点击单词可打开记忆词卡'
            }}
          </span>
        </div>

        <div v-if="activeKeywordView === 'flashcard'" class="mt-6">
          <div
            v-if="activePlanWordKeys.length"
            class="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm dark:border-sky-500/30 dark:bg-sky-500/10"
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
              @click="clearPlanFlashcardFocus"
            >
              查看全部闪卡
            </button>
          </div>

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
                {{ flashcardStats.mastered }}
              </p>
            </div>
          </div>

          <div class="mb-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              class="border rounded-full px-3 py-1 text-xs font-medium transition"
              :class="flashcardCategoryFilter === 'all'
                ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300'
                : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
              @click="flashcardCategoryFilter = 'all'"
            >
              全部分类
            </button>
            <button
              v-for="category in ws.map(cat => cat.title)"
              :key="category"
              type="button"
              class="border rounded-full px-3 py-1 text-xs font-medium transition"
              :class="flashcardCategoryFilter === category
                ? 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300'
                : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
              @click="flashcardCategoryFilter = category"
            >
              {{ category }}
            </button>
            <button
              type="button"
              class="border rounded-full px-3 py-1 text-xs font-medium transition"
              :class="flashcardReviewOptions.reviewMode === 'all'
                ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
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
              @click="clearAllReadingFlashcardProgress"
            >
              清除闪卡学习记录
            </button>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              `U`=不认识并翻面且已自动记入不认识；正面 `K`=认识翻面后背面 `K`/`U` 选对错；`Space`/`Enter` 仅背面翻回正面；`←/→` 切卡，`R` 随机
            </span>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              正面选「不认识」翻面即记入不认识；选「认识」后点「错」也会标记为不认识；点「对」累计 1 次正确记忆
            </span>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              当前分类：{{ flashcardCategoryFilter === 'all' ? '全部' : flashcardCategoryFilter }}
            </span>
          </div>

          <div
            v-if="currentFlashcard"
            ref="flashcardFullscreenEl"
            class="mx-auto max-w-3xl"
            :class="isFlashcardFullscreen ? 'max-w-none h-full w-full flex flex-col justify-center bg-gray-950 px-4 py-6 sm:px-8' : ''"
          >
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400" :class="isFlashcardFullscreen ? 'text-gray-300' : ''">
              <div class="flex items-center gap-3">
                <span class="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-700">{{ currentFlashcard.category }}</span>
                <span>{{ flashcardIndex + 1 }} / {{ flashcardDeck.length }}</span>
                <span
                  class="rounded-full border px-3 py-1 font-medium"
                  :class="getMemoryStageMeta(currentFlashcard.word, currentFlashcard.category).className"
                  :title="getMemoryStageMeta(currentFlashcard.word, currentFlashcard.category).hint"
                >
                  {{ getMemoryStageMeta(currentFlashcard.word, currentFlashcard.category).label }}
                </span>
                <span class="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  已记住 {{ getFlashcardMemoryCount(currentFlashcard.word) }} 次
                </span>
                <span
                  class="rounded-full px-3 py-1"
                  :class="getFlashcardStatus(currentFlashcard.word) === 'known'
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : getFlashcardStatus(currentFlashcard.word) === 'unknown'
                      ? 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
                      : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-300'"
                >
                  {{
                    getFlashcardStatus(currentFlashcard.word) === 'known'
                      ? '已标记：我认识'
                      : getFlashcardStatus(currentFlashcard.word) === 'unknown'
                        ? '已标记：不认识'
                        : '未标记'
                  }}
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
                    :class="getMemoryStageMeta(currentFlashcard.word, currentFlashcard.category).className"
                  >
                    {{ getMemoryStageMeta(currentFlashcard.word, currentFlashcard.category).label }}
                  </span>
                  <span class="rounded-full bg-slate-100 px-4 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    已记住 {{ getFlashcardMemoryCount(currentFlashcard.word) }} 次
                  </span>
                </div>
                <h4 class="text-[6.75rem] leading-none font-bold text-gray-900 dark:text-white">
                  {{ currentFlashcard.word }}
                </h4>
                <p class="mt-6 text-3xl text-gray-500 dark:text-gray-400">
                  {{ currentFlashcard.type }}
                </p>
                <p class="mt-8 text-lg text-gray-500 dark:text-gray-400">
                  <kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800">K</kbd> 认识 → 翻面后需对照释义点「对/错」；
                  <kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800">U</kbd> 不认识 → 翻面即记入「不认识」，直接看释义即可
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
                </div>
                <p class="mt-8 text-xl text-amber-600 dark:text-amber-400">
                  选认识后：背面用 <kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800">K</kbd>（对）/ <kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800">U</kbd>（错）；<kbd class="rounded border border-gray-300 bg-gray-100 px-1.5 py-0.5 text-sm dark:border-gray-600 dark:bg-gray-800">Space</kbd> 可翻回正面
                </p>
              </div>

              <div v-else class="min-h-[320px]">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div class="min-w-0 flex-1">
                    <p class="text-3xl font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">
                      Flashcard Back
                    </p>
                    <p v-if="flashcardPretest === 'known'" class="mt-2 text-xl text-gray-600 dark:text-gray-300">
                      你正面选了「认识」——请对照释义，用「对 / 错」判断回忆是否准确
                    </p>
                    <p v-else class="mt-2 text-xl text-amber-800 dark:text-amber-200">
                      你已选「不认识」：已自动记入「不认识」，请认真阅读下方释义与例句
                    </p>
                    <h4 class="mt-3 text-7xl leading-none font-bold text-gray-900 dark:text-white">
                      {{ currentFlashcard.word }}
                    </h4>
                    <p class="mt-4 text-3xl text-gray-500 dark:text-gray-400">
                      {{ currentFlashcard.type }} · {{ currentFlashcard.meaning }}
                    </p>
                    <div class="mt-5 flex flex-wrap items-center gap-3 text-xl">
                      <span
                        class="rounded-full border px-4 py-1.5 font-medium"
                        :class="getMemoryStageMeta(currentFlashcard.word, currentFlashcard.category).className"
                      >
                        {{ getMemoryStageMeta(currentFlashcard.word, currentFlashcard.category).label }}
                      </span>
                      <span class="rounded-full bg-slate-100 px-4 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        已记住 {{ getFlashcardMemoryCount(currentFlashcard.word) }} 次
                      </span>
                      <span class="text-lg text-gray-500 dark:text-gray-400">
                        {{ getMemoryStageMeta(currentFlashcard.word, currentFlashcard.category).hint }}
                      </span>
                    </div>
                  </div>
                  <div class="flex flex-col items-stretch gap-3 lg:max-w-sm" @click.stop>
                    <div v-if="flashcardPretest === 'known'" class="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <button
                        type="button"
                        class="border border-emerald-300 rounded-lg bg-emerald-50 px-5 py-3 text-2xl font-semibold text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/25"
                        @click="confirmFlashcardBack(true)"
                      >
                        对
                        <span class="mt-1 block text-sm font-normal opacity-80">与背面一致 → 我认识 · 快捷键 K</span>
                      </button>
                      <button
                        type="button"
                        class="border border-red-300 rounded-lg bg-red-50 px-5 py-3 text-2xl font-semibold text-red-800 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-500/25"
                        @click="confirmFlashcardBack(false)"
                      >
                        错
                        <span class="mt-1 block text-sm font-normal opacity-80">记错了 → 标记不认识 · 快捷键 U</span>
                      </button>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 sm:justify-end">
                      <button
                        type="button"
                        class="i-carbon-volume-up-filled text-5xl text-gray-500 dark:text-gray-400 hover:text-blue-600"
                        :title="`播放 ${currentFlashcard.word} 发音`"
                        @click="play(currentFlashcard.word)"
                      />
                      <button
                        type="button"
                        class="border border-gray-200 rounded-lg px-5 py-3 text-2xl dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                        @click="showWordToast(currentFlashcard, $event)"
                      >
                        完整词卡
                      </button>
                    </div>
                  </div>
                </div>

                <div class="mt-8 space-y-7 text-3xl text-gray-700 dark:text-gray-200">
                  <div>
                    <p class="text-2xl font-medium tracking-wide uppercase text-gray-500 dark:text-gray-400">
                      同义替换
                    </p>
                    <p class="mt-3 leading-[1.5]">
                      {{ currentFlashcard.synonyms.length ? currentFlashcard.synonyms.join(', ') : '暂无' }}
                    </p>
                  </div>
                  <div>
                    <p class="text-2xl font-medium tracking-wide uppercase text-gray-500 dark:text-gray-400">
                      雅思例句
                    </p>
                    <p class="mt-3 leading-[1.5]">
                      {{ currentFlashcard.example || '暂未找到例句。' }}
                    </p>
                  </div>
                  <div class="rounded-xl bg-blue-50 px-5 py-5 dark:bg-blue-500/10">
                    <p class="text-2xl font-medium tracking-wide uppercase text-blue-700 dark:text-blue-300">
                      助记提示
                    </p>
                    <p class="mt-3 leading-[1.5] text-blue-900 dark:text-blue-100">
                      {{ buildMemoryHint(currentFlashcard) }}
                    </p>
                  </div>
                </div>
              </div>
            </button>
          </div>
          <div v-else class="border border-gray-300 rounded-xl border-dashed px-6 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            当前筛选条件下没有可用单词，请清空搜索词后再试。
          </div>
        </div>

        <div v-else-if="activeKeywordView === 'plan'" class="mt-6 space-y-6">
          <div class="rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-500/30 dark:bg-sky-500/10">
            <div class="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p class="text-xs font-semibold tracking-wide uppercase text-sky-700 dark:text-sky-300">
                  Study Planner
                </p>
                <h4 class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
                  阅读 538 考点词学习规划
                </h4>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">
                  按你设定的天数自动拆分第 1/2/3 类任务，并结合当前记忆次数给出每天怎么学。
                </p>
              </div>
              <label class="flex items-center gap-3 text-sm text-gray-700 dark:text-gray-200">
                <span>计划天数</span>
                <input
                  v-model="planningDays"
                  type="number"
                  min="1"
                  max="60"
                  class="w-24 rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-sky-400 dark:border-sky-500/30 dark:bg-slate-900 dark:text-white"
                >
              </label>
            </div>

            <div class="mt-4 grid gap-3 lg:grid-cols-4 sm:grid-cols-2">
              <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-900/70">
                <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  计划天数
                </p>
                <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {{ keywordPlan.totalDays }} 天
                </p>
              </div>
              <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-900/70">
                <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  未达标词数
                </p>
                <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {{ keywordPlan.outstandingWords }}
                </p>
              </div>
              <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-900/70">
                <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  剩余正确记忆次数
                </p>
                <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {{ keywordPlan.totalRemainingHits }}
                </p>
              </div>
              <div class="rounded-xl bg-white px-4 py-3 text-sm shadow-sm dark:bg-slate-900/70">
                <p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  平均每日要补
                </p>
                <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">
                  {{ Math.ceil(keywordPlan.totalRemainingHits / keywordPlan.totalDays) }}
                </p>
              </div>
            </div>
          </div>

          <div class="grid gap-4 lg:grid-cols-3">
            <div
              v-for="plan in keywordPlan.categoryPlans"
              :key="plan.title"
              class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h5 class="text-lg font-semibold text-gray-900 dark:text-white">
                    {{ plan.title }}
                  </h5>
                  <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    目标：{{ plan.require }}
                  </p>
                </div>
                <span
                  class="rounded-full px-3 py-1 text-xs font-medium"
                  :class="plan.completed
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                    : 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'"
                >
                  {{ plan.completed ? '已全部达标' : '仍需推进' }}
                </span>
              </div>
              <div class="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                <p>总词数：{{ plan.totalWords }}</p>
                <p>目标次数：每词 {{ plan.targetCount }} 次</p>
                <p>未达标词：{{ plan.outstandingWords.length }}</p>
                <p>
                  今日起建议优先词：
                  {{ formatPlanWordPreview(plan.outstandingWords, 5) }}
                </p>
              </div>
            </div>
          </div>

          <div class="space-y-4">
            <div
              v-for="day in keywordPlan.days"
              :key="day.dayNumber"
              class="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800"
            >
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p class="text-xs font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">
                    Day {{ day.dayNumber }}
                  </p>
                  <h5 class="mt-1 text-xl font-bold text-gray-900 dark:text-white">
                    第 {{ day.dayNumber }} 天学习任务
                  </h5>
                  <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    今日共安排 {{ day.totalWords }} 个重点词，还需补 {{ day.totalRemainingHits }} 次正确记忆。
                  </p>
                </div>
                <div class="flex flex-wrap gap-2 text-xs">
                  <span class="rounded-full bg-gray-100 px-3 py-1 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                    重点词 {{ day.totalWords }}
                  </span>
                  <span class="rounded-full bg-blue-50 px-3 py-1 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                    记忆补点 {{ day.totalRemainingHits }}
                  </span>
                </div>
              </div>

              <div class="mt-4 grid gap-4 lg:grid-cols-3">
                <div
                  v-for="task in day.tasks"
                  :key="`${day.dayNumber}-${task.title}`"
                  class="rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-900/40"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div>
                      <h6 class="font-semibold text-gray-900 dark:text-white">
                        {{ task.title }}
                      </h6>
                      <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        {{ task.require }}
                      </p>
                    </div>
                    <span class="rounded-full bg-white px-2.5 py-1 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                      {{ task.targetWordCount }} 词
                    </span>
                  </div>
                  <div class="mt-3 space-y-2 text-sm text-gray-600 dark:text-gray-300">
                    <p>今日新/重点：{{ task.targetWordCount }} 个</p>
                    <p>待补次数：{{ task.remainingHits }}</p>
                    <p>建议词：{{ formatPlanWordPreview(task.wordsForDay, 5) }}</p>
                  </div>
                  <button
                    type="button"
                    class="mt-4 w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-gray-700"
                    :disabled="!task.targetWordCount"
                    @click="startPlanFlashcards(day, task)"
                  >
                    {{ task.targetWordCount ? '学习这类任务闪卡' : '今天该类无新增任务' }}
                  </button>
                </div>
              </div>

              <div class="mt-5 rounded-xl bg-slate-50 px-4 py-4 dark:bg-slate-900/60">
                <p class="text-sm font-semibold text-gray-900 dark:text-white">
                  当天具体学习建议
                </p>
                <ul class="mt-3 ml-5 list-disc space-y-2 text-sm text-gray-600 dark:text-gray-300">
                  <li v-for="tip in day.suggestions" :key="tip">
                    {{ tip }}
                  </li>
                </ul>
              </div>

              <div class="mt-4 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700 dark:disabled:bg-gray-900 dark:disabled:text-gray-500"
                  :disabled="!day.totalWords"
                  @click="startPlanFlashcards(day)"
                >
                  {{ day.totalWords ? '学习当天全部任务闪卡' : '今天以复习已学内容为主' }}
                </button>
              </div>
            </div>
          </div>
        </div>

        <template v-else>
          <template v-for="cat in filteredCategories" :key="cat.title">
            <div class="mt-6 items-center justify-between lg:flex">
              <div class="mb-4 lg:mb-0">
                <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
                  {{ cat.title }}
                </h3>
                <span class="text-base font-normal text-gray-500 dark:text-gray-400">{{ cat.define }}</span>
              </div>
              <div class="mb-4 lg:mb-0">
                <button
                  type="button"
                  class="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 focus:outline-none focus:ring-4 focus:ring-sky-300 dark:bg-sky-500 dark:hover:bg-sky-600 dark:focus:ring-sky-800"
                  @click="$router.push({ path: '/vocabulary/typing', query: { chapter: getTypingPracticeChapter(cat.title) } })"
                >
                  该类单词打字练习
                </button>
              </div>
            </div>
            <div class="mt-6">
              <div class="mb-4 flex flex-wrap items-center gap-2 text-xs">
                <span class="rounded-full bg-gray-100 px-3 py-1 text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                  总词数 {{ getCategoryProgressSummary(cat).total }}
                </span>
                <span class="rounded-full bg-amber-50 px-3 py-1 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
                  5+ 次 {{ getCategoryProgressSummary(cat).fivePlus }}
                </span>
                <span class="rounded-full bg-blue-50 px-3 py-1 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300">
                  10+ 次 {{ getCategoryProgressSummary(cat).tenPlus }}
                </span>
                <span class="rounded-full bg-emerald-50 px-3 py-1 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                  烂熟于心 {{ getCategoryProgressSummary(cat).mastered }}
                </span>
                <span class="text-gray-500 dark:text-gray-400">
                  {{ cat.require }}
                </span>
              </div>
              <div class="mb-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="border rounded-full px-3 py-1 text-xs font-medium transition"
                  :class="columnVisibility.word
                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                    : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
                  @click="toggleColumn('word')"
                >
                  {{ columnVisibility.word ? '隐藏考点词' : '显示考点词' }}
                </button>
                <button
                  type="button"
                  class="border rounded-full px-3 py-1 text-xs font-medium transition"
                  :class="columnVisibility.type
                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                    : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
                  @click="toggleColumn('type')"
                >
                  {{ columnVisibility.type ? '隐藏词性' : '显示词性' }}
                </button>
                <button
                  type="button"
                  class="border rounded-full px-3 py-1 text-xs font-medium transition"
                  :class="columnVisibility.meaning
                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                    : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
                  @click="toggleColumn('meaning')"
                >
                  {{ columnVisibility.meaning ? '隐藏词义' : '显示词义' }}
                </button>
                <button
                  type="button"
                  class="border rounded-full px-3 py-1 text-xs font-medium transition"
                  :class="columnVisibility.synonyms
                    ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300'
                    : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'"
                  @click="toggleColumn('synonyms')"
                >
                  {{ columnVisibility.synonyms ? '隐藏同义替换' : '显示同义替换' }}
                </button>
              </div>
              <table class="w-full text-left text-sm text-gray-500 dark:text-gray-400">
                <thead class="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400">
                  <tr>
                    <th class="w-0 px-6 py-3">
                      排名
                    </th>
                    <th class="w-0 px-6 py-3" />
                    <th scope="col" class="w-0 px-6 py-3">
                      <div class="flex items-center gap-2">
                        <span>考点词</span>
                        <button
                          type="button"
                          class="border border-transparent rounded px-2 py-0.5 text-[10px] normal-case text-gray-500 hover:border-gray-300 dark:text-gray-300 hover:text-gray-700 dark:hover:border-gray-500 dark:hover:text-white"
                          @click="toggleColumn('word')"
                        >
                          {{ columnVisibility.word ? '隐藏' : '显示' }}
                        </button>
                      </div>
                    </th>
                    <th scope="col" class="w-0 px-6 py-3">
                      <div class="flex items-center gap-2">
                        <span>词性</span>
                        <button
                          type="button"
                          class="border border-transparent rounded px-2 py-0.5 text-[10px] normal-case text-gray-500 hover:border-gray-300 dark:text-gray-300 hover:text-gray-700 dark:hover:border-gray-500 dark:hover:text-white"
                          @click="toggleColumn('type')"
                        >
                          {{ columnVisibility.type ? '隐藏' : '显示' }}
                        </button>
                      </div>
                    </th>
                    <th scope="col" class="w-80 px-6 py-3">
                      <div class="flex items-center gap-2">
                        <span>词义</span>
                        <button
                          type="button"
                          class="border border-transparent rounded px-2 py-0.5 text-[10px] normal-case text-gray-500 hover:border-gray-300 dark:text-gray-300 hover:text-gray-700 dark:hover:border-gray-500 dark:hover:text-white"
                          @click="toggleColumn('meaning')"
                        >
                          {{ columnVisibility.meaning ? '隐藏' : '显示' }}
                        </button>
                      </div>
                    </th>
                    <th scope="col" class="px-6 py-3">
                      <div class="flex items-center gap-2">
                        <span>同义替换</span>
                        <button
                          type="button"
                          class="border border-transparent rounded px-2 py-0.5 text-[10px] normal-case text-gray-500 hover:border-gray-300 dark:text-gray-300 hover:text-gray-700 dark:hover:border-gray-500 dark:hover:text-white"
                          @click="toggleColumn('synonyms')"
                        >
                          {{ columnVisibility.synonyms ? '隐藏' : '显示' }}
                        </button>
                      </div>
                    </th>
                    <th scope="col" class="w-56 px-6 py-3">
                      记忆进度
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="w in cat.words"
                    :key="w[0]"
                    class="border-b bg-white dark:border-gray-700 dark:bg-gray-800"
                  >
                    <td class="px-6 py-4">
                      {{ w[0] }}
                    </td>
                    <td class="px-6 py-4">
                      <button type="button" class="i-carbon-volume-up-filled block" @click="play(w[1])" />
                    </td>
                    <th scope="row" class="whitespace-nowrap px-6 py-4 font-medium text-gray-900 dark:text-white">
                      <div v-if="columnVisibility.word" class="flex items-center gap-2">
                        <button
                          type="button"
                          class="text-left hover:underline"
                          :title="`查看 ${normalizeWord(w[1])} 的记忆词卡`"
                          @click="showWordToast(createMetaFromRow(w), $event)"
                        >
                          {{ w[1] }}
                        </button>
                        <a
                          class="i-carbon-launch text-sm text-gray-400 hover:text-blue-600"
                          :title="`在剑桥词典中查询 ${normalizeWord(w[1])}`"
                          :href="`https://dictionary.cambridge.org/dictionary/english-chinese-simplified/${encodeURIComponent(normalizeWord(w[1]))}`"
                          target="_blank"
                        />
                      </div>
                      <span v-else class="text-gray-400 dark:text-gray-500">已隐藏，请先回忆单词</span>
                    </th>
                    <td
                      v-if="columnVisibility.type"
                      class="px-6 py-4 italic"
                      v-html="w[2].join('<br>')"
                    />
                    <td
                      v-else
                      class="px-6 py-4 italic text-gray-400 dark:text-gray-500"
                    >
                      已隐藏
                    </td>
                    <td
                      v-if="columnVisibility.meaning"
                      class="px-6 py-4"
                      v-html="w[3].join('<br>')"
                    />
                    <td
                      v-else
                      class="px-6 py-4 text-gray-400 dark:text-gray-500"
                    >
                      已隐藏，请先回忆词义
                    </td>
                    <td class="px-6 py-4">
                      <template v-if="columnVisibility.synonyms">
                        <template v-for="(synonym, idx) in w[4]" :key="`${w[0]}_${synonym}`">
                          <button
                            type="button"
                            class="inline text-left text-blue-700 dark:text-blue-400 hover:underline"
                            :title="`查看同义替换 ${normalizeWord(synonym)} 的记忆词卡`"
                            @click="showWordToast(createMetaFromSynonym(synonym, w), $event)"
                          >
                            {{ synonym }}
                          </button>
                          <span v-if="idx < w[4].length - 1">, </span>
                        </template>
                        <br>
                        {{ w[5].length > 0 ? w[5] : '' }}
                      </template>
                      <span v-else class="text-gray-400 dark:text-gray-500">已隐藏，请先回忆同义替换</span>
                    </td>
                    <td class="px-6 py-4">
                      <div class="flex flex-col items-start gap-2">
                        <span
                          class="rounded-full border px-3 py-1 text-xs font-medium"
                          :class="getMemoryStageMeta(w[1], cat.title).className"
                          :title="getMemoryStageMeta(w[1], cat.title).hint"
                        >
                          {{ getMemoryStageMeta(w[1], cat.title).label }}
                        </span>
                        <span class="text-sm font-medium text-gray-700 dark:text-gray-200">
                          已记住 {{ getFlashcardMemoryCount(w[1]) }} 次
                        </span>
                        <span class="text-xs text-gray-500 dark:text-gray-400">
                          {{ getMemoryStageMeta(w[1], cat.title).hint }}
                        </span>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </template>
      </div>
    </div>
  </div>
  <Transition
    enter-active-class="transition duration-200 ease-out"
    enter-from-class="translate-y-2 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-150 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-2 opacity-0"
  >
    <div
      v-if="wordToast.visible"
      :style="wordToast.positionStyle"
      class="fixed z-50 w-[min(92vw,28rem)] border border-gray-200 rounded-2xl bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-800"
    >
      <div class="flex items-start justify-between gap-4">
        <div>
          <p class="text-xs font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">
            Word Memory Card
          </p>
          <h4 class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">
            {{ wordToast.word }}
          </h4>
          <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {{ wordToast.type }} · {{ wordToast.meaning }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="i-carbon-volume-up-filled text-lg text-gray-500 dark:text-gray-400 hover:text-blue-600"
            :title="`播放 ${wordToast.word} 发音`"
            @click="play(wordToast.word)"
          />
          <button
            type="button"
            class="i-carbon-close text-lg text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            title="关闭词卡"
            @click="closeWordToast"
          />
        </div>
      </div>

      <div class="mt-4 text-sm text-gray-700 space-y-3 dark:text-gray-200">
        <div>
          <p class="text-xs font-medium tracking-wide uppercase text-gray-500 dark:text-gray-400">
            音标
          </p>
          <p class="phonetic-text mt-1 text-base">
            {{ wordToast.loading ? '查询中...' : (wordToast.phonetic || '暂未查到') }}
          </p>
        </div>

        <div>
          <p class="text-xs font-medium tracking-wide uppercase text-gray-500 dark:text-gray-400">
            音节拆分
          </p>
          <p class="mt-1">
            {{ wordToast.syllables || '暂未生成' }}
          </p>
        </div>

        <div>
          <p class="text-xs font-medium tracking-wide uppercase text-gray-500 dark:text-gray-400">
            雅思例句
          </p>
          <p class="mt-1 leading-6">
            {{ wordToast.example || '暂未找到例句。' }}
          </p>
        </div>

        <div class="rounded-xl bg-blue-50 px-3 py-3 dark:bg-blue-500/10">
          <p class="text-xs font-medium tracking-wide uppercase text-blue-700 dark:text-blue-300">
            助记提示
          </p>
          <p class="mt-1 leading-6 text-blue-900 dark:text-blue-100">
            {{ wordToast.memoryHint }}
          </p>
        </div>

        <div v-if="wordToast.note" class="rounded-lg bg-amber-50 px-3 py-2 text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
          {{ wordToast.note }}
        </div>

        <p v-if="wordToast.error" class="text-xs text-gray-500 dark:text-gray-400">
          {{ wordToast.error }}
        </p>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.phonetic-text {
  font-family: 'Times New Roman', 'Noto Sans', 'Segoe UI Symbol', 'Arial Unicode MS', serif;
  letter-spacing: 0.01em;
}
</style>
