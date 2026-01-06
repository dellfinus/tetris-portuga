
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  GRID_WIDTH, 
  GRID_HEIGHT, 
  INITIAL_SPEED, 
  MIN_SPEED, 
  WORD_POOLS, 
  TARGET_STRUCTURES,
  CATEGORY_COLORS 
} from './constants';
import { 
  WordBlock, 
  FallingBlock, 
  Position, 
  BlockCategory, 
  GameState,
  LeaderboardEntry
} from './types';
import { validateSentence, checkNameAppropriateness, suggestContextualWord, WordCategoryMapping } from './services/geminiService';
import { soundService } from './services/soundService';

const ALL_CATEGORIES: BlockCategory[] = ['subject', 'verb', 'object', 'adjective', 'adverb', 'conjunction', 'preposition'];

const App: React.FC = () => {
  const [hasStarted, setHasStarted] = useState(false);
  const [showRules, setShowRules] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isCheckingName, setIsCheckingName] = useState(false);
  const [isFetchingLeaderboard, setIsFetchingLeaderboard] = useState(false);
  const [nameError, setNameError] = useState("");
  const [isLandscape, setIsLandscape] = useState(false);
  
  // Track validation status for visual feedback
  const [validationStatus, setValidationStatus] = useState<'idle' | 'full' | 'half' | 'error'>('idle');
  
  const [gameState, setGameState] = useState<GameState>({
    playerName: "",
    grid: Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(null)),
    activeBlock: null,
    score: 0,
    level: 1,
    feedback: "Monte a frase na estrutura indicada!",
    gameOver: false,
    targetStructure: TARGET_STRUCTURES[0],
    isPaused: false,
    isValidating: false
  });

  const [speed, setSpeed] = useState(INITIAL_SPEED);
  const gameLoopRef = useRef<number | null>(null);
  const feedbackTimerRef = useRef<number | null>(null);
  
  const recentCategoriesRef = useRef<BlockCategory[]>([]);
  const categoryBagRef = useRef<BlockCategory[]>([]);

  useEffect(() => {
    const checkOrientation = () => {
      const isMobile = window.innerWidth < 768;
      const isLandscapeView = window.innerWidth > window.innerHeight;
      setIsLandscape(isMobile && isLandscapeView);
    };

    window.addEventListener('resize', checkOrientation);
    checkOrientation();
    return () => window.removeEventListener('resize', checkOrientation);
  }, []);

  useEffect(() => {
    soundService.setMuted(isMuted);
  }, [isMuted]);

  // Handle validation feedback timeout
  useEffect(() => {
    if (validationStatus !== 'idle') {
      if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = window.setTimeout(() => {
        setValidationStatus('idle');
      }, 4000);
    }
    return () => { if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current); };
  }, [validationStatus]);

  // Load and Mock "Online" Leaderboard
  useEffect(() => {
    const fetchLeaderboard = () => {
      setIsFetchingLeaderboard(true);
      const saved = localStorage.getItem('grammar_tetris_scores_online_v1');
      let scores: LeaderboardEntry[] = [];
      
      if (saved) {
        scores = JSON.parse(saved);
      } else {
        // Initial mock data to represent "online" players
        scores = [
          { name: "Prof_Gramática", score: 2500 },
          { name: "Dona_Benta", score: 1800 },
          { name: "Machado_A", score: 1500 },
          { name: "Clarice_L", score: 1200 },
          { name: "Guimarães_R", score: 900 }
        ];
        localStorage.setItem('grammar_tetris_scores_online_v1', JSON.stringify(scores));
      }
      
      setTimeout(() => {
        setLeaderboard(scores.sort((a, b) => b.score - a.score).slice(0, 10));
        setIsFetchingLeaderboard(false);
      }, 800);
    };
    
    fetchLeaderboard();
  }, []);

  const updateLeaderboard = useCallback((finalScore: number) => {
    if (finalScore <= 0) return;
    setLeaderboard(prev => {
      const otherPlayers = prev.filter(e => e.name !== gameState.playerName);
      const currentBest = prev.find(e => e.name === gameState.playerName)?.score || 0;
      const entry: LeaderboardEntry = { 
        name: gameState.playerName, 
        score: Math.max(currentBest, finalScore), 
        isCurrentUser: true 
      };
      const updated = [...otherPlayers, entry].sort((a, b) => b.score - a.score).slice(0, 10);
      localStorage.setItem('grammar_tetris_scores_online_v1', JSON.stringify(updated));
      return updated;
    });
  }, [gameState.playerName]);

  const getRequiredCategoryForCol = (colIndex: number): BlockCategory => {
    const parts = gameState.targetStructure.split(' + ');
    const part = parts[colIndex]?.toLowerCase() || "";
    if (part.includes("sujeito")) return 'subject';
    if (part.includes("verbo")) return 'verb';
    if (part.includes("objeto")) return 'object';
    if (part.includes("adjetivo")) return 'adjective';
    if (part.includes("advérbio")) return 'adverb';
    if (part.includes("preposição")) return 'preposition';
    if (part.includes("conjunção")) return 'conjunction';
    return 'subject';
  };

  const generateBlock = useCallback(async () => {
    const currentLevel = Math.min(gameState.level, Object.keys(WORD_POOLS).length);
    const levelPool = WORD_POOLS[currentLevel] || WORD_POOLS[1];

    let predictedCategory: BlockCategory | null = null;
    let contextWords: string[] = [];
    
    for (let y = GRID_HEIGHT - 1; y >= 0; y--) {
      const row = gameState.grid[y];
      const filledCells = row.filter(cell => cell !== null);
      if (filledCells.length === GRID_WIDTH - 1) {
        const emptyIdx = row.findIndex(cell => cell === null);
        predictedCategory = getRequiredCategoryForCol(emptyIdx);
        contextWords = row.map(cell => cell?.text || "");
        break;
      }
    }

    let preferredCategory: BlockCategory;
    let text: string | null = null;

    if (predictedCategory) {
      preferredCategory = predictedCategory;
      text = await suggestContextualWord(contextWords, preferredCategory, gameState.targetStructure);
    } else {
      if (categoryBagRef.current.length === 0) {
        const baseBag: BlockCategory[] = [...ALL_CATEGORIES, 'subject', 'verb', 'object', 'adjective'];
        for (let i = baseBag.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [baseBag[i], baseBag[j]] = [baseBag[j], baseBag[i]];
        }
        categoryBagRef.current = baseBag;
      }
      preferredCategory = categoryBagRef.current.pop()!;
    }

    if (!text) {
      const pool = levelPool[preferredCategory] || levelPool['subject'];
      text = pool[Math.floor(Math.random() * pool.length)];
    }
    
    recentCategoriesRef.current = [...recentCategoriesRef.current, preferredCategory].slice(-10);

    const newBlock: FallingBlock = {
      id: Math.random().toString(36).substr(2, 9),
      text,
      category: preferredCategory,
      color: CATEGORY_COLORS[preferredCategory],
      pos: { x: Math.floor(GRID_WIDTH / 2) - 1, y: 0 } 
    };

    if (checkCollision(newBlock.pos, gameState.grid)) {
      setGameState(prev => ({ ...prev, gameOver: true }));
      updateLeaderboard(gameState.score);
      soundService.playGameOver();
    } else {
      setGameState(prev => ({ ...prev, activeBlock: newBlock }));
    }
  }, [gameState.level, gameState.grid, gameState.targetStructure, updateLeaderboard, gameState.score]);

  const checkCollision = (pos: Position, grid: (WordBlock | null)[][]): boolean => {
    if (pos.x < 0 || pos.x >= GRID_WIDTH || pos.y >= GRID_HEIGHT) return true;
    if (pos.y >= 0 && grid[pos.y][pos.x]) return true;
    return false;
  };

  const clearLines = async (currentGrid: (WordBlock | null)[][]) => {
    const fullRows: { y: number; words: WordCategoryMapping[] }[] = [];
    for (let y = 0; y < GRID_HEIGHT; y++) {
      if (currentGrid[y].every(cell => cell !== null)) {
        fullRows.push({
          y,
          words: currentGrid[y].map(cell => ({ 
            text: cell?.text || "", 
            category: cell?.category || "" 
          }))
        });
      }
    }

    if (fullRows.length === 0) {
      setGameState(prev => ({ ...prev, activeBlock: null }));
      generateBlock();
      return;
    }

    let highestY = GRID_HEIGHT;
    for (let x = 0; x < GRID_WIDTH; x++) {
      for (let y = 0; y < GRID_HEIGHT; y++) {
        if (currentGrid[y][x]) { highestY = Math.min(highestY, y); break; }
      }
    }
    const isDangerZone = highestY < 4;

    setGameState(prev => ({ ...prev, isValidating: true, feedback: "Analisando estrutura..." }));
    
    const results = await Promise.all(fullRows.map(row => validateSentence(row.words, gameState.targetStructure, isDangerZone)));

    let newGrid = currentGrid.map(row => [...row]);
    let rowsToClear: number[] = [];
    let feedbackMsg = "";
    let totalScoreGain = 0;
    let finalStatus: 'full' | 'half' | 'error' = 'idle' as any;

    results.forEach((res, index) => {
      if (res.syntaxValid) {
        rowsToClear.push(fullRows[index].y);
        const baseScore = 100 * gameState.level;
        
        if (res.semanticsValid) {
          totalScoreGain += baseScore;
          finalStatus = 'full';
        } else {
          totalScoreGain += baseScore * 0.5;
          finalStatus = 'half';
        }
        
        feedbackMsg = res.feedback;
        soundService.playSuccess();
      } else {
        feedbackMsg = res.feedback;
        finalStatus = 'error';
        soundService.playError();
      }
    });

    setValidationStatus(finalStatus);

    if (rowsToClear.length > 0) {
      const filteredGrid = newGrid.filter((_, idx) => !rowsToClear.includes(idx));
      while (filteredGrid.length < GRID_HEIGHT) filteredGrid.unshift(Array(GRID_WIDTH).fill(null));
      newGrid = filteredGrid;
    }

    const newLevel = Math.floor((gameState.score + totalScoreGain) / 500) + 1;
    if (newLevel > gameState.level) soundService.playLevelUp();

    setGameState(prev => ({
      ...prev,
      grid: newGrid,
      score: prev.score + totalScoreGain,
      feedback: feedbackMsg || prev.feedback,
      isValidating: false,
      activeBlock: null,
      targetStructure: rowsToClear.length > 0 ? TARGET_STRUCTURES[Math.floor(Math.random() * TARGET_STRUCTURES.length)] : prev.targetStructure,
      level: newLevel
    }));

    setSpeed(Math.max(MIN_SPEED, INITIAL_SPEED - (newLevel * 40)));
  };

  const moveBlock = (dx: number, dy: number) => {
    if (gameState.gameOver || gameState.isPaused || gameState.isValidating || !gameState.activeBlock) return;
    const newPos = { x: gameState.activeBlock.pos.x + dx, y: gameState.activeBlock.pos.y + dy };

    if (!checkCollision(newPos, gameState.grid)) {
      if (dx !== 0) soundService.playMove();
      setGameState(prev => ({ ...prev, activeBlock: prev.activeBlock ? { ...prev.activeBlock, pos: newPos } : null }));
    } else if (dy > 0) {
      const finalGrid = gameState.grid.map(row => [...row]);
      const { x, y } = gameState.activeBlock.pos;
      if (y <= 0) {
        setGameState(prev => ({ ...prev, gameOver: true }));
        updateLeaderboard(gameState.score);
        soundService.playGameOver();
        return;
      }
      finalGrid[y][x] = { ...gameState.activeBlock };
      soundService.playLand();
      setGameState(prev => ({ ...prev, grid: finalGrid }));
      clearLines(finalGrid);
    }
  };

  useEffect(() => {
    if (hasStarted && !gameState.activeBlock && !gameState.gameOver && !gameState.isPaused && !gameState.isValidating) {
      generateBlock();
    }
  }, [hasStarted, gameState.activeBlock, gameState.gameOver, gameState.isPaused, gameState.isValidating, generateBlock]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') moveBlock(-1, 0);
      if (e.key === 'ArrowRight') moveBlock(1, 0);
      if (e.key === 'ArrowDown') moveBlock(0, 1);
      if (e.key === ' ') togglePause();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState.activeBlock, gameState.grid, gameState.gameOver, gameState.isPaused, gameState.isValidating]);

  useEffect(() => {
    if (hasStarted && !gameState.gameOver && !gameState.isPaused && !gameState.isValidating) {
      gameLoopRef.current = window.setInterval(() => moveBlock(0, 1), speed);
    }
    return () => { if (gameLoopRef.current) clearInterval(gameLoopRef.current); };
  }, [hasStarted, gameState.activeBlock, gameState.grid, gameState.gameOver, gameState.isPaused, gameState.isValidating, speed]);

  const resetGame = () => {
    soundService.playClick();
    setValidationStatus('idle');
    setGameState(prev => ({
      ...prev,
      grid: Array(GRID_HEIGHT).fill(null).map(() => Array(GRID_WIDTH).fill(null)),
      activeBlock: null,
      score: 0,
      level: 1,
      feedback: "Reiniciando...",
      gameOver: false,
      targetStructure: TARGET_STRUCTURES[0],
      isPaused: false,
      isValidating: false
    }));
    recentCategoriesRef.current = [];
    categoryBagRef.current = [];
    setSpeed(INITIAL_SPEED);
  };

  const handleStartAttempt = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    soundService.playClick();
    setIsCheckingName(true);
    const check = await checkNameAppropriateness(trimmed);
    if (check.isAppropriate) {
      setGameState(prev => ({ ...prev, playerName: trimmed }));
      setShowRules(true);
    } else {
      setNameError(check.reason || "Nome inapropriado.");
      soundService.playError();
    }
    setIsCheckingName(false);
  };

  const startGame = () => {
    soundService.playLevelUp();
    setShowRules(false);
    setHasStarted(true);
  };

  const togglePause = () => { soundService.playClick(); setGameState(prev => ({ ...prev, isPaused: !prev.isPaused })); };
  const toggleMute = () => setIsMuted(!isMuted);

  if (isLandscape) {
    return (
      <div className="fixed inset-0 bg-slate-950 z-[100] flex flex-col items-center justify-center p-8 text-center animate-in fade-in duration-500">
        <div className="w-24 h-24 bg-blue-600/10 rounded-3xl flex items-center justify-center mb-8 border border-blue-500/20 shadow-2xl">
          <span className="text-5xl animate-bounce">📱</span>
        </div>
        <h2 className="text-2xl font-black text-white uppercase italic tracking-tighter mb-4 leading-none">Gire seu dispositivo</h2>
        <p className="text-slate-400 text-sm max-w-[200px]">Este jogo é otimizado para o modo retrato (vertical).</p>
      </div>
    );
  }

  if (!hasStarted && !showRules) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <div className="bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center space-y-6">
          <div className="space-y-2">
            <h1 className="text-4xl font-black text-blue-400 tracking-tighter uppercase italic">Gramática Tetris</h1>
            <p className="text-slate-400 text-sm italic">Ambiente Escolar Online</p>
          </div>
          <div className="space-y-2">
            <input 
              autoFocus
              disabled={isCheckingName}
              type="text" 
              placeholder="Digite seu Nome"
              maxLength={15}
              onKeyDown={(e) => e.key === 'Enter' && handleStartAttempt((e.target as HTMLInputElement).value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all text-center text-white font-bold"
            />
            {nameError && <p className="text-rose-500 text-xs font-bold px-2 py-1 bg-rose-500/10 rounded animate-bounce">{nameError}</p>}
          </div>
          <button 
            disabled={isCheckingName}
            onClick={() => { const input = document.querySelector('input') as HTMLInputElement; handleStartAttempt(input.value); }}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-black py-4 rounded-xl transition-all shadow-xl shadow-blue-900/20 active:scale-95 uppercase tracking-widest"
          >
            {isCheckingName ? "Validando Nome..." : "Entrar no Jogo"}
          </button>
        </div>
      </div>
    );
  }

  if (!hasStarted && showRules) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 p-6 md:p-10 rounded-3xl shadow-2xl max-w-2xl w-full space-y-8 text-slate-100 overflow-y-auto max-h-[90vh]">
          <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-black text-blue-400 uppercase italic tracking-tighter">Regras de Conduta</h2>
            <div className="h-1.5 w-24 bg-blue-600 mx-auto mt-3 rounded-full"></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="flex gap-4">
                <span className="flex-shrink-0 w-10 h-10 bg-blue-600/20 border border-blue-500/30 rounded-xl flex items-center justify-center font-black text-blue-400 text-lg">1</span>
                <div>
                  <h3 className="font-bold text-white mb-1">Combine Blocos</h3>
                  <p className="text-sm text-slate-400">Monte frases na ordem sintática do topo para ganhar pontos.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <span className="flex-shrink-0 w-10 h-10 bg-rose-600/20 border border-rose-500/30 rounded-xl flex items-center justify-center font-black text-rose-400 text-lg">2</span>
                <div>
                  <h3 className="font-bold text-white mb-1">Respeito</h3>
                  <p className="text-sm text-slate-400">Nomes e termos inadequados não são permitidos no ambiente escolar.</p>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex gap-4">
                <span className="flex-shrink-0 w-10 h-10 bg-emerald-600/20 border border-emerald-500/30 rounded-xl flex items-center justify-center font-black text-emerald-400 text-lg">3</span>
                <div>
                  <h3 className="font-bold text-white mb-1">Ranking</h3>
                  <p className="text-sm text-slate-400">Suas vitórias são salvas no ranking global de alunos.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <span className="flex-shrink-0 w-10 h-10 bg-amber-600/20 border border-amber-500/30 rounded-xl flex items-center justify-center font-black text-amber-400 text-lg">4</span>
                <div>
                  <h3 className="font-bold text-white mb-1">IA Online</h3>
                  <p className="text-sm text-slate-400">A IA analisa cada jogada em tempo real para feedback instantâneo.</p>
                </div>
              </div>
            </div>
          </div>
          <button 
            onClick={startGame}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-black py-5 rounded-2xl transition-all shadow-2xl shadow-blue-900/30 active:scale-95 uppercase tracking-widest text-lg"
          >
            Vamos Começar!
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center p-2 md:p-8 overflow-y-auto overflow-x-hidden relative">
      <div className="max-w-[1400px] w-full grid grid-cols-1 md:grid-cols-12 gap-3 lg:gap-10 items-start pb-12">
        
        {/* Left Panel: Player, Score, Stats */}
        <div className="md:col-span-3 lg:col-span-3 flex flex-col gap-6 order-2 md:order-1">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2.5rem] shadow-2xl">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-12 h-12 lg:w-16 lg:h-16 rounded-[1.25rem] lg:rounded-3xl bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center font-black text-xl lg:text-3xl border-2 border-white/10 shrink-0 shadow-lg">
                {gameState.playerName[0]?.toUpperCase() || 'P'}
              </div>
              <div className="overflow-hidden">
                <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest leading-none mb-1">Jogador Ativo</p>
                <p className="text-lg lg:text-2xl font-black truncate leading-tight text-blue-100">{gameState.playerName}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-slate-950 p-4 lg:p-6 rounded-3xl border border-slate-800/50 text-center shadow-inner">
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Minha Pontuação</p>
                <p className="text-3xl lg:text-5xl font-mono font-black text-emerald-400 tabular-nums">{Math.floor(gameState.score)}</p>
              </div>
              <div className="bg-slate-950 p-4 lg:p-6 rounded-3xl border border-slate-800/50 text-center shadow-inner">
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mb-1">Nível Atual</p>
                <p className="text-3xl lg:text-5xl font-mono font-black text-blue-400 tabular-nums">{gameState.level}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2.5rem] shadow-xl flex flex-col gap-4">
            <div className="flex justify-between gap-3">
              <button onClick={togglePause} className={`flex-1 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${gameState.isPaused ? 'bg-emerald-600 text-white scale-105' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>
                {gameState.isPaused ? 'Retomar' : 'Pausar'}
              </button>
              <button onClick={toggleMute} className="w-16 h-12 flex items-center justify-center bg-slate-800 border border-slate-700 rounded-2xl hover:bg-slate-700 transition-colors text-xl">
                {isMuted ? '🔈' : '🔊'}
              </button>
            </div>
            <button onClick={resetGame} className="w-full py-4 bg-slate-800/50 border border-slate-700/50 rounded-2xl text-xs font-black uppercase tracking-widest text-rose-400 hover:bg-rose-500/10 transition-colors">
              Reiniciar Jogo
            </button>
          </div>
        </div>

        {/* Center Panel: Game Board */}
        <div className="md:col-span-6 lg:col-span-6 flex flex-col items-center order-1 md:order-2">
          <div className="relative group">
            <div className="absolute -inset-1 bg-gradient-to-b from-blue-600/20 to-transparent blur-2xl rounded-[3rem] opacity-50"></div>
            <div 
              className="relative grid bg-slate-900/95 backdrop-blur-sm border-[6px] lg:border-[8px] border-slate-800 rounded-[3rem] shadow-[0_0_100px_-20px_rgba(0,0,0,0.8)] overflow-hidden" 
              style={{ 
                gridTemplateColumns: `repeat(${GRID_WIDTH}, minmax(0, 1fr))`, 
                width: 'min(500px, 96vw)', 
                height: 'min(700px, 82vh)' 
              }}
            >
              {/* Target Structure Overlay Top */}
              <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-slate-950 to-transparent z-10 p-4 md:p-6 flex flex-col items-center pointer-events-none">
                 <p className="text-[9px] md:text-[10px] font-black text-amber-500 uppercase tracking-widest mb-1 opacity-80">Estrutura Alvo</p>
                 <p className="text-xs md:text-sm lg:text-lg font-black text-amber-100 text-center leading-tight drop-shadow-md">{gameState.targetStructure}</p>
              </div>

              {gameState.grid.map((row, y) => row.map((cell, x) => (
                <div key={`${y}-${x}`} className="border border-slate-800/20 relative">
                  {cell && <BlockUI block={cell} isGhost={false} />}
                  {gameState.activeBlock?.pos.x === x && gameState.activeBlock?.pos.y === y && <BlockUI block={gameState.activeBlock} isGhost={false} />}
                </div>
              )))}
            </div>

            {/* Screens Overlays */}
            {gameState.isPaused && !gameState.gameOver && (
              <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-xl flex flex-col items-center justify-center rounded-[3rem] z-40 animate-in fade-in zoom-in duration-300">
                <h2 className="text-3xl lg:text-6xl font-black text-white uppercase italic tracking-widest drop-shadow-2xl">Pausado</h2>
                <button onClick={togglePause} className="mt-8 bg-blue-600 text-white px-10 py-4 rounded-full font-black uppercase tracking-widest text-sm hover:bg-blue-500 active:scale-95 transition-all shadow-xl shadow-blue-900/40">Retomar</button>
              </div>
            )}
            
            {gameState.gameOver && (
              <div className="absolute inset-0 bg-slate-950/98 backdrop-blur-2xl flex flex-col items-center justify-center rounded-[3rem] p-8 md:p-12 text-center z-50 animate-in fade-in zoom-in duration-500">
                <div className="w-20 h-20 md:w-24 md:h-24 lg:w-32 lg:h-32 bg-rose-600/20 rounded-full flex items-center justify-center mb-6 md:mb-8 border border-rose-500/30">
                  <span className="text-5xl md:text-6xl lg:text-7xl">💀</span>
                </div>
                <h2 className="text-4xl md:text-5xl lg:text-7xl font-black text-white mb-2 uppercase italic">Fim de Jogo</h2>
                <p className="text-slate-400 mb-8 md:mb-10 font-bold uppercase tracking-widest text-sm">Pontuação final: <span className="text-emerald-400 font-black">{Math.floor(gameState.score)}</span></p>
                <button onClick={resetGame} className="bg-blue-600 text-white px-12 md:px-16 py-4 md:py-5 rounded-full font-black uppercase tracking-widest text-base md:text-lg hover:bg-blue-500 active:scale-95 transition-all shadow-2xl shadow-blue-900/50">Tentar Novamente</button>
              </div>
            )}

            {gameState.isValidating && (
              <div className="absolute inset-0 flex items-center justify-center z-40 bg-slate-900/50 backdrop-blur-[4px]">
                <div className="bg-white text-slate-950 px-8 md:px-10 py-4 md:py-5 rounded-3xl font-black animate-pulse border-4 md:border-8 border-slate-950 uppercase tracking-[0.2em] text-xs md:text-sm lg:text-lg shadow-[0_0_100px_rgba(255,255,255,0.2)]">Validando...</div>
              </div>
            )}
          </div>
          
          <div className={`mt-4 md:mt-8 border-2 p-4 md:p-5 lg:p-8 rounded-[1.5rem] md:rounded-[2rem] w-full max-w-[500px] text-center shadow-2xl relative overflow-hidden transition-all duration-300 ${
            validationStatus === 'full' ? 'bg-emerald-900/20 border-emerald-500/40 opacity-100' : 
            validationStatus === 'half' ? 'bg-amber-900/20 border-amber-500/40 opacity-100' : 
            validationStatus === 'error' ? 'bg-rose-900/20 border-rose-500/40 opacity-100' : 
            'bg-slate-900 border-slate-800 opacity-80'
          }`}>
            <div className={`absolute top-0 left-0 w-1 md:w-1.5 h-full ${
              validationStatus === 'full' ? 'bg-emerald-500' : 
              validationStatus === 'half' ? 'bg-amber-500' : 
              validationStatus === 'error' ? 'bg-rose-500' : 
              'bg-blue-600'
            }`}></div>
            
            <div className="flex items-center justify-center gap-2 mb-2">
              <p className={`text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] ${
                validationStatus === 'full' ? 'text-emerald-400' : 
                validationStatus === 'half' ? 'text-amber-400' : 
                validationStatus === 'error' ? 'text-rose-400' : 
                'text-blue-500'
              }`}>
                {validationStatus === 'full' ? '✓ PONTO COMPLETO' : 
                 validationStatus === 'half' ? '⚠ MEIO PONTO (Sentido Surreal)' : 
                 validationStatus === 'error' ? '✖ ERRO GRAMATICAL' : 
                 'Professor IA'}
              </p>
            </div>
            
            <p className={`italic text-xs md:text-sm lg:text-xl font-bold leading-relaxed ${
              validationStatus === 'full' ? 'text-emerald-100' : 
              validationStatus === 'half' ? 'text-amber-100' : 
              validationStatus === 'error' ? 'text-rose-100' : 
              'text-blue-100'
            }`}>
              "{gameState.feedback}"
            </p>
          </div>
        </div>

        {/* Right Panel: Rankings & Guide */}
        <div className="md:col-span-3 lg:col-span-3 flex flex-col gap-6 order-3">
          <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col min-h-[250px] md:min-h-[300px] relative">
            <div className="bg-slate-800/50 p-4 md:p-6 border-b border-slate-800 flex justify-between items-center">
              <h2 className="text-xs font-black text-blue-400 uppercase tracking-widest flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                Hall da Fama Online
              </h2>
              {isFetchingLeaderboard && <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></span>}
            </div>
            <div className="p-2 md:p-4 space-y-1 md:space-y-2 max-h-[300px] md:max-h-[400px] overflow-y-auto custom-scrollbar">
              {leaderboard.length > 0 ? leaderboard.map((entry, idx) => (
                <div key={`${entry.name}-${idx}`} className={`flex items-center justify-between p-3 md:p-4 rounded-2xl transition-all ${entry.name === gameState.playerName ? 'bg-blue-600/30 border border-blue-500 shadow-lg' : 'bg-slate-950/50 border border-slate-800 hover:bg-slate-900'}`}>
                  <div className="flex items-center gap-2 md:gap-3">
                    <span className="text-[9px] md:text-[10px] font-black text-slate-600">#{idx+1}</span>
                    <span className="text-xs md:text-sm font-bold truncate max-w-[80px] md:max-w-[100px] text-slate-200">{entry.name}</span>
                  </div>
                  <span className="text-xs md:text-sm font-mono font-black text-emerald-400">{Math.floor(entry.score)}</span>
                </div>
              )) : (
                <div className="text-center py-10">
                  <p className="text-slate-600 text-[10px] font-bold uppercase italic">Carregando Ranking...</p>
                </div>
              )}
            </div>
            <div className="absolute bottom-2 right-4 text-[8px] text-slate-600 font-bold uppercase italic">Atualizado em tempo real</div>
          </div>

          <div className="bg-slate-900/50 border border-slate-800/50 p-6 md:p-8 rounded-[2.5rem]">
            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 md:mb-6 border-b border-slate-800 pb-2">Classes Gramaticais</h3>
            <div className="grid grid-cols-2 md:grid-cols-1 gap-3 md:gap-4">
              {ALL_CATEGORIES.map(cat => (
                <div key={cat} className="flex items-center gap-2 md:gap-3 group">
                  <div className={`w-3 h-3 md:w-4 md:h-4 rounded shadow-sm group-hover:scale-110 transition-transform ${CATEGORY_COLORS[cat].split(' ')[0]}`} />
                  <span className="text-[9px] md:text-[10px] font-black text-slate-300 uppercase tracking-wider truncate">
                    {cat === 'subject' ? 'Sujeito' : cat === 'verb' ? 'Verbo' : cat === 'object' ? 'Objeto' : cat === 'adjective' ? 'Adjetivo' : cat === 'adverb' ? 'Advérbio' : cat === 'conjunction' ? 'Conjunção' : 'Preposição'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #1e293b; border-radius: 20px; }
        @keyframes block-entry {
          from { opacity: 0; transform: scale(0.9) translateY(-10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        .block-animate { animation: block-entry 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
      `}</style>
    </div>
  );
};

const BlockUI: React.FC<{ block: WordBlock; isGhost: boolean }> = ({ block, isGhost }) => {
  return (
    <div className={`absolute inset-0.5 md:inset-1.5 lg:inset-2.5 rounded-lg md:rounded-2xl lg:rounded-[1.5rem] border-b-[3px] md:border-b-[5px] lg:border-b-[8px] border-black/30 flex items-center justify-center p-1 md:p-2 lg:p-4 shadow-md md:shadow-xl lg:shadow-2xl ${block.color} ${isGhost ? 'opacity-30 grayscale-[0.5]' : ''} transition-all duration-300 block-animate`}>
      <span className="text-[7px] sm:text-[9px] md:text-xs lg:text-base font-black leading-tight text-center text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] md:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] uppercase italic break-words selection:bg-transparent tracking-tighter sm:tracking-tight">
        {block.text}
      </span>
      {/* Glossy overlay */}
      <div className="absolute top-0.5 md:top-1 left-1 md:left-2 right-1 md:right-2 h-1/3 bg-white/10 rounded-t-full pointer-events-none"></div>
    </div>
  );
};

export default App;
