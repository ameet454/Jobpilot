/**
 * Line icons (lucide, ISC licence). Titles written with a leading emoji
 * ("⚖️ Weight") are drawn with the matching icon instead, so the whole app
 * shares one consistent icon style.
 */
import {
  Activity, AlertTriangle, Award, Camera, ChefHat, Droplet, Dumbbell, Flame, Footprints, Home, LineChart, Moon,
  MessageCircle, PieChart, Sun, Sunrise, Cookie, Scale, Sparkles, Target, Timer, TrendingUp, Trophy, UtensilsCrossed, Zap,
} from 'lucide-react';

const BY_EMOJI = {
  '⏱': Timer, '⚖': Scale, '⚠': AlertTriangle, '🏋': Dumbbell, '👟': Footprints, '💧': Droplet, '💪': Zap,
  '🔥': Flame, '😴': Moon, '🥇': Award, '🥧': PieChart, '🎯': Target, '🏆': Trophy, '📷': Camera, '🍽': UtensilsCrossed,
  '📈': TrendingUp, '📊': Activity, '💬': MessageCircle, '✨': Sparkles, '🧑‍🍳': ChefHat,
};
const LEAD = /^(\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*)️?\s*/u;

/** Split "⚖️ Weight" into { Icon, text }. */
export function iconTitle(title) {
  if (typeof title !== 'string') return { Icon: null, text: title };
  const m = title.match(LEAD);
  if (!m) return { Icon: null, text: title };
  return { Icon: BY_EMOJI[m[1]] || null, text: title.slice(m[0].length) };
}

export const TAB_ICONS = { home: Home, today: UtensilsCrossed, gym: Dumbbell, track: Activity, progress: LineChart, coach: MessageCircle };

const MEAL = { breakfast: Sunrise, lunch: Sun, snacks: Cookie, dinner: Moon };
export function MealIcon({ id, size = 17 }) {
  const I = MEAL[id] || UtensilsCrossed;
  return <I size={size} strokeWidth={2.2} className="meal-icon" aria-hidden="true" />;
}
