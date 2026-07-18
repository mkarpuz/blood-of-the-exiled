import { describe, expect, it } from 'vitest';
import { movementVector, type MovementInput } from './movement.js';

const none: MovementInput = {
  forward: false,
  backward: false,
  left: false,
  right: false,
};

describe('movementVector', () => {
  it('keeps W and S on the camera forward axis', () => {
    expect(movementVector({ ...none, forward: true }, 0)).toEqual({ x: 0, z: 1 });
    expect(movementVector({ ...none, backward: true }, 0)).toEqual({ x: 0, z: -1 });
  });

  it('keeps A and D reversed from the screen-inverted bug', () => {
    expect(movementVector({ ...none, left: true }, 0)).toEqual({ x: 1, z: 0 });
    expect(movementVector({ ...none, right: true }, 0)).toEqual({ x: -1, z: 0 });
  });

  it('normalizes diagonal movement', () => {
    const diagonal = movementVector({ ...none, forward: true, right: true }, 0);
    expect(Math.hypot(diagonal.x, diagonal.z)).toBeCloseTo(1);
  });
});
