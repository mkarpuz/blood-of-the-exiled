import { randomUUID } from 'node:crypto';
import type { Equipment, ItemId, ItemStack, PlayerState } from '@boe/contracts';
import { ITEMS, RECIPES, itemCount, type EquipmentSlot, type RecipeDefinition } from '@boe/game-data';

export function createItem(itemId: ItemId, quantity = 1): ItemStack {
  const definition = ITEMS[itemId];
  return {
    instanceId: randomUUID(),
    itemId,
    quantity: Math.min(quantity, definition.stack),
    ...(definition.stack === 1 && definition.category !== 'material' ? { durability: 100 } : {}),
    version: 1,
  };
}

export function addItem(state: PlayerState, itemId: ItemId, quantity = 1): boolean {
  const definition = ITEMS[itemId];
  let remaining = quantity;
  if (definition.stack > 1) {
    for (const stack of state.inventory.filter((candidate) => candidate.itemId === itemId)) {
      const room = definition.stack - stack.quantity;
      if (room <= 0) continue;
      const moved = Math.min(room, remaining);
      stack.quantity += moved;
      stack.version += 1;
      remaining -= moved;
      if (remaining <= 0) return true;
    }
  }
  while (remaining > 0) {
    if (state.inventory.length >= 24) return false;
    const moved = Math.min(definition.stack, remaining);
    state.inventory.push(createItem(itemId, moved));
    remaining -= moved;
  }
  return true;
}

export function addExistingItem(state: PlayerState, item: ItemStack): boolean {
  if (ITEMS[item.itemId].stack > 1) return addItem(state, item.itemId, item.quantity);
  if (state.inventory.length >= 24) return false;
  state.inventory.push(structuredClone(item));
  return true;
}

export function removeItemQuantity(state: PlayerState, itemId: ItemId, quantity: number): boolean {
  if (itemCount(state.inventory, itemId) < quantity) return false;
  let remaining = quantity;
  for (let index = state.inventory.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const stack = state.inventory[index];
    if (!stack || stack.itemId !== itemId) continue;
    const removed = Math.min(stack.quantity, remaining);
    stack.quantity -= removed;
    stack.version += 1;
    remaining -= removed;
    if (stack.quantity <= 0) state.inventory.splice(index, 1);
  }
  return true;
}

export function craft(state: PlayerState, recipeId: string): { recipe: RecipeDefinition; output: ItemStack } {
  const recipe = RECIPES.find((candidate) => candidate.id === recipeId);
  if (!recipe) throw new Error('RECIPE_NOT_FOUND');
  if (state.level < recipe.level) throw new Error('LEVEL_TOO_LOW');
  if (state.gold < recipe.fee) throw new Error('NOT_ENOUGH_GOLD');
  if (state.inventory.length >= 24 && !state.inventory.some((stack) => stack.itemId === recipe.output.itemId)) {
    throw new Error('INVENTORY_FULL');
  }
  for (const [itemId, quantity] of Object.entries(recipe.ingredients) as Array<[ItemId, number]>) {
    if (itemCount(state.inventory, itemId) < quantity) throw new Error('MISSING_INGREDIENTS');
  }
  for (const [itemId, quantity] of Object.entries(recipe.ingredients) as Array<[ItemId, number]>) {
    removeItemQuantity(state, itemId, quantity);
  }
  state.gold -= recipe.fee;
  const output = createItem(recipe.output.itemId, recipe.output.quantity);
  if (ITEMS[output.itemId].stack > 1) {
    addItem(state, output.itemId, output.quantity);
  } else {
    state.inventory.push(output);
  }
  state.version += 1;
  return { recipe, output };
}

export function equipItem(state: PlayerState, instanceId: string): EquipmentSlot {
  const index = state.inventory.findIndex((item) => item.instanceId === instanceId);
  const item = state.inventory[index];
  if (!item) throw new Error('ITEM_NOT_FOUND');
  const slot = ITEMS[item.itemId].slot;
  if (!slot || slot === 'body') throw new Error('ITEM_NOT_EQUIPPABLE');
  state.inventory.splice(index, 1);
  const existing = state.equipment[slot];
  if (existing) state.inventory.push(existing);
  state.equipment[slot] = item;
  state.version += 1;
  return slot;
}

export function unequipItem(state: PlayerState, slot: Exclude<EquipmentSlot, null | 'body'>): void {
  const item = state.equipment[slot];
  if (!item) throw new Error('SLOT_EMPTY');
  if (state.inventory.length >= 24) throw new Error('INVENTORY_FULL');
  state.equipment[slot] = null;
  state.inventory.push(item);
  state.version += 1;
}

export function consumeItem(state: PlayerState, instanceId: string): { heal: number; itemId: ItemId } {
  const index = state.inventory.findIndex((item) => item.instanceId === instanceId);
  const stack = state.inventory[index];
  if (!stack) throw new Error('ITEM_NOT_FOUND');
  const definition = ITEMS[stack.itemId];
  if (!definition.heal) throw new Error('ITEM_NOT_CONSUMABLE');
  if (state.health >= state.maxHealth) throw new Error('HEALTH_FULL');
  state.health = Math.min(state.maxHealth, state.health + definition.heal);
  stack.quantity -= 1;
  stack.version += 1;
  if (stack.quantity <= 0) state.inventory.splice(index, 1);
  state.version += 1;
  return { heal: definition.heal, itemId: stack.itemId };
}

export function applyDeathLoss(state: PlayerState): { lostItems: ItemStack[]; lostGold: number } {
  const lostItems: ItemStack[] = [];
  for (const slot of ['weapon', 'offhand', 'head'] as const) {
    const item = state.equipment[slot];
    if (item) lostItems.push(item);
    state.equipment[slot] = null;
  }
  const lostGold = state.gold;
  state.gold = 0;
  state.version += 1;
  return { lostItems, lostGold };
}

export function newEquipment(): Equipment {
  return {
    weapon: null,
    offhand: null,
    head: null,
    body: createItem('exile_clothes'),
  };
}

export function moveItemToBank(state: PlayerState, instanceId: string): void {
  if (state.bank.length >= state.bankSlots) throw new Error('BANK_FULL');
  const index = state.inventory.findIndex((item) => item.instanceId === instanceId);
  const item = state.inventory[index];
  if (!item) throw new Error('ITEM_NOT_FOUND');
  state.inventory.splice(index, 1);
  state.bank.push(item);
  state.version += 1;
}

export function moveItemFromBank(state: PlayerState, instanceId: string): void {
  if (state.inventory.length >= 24) throw new Error('INVENTORY_FULL');
  const index = state.bank.findIndex((item) => item.instanceId === instanceId);
  const item = state.bank[index];
  if (!item) throw new Error('ITEM_NOT_FOUND');
  state.bank.splice(index, 1);
  state.inventory.push(item);
  state.version += 1;
}
