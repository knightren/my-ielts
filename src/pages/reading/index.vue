<script setup>
import keywordMarkdown from './538keyword.md?raw'
import words from './reading538words'

const ws = reactive(words)

const keyword = ref('')
const columnVisibility = reactive({
  word: true,
  type: true,
  meaning: true,
  synonyms: true,
})

const exampleMap = createExampleMap(keywordMarkdown)
const wordMetaMap = createWordMetaMap(words, exampleMap)
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
      <!-- Card header -->
      <template
        v-for="cat in ws"
        :key="cat.title"
      >
        <div class="mt-6 items-center justify-between lg:flex">
          <div class="mb-4 lg:mb-0">
            <h3 class="mb-2 text-xl font-bold text-gray-900 dark:text-white">
              {{ cat.title }}
            </h3>
            <span class="text-base font-normal text-gray-500 dark:text-gray-400">{{ cat.define }}</span>
          </div>
          <div class="items-center sm:flex">
            <div class="flex items-center">
              <button
                type="button"
                class="rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-medium text-white dark:bg-blue-600 hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 dark:hover:bg-blue-700 dark:focus:ring-blue-800"
                @click="$router.push('/reading/538practice')"
              >
                练习
              </button>
              <!-- <input type="text" name="email" class="ml-3 block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 text-gray-900 dark:border-gray-600 focus:border-primary-500 dark:bg-gray-700 sm:text-sm dark:text-white focus:ring-primary-500 dark:focus:border-primary-500 dark:focus:ring-primary-500 dark:placeholder-gray-400" placeholder="关键词"> -->
              <div class="relative ml-2 flex-1">
                <div class="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <svg class="h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 20">
                    <path stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="m19 19-4-4m0-7A7 7 0 1 1 1 8a7 7 0 0 1 14 0Z" />
                  </svg>
                </div>
                <input
                  v-model="keyword"
                  type="search"
                  class="block w-full border border-gray-300 rounded-lg bg-gray-50 p-2.5 pl-10 text-sm text-gray-900 dark:border-gray-600 focus:border-blue-500 dark:bg-gray-700 dark:text-white focus:ring-blue-500 dark:focus:border-blue-500 dark:focus:ring-blue-500 dark:placeholder-gray-400" placeholder="Search"
                >
              </div>
            </div>
          </div>
        </div>
        <div class="mt-6">
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
              </tr>
            </tbody>
          </table>
        </div>
      </template>
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
