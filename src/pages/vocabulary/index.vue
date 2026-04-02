<!-- eslint-disable eslint-comments/no-unlimited-disable -->
<script setup generic="T extends any, O extends any">
import chapterMap from './chapter-map'

const CHAPTER_KEY = 'vocabulary_chapter'
const VOCABULARY_VIEW_KEY = 'vocabulary_view'
const VOCABULARY_FLASHCARD_STATUS_KEY = 'vocabulary_flashcard_statuses'
const VOCABULARY_FLASHCARD_REVIEWED_AT_KEY = 'vocabulary_flashcard_reviewed_at'
const VOCABULARY_FLASHCARD_MEMORY_COUNT_KEY = 'vocabulary_flashcard_memory_counts'

const isTrainingModel = ref(false)
const isShowMeaning = ref(true)
const isAutoPlayWordAudio = ref(true)
const isOnlyShowErrors = ref(false)
const isFinishTraining = ref(false)
const isShowSource = ref(false)
const activeView = ref(localStorage.getItem(VOCABULARY_VIEW_KEY) || 'list')
const planningDays = ref(7)
const flashcardIndex = ref(0)
const flashcardFlipped = ref(false)
const activePlanLabel = ref('')
const activePlanWordKeys = ref([])
const flashcardOrder = ref([])
const flashcardReviewOptions = reactive({
  reviewMode: 'all',
  shuffle: false,
  autoNextAfterFlip: false,
})
const flashcardStatuses = reactive({})
const flashcardReviewedAt = reactive({})
const flashcardMemoryCounts = reactive({})
let autoNextTimer = null

const trainingStats = ref('')
const keyword = ref('')
const chapters = Object.keys(chapterMap)
const storedCategory = localStorage.getItem(CHAPTER_KEY)
const category = ref(storedCategory && chapterMap[storedCategory] ? storedCategory : chapters[0])

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
  flashcardReviewOptions.reviewMode = 'all'
  clearAutoNextTimer()
})

watch(activeView, (value) => {
  localStorage.setItem(VOCABULARY_VIEW_KEY, value)
  flashcardFlipped.value = false
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
  if (flashcardReviewOptions.reviewMode === 'unknown')
    return cards.filter(card => getFlashcardStatus(card.statusKey) === 'unknown')
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

const flashcardStats = computed(() => {
  const today = getTodayKey()
  const cards = flashcards.value
  const known = cards.filter(card => getFlashcardStatus(card.statusKey) === 'known').length
  const unknown = cards.filter(card => getFlashcardStatus(card.statusKey) === 'unknown').length
  const reviewedToday = cards.filter(card => flashcardReviewedAt[card.statusKey] === today).length
  const fivePlus = cards.filter(card => getFlashcardMemoryCount(card.statusKey) >= 5).length
  const tenPlus = cards.filter(card => getFlashcardMemoryCount(card.statusKey) >= 10).length
  const mastered = cards.filter(card => getFlashcardMemoryCount(card.statusKey) >= 20).length

  return {
    total: cards.length,
    known,
    unknown,
    unmarked: cards.length - known - unknown,
    reviewedToday,
    fivePlus,
    tenPlus,
    mastered,
  }
})

const chapterPlanTarget = computed(() => currentChapter.value?.source === 'base3000' ? 10 : 8)
const chapterPlan = computed(() => {
  const totalDays = Math.max(1, Math.min(60, Number(planningDays.value) || 7))
  const outstandingWords = chapterWords.value
    .map(item => {
      const statusKey = `${category.value}::${item.word[0].toLowerCase()}`
      return {
        ...item,
        statusKey,
        remaining: Math.max(chapterPlanTarget.value - getFlashcardMemoryCount(statusKey), 0),
      }
    })
    .filter(item => item.remaining > 0)

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
  localStorage.setItem(VOCABULARY_FLASHCARD_STATUS_KEY, JSON.stringify(flashcardStatuses))
  localStorage.setItem(VOCABULARY_FLASHCARD_REVIEWED_AT_KEY, JSON.stringify(flashcardReviewedAt))
  localStorage.setItem(VOCABULARY_FLASHCARD_MEMORY_COUNT_KEY, JSON.stringify(flashcardMemoryCounts))
}

function loadFlashcardState() {
  for (const [key, target] of [
    [VOCABULARY_FLASHCARD_STATUS_KEY, flashcardStatuses],
    [VOCABULARY_FLASHCARD_REVIEWED_AT_KEY, flashcardReviewedAt],
    [VOCABULARY_FLASHCARD_MEMORY_COUNT_KEY, flashcardMemoryCounts],
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
}

function getMemoryStageMeta(statusKey) {
  const count = getFlashcardMemoryCount(statusKey)
  if (count >= 20) {
    return {
      label: '烂熟于心',
      hint: '已达到 20 次以上正确回忆',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300',
    }
  }
  if (count >= 10) {
    return {
      label: '10+ 次',
      hint: '已达到 10 次以上正确回忆',
      className: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300',
    }
  }
  if (count >= 5) {
    return {
      label: '5+ 次',
      hint: '已达到 5 次以上正确回忆',
      className: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
    }
  }
  return {
    label: '未达 5 次',
    hint: '继续记背，先冲到 5 次',
    className: 'border-gray-200 bg-gray-100 text-gray-600 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300',
  }
}

function moveFlashcard(step) {
  const cards = flashcardDeck.value
  if (!cards.length)
    return
  flashcardIndex.value = (flashcardIndex.value + step + cards.length) % cards.length
  flashcardFlipped.value = false
  clearAutoNextTimer()
}

function flipFlashcard() {
  if (!currentFlashcard.value)
    return
  flashcardFlipped.value = !flashcardFlipped.value

  if (flashcardFlipped.value && flashcardReviewOptions.autoNextAfterFlip)
    scheduleAutoNext()
  else
    clearAutoNextTimer()
}

function markFlashcard(status) {
  const card = currentFlashcard.value
  if (!card)
    return
  flashcardStatuses[card.statusKey] = status
  flashcardReviewedAt[card.statusKey] = getTodayKey()
  if (status === 'known')
    flashcardMemoryCounts[card.statusKey] = getFlashcardMemoryCount(card.statusKey) + 1
  persistFlashcardState()
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
    '中午或下午切到闪卡模式，先看词再回忆中文义，答对后点“我认识”累计次数。',
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
  flashcardReviewOptions.reviewMode = 'all'
  flashcardReviewOptions.shuffle = true
  flashcardIndex.value = 0
  flashcardFlipped.value = false
}

function clearPlanFlashcards() {
  activePlanWordKeys.value = []
  activePlanLabel.value = ''
  flashcardReviewOptions.reviewMode = 'all'
}

onMounted(() => {
  loaded.value = true
  loadFlashcardState()

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

onUpdated(() => {
  // 音频再切换 SRC 之后需要调用一下 load() 不然看不到效果
  for (const el of document.getElementsByTagName('audio'))
    el.load()
})

document.addEventListener('keydown', (ev) => {
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
            <select
              v-model="category"
              class="block w-full flex-1 border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400"
            >
              <!-- <option value="">
                全部章节
              </option> -->
              <option v-for="(_, k) in refVocabulary" :key="k" :value="k">
                {{ k }}
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
                        {{ isTrainingModel ? '' : item.example }}
                      </td>
                      <td class="p-4">
                        {{ isTrainingModel ? '' : item.extra }}
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
        <div class="grid mb-4 gap-3 xl:grid-cols-7 lg:grid-cols-4 sm:grid-cols-2">
          <div class="rounded-xl bg-gray-50 px-4 py-3 text-sm dark:bg-gray-700/50">
            <p class="text-xs tracking-wide uppercase text-gray-500 dark:text-gray-400">总词数</p>
            <p class="mt-1 text-lg font-semibold text-gray-900 dark:text-white">{{ flashcardStats.total }}</p>
          </div>
          <div class="rounded-xl bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-500/10">
            <p class="text-xs tracking-wide uppercase text-emerald-700 dark:text-emerald-300">我认识</p>
            <p class="mt-1 text-lg font-semibold text-emerald-800 dark:text-emerald-200">{{ flashcardStats.known }}</p>
          </div>
          <div class="rounded-xl bg-amber-50 px-4 py-3 text-sm dark:bg-amber-500/10">
            <p class="text-xs tracking-wide uppercase text-amber-700 dark:text-amber-300">不认识</p>
            <p class="mt-1 text-lg font-semibold text-amber-800 dark:text-amber-200">{{ flashcardStats.unknown }}</p>
          </div>
          <div class="rounded-xl bg-purple-50 px-4 py-3 text-sm dark:bg-purple-500/10">
            <p class="text-xs tracking-wide uppercase text-purple-700 dark:text-purple-300">今日复习</p>
            <p class="mt-1 text-lg font-semibold text-purple-800 dark:text-purple-200">{{ flashcardStats.reviewedToday }}</p>
          </div>
          <div class="rounded-xl bg-amber-50 px-4 py-3 text-sm dark:bg-amber-500/10">
            <p class="text-xs tracking-wide uppercase text-amber-700 dark:text-amber-300">5+ 次</p>
            <p class="mt-1 text-lg font-semibold text-amber-800 dark:text-amber-200">{{ flashcardStats.fivePlus }}</p>
          </div>
          <div class="rounded-xl bg-blue-50 px-4 py-3 text-sm dark:bg-blue-500/10">
            <p class="text-xs tracking-wide uppercase text-blue-700 dark:text-blue-300">10+ 次</p>
            <p class="mt-1 text-lg font-semibold text-blue-800 dark:text-blue-200">{{ flashcardStats.tenPlus }}</p>
          </div>
          <div class="rounded-xl bg-emerald-50 px-4 py-3 text-sm dark:bg-emerald-500/10">
            <p class="text-xs tracking-wide uppercase text-emerald-700 dark:text-emerald-300">烂熟于心</p>
            <p class="mt-1 text-lg font-semibold text-emerald-800 dark:text-emerald-200">{{ flashcardStats.mastered }}</p>
          </div>
        </div>

        <div class="mb-4 flex flex-wrap items-center gap-2">
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
            {{ flashcardReviewOptions.autoNextAfterFlip ? '翻卡后自动下一张中' : '翻卡后自动下一张' }}
          </button>
          <span class="text-xs text-gray-500 dark:text-gray-400">
            基础词汇也支持按状态筛选、打乱和自动过卡了
          </span>
        </div>

        <div
          v-if="currentFlashcard"
          class="mx-auto max-w-4xl cursor-pointer rounded-3xl border border-sky-100 bg-gradient-to-br from-white via-sky-50 to-blue-50 p-6 shadow-lg dark:border-sky-700/40 dark:from-slate-900 dark:via-sky-950/50 dark:to-slate-950"
          @click="flipFlashcard"
        >
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
            <div class="flex flex-wrap items-center gap-3">
              <span class="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-700">{{ category }}</span>
              <span>{{ flashcardIndex + 1 }} / {{ flashcardDeck.length }}</span>
              <span
                class="rounded-full border px-3 py-1 font-medium"
                :class="getMemoryStageMeta(currentFlashcard.statusKey).className"
              >
                {{ getMemoryStageMeta(currentFlashcard.statusKey).label }}
              </span>
              <span class="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                已记住 {{ getFlashcardMemoryCount(currentFlashcard.statusKey) }} 次
              </span>
            </div>
            <div class="flex items-center gap-2">
              <button type="button" class="rounded-lg border border-gray-200 px-3 py-1.5 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700" @click.stop="moveFlashcard(-1)">上一张</button>
              <button type="button" class="rounded-lg border border-gray-200 px-3 py-1.5 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700" @click.stop="moveFlashcard(1)">下一张</button>
            </div>
          </div>

          <div v-if="!flashcardFlipped" class="min-h-[320px] flex flex-col items-center justify-center text-center">
            <p class="mb-6 text-2xl font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">Flashcard Front</p>
            <h4 class="text-[5.5rem] leading-none font-bold text-gray-900 dark:text-white">{{ currentFlashcard.word[0] }}</h4>
            <p class="mt-6 text-2xl text-gray-500 dark:text-gray-400">{{ currentFlashcard.pos }}</p>
            <p class="mt-8 text-xl text-gray-400 dark:text-gray-500">点击卡片翻面，回忆中文词义和例句</p>
          </div>
          <div v-else class="min-h-[320px]">
            <p class="text-2xl font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">Flashcard Back</p>
            <h4 class="mt-3 text-6xl leading-none font-bold text-gray-900 dark:text-white">{{ currentFlashcard.word[0] }}</h4>
            <p class="mt-4 text-2xl text-gray-500 dark:text-gray-400">{{ currentFlashcard.pos }} · {{ currentFlashcard.meaning }}</p>
            <div class="mt-6 space-y-5 text-xl text-gray-700 dark:text-gray-200">
              <div>
                <p class="text-sm font-medium tracking-wide uppercase text-gray-500 dark:text-gray-400">例句</p>
                <p class="mt-2 leading-[1.6]">{{ currentFlashcard.example || '暂未提供例句。' }}</p>
              </div>
              <div>
                <p class="text-sm font-medium tracking-wide uppercase text-gray-500 dark:text-gray-400">补充</p>
                <p class="mt-2 leading-[1.6]">{{ currentFlashcard.extra || '暂无补充。' }}</p>
              </div>
            </div>
            <div class="mt-8 flex flex-wrap items-center gap-3">
              <button type="button" class="rounded-lg border border-emerald-200 px-5 py-3 text-lg text-emerald-700 dark:border-emerald-500/30 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-500/10" @click.stop="markFlashcard('known')">我认识</button>
              <button type="button" class="rounded-lg border border-amber-200 px-5 py-3 text-lg text-amber-700 dark:border-amber-500/30 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-500/10" @click.stop="markFlashcard('unknown')">不认识</button>
              <button type="button" class="i-ph-speaker-simple-high-bold text-3xl text-gray-500 dark:text-gray-400 hover:text-blue-600" @click.stop="play(getWordAudioPath(category, currentFlashcard.word[0]))" />
            </div>
          </div>
        </div>
      </div>
      <div v-else class="mt-6 space-y-4">
        <div class="rounded-2xl border border-sky-200 bg-sky-50 p-5 dark:border-sky-500/30 dark:bg-sky-500/10">
          <div class="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p class="text-xs font-semibold tracking-wide uppercase text-sky-700 dark:text-sky-300">Study Planner</p>
              <h4 class="mt-1 text-2xl font-bold text-gray-900 dark:text-white">{{ category }} 学习规划</h4>
              <p class="mt-2 text-sm text-gray-600 dark:text-gray-300">按天拆分这个词表的任务，并把每天任务直接送进闪卡模式。</p>
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
