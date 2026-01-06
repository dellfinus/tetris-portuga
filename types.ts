
export type BlockCategory = 'subject' | 'verb' | 'object' | 'adjective' | 'adverb' | 'conjunction' | 'preposition';

export interface WordBlock {
  id: string;
  text: string;
  category: BlockCategory;
  color: string;
}

export interface Position {
  x: number;
  y: number;
}

export interface FallingBlock extends WordBlock {
  pos: Position;
}

export interface LeaderboardEntry {
  name: string;
  score: number;
  isCurrentUser?: boolean;
}

export interface GameState {
  playerName: string;
  grid: (WordBlock | null)[][];
  activeBlock: FallingBlock | null;
  score: number;
  level: number;
  feedback: string;
  gameOver: boolean;
  targetStructure: string;
  isPaused: boolean;
  isValidating: boolean;
}

export enum GameAction {
  MOVE_LEFT,
  MOVE_RIGHT,
  MOVE_DOWN,
  ROTATE,
  DROP
}
