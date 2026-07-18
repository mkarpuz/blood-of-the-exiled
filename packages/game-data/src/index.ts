import type { EntityKind, ItemId, ItemStack, Vec3 } from '@boe/contracts';

export const WORLD_SIZE = 512;
export const SAFE_ZONE_CENTER: Vec3 = { x: -142, y: 0, z: 116 };
export const SPAWN_POINT: Vec3 = { x: -220, y: 0, z: 52 };
export const OUTPOST_CENTER: Vec3 = { x: 151, y: 0, z: -74 };
export const GIANT_TREE_CENTER: Vec3 = { x: -6, y: 0, z: -2 };

export const XP_THRESHOLDS = [0, 0, 120, 310, 570, 920, 1360, 1900, 2550, 3320, 4220] as const;

export type EquipmentSlot = 'weapon' | 'offhand' | 'head' | 'body' | null;

export interface ItemDefinition {
  id: ItemId;
  name: string;
  description: string;
  category: 'weapon' | 'shield' | 'armor' | 'consumable' | 'material';
  slot: EquipmentSlot;
  stack: number;
  damage?: number;
  armor?: number;
  heal?: number;
  vendorPrice: number;
}

export const ITEMS: Record<ItemId, ItemDefinition> = {
  exile_clothes: {
    id: 'exile_clothes',
    name: 'Exile clothing',
    description: 'Unowned cloth. It survives every death.',
    category: 'armor',
    slot: 'body',
    stack: 1,
    armor: 1,
    vendorPrice: 0,
  },
  basic_club: {
    id: 'basic_club',
    name: 'Basic club',
    description: 'Ugly, cheap, and enough to begin again.',
    category: 'weapon',
    slot: 'weapon',
    stack: 1,
    damage: 9,
    vendorPrice: 18,
  },
  rough_mace: {
    id: 'rough_mace',
    name: 'Rough mace',
    description: 'Stone bound to ash wood with stubborn cord.',
    category: 'weapon',
    slot: 'weapon',
    stack: 1,
    damage: 14,
    vendorPrice: 26,
  },
  stone_axe: {
    id: 'stone_axe',
    name: 'Stone axe',
    description: 'A gathering tool that also settles arguments.',
    category: 'weapon',
    slot: 'weapon',
    stack: 1,
    damage: 12,
    vendorPrice: 24,
  },
  hide_shield: {
    id: 'hide_shield',
    name: 'Hide shield',
    description: 'Layered hide over a rough wooden frame.',
    category: 'shield',
    slot: 'offhand',
    stack: 1,
    armor: 4,
    vendorPrice: 30,
  },
  concord_blade: {
    id: 'concord_blade',
    name: 'Reclaimed Concord blade',
    description: 'Authority melted down into a tool of escape.',
    category: 'weapon',
    slot: 'weapon',
    stack: 1,
    damage: 20,
    vendorPrice: 55,
  },
  forest_tonic: {
    id: 'forest_tonic',
    name: 'Forest tonic',
    description: 'A bitter draught that restores 45 health.',
    category: 'consumable',
    slot: null,
    stack: 10,
    heal: 45,
    vendorPrice: 10,
  },
  branded_helmet: {
    id: 'branded_helmet',
    name: 'Unbranded helmet',
    description: 'The Concord mark has been hammered flat.',
    category: 'armor',
    slot: 'head',
    stack: 1,
    armor: 6,
    vendorPrice: 48,
  },
  wood: {
    id: 'wood',
    name: 'Ash wood',
    description: 'Deadfall only. The refuge does not fell living trees.',
    category: 'material',
    slot: null,
    stack: 99,
    vendorPrice: 2,
  },
  stone: {
    id: 'stone',
    name: 'River stone',
    description: 'Hard enough to keep an edge for one more fight.',
    category: 'material',
    slot: null,
    stack: 99,
    vendorPrice: 2,
  },
  herb: {
    id: 'herb',
    name: 'Bitterleaf',
    description: 'Medicinal when prepared. Unpleasant always.',
    category: 'material',
    slot: null,
    stack: 99,
    vendorPrice: 3,
  },
  mushroom: {
    id: 'mushroom',
    name: 'Mooncap',
    description: 'Glows faintly near old roots.',
    category: 'material',
    slot: null,
    stack: 99,
    vendorPrice: 3,
  },
  concord_scrap: {
    id: 'concord_scrap',
    name: 'Concord scrap',
    description: 'Stolen metal bearing a broken rank stamp.',
    category: 'material',
    slot: null,
    stack: 99,
    vendorPrice: 5,
  },
  branded_hide: {
    id: 'branded_hide',
    name: 'Branded hide',
    description: 'Recovered from a creature the Concord twisted.',
    category: 'material',
    slot: null,
    stack: 99,
    vendorPrice: 6,
  },
};

export interface RecipeDefinition {
  id: string;
  name: string;
  station: 'anvil' | 'workbench' | 'alchemy';
  level: number;
  fee: number;
  ingredients: Partial<Record<ItemId, number>>;
  output: { itemId: ItemId; quantity: number };
}

export const RECIPES: RecipeDefinition[] = [
  {
    id: 'rough-mace',
    name: 'Rough mace',
    station: 'anvil',
    level: 1,
    fee: 0,
    ingredients: { wood: 3, stone: 2 },
    output: { itemId: 'rough_mace', quantity: 1 },
  },
  {
    id: 'stone-axe',
    name: 'Stone axe',
    station: 'workbench',
    level: 1,
    fee: 1,
    ingredients: { wood: 3, stone: 3 },
    output: { itemId: 'stone_axe', quantity: 1 },
  },
  {
    id: 'hide-shield',
    name: 'Hide shield',
    station: 'workbench',
    level: 2,
    fee: 3,
    ingredients: { wood: 4, branded_hide: 2 },
    output: { itemId: 'hide_shield', quantity: 1 },
  },
  {
    id: 'concord-blade',
    name: 'Reclaimed Concord blade',
    station: 'anvil',
    level: 4,
    fee: 8,
    ingredients: { wood: 2, concord_scrap: 8, stone: 2 },
    output: { itemId: 'concord_blade', quantity: 1 },
  },
  {
    id: 'forest-tonic',
    name: 'Forest tonic',
    station: 'alchemy',
    level: 1,
    fee: 1,
    ingredients: { herb: 2, mushroom: 1 },
    output: { itemId: 'forest_tonic', quantity: 1 },
  },
  {
    id: 'branded-helmet',
    name: 'Unbranded helmet',
    station: 'anvil',
    level: 3,
    fee: 5,
    ingredients: { concord_scrap: 5, branded_hide: 3 },
    output: { itemId: 'branded_helmet', quantity: 1 },
  },
];

export interface AbilityDefinition {
  id: string;
  name: string;
  unlockLevel: number;
  cooldownMs: number;
  stamina: number;
  damageMultiplier: number;
  range: number;
  arc: number;
}

export const ABILITIES: AbilityDefinition[] = [
  {
    id: 'shield-bash',
    name: 'Shield Bash',
    unlockLevel: 2,
    cooldownMs: 8_000,
    stamina: 20,
    damageMultiplier: 0.8,
    range: 2.5,
    arc: 0.65,
  },
  {
    id: 'war-cry',
    name: 'War Cry',
    unlockLevel: 4,
    cooldownMs: 18_000,
    stamina: 15,
    damageMultiplier: 0,
    range: 8,
    arc: Math.PI,
  },
  {
    id: 'liberating-sweep',
    name: 'Liberating Sweep',
    unlockLevel: 7,
    cooldownMs: 14_000,
    stamina: 35,
    damageMultiplier: 1.6,
    range: 3.8,
    arc: 1.8,
  },
];

export interface EnemyDefinition {
  kind: Exclude<EntityKind, 'player' | 'deer' | 'rabbit' | 'horse'>;
  name: string;
  level: number;
  health: number;
  damage: number;
  speed: number;
  aggroRange: number;
  attackRange: number;
  attackCooldownMs: number;
  xp: number;
  gold: [number, number];
  drops: Partial<Record<ItemId, [number, number]>>;
}

export const ENEMIES: Record<EnemyDefinition['kind'], EnemyDefinition> = {
  soldier: {
    kind: 'soldier',
    name: 'Concord Soldier',
    level: 2,
    health: 72,
    damage: 22,
    speed: 3.4,
    aggroRange: 13,
    attackRange: 2.1,
    attackCooldownMs: 1_700,
    xp: 34,
    gold: [2, 6],
    drops: { concord_scrap: [1, 2] },
  },
  swordsman: {
    kind: 'swordsman',
    name: 'Concord Swordsman',
    level: 3,
    health: 88,
    damage: 26,
    speed: 3.8,
    aggroRange: 15,
    attackRange: 2.2,
    attackCooldownMs: 1_500,
    xp: 44,
    gold: [3, 7],
    drops: { concord_scrap: [1, 3] },
  },
  archer: {
    kind: 'archer',
    name: 'Concord Archer',
    level: 3,
    health: 58,
    damage: 20,
    speed: 3.2,
    aggroRange: 24,
    attackRange: 17,
    attackCooldownMs: 2_300,
    xp: 46,
    gold: [3, 8],
    drops: { concord_scrap: [1, 2] },
  },
  cultist: {
    kind: 'cultist',
    name: 'Concord Cultist',
    level: 4,
    health: 70,
    damage: 29,
    speed: 3.3,
    aggroRange: 16,
    attackRange: 8,
    attackCooldownMs: 2_100,
    xp: 56,
    gold: [4, 9],
    drops: { concord_scrap: [1, 2], herb: [0, 1] },
  },
  corrupted_boar: {
    kind: 'corrupted_boar',
    name: 'Branded Boar',
    level: 4,
    health: 128,
    damage: 31,
    speed: 4.8,
    aggroRange: 12,
    attackRange: 2.4,
    attackCooldownMs: 2_000,
    xp: 85,
    gold: [0, 0],
    drops: { branded_hide: [3, 5] },
  },
  inquisitor: {
    kind: 'inquisitor',
    name: 'Concord Inquisitor',
    level: 6,
    health: 210,
    damage: 36,
    speed: 3.5,
    aggroRange: 20,
    attackRange: 2.6,
    attackCooldownMs: 1_800,
    xp: 190,
    gold: [15, 28],
    drops: { concord_scrap: [4, 7] },
  },
};

export const COMPROMISE = {
  wildlifeAttack: 15,
  wildlifeKill: 25,
  skippedStudy: 5,
  correctStudy: -5,
  liberatedCreature: -15,
  correctHelper: -5,
  fleeThreshold: 20,
  mentorThreshold: 40,
  aggroThreshold: 60,
} as const;

export const BUILTIN_QUESTIONS = [
  {
    id: 'builtin-1',
    type: 'mcq' as const,
    language: 'en' as const,
    prompt: 'Which German word means “freedom”?',
    options: [
      { id: 'a', text: 'Freiheit' },
      { id: 'b', text: 'Pflicht' },
      { id: 'c', text: 'Eigentum' },
      { id: 'd', text: 'Befehl' },
    ],
    accepted: ['a', 'freiheit'],
    answerDisplay: 'Freiheit',
    sourceExcerpt: 'Freiheit means freedom.',
  },
  {
    id: 'builtin-2',
    type: 'text' as const,
    language: 'de' as const,
    prompt: 'Translate “the forest” into German.',
    accepted: ['der wald', 'wald'],
    answerDisplay: 'der Wald',
    sourceExcerpt: 'der Wald — the forest',
  },
  {
    id: 'builtin-3',
    type: 'mcq' as const,
    language: 'en' as const,
    prompt: 'In JavaScript, which declaration creates a block-scoped constant?',
    options: [
      { id: 'a', text: 'var' },
      { id: 'b', text: 'const' },
      { id: 'c', text: 'define' },
      { id: 'd', text: 'static' },
    ],
    accepted: ['b', 'const'],
    answerDisplay: 'const',
    sourceExcerpt: 'const declares a block-scoped binding that cannot be reassigned.',
  },
  {
    id: 'builtin-4',
    type: 'text' as const,
    language: 'en' as const,
    prompt: 'What HTTP method is conventionally used to retrieve a resource?',
    accepted: ['get'],
    answerDisplay: 'GET',
    sourceExcerpt: 'GET requests a representation of a resource.',
  },
] as const;

export const RESOURCE_NODES = [
  { id: 'wood-1', itemId: 'wood' as ItemId, position: { x: -190, y: 0, z: 75 }, amount: 2 },
  { id: 'wood-2', itemId: 'wood' as ItemId, position: { x: -176, y: 0, z: 96 }, amount: 3 },
  { id: 'wood-3', itemId: 'wood' as ItemId, position: { x: -118, y: 0, z: 78 }, amount: 2 },
  { id: 'stone-1', itemId: 'stone' as ItemId, position: { x: -198, y: 0, z: 41 }, amount: 2 },
  { id: 'stone-2', itemId: 'stone' as ItemId, position: { x: -154, y: 0, z: 70 }, amount: 3 },
  { id: 'stone-3', itemId: 'stone' as ItemId, position: { x: -88, y: 0, z: 28 }, amount: 2 },
  { id: 'herb-1', itemId: 'herb' as ItemId, position: { x: -122, y: 0, z: 141 }, amount: 2 },
  { id: 'herb-2', itemId: 'herb' as ItemId, position: { x: -40, y: 0, z: 70 }, amount: 2 },
  { id: 'mushroom-1', itemId: 'mushroom' as ItemId, position: { x: -72, y: 0, z: -16 }, amount: 2 },
  { id: 'mushroom-2', itemId: 'mushroom' as ItemId, position: { x: 22, y: 0, z: 35 }, amount: 2 },
] as const;

export const INTERACTABLES = [
  { id: 'mentor', kind: 'mentor', position: { x: -139, y: 0, z: 112 }, radius: 4 },
  { id: 'anvil', kind: 'anvil', position: { x: -151, y: 0, z: 120 }, radius: 4 },
  { id: 'workbench', kind: 'workbench', position: { x: -147, y: 0, z: 131 }, radius: 4 },
  { id: 'alchemy', kind: 'alchemy', position: { x: -132, y: 0, z: 130 }, radius: 4 },
  { id: 'bank', kind: 'bank', position: { x: -159, y: 0, z: 110 }, radius: 4 },
  { id: 'market', kind: 'market', position: { x: -127, y: 0, z: 113 }, radius: 4 },
  { id: 'outpost-standard', kind: 'liberation', position: { x: 154, y: 0, z: -76 }, radius: 7 },
  { id: 'secret-cave', kind: 'discovery', position: { x: 80, y: 0, z: 168 }, radius: 9 },
  { id: 'secret-shrine', kind: 'discovery', position: { x: -43, y: 0, z: -176 }, radius: 8 },
  { id: 'strange-ruin', kind: 'discovery', position: { x: 193, y: 0, z: 112 }, radius: 10 },
] as const;

export function normalizeAnswer(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US')
    .replace(/[“”„"'`´]/g, '')
    .replace(/[^\p{L}\p{N}+#.]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function gradeAnswer(answer: string, accepted: readonly string[]): boolean {
  const normalized = normalizeAnswer(answer);
  return accepted.some((candidate) => normalizeAnswer(candidate) === normalized);
}

export function levelForXp(xp: number): number {
  for (let level = 10; level >= 1; level -= 1) {
    if (xp >= (XP_THRESHOLDS[level] ?? Number.POSITIVE_INFINITY)) return level;
  }
  return 1;
}

export function maxHealthForLevel(level: number): number {
  return 100 + (Math.max(1, level) - 1) * 12;
}

export function calculateDamage(options: {
  baseWeaponDamage: number;
  level: number;
  multiplier: number;
  clarity: boolean;
  burden: boolean;
  blocked: boolean;
  armor: number;
}): number {
  const levelPower = 1 + (options.level - 1) * 0.065;
  const learning = options.clarity ? 1.25 : options.burden ? 0.75 : 1;
  const block = options.blocked ? 0.28 : 1;
  return Math.max(
    1,
    Math.round(options.baseWeaponDamage * levelPower * options.multiplier * learning * block - options.armor * 0.35),
  );
}

export function clampCompromise(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function itemCount(inventory: readonly ItemStack[], itemId: ItemId): number {
  return inventory.reduce((total, stack) => total + (stack.itemId === itemId ? stack.quantity : 0), 0);
}

export function distance2d(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function terrainHeight(x: number, z: number): number {
  const broad = Math.sin(x * 0.018) * 2.2 + Math.cos(z * 0.021) * 1.8;
  const detail = Math.sin((x + z) * 0.047) * 0.65 + Math.cos((x - z) * 0.039) * 0.5;
  const refugeFlatten = Math.max(0, 1 - distance2d({ x, y: 0, z }, SAFE_ZONE_CENTER) / 42);
  const outpostFlatten = Math.max(0, 1 - distance2d({ x, y: 0, z }, OUTPOST_CENTER) / 46);
  return (broad + detail) * (1 - refugeFlatten * 0.92) * (1 - outpostFlatten * 0.9);
}
