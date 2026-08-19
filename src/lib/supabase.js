import { createClient } from '@supabase/supabase-js';

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ebpkbakjgzxfahsvrldk.supabase.co';
const SUPA_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVicGtiYWtqZ3p4ZmFoc3ZybGRrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTMzNjE5MjEsImV4cCI6MjAyODkzNzkyMX0.XnL0RGQyHIiDnZdfrgKTBBYy5Nu13dWU44pKxw4Wq_o';

export const supabase = createClient(SUPA_URL, SUPA_ANON);

// /preview 경로(또는 ?preview) → 로그인 없이 미리보기 모드
export const previewMode = (() => {
  const q = new URLSearchParams(location.search);
  if (q.has('preview')) return true;
  const seg = location.pathname.replace(/^\/+|\/+$/g, '').split('/').pop();
  return seg === 'preview';
})();

// /admin 경로 → 기기 코드 발급 관리자 페이지 (기기 라우팅 대신)
export const adminMode = (() => {
  const seg = location.pathname.replace(/^\/+|\/+$/g, '').split('/').pop();
  return seg === 'admin';
})();

// URL에서 device_code 추출: /DSJA-JD49... 경로 또는 ?device= 쿼리
export const deviceCode = (() => {
  if (previewMode || adminMode) return null;
  const q = new URLSearchParams(location.search);
  const fromQuery = q.get('device') || q.get('d');
  if (fromQuery) return fromQuery;
  const seg = location.pathname.replace(/^\/+|\/+$/g, '').split('/').pop();
  if (seg && seg !== 'index.html' && !seg.includes('.') && /[A-Za-z0-9]/.test(seg)) return seg;
  return null;
})();

// ?invite=SLUG 파라미터 감지
export const inviteSlug = new URLSearchParams(location.search).get('invite');

export const deviceAuth = () =>
  supabase.functions.invoke('clicker_device_auth', { body: { device_code: deviceCode } });

export const deviceRegister = () =>
  supabase.functions.invoke('clicker_device_register', { body: { device_code: deviceCode } });

export const googleLogin = () =>
  supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.href } });

export const slugLookup = (slug) =>
  supabase.functions.invoke('clicker_slug_lookup', { body: { slug } });

export const usersSearch = (q) =>
  supabase.functions.invoke('clicker_users_search', { body: { q: q || '' } });

export const friendAdd = (targetUserId) =>
  supabase.functions.invoke('clicker_friend_add', { body: { target_user_id: targetUserId } });

export const rankSubmit = (mbti) =>
  supabase.functions.invoke('clicker_rank_submit', { body: { mbti } });

export const rankGet = (mbti) =>
  supabase.functions.invoke('clicker_rank_get', { body: mbti ? { mbti } : {} });

// 관리자 전용(clicker_admin_devices). ADMIN_EMAILS에 없는 계정은 403.
export const adminDevices = (body) =>
  supabase.functions.invoke('clicker_admin_devices', { body });

export const updateSlug = (myId, slug) =>
  supabase.from('clicker_profiles').update({ slug }).eq('id', myId).select('slug').single();
