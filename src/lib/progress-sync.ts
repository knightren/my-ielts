import type { ProgressPayload } from './progress-keys'
import { PROGRESS_STORAGE_KEYS } from './progress-keys'
import { supabase } from './supabase'

const LAST_MODIFIED_KEY = 'progress_last_modified_at'

export function getLocalProgressPayload(): ProgressPayload {
  const out: ProgressPayload = {}
  for (const key of PROGRESS_STORAGE_KEYS) {
    const v = localStorage.getItem(key)
    if (v != null && v !== '')
      out[key] = v
  }
  return out
}

export function touchProgressTimestamp() {
  localStorage.setItem(LAST_MODIFIED_KEY, new Date().toISOString())
}

function getPayloadTimestamp(payload: ProgressPayload): number {
  const raw = payload[LAST_MODIFIED_KEY]
  if (!raw)
    return 0

  const time = Date.parse(raw)
  return Number.isNaN(time) ? 0 : time
}

function normalizePayload(remote: unknown): ProgressPayload {
  if (!remote || typeof remote !== 'object')
    return {}

  const source = remote as Record<string, unknown>
  const out: ProgressPayload = {}
  for (const key of PROGRESS_STORAGE_KEYS) {
    if (typeof source[key] === 'string')
      out[key] = source[key] as string
  }
  return out
}

function isSamePayload(a: ProgressPayload, b: ProgressPayload): boolean {
  for (const key of PROGRESS_STORAGE_KEYS) {
    if ((a[key] ?? null) !== (b[key] ?? null))
      return false
  }
  return true
}

/** 先清空同步相关键再写入云端，避免残留旧键与云端不一致 */
export function applyRemotePayloadIfAny(remote: unknown): boolean {
  const normalizedRemote = normalizePayload(remote)
  const keysFromRemote = PROGRESS_STORAGE_KEYS.filter(k => typeof normalizedRemote[k] === 'string')
  if (keysFromRemote.length === 0)
    return false

  const local = getLocalProgressPayload()
  if (isSamePayload(local, normalizedRemote))
    return false

  for (const key of PROGRESS_STORAGE_KEYS)
    localStorage.removeItem(key)
  for (const k of keysFromRemote)
    localStorage.setItem(k, normalizedRemote[k]!)
  return true
}

/**
 * 登录后：若云端已有进度则拉取并覆盖本地；否则把当前本地进度推送到云端（首次绑定账号）。
 * @returns 是否在本地写入了云端数据（需要 reload）
 */
export async function syncProgressAfterAuth(userId: string): Promise<boolean> {
  if (!supabase)
    return false

  const { data, error } = await supabase
    .from('user_progress')
    .select('payload, updated_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error)
    throw error

  const local = getLocalProgressPayload()
  const remotePayload = data?.payload
  const hasRemote = remotePayload
    && typeof remotePayload === 'object'
    && PROGRESS_STORAGE_KEYS.some(k =>
      Object.prototype.hasOwnProperty.call(remotePayload, k)
      && typeof (remotePayload as Record<string, unknown>)[k] === 'string',
    )

  if (hasRemote) {
    const normalizedRemote = normalizePayload(remotePayload)
    const localTimestamp = getPayloadTimestamp(local)
    const remoteTimestamp = Math.max(
      getPayloadTimestamp(normalizedRemote),
      Date.parse(data?.updated_at ?? '') || 0,
    )

    if (localTimestamp > remoteTimestamp) {
      const { error: upErr } = await supabase
        .from('user_progress')
        .upsert(
          {
            user_id: userId,
            payload: local,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'user_id' },
        )

      if (upErr)
        throw upErr

      return false
    }

    const applied = applyRemotePayloadIfAny(remotePayload)
    return applied
  }

  if (Object.keys(local).length === 0)
    return false

  const { error: upErr } = await supabase
    .from('user_progress')
    .upsert(
      {
        user_id: userId,
        payload: local,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

  if (upErr)
    throw upErr

  return false
}

export async function pushLocalProgressToCloud(userId: string): Promise<void> {
  if (!supabase)
    return

  const payload = getLocalProgressPayload()
  if (Object.keys(payload).length === 0)
    return

  const { error } = await supabase
    .from('user_progress')
    .upsert(
      {
        user_id: userId,
        payload,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' },
    )

  if (error)
    throw error
}
