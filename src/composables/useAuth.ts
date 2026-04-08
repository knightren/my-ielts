import type { User } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import { pushLocalProgressToCloud, syncProgressAfterAuth } from '~/lib/progress-sync'

export const authUser = ref<User | null>(null)
export const authReady = ref(false)
export const authError = ref<string | null>(null)

let syncTimer: ReturnType<typeof setInterval> | null = null
let syncSoonTimer: ReturnType<typeof setTimeout> | null = null
const SYNC_MS = 45_000

function stopPeriodicSync() {
  if (syncTimer) {
    clearInterval(syncTimer)
    syncTimer = null
  }
  if (syncSoonTimer) {
    clearTimeout(syncSoonTimer)
    syncSoonTimer = null
  }
}

function startPeriodicSync(userId: string) {
  stopPeriodicSync()
  syncTimer = setInterval(() => {
    pushLocalProgressToCloud(userId).catch((e) => {
      console.warn('[sync]', e)
    })
  }, SYNC_MS)
}

async function runSessionSync(userId: string) {
  try {
    authError.value = null
    const needReload = await syncProgressAfterAuth(userId)
    if (needReload)
      window.location.reload()
    else
      startPeriodicSync(userId)
  }
  catch (e) {
    console.error(e)
    authError.value = e instanceof Error ? e.message : '同步失败'
  }
}

export function requestProgressSync(delay = 1200) {
  const userId = authUser.value?.id
  if (!supabase || !userId)
    return

  if (syncSoonTimer)
    clearTimeout(syncSoonTimer)

  syncSoonTimer = setTimeout(() => {
    pushLocalProgressToCloud(userId).catch((e) => {
      console.warn('[sync-soon]', e)
    })
    syncSoonTimer = null
  }, delay)
}

export async function initAuth() {
  authReady.value = false
  if (!supabase) {
    authReady.value = true
    return
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    authUser.value = session?.user ?? null

    if (event === 'INITIAL_SESSION') {
      if (session?.user)
        await runSessionSync(session.user.id)
      authReady.value = true
      return
    }

    if (event === 'SIGNED_OUT') {
      stopPeriodicSync()
      return
    }

    if (event === 'SIGNED_IN' && session?.user)
      await runSessionSync(session.user.id)

    if (event === 'TOKEN_REFRESHED' && session?.user)
      startPeriodicSync(session.user.id)
  })
}

export async function signInWithEmail(email: string, password: string) {
  if (!supabase)
    throw new Error('未配置 Supabase')
  authError.value = null
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error)
    throw error
}

export async function signUpWithEmail(email: string, password: string) {
  if (!supabase)
    throw new Error('未配置 Supabase')
  authError.value = null
  const { error } = await supabase.auth.signUp({ email: email.trim(), password })
  if (error)
    throw error
}

export async function signOut() {
  if (!supabase)
    return

  authError.value = null
  stopPeriodicSync()
  const previousUser = authUser.value
  authUser.value = null

  const { error } = await supabase.auth.signOut()
  if (error) {
    authUser.value = previousUser
    throw error
  }
}

export function isSupabaseEnabled() {
  return !!supabase
}
