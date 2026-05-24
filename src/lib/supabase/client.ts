import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export function createSupabaseBrowserClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Supabase 환경변수가 설정되지 않았습니다.");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

export function clearSupabaseBrowserSession() {
  if (typeof document === "undefined" || !supabaseUrl) {
    return;
  }

  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  const authStorageKey = `sb-${projectRef}-auth-token`;
  const authCookieNames = document.cookie
    .split(";")
    .map((cookie) => cookie.trim().split("=")[0])
    .filter(
      (name) =>
        name === authStorageKey ||
        name.startsWith(`${authStorageKey}.`) ||
        name === `${authStorageKey}-code-verifier`,
    );

  for (const name of authCookieNames) {
    document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
  }
}
