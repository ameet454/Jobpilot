/**
 * Local-first app state. Everything lives on the user's device
 * (localStorage) — no account, no server, exportable as JSON any time.
 */
import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { dateKey } from './dates.js';
import { computeTargets } from './nutrition.js';
import { latestWeight } from './trend.js';

const KEY = 'healthpilot:v1';

export const emptyDay = () => ({ entries: [], water: 0, steps: 0, sleep: null, weight: null });

export const initialState = {
  version: 1,
  profile: null,
  days: {},
  customFoods: [],
  favorites: [],
  recents: [],
  fasting: { active: null, history: [] },
  settings: { theme: 'system' },
};

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return initialState;
    return { ...initialState, ...JSON.parse(raw) };
  } catch {
    return initialState;
  }
}

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

function updateDay(state, date, fn) {
  const day = { ...emptyDay(), ...state.days[date] };
  return { ...state, days: { ...state.days, [date]: fn(day) } };
}

export function reducer(state, action) {
  switch (action.type) {
    case 'SET_PROFILE': {
      const next = { ...state, profile: action.profile };
      // Seed today's weight from onboarding so the trend starts immediately.
      if (!state.profile) return updateDay(next, dateKey(), (d) => ({ ...d, weight: d.weight ?? action.profile.weight }));
      return next;
    }
    case 'ADD_ENTRIES': {
      const entries = action.entries.map((e) => ({ id: uid(), t: Date.now(), ...e }));
      const recentIds = entries.map((e) => e.foodId).filter(Boolean);
      const recents = [...new Set([...recentIds, ...state.recents])].slice(0, 15);
      return { ...updateDay(state, action.date, (d) => ({ ...d, entries: [...d.entries, ...entries] })), recents };
    }
    case 'UPDATE_ENTRY':
      return updateDay(state, action.date, (d) => ({
        ...d, entries: d.entries.map((e) => (e.id === action.id ? { ...e, ...action.patch } : e)),
      }));
    case 'REMOVE_ENTRY':
      return updateDay(state, action.date, (d) => ({ ...d, entries: d.entries.filter((e) => e.id !== action.id) }));
    case 'SET_METRIC':
      return updateDay(state, action.date, (d) => ({ ...d, [action.key]: action.value }));
    case 'ADD_WATER':
      return updateDay(state, action.date, (d) => ({ ...d, water: Math.max(0, (d.water || 0) + action.ml) }));
    case 'TOGGLE_FAV': {
      const has = state.favorites.includes(action.id);
      return { ...state, favorites: has ? state.favorites.filter((x) => x !== action.id) : [action.id, ...state.favorites] };
    }
    case 'ADD_CUSTOM_FOOD':
      return { ...state, customFoods: [{ ...action.food, id: `custom-${uid()}`, custom: true }, ...state.customFoods] };
    case 'FAST_START':
      return { ...state, fasting: { ...state.fasting, active: { start: action.start ?? Date.now(), target: action.target } } };
    case 'FAST_END': {
      const a = state.fasting.active;
      if (!a) return state;
      const rec = { start: a.start, end: action.end ?? Date.now(), target: a.target };
      return { ...state, fasting: { active: null, history: [rec, ...state.fasting.history].slice(0, 60) } };
    }
    case 'FAST_CANCEL':
      return { ...state, fasting: { ...state.fasting, active: null } };
    case 'SET_THEME':
      return { ...state, settings: { ...state.settings, theme: action.theme } };
    case 'IMPORT':
      return { ...initialState, ...action.state };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, load);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* storage full or blocked */ }
  }, [state]);

  const targets = useMemo(() => {
    if (!state.profile) return null;
    return computeTargets(state.profile, latestWeight(state.days, state.profile.weight));
  }, [state.profile, state.days]);

  const value = useMemo(() => ({ state, dispatch, targets }), [state, targets]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export const useStore = () => useContext(StoreContext);
