/* Shared console state. */
import { api } from './api.js';

export const state = { boot: null, user: null };

export async function loadBoot() {
  state.boot = await api('meta.bootstrap');
  state.user = state.boot.user;
  return state.boot;
}
export const isAdmin = () => state.user && state.user.role === 'ADMIN';
export const go = (hash) => { if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange')); else location.hash = hash; };
export const deptName = (code) => { const d = (state.boot.departments || []).find((x) => x.code === code); return d ? d.name : code; };
export const companyById = (id) => (state.boot.companies || []).find((c) => c.companyId === id);
export const today = () => (state.boot && state.boot.today) || window.OSC.todayIST();
