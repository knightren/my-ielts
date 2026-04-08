<script setup lang="ts">
import {
  authError,
  authReady,
  authUser,
  isSupabaseEnabled,
  signInWithEmail,
  signOut,
  signUpWithEmail,
} from '~/composables/useAuth'

const open = ref(false)
const email = ref('')
const password = ref('')
const busy = ref(false)
const localError = ref<string | null>(null)

async function onSignIn() {
  if (!email.value || !password.value) {
    localError.value = '请输入邮箱和密码'
    return
  }
  busy.value = true
  localError.value = null
  try {
    await signInWithEmail(email.value, password.value)
    open.value = false
    password.value = ''
  }
  catch (e) {
    localError.value = e instanceof Error ? e.message : '登录失败'
  }
  finally {
    busy.value = false
  }
}

async function onSignUp() {
  if (!email.value || !password.value) {
    localError.value = '请输入邮箱和密码'
    return
  }
  if (password.value.length < 6) {
    localError.value = '密码至少 6 位'
    return
  }
  busy.value = true
  localError.value = null
  try {
    await signUpWithEmail(email.value, password.value)
    localError.value = '若开启邮箱验证，请查收邮件后再登录'
  }
  catch (e) {
    localError.value = e instanceof Error ? e.message : '注册失败'
  }
  finally {
    busy.value = false
  }
}

async function onSignOut() {
  busy.value = true
  try {
    await signOut()
  }
  finally {
    busy.value = false
  }
}
</script>

<template>
  <div v-if="isSupabaseEnabled()" class="flex items-center gap-2">
    <template v-if="authUser">
      <span class="hidden max-w-[10rem] truncate text-xs text-gray-500 sm:inline dark:text-gray-400" :title="authUser.email ?? ''">
        {{ authUser.email }}
      </span>
      <button
        type="button"
        class="rounded-lg px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700"
        :disabled="busy"
        @click="onSignOut"
      >
        退出
      </button>
    </template>
    <template v-else>
      <button
        type="button"
        class="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600"
        :disabled="!authReady"
        @click="open = true"
      >
        {{ authReady ? '登录' : '连接中...' }}
      </button>
    </template>

    <Teleport to="body">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
        @click.self="open = false"
      >
        <div class="max-w-sm w-full border border-gray-200 rounded-2xl bg-white p-6 shadow-xl dark:border-gray-600 dark:bg-gray-800">
          <h2 class="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
            登录以同步学习记录
          </h2>
          <p class="mb-4 text-xs text-gray-500 dark:text-gray-400">
            词汇闪卡、阅读 538 闪卡、打字进度和听力 179 练习记录会保存在你的账号下（需先在 Supabase 执行迁移 SQL）。
          </p>
          <label class="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">邮箱</label>
          <input
            v-model="email"
            type="email"
            autocomplete="username"
            class="mb-3 w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
          >
          <label class="mb-2 block text-xs font-medium text-gray-700 dark:text-gray-300">密码</label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            class="mb-3 w-full border border-gray-300 rounded-lg bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-white"
            @keydown.enter="onSignIn"
          >
          <p v-if="localError || authError" class="mb-3 text-xs text-red-600 dark:text-red-400">
            {{ localError || authError }}
          </p>
          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              :disabled="busy"
              @click="onSignIn"
            >
              登录
            </button>
            <button
              type="button"
              class="border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-700 dark:border-gray-600 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700"
              :disabled="busy"
              @click="onSignUp"
            >
              注册
            </button>
            <button
              type="button"
              class="ml-auto rounded-lg px-2 py-2 text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-200"
              @click="open = false"
            >
              取消
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
