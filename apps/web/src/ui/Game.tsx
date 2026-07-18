import { useEffect, useRef } from 'react';
import { GameEngine } from '../game/GameEngine';
import { gameNetwork } from '../network';
import { gameStore } from '../game-store';
import type { CharacterSummary, MaterialSummary } from '../types';
import { GameHud } from './GameHud';

export function Game({
  character,
  materials,
  onLogout,
}: {
  character: CharacterSummary;
  materials: MaterialSummary[];
  onLogout: () => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    gameStore.reset(character);
    gameNetwork.connect();
    const canvas = canvasRef.current;
    const engine = canvas ? new GameEngine(canvas) : null;
    return () => {
      engine?.dispose();
      gameNetwork.disconnect();
    };
  }, [character]);

  return (
    <main className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Blood of the Exiled game world" />
      <GameHud materials={materials} onLogout={onLogout} />
      <div className="mobile-notice">
        <strong>Desktop controls required</strong>
        <span>Blood of the Exiled V1 uses keyboard, mouse, and pointer lock.</span>
      </div>
    </main>
  );
}
