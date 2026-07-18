import { describe, expect, it } from 'vitest';
import type { PlayerState } from '@boe/contracts';
import { addItem, applyDeathLoss, craft, createItem, newEquipment } from './inventory.js';

function state(): PlayerState {
  return {
    id: 'p',
    username: 'Exile',
    appearance: 'warrior',
    position: { x: 0, y: 0, z: 0 },
    yaw: 0,
    health: 100,
    maxHealth: 100,
    stamina: 100,
    maxStamina: 100,
    focus: 0,
    level: 1,
    xp: 0,
    gold: 10,
    bankedGold: 0,
    inventory: [],
    bank: [],
    bankSlots: 12,
    equipment: newEquipment(),
    compromise: 0,
    questStage: 'wake',
    discoveries: [],
    buffs: [],
    dead: false,
    version: 1,
  };
}

describe('inventory transactions', () => {
  it('crafts only after all ingredients are available', () => {
    const player = state();
    addItem(player, 'wood', 3);
    expect(() => craft(player, 'rough-mace')).toThrow('MISSING_INGREDIENTS');
    addItem(player, 'stone', 2);
    craft(player, 'rough-mace');
    expect(player.inventory.find((item) => item.itemId === 'rough_mace')).toBeTruthy();
    expect(player.inventory.some((item) => item.itemId === 'wood')).toBe(false);
  });

  it('deletes only equipped risk and on-hand gold', () => {
    const player = state();
    player.gold = 55;
    player.inventory.push(createItem('forest_tonic', 2));
    player.bank.push(createItem('concord_blade'));
    player.equipment.weapon = createItem('rough_mace');
    const result = applyDeathLoss(player);
    expect(result.lostGold).toBe(55);
    expect(result.lostItems).toHaveLength(1);
    expect(player.gold).toBe(0);
    expect(player.inventory).toHaveLength(1);
    expect(player.bank).toHaveLength(1);
    expect(player.equipment.body?.itemId).toBe('exile_clothes');
  });
});
