import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '~/lib/supabase'
import { pushLocalProgressToCloud, syncProgressAfterAuth } from '~/lib/progress-sync'

export const authUser = ref<User | null>(null)
export const authReady = ref(false)
export const authError = ref<string | null>(null)

let syncTimer: ReturnType<typeof setInterval> | null = null
let syncSoonTimer: ReturnType<typeof setTimeout> | null = null
const SYNC_MS = 45_000
const FORCE_SIGNED_OUT_KEY = 'supabase_force_signed_out'
const SUPABASE_AUTH_PREFIXES = ['sb-', 'supabase.auth.token']

function clearSupabaseAuthStorage() {
  if (typeof window === 'undefined')
    return

  for (const storage of [window.localStorage, window.sessionStorage]) {
    const keysToRemove: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key && SUPABASE_AUTH_PREFIXES.some(prefix => key.startsWith(prefix)))
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

async function signOutLocally() {
  if (!supabase)
    return

  const { error } = await supabase.auth.signOut({ scope: 'local' })
  clearSupabaseAuthStorage()
  if (error)
    throw error
}

async function enforceSignedOutState() {
  authUser.value = null
  stopPeriodicSync()
  await signOutLocally().catch(() => {})
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

async function handleInitialSession(session: Session | null) {
  if (hasForceSignedOut()) {
    if (session?.user)
      await enforceSignedOutState()
    else
      clearForceSignedOut()

    authReady.value = true
    return
  }

  authUser.value = session?.user ?? null
  if (session?.user)
    await runSessionSync(session.user.id)

  authReady.value = true
}

async function handleAuthEvent(event: string, session: { user?: User | null } | null) {
  authUser.value = session?.user ?? null

  if (event === 'INITIAL_SESSION') {
    await handleInitialSession(session as Session | null)
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
}

export async function initAuth() {
  authReady.value = false
  if (!supabase) {
    authReady.value = true
    return
  }

  if (hasForceSignedOut())
    await enforceSignedOutState()

  supabase.auth.onAuthStateChange(async (event, session) => {
    try {
      await handleAuthEvent(event, session)
    }
    catch (e) {
      console.error(e)
      authError.value = e instanceof Error ? e.message : '认证状态更新失败'
      authReady.value = true
    }
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
  await signOutLocally()
}

export function isSupabaseEnabled() {
  return !!supabase
}
