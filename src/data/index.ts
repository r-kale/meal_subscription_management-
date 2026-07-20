import type { DataAdapter } from './adapter'
import { DemoAdapter } from './demoAdapter'
import { SupabaseAdapter } from './supabaseAdapter'

declare global {
  interface Window {
    APP_CONFIG?: { supabaseUrl?: string; supabaseAnonKey?: string }
  }
}

export function isConfigured(): boolean {
  const cfg = window.APP_CONFIG
  return Boolean(cfg?.supabaseUrl && cfg?.supabaseAnonKey)
}

let adapter: DataAdapter | null = null

/**
 * Pick the data adapter once per page load:
 * - Supabase when public/config.js is filled in and demo was not requested
 * - Demo (localStorage) otherwise
 */
export function getAdapter(forceDemo = false): DataAdapter {
  const wantDemo = forceDemo || !isConfigured()
  if (adapter && adapter.isDemo === wantDemo) return adapter
  adapter = wantDemo
    ? new DemoAdapter()
    : new SupabaseAdapter(window.APP_CONFIG!.supabaseUrl!, window.APP_CONFIG!.supabaseAnonKey!)
  return adapter
}

export function resetAdapterForTests(): void {
  adapter = null
}
