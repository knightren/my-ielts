import type { User } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import { pushLocalProgressToCloud, syncProgressAfterAuth } from '~/lib/progress-sync'

export const authUser = ref<User | null>(null)
export const authReady = ref(false)
export const authError = ref<string | null>(null)

let syncTimer: ReturnType<typeof setInterval> | null = null
let syncSoonTimer: ReturnType<typeof setTimeout> | null = null
const SYNC_MS = 45_000
const FORCE_SIGNED_OUT_KEY = 'supabase_force_signed_out'

function clearSupabaseAuthStorage() {
  if (typeof window === 'undefined')
    return

  const prefixes = ['sb-', 'supabase.auth.token']
  for (const storage of [window.localStorage, window.sessionStorage]) {
    const keysToRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && prefixes.some(prefix => key.startsWith(prefix)))
        keysToRemove.push(key)
    }
    for (const key of keysToRemove)
      storage.removeItem(key)
  }
}

function markForceSignedOut() {
  if (typeof window === 'undefined')
    return
  window.localStorage.setItem(FORCE_SIGNED_OUT_KEY, '1')
}

function clearForceSignedOut() {
  if (typeof window === 'undefined')
    return
  window.localStorage.removeItem(FORCE_SIGNED_OUT_KEY)
}

function hasForceSignedOut(): boolean {
  if (typeof window === 'undefined')
    return false
  return window.localStorage.getItem(FORCE_SIGNED_OUT_KEY) === '1'
}

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

  const client = supabase

  if (hasForceSignedOut()) {
    clearSupabaseAuthStorage()
    await client.auth.signOut({ scope: 'local' }).catch(() => {})
    authUser.value = null
  }

  client.auth.onAuthStateChange(async (event, session) => {
    authUser.value = session?.user ?? null

    if (event === 'INITIAL_SESSION') {
      if (hasForceSignedOut()) {
        if (session?.user) {
          await client.auth.signOut({ scope: 'local' }).catch(() => {})
          clearSupabaseAuthStorage()
          authUser.value = null
        }
        else {
          clearForceSignedOut()
        }
        authReady.value = true
        return
      }

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
  clearForceSignedOut()
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
  if (error)
    throw error
}

export async function signUpWithEmail(email: string, password: string) {
  if (!supabase)
    throw new Error('未配置 Supabase')
  authError.value = null
  clearForceSignedOut()
  const { error } = await supabase.auth.signUp({ email: email.trim(), password })
  if (error)
    throw error
}

export async function signOut() {
  if (!supabase)
    return

  authError.value = null
  stopPeriodicSync()
  authUser.value = null
  markForceSignedOut()

  const { error } = await supabase.auth.signOut({ scope: 'local' })
  clearSupabaseAuthStorage()
  if (error)
    throw error
}

export function isSupabaseEnabled() {
  return !!supabase
}
