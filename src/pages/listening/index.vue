<script setup>
import words from './listening179.json'
import { requestProgressSync } from '~/composables/useAuth'
import { touchProgressTimestamp } from '~/lib/progress-sync'

const LISTENING_FLASHCARD_VIEW_KEY = 'listening_179_view'
const LISTENING_FLASHCARD_STATUS_KEY = 'listening_179_flashcard_statuses'
const LISTENING_FLASHCARD_REVIEWED_AT_KEY = 'listening_179_flashcard_reviewed_at'
const LISTENING_FLASHCARD_MEMORY_COUNT_KEY = 'listening_179_flashcard_memory_counts'

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

const activeTab = ref('keywords')
const activeView = ref(localStorage.getItem(LISTENING_FLASHCARD_VIEW_KEY) || 'flashcard')
const keyword = ref('')
const flashcardIndex = ref(0)
const flashcardFlipped = ref(false)
const flashcardPretest = ref(null)
const flashcardOrder = ref([])
const flashcardFullscreenEl = ref(null)
const isFlashcardFullscreen = ref(false)
const flashcardReviewOptions = reactive({
  reviewMode: 'all',
  shuffle: false,
  autoNextAfterFlip: false,
})
const flashcardStatuses = reactive({})
const flashcardReviewedAt = reactive({})
const flashcardMemoryCounts = reactive({})
let autoNextTimer = null

const dictionaryCache = new Map()
const currentFlashcardPhoneticRequestId = ref(0)
const flashcardBackPhonetic = ref('')
const flashcardBackPhoneticLoading = ref(false)

const searchedWords = computed(() => {
  const query = keyword.value.trim().toLowerCase()
  if (!query)
    return words

  return words.filter((item) => {
    const haystack = [
      item.word,
      item.type,
      item.meaning,
      ...(item.replace || []),
    ].join(' ').toLowerCase()
    return haystack.includes(query)
  })
})

const flashcards = computed(() => searchedWords.value.map(item => ({
  ...item,
  statusKey: `listening179::${item.word.toLowerCase()}`,
})))

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

watch(activeView, (value) => {
  localStorage.setItem(LISTENING_FLASHCARD_VIEW_KEY, value)
  flashcardFlipped.value = false
  flashcardPretest.value = null
  clearAutoNextTimer()
  if (value !== 'flashcard')
    exitFlashcardFullscreen()
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

watch(
  () => currentFlashcard.value?.statusKey,
  () => {
    void loadCurrentFlashcardPhonetic()
  },
  { immediate: true },
)

function getTodayKey() {
  return new Date().toISOString().slice(0, 10)
}

function persistFlashcardState() {
  touchProgressTimestamp()
  localStorage.setItem(LISTENING_FLASHCARD_STATUS_KEY, JSON.stringify(flashcardStatuses))
  localStorage.setItem(LISTENING_FLASHCARD_REVIEWED_AT_KEY, JSON.stringify(flashcardReviewedAt))
  localStorage.setItem(LISTENING_FLASHCARD_MEMORY_COUNT_KEY, JSON.stringify(flashcardMemoryCounts))
  requestProgressSync()
}

function loadFlashcardState() {
  for (const [key, target] of [
    [LISTENING_FLASHCARD_STATUS_KEY, flashcardStatuses],
    [LISTENING_FLASHCARD_REVIEWED_AT_KEY, flashcardReviewedAt],
    [LISTENING_FLASHCARD_MEMORY_COUNT_KEY, flashcardMemoryCounts],
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

function getFlashcardStatus(statusKey) {
  return flashcardStatuses[statusKey] || ''
}

function getFlashcardMemoryCount(statusKey) {
  const value = flashcardMemoryCounts[statusKey]
  return Number.isFinite(value) ? value : 0
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

function clearAllListeningFlashcardProgress() {
  if (!confirm('确定清除听力 179 闪卡学习记录？所有标记与记忆次数将清空，且无法恢复。'))
    return
  for (const k of Object.keys(flashcardStatuses))
    delete flashcardStatuses[k]
  for (const k of Object.keys(flashcardReviewedAt))
    delete flashcardReviewedAt[k]
  for (const k of Object.keys(flashcardMemoryCounts))
    delete flashcardMemoryCounts[k]
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

function play(word) {
  const audio = document.createElement('audio')
  audio.src = `/179_audios/${word}.mp3`
  audio.play()
}

function buildLookupTokens(rawWord) {
  return String(rawWord || '').trim().split(/\s+/).map(token => token.trim()).filter(Boolean)
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
  const rawWord = currentFlashcard.value?.word || ''
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

function buildMemoryHint(card) {
  const word = card.word.toLowerCase()
  const meaning = card.meaning || '核心含义'
  const synonym = card.replace?.[0] || ''

  if (buildLookupTokens(card.word).length > 1)
    return `先把 "${card.word}" 当成整块短语记，不要逐字拆散。先锁定整体义“${meaning}”，再和同义替换 ${synonym || '或听力语境'} 对照，记住它通常在听力里怎么被改写。`

  const prefixRules = [
    { match: 'inter', hint: 'inter- 常表示“在……之间、相互”' },
    { match: 'trans', hint: 'trans- 常表示“跨越、转移、传递”' },
    { match: 'super', hint: 'super- 常表示“上、超、过度”' },
    { match: 'sub', hint: 'sub- 常表示“下、次级、细分”' },
    { match: 'pre', hint: 'pre- 常表示“在前、预先”' },
    { match: 're', hint: 're- 常表示“再、回、重新”' },
    { match: 'un', hint: 'un- 常表示“否定、相反”' },
    { match: 'dis', hint: 'dis- 常表示“分开、否定、反向”' },
    { match: 'mis', hint: 'mis- 常表示“错、坏、误”' },
  ]
  const suffixRules = [
    { match: 'tion', hint: '-tion / -sion 常把词拉向“行为、结果、状态”名词' },
    { match: 'sion', hint: '-tion / -sion 常把词拉向“行为、结果、状态”名词' },
    { match: 'ment', hint: '-ment 常表示“结果、事物、状态”' },
    { match: 'ity', hint: '-ity 常表示“性质、特征、状态”' },
    { match: 'ive', hint: '-ive 常见于形容词，表示“具有……倾向/性质”' },
    { match: 'ous', hint: '-ous 常见于形容词，表示“充满……的、有……性质的”' },
    { match: 'able', hint: '-able / -ible 常表示“能够……的、适合……的”' },
    { match: 'ible', hint: '-able / -ible 常表示“能够……的、适合……的”' },
    { match: 'ly', hint: '-ly 常见于副词，也可能是形容词尾，先判断它修饰动作还是描述性质' },
  ]
  const rootRules = [
    { match: 'spect', hint: '词根 spect 常和“看”有关' },
    { match: 'dict', hint: '词根 dict 常和“说、表述”有关' },
    { match: 'struct', hint: '词根 struct 常和“建、构造”有关' },
    { match: 'tract', hint: '词根 tract 常和“拉、拖”有关' },
    { match: 'port', hint: '词根 port 常和“搬运、携带”有关' },
    { match: 'ject', hint: '词根 ject 常和“扔、投”有关' },
    { match: 'gress', hint: '词根 gress 常和“走、前进”有关' },
    { match: 'press', hint: '词根 press 常和“压、按”有关' },
  ]
  const prefixHint = prefixRules.find(rule => word.startsWith(rule.match) && word.length - rule.match.length >= 3)?.hint
  const suffixHint = suffixRules.find(rule => word.endsWith(rule.match) && word.length - rule.match.length >= 3)?.hint
  const rootHint = rootRules.find(rule => word.includes(rule.match))?.hint
  const structureHints = [prefixHint, rootHint, suffixHint].filter(Boolean)

  if (structureHints.length)
    return `${structureHints.join('；')}。背 ${card.word} 时，先沿着构词线索推到“${meaning}”，再顺手联想听力里常见的替换词 ${synonym || '或同场景表达'}。`

  if (String(card.type || '').toLowerCase().includes('v'))
    return `这个词更适合按“动作词”来记。先抓核心义“${meaning}”，再想是谁在做这个动作、动作指向谁；听力里它常被更口语的表达替换。`

  return `如果暂时拆不出稳定词根词缀，就先把 ${card.word} 和“${meaning}”一对一绑定，再结合同义替换 ${synonym || '和听力场景'} 反复复现。`
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

function handleListeningFlashcardKeydown(event) {
  if (activeTab.value !== 'keywords' || activeView.value !== 'flashcard')
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
  loadFlashcardState()
  syncFlashcardFullscreenState()
  window.addEventListener('keydown', handleListeningFlashcardKeydown)
  document.addEventListener('fullscreenchange', syncFlashcardFullscreenState)
  document.addEventListener('webkitfullscreenchange', syncFlashcardFullscreenState)
})

onBeforeUnmount(() => {
  clearAutoNextTimer()
  window.removeEventListener('keydown', handleListeningFlashcardKeydown)
  document.removeEventListener('fullscreenchange', syncFlashcardFullscreenState)
  document.removeEventListener('webkitfullscreenchange', syncFlashcardFullscreenState)
})
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
              ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
              : 'bg-white text-gray-500 dark:bg-gray-800 dark:text-gray-400'"
            @click="activeTab = 'concepts'"
          >
            IELTS 听力概述
          </button>
        </li>
        <li class="w-full">
          <button
            type="button"
            class="inline-block w-full rounded-r-lg p-4"
            :class="activeTab === 'keywords'
              ? 'bg-blue-50 font-semibold text-blue-700 dark:bg-blue-500/15 dark:text-blue-300'
              : 'bg-white text-gray-500 dark:bg-gray-800 dark:text-gray-400'"
            @click="activeTab = 'keywords'"
          >
            听力 179 考点词
          </button>
        </li>
      </ul>

      <div v-if="activeTab === 'concepts'" class="pt-6 text-gray-500 dark:text-gray-400">
        <h3 class="mb-4 text-xl font-semibold text-black dark:text-white">概述</h3>
        <div class="mb-4">
          <p>了解雅思听力，以及考试中的一些基本原则、技巧</p>
          <br>
          <p>评分表</p>
          <table class="w-full text-center text-sm text-gray-500 dark:text-gray-400">
            <tbody>
              <tr class="border bg-white dark:border-gray-700 dark:bg-gray-800">
                <td v-for="v in scoreTable" :key="v[0]" class="border px-6 py-4">{{ v[0] }}</td>
              </tr>
              <tr class="border bg-white dark:border-gray-700 dark:bg-gray-800">
                <td v-for="v in scoreTable" :key="v[0]" class="border px-6 py-4">{{ v[1] }}</td>
              </tr>
            </tbody>
          </table>
          <br>
          <ul class="ml-6 list-disc">
            <li>时限 30min</li>
            <li>结尾 10min 额外时间（这里说的应该是笔试，机考可能不一样）</li>
            <li>40 个题（错 10 个以内都可以得 7+）</li>
            <li>4 个小节，每个 10 题，难度递增</li>
            <li>答案是顺序的</li>
            <li>3 种题型：gap-fill、multiple choice、matching</li>
            <li>多种口音</li>
            <li>只能听一次</li>
          </ul>
        </div>
        <h3 class="my-4 text-xl font-semibold text-black dark:text-white">Section 1-4 核心提醒</h3>
        <ul class="ml-6 list-disc space-y-2">
          <li>Section 1 以日常对话和基础信息为主，目标尽量 9-10 个正确。</li>
          <li>Section 2 只有一个说话人，继续重点抓顺序和定位。</li>
          <li>Section 3 会出现教育培训场景，对话更复杂，同义替换更密。</li>
          <li>Section 4 无中途停顿，学术内容多，必须提前划关键词。</li>
          <li>整个听力都要坚持：提前读题、划关键词、听同义替换、不要回头卡题。</li>
        </ul>
      </div>

      <div v-else class="pt-6">
        <div class="items-center justify-between lg:flex">
          <div class="mb-4 lg:mb-0">
            <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">听力 179 考点词</h3>
            <span class="text-base font-normal text-gray-500 dark:text-gray-400">默认优先进入闪卡模式，适合先背高频听力替换</span>
          </div>
          <div class="items-center sm:flex">
            <div class="flex flex-wrap items-center gap-2">
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
                  ? 'border-orange-300 bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-orange-200 dark:border-orange-400/40 dark:from-orange-500 dark:to-amber-500'
                  : 'border-orange-200 bg-orange-50 text-orange-700 hover:border-orange-300 hover:bg-orange-100 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300 dark:hover:bg-orange-500/20'"
                @click="activeView = 'flashcard'"
              >
                <span class="inline-flex items-center gap-2">
                  <span class="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">Flash</span>
                  <span>闪卡模式</span>
                </span>
              </button>
              <RouterLink
                to="/listening/179practice"
                class="rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-100 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-300 dark:hover:bg-sky-500/20"
              >
                拼写练习
              </RouterLink>
              <input
                v-model="keyword"
                type="search"
                class="w-56 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                placeholder="搜索考点词/替换词"
              >
            </div>
          </div>
        </div>

        <div v-if="activeView === 'list'" class="mt-6 overflow-x-auto rounded-lg">
          <table class="w-full text-left text-sm text-gray-500 dark:text-gray-400">
            <thead class="bg-gray-50 text-xs uppercase text-gray-700 dark:bg-gray-700 dark:text-gray-400">
              <tr>
                <th class="w-0 px-6 py-3">#</th>
                <th class="w-20 px-6 py-3">音频</th>
                <th class="px-6 py-3">考点词</th>
                <th class="w-0 px-6 py-3">词性</th>
                <th class="px-6 py-3">词义</th>
                <th class="px-6 py-3">同义替换</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in searchedWords" :key="item.index" class="border-b bg-white dark:border-gray-700 dark:bg-gray-800">
                <td class="px-6 py-4">{{ item.index }}</td>
                <td class="px-6 py-4">
                  <button class="i-carbon-volume-up-filled" @click="play(item.word)" />
                </td>
                <td class="px-6 py-4 font-medium text-gray-900 dark:text-white">{{ item.word }}</td>
                <td class="px-6 py-4 italic">{{ item.type || '-' }}</td>
                <td class="px-6 py-4">{{ item.meaning }}</td>
                <td class="px-6 py-4">{{ item.replace.join(', ') }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else class="mt-6">
          <div class="grid mb-4 gap-3 xl:grid-cols-8 lg:grid-cols-4 sm:grid-cols-2">
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
            <div class="rounded-xl bg-blue-50 px-4 py-3 text-sm dark:bg-blue-500/10">
              <p class="text-xs tracking-wide uppercase text-blue-700 dark:text-blue-300">未标记</p>
              <p class="mt-1 text-lg font-semibold text-blue-800 dark:text-blue-200">{{ flashcardStats.unmarked }}</p>
            </div>
            <div class="rounded-xl bg-purple-50 px-4 py-3 text-sm dark:bg-purple-500/10">
              <p class="text-xs tracking-wide uppercase text-purple-700 dark:text-purple-300">今日复习进度</p>
              <p class="mt-1 text-lg font-semibold text-purple-800 dark:text-purple-200">{{ flashcardStats.reviewedToday }} / {{ flashcardStats.total }}</p>
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
            <button type="button" class="border rounded-full px-3 py-1 text-xs font-medium transition" :class="flashcardReviewOptions.reviewMode === 'all' ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300' : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'" @click="setReviewMode('all')">全部单词</button>
            <button type="button" class="border rounded-full px-3 py-1 text-xs font-medium transition" :class="flashcardReviewOptions.reviewMode === 'unknown' ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300' : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'" @click="setReviewMode('unknown')">只复习“不认识”</button>
            <button type="button" class="border rounded-full px-3 py-1 text-xs font-medium transition" :class="flashcardReviewOptions.reviewMode === 'unmarked' ? 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/30 dark:bg-cyan-500/10 dark:text-cyan-300' : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'" @click="setReviewMode('unmarked')">只复习“未标记”</button>
            <button type="button" class="border rounded-full px-3 py-1 text-xs font-medium transition" :class="flashcardReviewOptions.shuffle ? 'border-purple-200 bg-purple-50 text-purple-700 dark:border-purple-500/30 dark:bg-purple-500/10 dark:text-purple-300' : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'" @click="flashcardReviewOptions.shuffle = !flashcardReviewOptions.shuffle">{{ flashcardReviewOptions.shuffle ? '自动打乱复习中' : '自动打乱复习' }}</button>
            <button type="button" class="border rounded-full px-3 py-1 text-xs font-medium transition" :class="flashcardReviewOptions.autoNextAfterFlip ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300' : 'border-gray-200 bg-gray-100 text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300'" @click="flashcardReviewOptions.autoNextAfterFlip = !flashcardReviewOptions.autoNextAfterFlip">{{ flashcardReviewOptions.autoNextAfterFlip ? '确认后自动下一张中' : '确认后自动下一张' }}</button>
            <button type="button" class="border rounded-full border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700 transition dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300" @click="clearAllListeningFlashcardProgress">清除闪卡学习记录</button>
            <span class="text-xs text-gray-500 dark:text-gray-400">当前词库：听力 179</span>
          </div>

          <div
            v-if="currentFlashcard"
            ref="flashcardFullscreenEl"
            class="mx-auto max-w-6xl w-full"
            :class="isFlashcardFullscreen ? 'max-w-none h-full w-full flex flex-col justify-center bg-gray-950 px-4 py-6 sm:px-8' : ''"
          >
            <div class="mb-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400" :class="isFlashcardFullscreen ? 'text-gray-300' : ''">
              <div class="flex items-center gap-3">
                <span class="rounded-full bg-gray-100 px-3 py-1 dark:bg-gray-700">听力 179</span>
                <span>{{ flashcardIndex + 1 }} / {{ flashcardDeck.length }}</span>
                <span class="rounded-full border px-3 py-1 font-medium" :class="getMemoryStageMeta(currentFlashcard.statusKey).className" :title="getMemoryStageMeta(currentFlashcard.statusKey).hint">{{ getMemoryStageMeta(currentFlashcard.statusKey).label }}</span>
                <span class="rounded-full bg-slate-100 px-3 py-1 text-slate-700 dark:bg-slate-800 dark:text-slate-200">已记住 {{ getFlashcardMemoryCount(currentFlashcard.statusKey) }} 次</span>
              </div>
              <div class="flex items-center gap-2">
                <button type="button" class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700" @click="toggleFlashcardFullscreen">{{ isFlashcardFullscreen ? '退出全屏' : '全屏' }}</button>
                <button type="button" class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700" @click="moveFlashcard(-1)">上一张</button>
                <button type="button" class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700" @click="randomFlashcard">随机</button>
                <button type="button" class="border border-gray-200 rounded-lg px-3 py-1.5 text-sm dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700" @click="moveFlashcard(1)">下一张</button>
              </div>
            </div>

            <button
              type="button"
              class="w-full border border-sky-200 rounded-2xl bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-100 p-8 text-left shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-sky-700/60 dark:from-slate-800 dark:via-sky-900/40 dark:to-slate-900 dark:hover:border-blue-500/40"
              :class="[isFlashcardFullscreen ? 'min-h-[calc(100vh-9rem)] border-sky-300 from-sky-100 via-blue-50 to-cyan-100 dark:border-sky-700 dark:from-slate-900 dark:via-sky-950/70 dark:to-slate-950' : '', flashcardFlipped ? 'cursor-pointer' : '']"
              @click="onFlashcardShellClick"
            >
              <div v-if="!flashcardFlipped" class="min-h-[320px] flex flex-col items-center justify-center text-center">
                <p class="mb-6 text-3xl font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">Flashcard Front</p>
                <div class="mb-6 flex flex-wrap items-center justify-center gap-3 text-xl">
                  <span class="rounded-full border px-4 py-1.5 font-medium" :class="getMemoryStageMeta(currentFlashcard.statusKey).className">{{ getMemoryStageMeta(currentFlashcard.statusKey).label }}</span>
                  <span class="rounded-full bg-slate-100 px-4 py-1.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">已记住 {{ getFlashcardMemoryCount(currentFlashcard.statusKey) }} 次</span>
                </div>
                <h4 class="text-[6.75rem] leading-none font-bold text-gray-900 dark:text-white">{{ currentFlashcard.word }}</h4>
                <p class="mt-6 text-3xl text-gray-500 dark:text-gray-400">{{ currentFlashcard.type || '词组' }}</p>
                <div class="mt-8 flex flex-wrap items-center justify-center gap-4" @click.stop>
                  <button type="button" class="rounded-xl border-2 border-gray-200 bg-white px-8 py-4 text-2xl font-semibold text-gray-700 transition hover:border-emerald-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200" @click="selectFlashcardPretestAndFlip('known')">认识<span class="mt-1 block text-sm font-normal opacity-70">K</span></button>
                  <button type="button" class="rounded-xl border-2 border-gray-200 bg-white px-8 py-4 text-2xl font-semibold text-gray-700 transition hover:border-amber-300 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200" @click="selectFlashcardPretestAndFlip('unknown')">不认识<span class="mt-1 block text-sm font-normal opacity-70">U</span></button>
                </div>
              </div>

              <div v-else class="min-h-[320px]">
                <div class="flex flex-wrap items-start justify-between gap-4">
                  <div class="min-w-0 flex-1">
                    <p class="text-3xl font-semibold tracking-wide uppercase text-blue-600 dark:text-blue-400">Flashcard Back</p>
                    <p v-if="flashcardPretest === 'known'" class="mt-2 text-xl text-gray-600 dark:text-gray-300">你正面选了「认识」——请对照释义，用「对 / 错」判断回忆是否准确</p>
                    <p v-else class="mt-2 text-xl text-amber-800 dark:text-amber-200">你已选「不认识」：已自动记入「不认识」，请认真阅读下方释义与替换词</p>
                    <h4 class="mt-3 text-7xl leading-none font-bold text-gray-900 dark:text-white">{{ currentFlashcard.word }}</h4>
                    <p class="phonetic-text mt-4 text-2xl font-medium text-sky-700 dark:text-sky-300">/{{ flashcardBackPhoneticLoading ? '...' : (flashcardBackPhonetic || '暂未查到') }}/</p>
                    <p class="mt-4 text-3xl text-gray-500 dark:text-gray-400">{{ currentFlashcard.type || '词组' }} · {{ currentFlashcard.meaning }}</p>
                  </div>
                  <div class="flex flex-col items-stretch gap-3 lg:max-w-sm" @click.stop>
                    <div v-if="flashcardPretest === 'known'" class="flex flex-col gap-3 sm:flex-row sm:items-start">
                      <button type="button" class="border border-emerald-300 rounded-lg bg-emerald-50 px-5 py-3 text-2xl font-semibold text-emerald-800 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-500/25" @click="confirmFlashcardBack(true)">对<span class="mt-1 block text-sm font-normal opacity-80">与背面一致 · 快捷键 K</span></button>
                      <button type="button" class="border border-red-300 rounded-lg bg-red-50 px-5 py-3 text-2xl font-semibold text-red-800 dark:border-red-500/40 dark:bg-red-500/15 dark:text-red-200 hover:bg-red-100 dark:hover:bg-red-500/25" @click="confirmFlashcardBack(false)">错<span class="mt-1 block text-sm font-normal opacity-80">记错了 · 快捷键 U</span></button>
                    </div>
                    <div class="flex flex-wrap items-center gap-2 sm:justify-end">
                      <button type="button" class="i-carbon-volume-up-filled text-5xl text-gray-500 dark:text-gray-400 hover:text-blue-600" :title="`播放 ${currentFlashcard.word} 发音`" @click="play(currentFlashcard.word)" />
                    </div>
                  </div>
                </div>

                <div class="mt-8 space-y-7 text-3xl text-gray-700 dark:text-gray-200">
                  <div class="rounded-xl bg-blue-50 px-4 py-4 dark:bg-blue-500/10">
                    <p class="text-2xl font-medium tracking-wide uppercase text-blue-700 dark:text-blue-300">助记提示</p>
                    <p class="mt-3 leading-[1.5] text-blue-900 dark:text-blue-100">{{ buildMemoryHint(currentFlashcard) }}</p>
                  </div>
                  <div>
                    <p class="text-2xl font-medium tracking-wide uppercase text-gray-500 dark:text-gray-400">同义替换</p>
                    <p class="mt-3 leading-[1.5]">{{ currentFlashcard.replace.length ? currentFlashcard.replace.join(', ') : '暂无' }}</p>
                  </div>
                </div>
              </div>
            </button>
          </div>
          <div v-else class="border border-gray-300 rounded-xl border-dashed px-6 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            当前筛选条件下没有可用单词，请调整搜索或筛选后再试。
          </div>
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

.dark svg text {
  font-family: 'comic sans ms', system-ui;
  fill: #fff;
}
</style>
