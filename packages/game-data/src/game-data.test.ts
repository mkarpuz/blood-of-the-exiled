import { describe, expect, it } from 'vitest';
import {
  calculateDamage,
  clampCompromise,
  gradeAnswer,
  levelForXp,
  normalizeAnswer,
  XP_THRESHOLDS,
} from './index.js';

describe('learning answer normalization', () => {
  it('normalizes casing, punctuation, spacing, and diacritics deterministically', () => {
    expect(normalizeAnswer('  FÜNF,  Bäume! ')).toBe('funf baume');
    expect(gradeAnswer('“Der Wald”', ['der wald'])).toBe(true);
    expect(gradeAnswer('POST', ['GET'])).toBe(false);
  });
});

describe('progression and compromise', () => {
  it('maps every threshold to its level', () => {
    for (let level = 1; level <= 10; level += 1) {
      expect(levelForXp(XP_THRESHOLDS[level] ?? 0)).toBe(level);
    }
  });

  it('clamps hidden compromise', () => {
    expect(clampCompromise(-15)).toBe(0);
    expect(clampCompromise(44)).toBe(44);
    expect(clampCompromise(130)).toBe(100);
  });
});

describe('combat math', () => {
  it('makes learning effects consequential and blocking effective', () => {
    const base = { baseWeaponDamage: 14, level: 3, multiplier: 1, armor: 0 };
    const normal = calculateDamage({ ...base, clarity: false, burden: false, blocked: false });
    const clear = calculateDamage({ ...base, clarity: true, burden: false, blocked: false });
    const burdened = calculateDamage({ ...base, clarity: false, burden: true, blocked: false });
    const blocked = calculateDamage({ ...base, clarity: false, burden: false, blocked: true });
    expect(clear).toBeGreaterThan(normal);
    expect(burdened).toBeLessThan(normal);
    expect(blocked).toBeLessThan(normal / 2);
  });
});
