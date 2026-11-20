/* Shared console state. */
import { api } from './api.js';

export const state = { boot: null, user: null };

const BOOT_KEY = 'osc.boot';
/** Last start-up data, so the console can draw at once while fresh data loads. */
export function cachedBoot(username) {
  try { const b = JSON.parse(localStorage.getItem(BOOT_KEY) || 'null'); return b && b.user && b.user.username === username ? b : null; } catch (e) { return null; }
}
export async function loadBoot() {
  state.boot = await api('meta.bootstrap');
  state.user = state.boot.user;
  state.bootAt = Date.now();
  try { localStorage.setItem(BOOT_KEY, JSON.stringify(state.boot)); } catch (e) { /* ignore */ }
  return state.boot;
}
export function useCachedBoot(b) { state.boot = b; state.user = b.user; state.bootAt = 0; }
export const isAdmin = () => state.user && state.user.role === 'ADMIN';
export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };
export const deptName = (code) => { const d = (state.boot.departments || []).find((x) => x.code === code); return d ? d.name : code; };
export const companyById = (id) => (state.boot.companies || []).find((c) => c.companyId === id);
export const today = () => (state.boot && state.boot.today) || window.OSC.todayIST();
