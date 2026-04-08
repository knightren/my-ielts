import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * 未配置环境变量时为 null，页面仍可仅用 localStorage 运行。
 * 请在项目根目录复制 .env.example 为 .env 并填入 anon key。
 */
export const supabase = url && anonKey
  ? createClient(url, anonKey)
  : null

export function isSupabaseConfigured(): boolean {
  return supabase !== null
}
