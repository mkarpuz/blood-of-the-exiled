import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { runtimeAssetSchema, type Auction, type ItemStack, type RuntimeAsset } from '@boe/contracts';
import { ITEMS, RECIPES, distance2d } from '@boe/game-data';
import { api } from '../api';
import { gameStore, useGameState, type Panel } from '../game-store';
import { gameNetwork } from '../network';
import type { MaterialSummary } from '../types';
import { itemCount, itemLabel } from './GameHud';

export function Panels({ materials, onLogout }: { materials: MaterialSummary[]; onLogout: () => Promise<void> }) {
  const { panel } = useGameState();
  useEffect(() => {
    if (panel) void document.exitPointerLock();
  }, [panel]);
  if (!panel) return null;
  return (
    <div className="panel-layer" role="presentation">
      <button className="panel-scrim" aria-label="Close panel" onClick={() => gameStore.closePanel()} />
      {panel === 'inventory' && <InventoryPanel />}
      {panel === 'craft' && <CraftPanel />}
      {panel === 'bank' && <BankPanel />}
      {panel === 'market' && <MarketPanel />}
      {panel === 'social' && <SocialPanel />}
      {panel === 'map' && <WorldMapPanel />}
      {panel === 'questions' && <QuestionsPanel materials={materials} />}
      {panel === 'credits' && <CreditsPanel />}
      {panel === 'menu' && <MenuPanel onLogout={onLogout} />}
    </div>
  );
}

function PanelFrame({ title, eyebrow, children, className = '' }: { title: string; eyebrow: string; children: ReactNode; className?: string }) {
  return (
    <section className={`game-panel panel-grain ${className}`}>
      <header><div><small>{eyebrow}</small><h2>{title}</h2></div><button className="close-button" onClick={() => gameStore.closePanel()} aria-label="Close">×</button></header>
      {children}
    </section>
  );
}

function InventoryPanel() {
  const { self } = useGameState();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!self) return null;
  const selected = self.inventory.find((item) => item.instanceId === selectedId) ?? null;
  const equipment = [
    ['weapon', self.equipment.weapon],
    ['offhand', self.equipment.offhand],
    ['head', self.equipment.head],
    ['body', self.equipment.body],
  ] as const;
  return (
    <PanelFrame title="What you still carry" eyebrow={`Inventory · ${self.inventory.length}/24`} className="inventory-panel">
      <div className="inventory-layout">
        <aside className="paper-doll">
          <div className={`paper-silhouette ${self.appearance}`}><i /><b /></div>
          {equipment.map(([slot, item]) => (
            <button key={slot} className={`equipment-slot slot-${slot}`} disabled={!item || slot === 'body'} onClick={() => slot !== 'body' && gameNetwork.send({ type: 'unequip', slot })}>
              <small>{slot}</small><strong>{item ? ITEMS[item.itemId].name : 'Empty'}</strong>{item?.durability !== undefined && <span>{item.durability}%</span>}
            </button>
          ))}
          <div className="currency-readout"><span><i className="coin" />{self.gold} carried</span><span>{self.bankedGold} banked</span></div>
        </aside>
        <div className="inventory-grid" role="list" aria-label="Inventory items">
          {Array.from({ length: 24 }, (_, index) => {
            const item = self.inventory[index];
            return item ? (
              <button key={item.instanceId} className={`item-slot ${selectedId === item.instanceId ? 'selected' : ''}`} onClick={() => setSelectedId(item.instanceId)} title={ITEMS[item.itemId].description}>
                <ItemGlyph itemId={item.itemId} /><strong>{ITEMS[item.itemId].name}</strong>{item.quantity > 1 && <span>×{item.quantity}</span>}
              </button>
            ) : <span key={`empty-${index}`} className="item-slot empty" />;
          })}
        </div>
        <aside className="item-inspector">
          {selected ? (
            <>
              <ItemGlyph itemId={selected.itemId} large />
              <small>{ITEMS[selected.itemId].category}</small>
              <h3>{ITEMS[selected.itemId].name}</h3>
              <p>{ITEMS[selected.itemId].description}</p>
              <dl>
                {ITEMS[selected.itemId].damage && <div><dt>Damage</dt><dd>{ITEMS[selected.itemId].damage}</dd></div>}
                {ITEMS[selected.itemId].armor && <div><dt>Armor</dt><dd>{ITEMS[selected.itemId].armor}</dd></div>}
                {ITEMS[selected.itemId].heal && <div><dt>Restores</dt><dd>{ITEMS[selected.itemId].heal} health</dd></div>}
              </dl>
              {ITEMS[selected.itemId].slot && ITEMS[selected.itemId].slot !== 'body' && <button className="secondary-button" onClick={() => gameNetwork.send({ type: 'equip', instanceId: selected.instanceId })}>Equip</button>}
              {ITEMS[selected.itemId].category === 'consumable' && <button className="secondary-button" onClick={() => gameNetwork.send({ type: 'use-item', instanceId: selected.instanceId })}>Use</button>}
              {ITEMS[selected.itemId].category !== 'material' && <button className="text-button" onClick={() => gameStore.setPanel('market')}>List at exchange</button>}
            </>
          ) : <div className="empty-inspector"><span>⌁</span><p>Select an item to inspect it.</p></div>}
        </aside>
      </div>
    </PanelFrame>
  );
}

function CraftPanel() {
  const { self, nearby } = useGameState();
  const [selected, setSelected] = useState(RECIPES[0]?.id ?? '');
  if (!self) return null;
  const recipe = RECIPES.find((item) => item.id === selected) ?? RECIPES[0];
  return (
    <PanelFrame title="Make what rank denied you" eyebrow={`Crafting · ${nearby?.kind ?? 'station'}`} className="craft-panel">
      <div className="craft-layout">
        <nav>{RECIPES.map((item) => <button key={item.id} className={item.id === selected ? 'selected' : ''} onClick={() => setSelected(item.id)} disabled={self.level < item.level}><ItemGlyph itemId={item.output.itemId} /><span><strong>{item.name}</strong><small>{item.station} · level {item.level}</small></span></button>)}</nav>
        {recipe && <article className="recipe-sheet">
          <p className="eyebrow">{recipe.station} recipe</p><h3>{recipe.name}</h3><p>{ITEMS[recipe.output.itemId].description}</p>
          <h4>Required</h4><div className="ingredient-list">{Object.entries(recipe.ingredients).map(([itemId, quantity]) => { const owned = itemCount(self.inventory, itemId as keyof typeof ITEMS); return <div key={itemId} className={owned >= (quantity ?? 0) ? 'ready' : 'missing'}><ItemGlyph itemId={itemId as keyof typeof ITEMS} /><span><strong>{ITEMS[itemId as keyof typeof ITEMS].name}</strong><small>{owned} / {quantity}</small></span></div>; })}</div>
          <div className="recipe-cost"><span>Station fee</span><strong>{recipe.fee} gold</strong></div>
          <button className="primary-button" onClick={() => gameNetwork.send({ type: 'craft', recipeId: recipe.id })} disabled={self.level < recipe.level}>Forge {recipe.name}</button>
        </article>}
      </div>
    </PanelFrame>
  );
}

function BankPanel() {
  const { self } = useGameState();
  const [amount, setAmount] = useState(0);
  if (!self) return null;
  return (
    <PanelFrame title="The shared strongbox" eyebrow={`Bank · ${self.bank.length}/${self.bankSlots}`} className="bank-panel">
      <div className="bank-columns">
        <ItemList title="Carried" items={self.inventory} actionLabel="Deposit" onAction={(item) => gameNetwork.send({ type: 'bank', action: 'deposit-item', instanceId: item.instanceId })} />
        <div className="bank-ledger">
          <span className="large-coin">◉</span><small>Protected gold</small><strong>{self.bankedGold}</strong><p>Banked gold survives death. Carried gold does not.</p>
          <label>Amount<input type="number" min={1} value={amount || ''} onChange={(event) => setAmount(Math.max(0, Number(event.target.value)))} /></label>
          <div><button onClick={() => amount > 0 && gameNetwork.send({ type: 'bank', action: 'deposit-gold', amount })}>Deposit</button><button onClick={() => amount > 0 && gameNetwork.send({ type: 'bank', action: 'withdraw-gold', amount })}>Withdraw</button></div>
          <button className="text-button" onClick={() => gameNetwork.send({ type: 'bank', action: 'expand' })}>Expand by 6 slots · {80 + Math.max(0, self.bankSlots - 12) * 20} gold</button>
        </div>
        <ItemList title="Protected" items={self.bank} actionLabel="Withdraw" onAction={(item) => gameNetwork.send({ type: 'bank', action: 'withdraw-item', instanceId: item.instanceId })} />
      </div>
    </PanelFrame>
  );
}

function ItemList({ title, items, actionLabel, onAction }: { title: string; items: ItemStack[]; actionLabel: string; onAction: (item: ItemStack) => void }) {
  return <section className="bank-list"><h3>{title}</h3>{items.length === 0 ? <p className="muted">Nothing here.</p> : items.map((item) => <div key={item.instanceId}><ItemGlyph itemId={item.itemId} /><span><strong>{itemLabel(item)}</strong><small>{ITEMS[item.itemId].category}</small></span><button onClick={() => onAction(item)}>{actionLabel}</button></div>)}</section>;
}

function MarketPanel() {
  const { self } = useGameState();
  const [auctions, setAuctions] = useState<Auction[]>([]);
  const [selectedItem, setSelectedItem] = useState('');
  const [price, setPrice] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = () => { setLoading(true); void api.auctions().then(setAuctions).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not load listings.')).finally(() => setLoading(false)); };
  useEffect(load, []);
  if (!self) return null;
  const listable = self.inventory.filter((item) => ITEMS[item.itemId].category !== 'material');
  return (
    <PanelFrame title="The exile exchange" eyebrow="24-hour listings · 5% listing fee" className="market-panel">
      <div className="market-layout">
        <aside className="market-sell"><h3>Offer an item</h3><p>No ownership stamp. No binding. Only a public offer.</p><label>Item<select value={selectedItem} onChange={(event) => setSelectedItem(event.target.value)}><option value="">Choose an item</option>{listable.map((item) => <option key={item.instanceId} value={item.instanceId}>{itemLabel(item)}</option>)}</select></label><label>Price<input type="number" min={1} max={1_000_000} value={price} onChange={(event) => setPrice(Number(event.target.value))} /></label><span className="fee-line">Listing fee now: <strong>{Math.max(1, Math.ceil(price * 0.05))} gold</strong></span><button className="primary-button" disabled={!selectedItem || price < 1} onClick={() => void api.listAuction(selectedItem, price).then(() => { setSelectedItem(''); load(); }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Listing failed.'))}>Post public offer</button></aside>
        <section className="auction-board"><header><h3>Open offers</h3><button onClick={load}>Refresh</button></header>{error && <p className="form-error">{error}</p>}{loading ? <p className="muted">Reading the board…</p> : auctions.length === 0 ? <div className="empty-market"><span>Nothing is listed.</span><small>The economy begins with what exiles choose to make.</small></div> : auctions.map((auction) => <article key={auction.id}><ItemGlyph itemId={auction.item.itemId} /><div><strong>{ITEMS[auction.item.itemId].name}</strong><small>{auction.sellerName} · expires {relativeTime(auction.expiresAt)}</small></div><b>{auction.price} g</b><button disabled={auction.sellerId === self.id || self.gold < auction.price} onClick={() => void api.buyAuction(auction.id, auction.version).then(load).catch((caught) => setError(caught instanceof Error ? caught.message : 'Purchase failed.'))}>{auction.sellerId === self.id ? 'Yours' : 'Buy'}</button></article>)}</section>
      </div>
    </PanelFrame>
  );
}

function SocialPanel() {
  const { self, entities, trade } = useGameState();
  const [gold, setGold] = useState(0);
  if (!self) return null;
  const nearbyPlayers = entities.filter((entity) => entity.kind === 'player' && distance2d(self.position, entity.position) <= 12);
  if (trade) {
    const other = trade.participants.find((participant) => participant.id !== self.id);
    const selfOffer = trade.offers[self.id];
    const otherOffer = other ? trade.offers[other.id] : undefined;
    return (
      <PanelFrame title={`Exchange with ${other?.name ?? 'another exile'}`} eyebrow={`Direct trade · revision ${trade.version}`} className="social-panel trade-panel">
        <div className="trade-layout">
          <TradeOffer title="Your offer" offer={selfOffer} items={self.inventory} selfId={self.id} version={trade.version} editable />
          <div className="trade-knot"><span>⇄</span><small>Atomic escrow</small></div>
          <TradeOffer title={`${other?.name ?? 'Their'} offer`} offer={otherOffer} items={[]} selfId={self.id} version={trade.version} />
        </div>
        <div className="trade-controls"><label>Gold<input type="number" min={0} max={self.gold} value={gold || ''} onChange={(event) => setGold(Math.max(0, Number(event.target.value)))} /></label><button onClick={() => gameNetwork.send({ type: 'trade', action: 'offer-gold', amount: gold, tradeVersion: trade.version })}>Set gold</button><button className="primary-button" disabled={selfOffer?.accepted} onClick={() => gameNetwork.send({ type: 'trade', action: 'accept', tradeVersion: trade.version })}>{selfOffer?.accepted ? 'Accepted · waiting' : 'Lock my offer'}</button><button className="text-button danger" onClick={() => gameNetwork.send({ type: 'trade', action: 'cancel' })}>Cancel</button></div>
      </PanelFrame>
    );
  }
  return (
    <PanelFrame title="Exiles nearby" eyebrow="Mutual aid · direct trade" className="social-panel">
      <div className="social-list">{nearbyPlayers.length === 0 ? <div className="empty-social"><span>Only your footsteps answer.</span><small>Local chat reaches 55 metres; zone chat reaches the forest.</small></div> : nearbyPlayers.map((player) => <article key={player.id}><span className="player-medallion">{player.name?.slice(0, 1) ?? '?'}</span><div><strong>{player.name}</strong><small>Level {player.level} · {distance2d(self.position, player.position).toFixed(1)} m away</small></div><button onClick={() => gameNetwork.send({ type: 'trade', action: 'request', targetPlayerId: player.id })}>Offer trade</button></article>)}</div>
      <blockquote>“Help is not charity when tomorrow you may wake with nothing.”<cite>— Sera, refuge mentor</cite></blockquote>
    </PanelFrame>
  );
}

function TradeOffer({ title, offer, items, selfId, version, editable = false }: { title: string; offer: { itemInstanceIds: string[]; gold: number; accepted: boolean } | undefined; items: ItemStack[]; selfId: string; version: number; editable?: boolean }) {
  return <section className={`trade-offer ${offer?.accepted ? 'accepted' : ''}`}><h3>{title}</h3><div className="trade-items">{editable ? items.map((item) => { const offered = offer?.itemInstanceIds.includes(item.instanceId); return <button key={item.instanceId} className={offered ? 'offered' : ''} onClick={() => gameNetwork.send({ type: 'trade', action: 'offer-item', instanceId: item.instanceId, tradeVersion: version })}><ItemGlyph itemId={item.itemId} /><small>{ITEMS[item.itemId].name}</small></button>; }) : Array.from({ length: offer?.itemInstanceIds.length ?? 0 }, (_, index) => <span key={index} className="sealed-item">Sealed item</span>)}</div><div className="trade-gold"><span>Gold</span><strong>{offer?.gold ?? 0}</strong></div>{offer?.accepted && <i className="accepted-stamp">Locked</i>}<span className="sr-only">{selfId}</span></section>;
}

function WorldMapPanel() {
  const { self, entities, world } = useGameState();
  if (!self) return null;
  const pos = (x: number, z: number) => ({ left: `${((x + 256) / 512) * 100}%`, top: `${((256 - z) / 512) * 100}%` });
  return (
    <PanelFrame title="The Great Forest Frontier" eyebrow="No fast travel · what you find stays found" className="world-map-panel">
      <div className="world-map"><span className="world-map-grid" /><span className="region-label wild">THE WILD</span><span className="region-label refuge">FREE TERRITORY</span><span className="region-label concord">CONCORD MARCH</span><MapMark style={pos(-142, 116)} label="Free Territory" className="refuge" /><MapMark style={pos(-6, -2)} label="The Giant Tree" className="tree" /><MapMark style={pos(151, -74)} label={`Eastern outpost · ${world?.outpost ?? 'unknown'}`} className="outpost" />{self.discoveries.includes('secret-cave') && <MapMark style={pos(80, 168)} label="Hidden cave" className="secret" />}{self.discoveries.includes('secret-shrine') && <MapMark style={pos(-43, -176)} label="Concealed shrine" className="secret" />}{self.discoveries.includes('strange-ruin') && <MapMark style={pos(193, 112)} label="Strange ruin" className="secret" />}{entities.filter((entity) => entity.kind === 'player').map((entity) => <i key={entity.id} className="world-player remote" style={pos(entity.position.x, entity.position.z)} title={entity.name} />)}<i className="world-player self" style={pos(self.position.x, self.position.z)} /></div>
      <div className="map-legend"><span><i className="refuge" />Safe refuge</span><span><i className="outpost" />Concord</span><span><i className="secret" />Discovered secret</span><strong>{self.discoveries.length} / 3 secrets found</strong></div>
    </PanelFrame>
  );
}

function MapMark({ style, label, className }: { style: CSSProperties; label: string; className: string }) {
  return <span className={`world-mark ${className}`} style={style}><i /><strong>{label}</strong></span>;
}

function QuestionsPanel({ materials }: { materials: MaterialSummary[] }) {
  const [questions, setQuestions] = useState<Array<Record<string, unknown>>>([]);
  const [ledgerMaterials, setLedgerMaterials] = useState(materials);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    let refreshTimer = 0;
    const load = async () => {
      try {
        const [nextQuestions, nextMaterials] = await Promise.all([api.questions(), api.materials()]);
        if (cancelled) return;
        setQuestions(nextQuestions);
        setLedgerMaterials(nextMaterials);
        if (nextMaterials.some((material) => material.status === 'processing')) {
          refreshTimer = window.setTimeout(() => void load(), 2_000);
        }
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load questions.');
      }
    };
    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(refreshTimer);
    };
  }, [materials]);
  const update = (id: string, patch: Record<string, unknown>) => void api.updateQuestion(id, patch).then((question) => { setQuestions((current) => current.map((item) => item.id === id ? question : item)); setSelected(question); }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Update failed.'));
  return (
    <PanelFrame title="Your question ledger" eyebrow={`${questions.length} generated · ${ledgerMaterials.length} material${ledgerMaterials.length === 1 ? '' : 's'}`} className="questions-panel">
      <div className="questions-layout"><nav>{ledgerMaterials.map((material) => <div key={material.id} className={`material-status ${material.status}`}><span /><div><strong>{material.title}</strong><small>{material.status}{material.error ? ` · ${material.error}` : ''}</small></div></div>)}<hr />{questions.map((question, index) => <button key={String(question.id)} className={selected?.id === question.id ? 'selected' : ''} onClick={() => setSelected(question)}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{String(question.prompt)}</strong><small>{String(question.type)} · {question.enabled ? 'active' : 'disabled'}</small></div></button>)}</nav><article>{error && <p className="form-error">{error}</p>}{selected ? <QuestionEditor question={selected} onUpdate={update} /> : <div className="empty-inspector"><span>⌁</span><p>Select a generated question to review, edit, or disable it.</p></div>}</article></div>
    </PanelFrame>
  );
}

function QuestionEditor({ question, onUpdate }: { question: Record<string, unknown>; onUpdate: (id: string, patch: Record<string, unknown>) => void }) {
  const [prompt, setPrompt] = useState(String(question.prompt ?? ''));
  const [accepted, setAccepted] = useState('');
  useEffect(() => { setPrompt(String(question.prompt ?? '')); setAccepted(''); }, [question]);
  const id = String(question.id);
  return <><p className="eyebrow">{String(question.type)} · {String(question.language)}</p><label>Prompt<textarea value={prompt} maxLength={500} onChange={(event) => setPrompt(event.target.value)} /></label><label>Replace accepted answers <input value={accepted} onChange={(event) => setAccepted(event.target.value)} placeholder="comma-separated aliases" /></label><blockquote>{String(question.sourceExcerpt ?? '')}</blockquote><div className="question-actions"><button className="secondary-button" onClick={() => onUpdate(id, { prompt, ...(accepted.trim() ? { accepted: accepted.split(',').map((value) => value.trim()).filter(Boolean), answerDisplay: accepted.split(',')[0]?.trim() } : {}) })}>Save edits</button><button className="text-button danger" onClick={() => onUpdate(id, { enabled: !question.enabled })}>{question.enabled ? 'Disable question' : 'Enable question'}</button></div></>;
}

function CreditsPanel() {
  const [assets, setAssets] = useState<RuntimeAsset[]>([]);
  useEffect(() => { void fetch('/assets/runtime/manifest.json').then((response) => response.json()).then((value) => setAssets(runtimeAssetSchema.array().parse(value))); }, []);
  const grouped = assets.reduce((map, asset) => {
    const entries = map.get(asset.preloadGroup) ?? [];
    entries.push(asset);
    map.set(asset.preloadGroup, entries);
    return map;
  }, new Map<string, RuntimeAsset[]>());
  return (
    <PanelFrame title="Makers and borrowed forms" eyebrow="Attribution · runtime asset ledger" className="credits-panel">
      <p>Blood of the Exiled uses a curated runtime subset. Every supplied source asset remains preserved outside the public bundle. The Free Standard bow is intentionally excluded.</p>
      {[...grouped.entries()].map(([group, entries]) => <section key={group}><h3>{group}</h3>{entries.map((asset) => <a key={asset.id} href={asset.sourceUrl} target="_blank" rel="noreferrer"><span><strong>{asset.id}</strong><small>{asset.author} · {asset.license}</small></span><i>↗</i></a>)}</section>)}
      <p className="smallprint">Three.js · React · Rapier · Fastify · PostgreSQL · DeepSeek · Whisper · Piper. Thorsten German voice data/model: CC0.</p>
    </PanelFrame>
  );
}

function MenuPanel({ onLogout }: { onLogout: () => Promise<void> }) {
  const { self, connection, latency } = useGameState();
  return (
    <PanelFrame title="Pause without pausing the world" eyebrow="The forest continues" className="menu-panel">
      <div className="menu-layout"><section><button onClick={() => gameStore.closePanel()}>Return to world<span>Esc</span></button><button onClick={() => gameStore.setPanel('questions')}>Question ledger<span>Study material</span></button><button onClick={() => gameStore.setPanel('credits')}>Credits and licenses<span>Asset ledger</span></button><button className="danger" onClick={() => void onLogout()}>Leave the forest<span>Sign out</span></button></section><aside><p className="eyebrow">Controls</p><dl><div><dt>Move / sprint</dt><dd>WASD · Shift</dd></div><div><dt>Jump / dodge</dt><dd>Space · Alt</dd></div><div><dt>Attack / block</dt><dd>LMB · RMB</dd></div><div><dt>Heavy / abilities</dt><dd>Q · 1 2 3</dd></div><div><dt>Interact / tonic</dt><dd>E · R</dd></div><div><dt>Inventory / map</dt><dd>Tab · M</dd></div></dl><p className="server-line"><i className={connection} />{connection} · {latency} ms · level {self?.level}</p></aside></div>
    </PanelFrame>
  );
}

function ItemGlyph({ itemId, large = false }: { itemId: keyof typeof ITEMS; large?: boolean }) {
  return <i className={`item-glyph item-${itemId} ${large ? 'large' : ''}`} aria-hidden="true"><span /></i>;
}

function relativeTime(timestamp: number): string {
  const hours = Math.max(1, Math.ceil((timestamp - Date.now()) / 3_600_000));
  return `in ${hours}h`;
}
