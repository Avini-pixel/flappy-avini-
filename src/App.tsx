/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Volume2, VolumeX, Play, RotateCcw, Pause, Download, Copy, Check, Sliders, Trophy, Code2, Gamepad2 } from 'lucide-react';
import { soundEngine } from './sound';
import { STANDALONE_FLAPPY_HTML } from './standaloneHtml';

type GameState = 'TITLE_MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER';
type DifficultyMode = 'relaxed' | 'classic' | 'turbo';
type ThemeMode = 'daylight' | 'sunset' | 'midnight';
type ActiveTab = 'stage' | 'physics' | 'history' | 'html';

interface PhysicsConfig {
  gravity: number;
  flapStrength: number;
  pipeGap: number;
  pipeSpeed: number;
  spawnInterval: number;
}

interface RunRecord {
  id: number;
  score: number;
  difficulty: DifficultyMode;
  medal: string;
  timestamp: string;
}

interface PipeObstacle {
  x: number;
  topHeight: number;
  bottomY: number;
  passed: boolean;
}

interface FeatherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alpha: number;
  size: number;
  color: string;
}

interface ScorePopup {
  x: number;
  y: number;
  vy: number;
  alpha: number;
  text: string;
}

const DIFFICULTY_PRESETS: Record<DifficultyMode, PhysicsConfig> = {
  relaxed: {
    gravity: 0.35,
    flapStrength: -7.2,
    pipeGap: 168,
    pipeSpeed: 2.35,
    spawnInterval: 112,
  },
  classic: {
    gravity: 0.42,
    flapStrength: -7.8,
    pipeGap: 146,
    pipeSpeed: 2.8,
    spawnInterval: 96,
  },
  turbo: {
    gravity: 0.48,
    flapStrength: -8.3,
    pipeGap: 130,
    pipeSpeed: 3.45,
    spawnInterval: 80,
  },
};

const THEME_PALETTES: Record<
  ThemeMode,
  {
    skyTop: string;
    skyBottom: string;
    cloudColor: string;
    cityColor: string;
    groundFill: string;
    groundStripe: string;
    grassTop: string;
    birdBody: string;
    birdWing: string;
  }
> = {
  daylight: {
    skyTop: '#38BDF8',
    skyBottom: '#BAE6FD',
    cloudColor: 'rgba(255, 255, 255, 0.86)',
    cityColor: 'rgba(14, 116, 144, 0.22)',
    groundFill: '#D97706',
    groundStripe: '#B45309',
    grassTop: '#22C55E',
    birdBody: '#F59E0B',
    birdWing: '#FEF3C7',
  },
  sunset: {
    skyTop: '#7C2D12',
    skyBottom: '#FDBA74',
    cloudColor: 'rgba(254, 215, 170, 0.65)',
    cityColor: 'rgba(67, 20, 7, 0.32)',
    groundFill: '#9A3412',
    groundStripe: '#7C2D12',
    grassTop: '#16A34A',
    birdBody: '#FBBF24',
    birdWing: '#FFFBEB',
  },
  midnight: {
    skyTop: '#0F172A',
    skyBottom: '#1E293B',
    cloudColor: 'rgba(148, 163, 184, 0.25)',
    cityColor: 'rgba(15, 23, 42, 0.65)',
    groundFill: '#334155',
    groundStripe: '#1E293B',
    grassTop: '#10B981',
    birdBody: '#F59E0B',
    birdWing: '#FDE68A',
  },
};

function getMedalForScore(score: number): { label: string; color: string } {
  if (score >= 40) return { label: 'Platinum', color: '#E2E8F0' };
  if (score >= 25) return { label: 'Gold', color: '#F59E0B' };
  if (score >= 10) return { label: 'Silver', color: '#94A3B8' };
  if (score >= 5) return { label: 'Bronze', color: '#D97706' };
  return { label: 'Unranked', color: '#64748B' };
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<GameState>('TITLE_MENU');
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      return Number(localStorage.getItem('flappy_canvas_high_score') || 0);
    } catch {
      return 0;
    }
  });
  const [difficulty, setDifficulty] = useState<DifficultyMode>('classic');
  const [theme, setTheme] = useState<ThemeMode>('daylight');
  const [physics, setPhysics] = useState<PhysicsConfig>(DIFFICULTY_PRESETS.classic);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<ActiveTab>('stage');
  const [copiedHtml, setCopiedHtml] = useState<boolean>(false);
  const [runHistory, setRunHistory] = useState<RunRecord[]>(() => {
    try {
      const saved = localStorage.getItem('flappy_canvas_runs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Mutable game engine state inside ref for 60fps requestAnimationFrame loop
  const engineRef = useRef<{
    state: GameState;
    score: number;
    highScore: number;
    frameCount: number;
    groundScroll: number;
    bird: {
      x: number;
      y: number;
      radius: number;
      velocity: number;
      rotation: number;
    };
    pipes: PipeObstacle[];
    particles: FeatherParticle[];
    popups: ScorePopup[];
    clouds: { x: number; y: number; scale: number; speed: number }[];
    stars: { x: number; y: number; size: number; alpha: number }[];
    flashAlpha: number;
  }>({
    state: 'TITLE_MENU',
    score: 0,
    highScore: highScore,
    frameCount: 0,
    groundScroll: 0,
    bird: {
      x: 130,
      y: 260,
      radius: 17,
      velocity: 0,
      rotation: 0,
    },
    pipes: [],
    particles: [],
    popups: [],
    clouds: [
      { x: 70, y: 88, scale: 1.0, speed: 0.35 },
      { x: 250, y: 140, scale: 0.82, speed: 0.25 },
      { x: 410, y: 74, scale: 1.12, speed: 0.42 },
    ],
    stars: Array.from({ length: 28 }, (_, i) => ({
      x: (i * 73) % 520,
      y: (i * 41) % 340,
      size: (i % 2) + 1.2,
      alpha: 0.35 + (i % 5) * 0.12,
    })),
    flashAlpha: 0,
  });

  const physicsRef = useRef<PhysicsConfig>(physics);
  useEffect(() => {
    physicsRef.current = physics;
  }, [physics]);

  const themeRef = useRef<ThemeMode>(theme);
  useEffect(() => {
    themeRef.current = theme;
  }, [theme]);

  const difficultyRef = useRef<DifficultyMode>(difficulty);
  useEffect(() => {
    difficultyRef.current = difficulty;
  }, [difficulty]);

  const CANVAS_WIDTH = 520;
  const CANVAS_HEIGHT = 640;
  const GROUND_HEIGHT = 84;
  const PLAY_HEIGHT = CANVAS_HEIGHT - GROUND_HEIGHT;
  const PIPE_WIDTH = 68;

  const spawnFeathers = useCallback((x: number, y: number, count = 5) => {
    const palette = THEME_PALETTES[themeRef.current];
    for (let i = 0; i < count; i++) {
      engineRef.current.particles.push({
        x: x - 6,
        y: y + 2,
        vx: -1.5 - Math.random() * 2.2,
        vy: (Math.random() - 0.5) * 3.2,
        alpha: 1,
        size: 3 + Math.random() * 3,
        color: i % 2 === 0 ? palette.birdBody : palette.birdWing,
      });
    }
  }, []);

  const recordCompletedRun = useCallback((finalScore: number) => {
    const medal = getMedalForScore(finalScore).label;
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    setRunHistory((prev) => {
      const updated: RunRecord[] = [
        {
          id: Date.now(),
          score: finalScore,
          difficulty: difficultyRef.current,
          medal,
          timestamp: timeStr,
        },
        ...prev.slice(0, 14),
      ];
      try {
        localStorage.setItem('flappy_canvas_runs', JSON.stringify(updated));
      } catch {
        // Ignore storage quota errors
      }
      return updated;
    });
  }, []);

  const triggerGameOver = useCallback(() => {
    const eng = engineRef.current;
    if (eng.state === 'GAME_OVER') return;
    eng.state = 'GAME_OVER';
    eng.flashAlpha = 0.65;
    setGameState('GAME_OVER');
    soundEngine.playCrash();
    spawnFeathers(eng.bird.x, eng.bird.y, 14);

    if (eng.score > eng.highScore) {
      eng.highScore = eng.score;
      setHighScore(eng.score);
      try {
        localStorage.setItem('flappy_canvas_high_score', String(eng.score));
      } catch {
        // Ignore localStorage error
      }
    }
    recordCompletedRun(eng.score);
  }, [recordCompletedRun, spawnFeathers]);

  const startOrRestartGame = useCallback(() => {
    const eng = engineRef.current;
    eng.score = 0;
    eng.frameCount = 0;
    eng.bird.x = 130;
    eng.bird.y = PLAY_HEIGHT / 2 - 24;
    eng.bird.velocity = physicsRef.current.flapStrength;
    eng.bird.rotation = -0.35;
    eng.pipes = [];
    eng.particles = [];
    eng.popups = [];
    eng.flashAlpha = 0;
    eng.state = 'PLAYING';

    setScore(0);
    setGameState('PLAYING');
    soundEngine.playFlap();
    spawnFeathers(eng.bird.x, eng.bird.y, 5);
  }, [PLAY_HEIGHT, spawnFeathers]);

  const flapBird = useCallback(() => {
    const eng = engineRef.current;
    if (eng.state === 'TITLE_MENU') {
      startOrRestartGame();
      return;
    }
    if (eng.state === 'PLAYING') {
      eng.bird.velocity = physicsRef.current.flapStrength;
      eng.bird.rotation = -0.38;
      soundEngine.playFlap();
      spawnFeathers(eng.bird.x, eng.bird.y, 4);
    }
  }, [startOrRestartGame, spawnFeathers]);

  const togglePause = useCallback(() => {
    const eng = engineRef.current;
    if (eng.state === 'PLAYING') {
      eng.state = 'PAUSED';
      setGameState('PAUSED');
    } else if (eng.state === 'PAUSED') {
      eng.state = 'PLAYING';
      setGameState('PLAYING');
    }
  }, []);

  const handleDifficultyChange = (mode: DifficultyMode) => {
    setDifficulty(mode);
    setPhysics(DIFFICULTY_PRESETS[mode]);
  };

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    soundEngine.enabled = next;
  };

  const handleCopyStandaloneHtml = async () => {
    try {
      await navigator.clipboard.writeText(STANDALONE_FLAPPY_HTML);
      setCopiedHtml(true);
      setTimeout(() => setCopiedHtml(false), 2200);
    } catch {
      // Fallback copy
    }
  };

  const handleDownloadStandaloneHtml = () => {
    const blob = new Blob([STANDALONE_FLAPPY_HTML], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'index.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Global keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid intercepting keys if user is interacting with an input element
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        if (engineRef.current.state === 'GAME_OVER') {
          startOrRestartGame();
        } else if (engineRef.current.state === 'PAUSED') {
          togglePause();
        } else {
          flapBird();
        }
      } else if (e.code === 'Enter') {
        if (engineRef.current.state === 'TITLE_MENU' || engineRef.current.state === 'GAME_OVER') {
          e.preventDefault();
          startOrRestartGame();
        }
      } else if (e.code === 'KeyP' || e.code === 'Escape') {
        if (engineRef.current.state === 'PLAYING' || engineRef.current.state === 'PAUSED') {
          e.preventDefault();
          togglePause();
        }
      } else if (e.code === 'KeyR') {
        if (engineRef.current.state === 'PLAYING' || engineRef.current.state === 'GAME_OVER') {
          e.preventDefault();
          startOrRestartGame();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [flapBird, startOrRestartGame, togglePause]);

  // Main 60FPS HTML5 Canvas Game Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const spawnPipe = () => {
      const cfg = physicsRef.current;
      const minTop = 56;
      const maxTop = PLAY_HEIGHT - cfg.pipeGap - 76;
      const topHeight = Math.floor(Math.random() * Math.max(20, maxTop - minTop + 1)) + minTop;
      engineRef.current.pipes.push({
        x: CANVAS_WIDTH + 12,
        topHeight,
        bottomY: topHeight + cfg.pipeGap,
        passed: false,
      });
    };

    const updatePhysics = () => {
      const eng = engineRef.current;
      const cfg = physicsRef.current;

      eng.frameCount++;

      // Update clouds
      for (const c of eng.clouds) {
        if (eng.state !== 'PAUSED') {
          c.x -= c.speed;
          if (c.x < -110) c.x = CANVAS_WIDTH + 80;
        }
      }

      // Decay screen flash
      if (eng.flashAlpha > 0) {
        eng.flashAlpha = Math.max(0, eng.flashAlpha - 0.04);
      }

      // Update feather particles
      for (let i = eng.particles.length - 1; i >= 0; i--) {
        const pt = eng.particles[i];
        pt.x += pt.vx;
        pt.y += pt.vy;
        pt.vy += 0.12;
        pt.alpha -= 0.028;
        if (pt.alpha <= 0) {
          eng.particles.splice(i, 1);
        }
      }

      // Update floating score popups
      for (let i = eng.popups.length - 1; i >= 0; i--) {
        const pop = eng.popups[i];
        pop.y += pop.vy;
        pop.alpha -= 0.026;
        if (pop.alpha <= 0) {
          eng.popups.splice(i, 1);
        }
      }

      if (eng.state === 'PAUSED') {
        return;
      }

      if (eng.state !== 'GAME_OVER') {
        eng.groundScroll = (eng.groundScroll + cfg.pipeSpeed) % 28;
      }

      if (eng.state === 'TITLE_MENU') {
        eng.bird.y = PLAY_HEIGHT / 2 - 24 + Math.sin(eng.frameCount * 0.075) * 9;
        eng.bird.rotation = Math.sin(eng.frameCount * 0.075) * 0.08;
        return;
      }

      if (eng.state === 'PLAYING') {
        eng.bird.velocity += cfg.gravity;
        eng.bird.y += eng.bird.velocity;

        if (eng.bird.velocity < 0) {
          eng.bird.rotation = -0.38;
        } else {
          eng.bird.rotation = Math.min(Math.PI / 2.1, eng.bird.rotation + 0.045);
        }

        // Ceiling guard
        if (eng.bird.y - eng.bird.radius < 0) {
          eng.bird.y = eng.bird.radius;
          eng.bird.velocity = 0;
        }

        // Ground collision
        if (eng.bird.y + eng.bird.radius >= PLAY_HEIGHT) {
          eng.bird.y = PLAY_HEIGHT - eng.bird.radius;
          triggerGameOver();
          return;
        }

        // Pipe spawning
        if (eng.frameCount % cfg.spawnInterval === 0) {
          spawnPipe();
        }

        // Update pipes & check collisions
        for (let i = eng.pipes.length - 1; i >= 0; i--) {
          const p = eng.pipes[i];
          p.x -= cfg.pipeSpeed;

          const hitboxPadding = 3.5;
          const withinX =
            eng.bird.x + eng.bird.radius - hitboxPadding > p.x &&
            eng.bird.x - eng.bird.radius + hitboxPadding < p.x + PIPE_WIDTH;

          if (withinX) {
            const hitTop = eng.bird.y - eng.bird.radius + hitboxPadding < p.topHeight;
            const hitBottom = eng.bird.y + eng.bird.radius - hitboxPadding > p.bottomY;
            if (hitTop || hitBottom) {
              triggerGameOver();
              return;
            }
          }

          // Score increment when clearing pipe
          if (!p.passed && p.x + PIPE_WIDTH < eng.bird.x) {
            p.passed = true;
            eng.score += 1;
            setScore(eng.score);
            soundEngine.playScore();
            eng.popups.push({
              x: eng.bird.x + 10,
              y: eng.bird.y - 24,
              vy: -1.2,
              alpha: 1,
              text: '+1',
            });

            if (eng.score > eng.highScore) {
              eng.highScore = eng.score;
              setHighScore(eng.score);
              try {
                localStorage.setItem('flappy_canvas_high_score', String(eng.score));
              } catch {
                // Ignore
              }
            }
          }

          if (p.x + PIPE_WIDTH < -30) {
            eng.pipes.splice(i, 1);
          }
        }
      }
    };

    const drawScene = () => {
      const eng = engineRef.current;
      const palette = THEME_PALETTES[themeRef.current];

      // 1. Sky Backdrop
      const skyGrad = ctx.createLinearGradient(0, 0, 0, PLAY_HEIGHT);
      skyGrad.addColorStop(0, palette.skyTop);
      skyGrad.addColorStop(1, palette.skyBottom);
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, PLAY_HEIGHT);

      // Night stars if midnight theme
      if (themeRef.current === 'midnight') {
        for (const st of eng.stars) {
          ctx.fillStyle = `rgba(248, 250, 252, ${st.alpha})`;
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // 2. Parallax Clouds
      for (const c of eng.clouds) {
        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.scale(c.scale, c.scale);
        ctx.fillStyle = palette.cloudColor;
        ctx.beginPath();
        ctx.arc(0, 0, 21, 0, Math.PI * 2);
        ctx.arc(19, -7, 26, 0, Math.PI * 2);
        ctx.arc(42, 0, 20, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 3. Distant Architectural Skyline Silhouette
      ctx.fillStyle = palette.cityColor;
      for (let x = 0; x < CANVAS_WIDTH; x += 44) {
        const bHeight = 42 + ((x * 23) % 58);
        ctx.fillRect(x, PLAY_HEIGHT - bHeight, 38, bHeight);
      }

      // 4. Pipes
      const capHeight = 26;
      for (const p of eng.pipes) {
        const pipeGrad = ctx.createLinearGradient(p.x, 0, p.x + PIPE_WIDTH, 0);
        pipeGrad.addColorStop(0, '#15803D');
        pipeGrad.addColorStop(0.28, '#4ADE80');
        pipeGrad.addColorStop(0.72, '#16A34A');
        pipeGrad.addColorStop(1, '#14532D');

        ctx.fillStyle = pipeGrad;
        ctx.strokeStyle = '#052E16';
        ctx.lineWidth = 2.5;

        // Top pipe column
        ctx.fillRect(p.x, 0, PIPE_WIDTH, p.topHeight - capHeight);
        ctx.strokeRect(p.x, -2, PIPE_WIDTH, p.topHeight - capHeight + 2);

        // Top pipe rim cap
        ctx.fillRect(p.x - 4, p.topHeight - capHeight, PIPE_WIDTH + 8, capHeight);
        ctx.strokeRect(p.x - 4, p.topHeight - capHeight, PIPE_WIDTH + 8, capHeight);

        // Bottom pipe rim cap
        const bottomHeight = PLAY_HEIGHT - p.bottomY;
        ctx.fillRect(p.x - 4, p.bottomY, PIPE_WIDTH + 8, capHeight);
        ctx.strokeRect(p.x - 4, p.bottomY, PIPE_WIDTH + 8, capHeight);

        // Bottom pipe column
        ctx.fillRect(p.x, p.bottomY + capHeight, PIPE_WIDTH, bottomHeight - capHeight);
        ctx.strokeRect(p.x, p.bottomY + capHeight, PIPE_WIDTH, bottomHeight - capHeight + 2);
      }

      // 5. Scrolling Ground & Turf
      ctx.fillStyle = palette.groundFill;
      ctx.fillRect(0, PLAY_HEIGHT, CANVAS_WIDTH, GROUND_HEIGHT);

      ctx.fillStyle = palette.grassTop;
      ctx.fillRect(0, PLAY_HEIGHT, CANVAS_WIDTH, 16);

      ctx.strokeStyle = '#052E16';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, PLAY_HEIGHT);
      ctx.lineTo(CANVAS_WIDTH, PLAY_HEIGHT);
      ctx.stroke();

      ctx.fillStyle = palette.groundStripe;
      for (let x = -eng.groundScroll; x < CANVAS_WIDTH + 28; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, PLAY_HEIGHT + 16);
        ctx.lineTo(x + 14, PLAY_HEIGHT + 16);
        ctx.lineTo(x + 4, CANVAS_HEIGHT);
        ctx.lineTo(x - 10, CANVAS_HEIGHT);
        ctx.closePath();
        ctx.fill();
      }

      // 6. Feather Particles
      for (const pt of eng.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.alpha);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      // 7. Flappy Bird Sprite
      ctx.save();
      ctx.translate(eng.bird.x, eng.bird.y);
      ctx.rotate(eng.bird.rotation);

      // Tail feathers
      ctx.fillStyle = '#D97706';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-eng.bird.radius - 1, -4);
      ctx.lineTo(-eng.bird.radius - 10, -8);
      ctx.lineTo(-eng.bird.radius - 7, 0);
      ctx.lineTo(-eng.bird.radius - 10, 7);
      ctx.lineTo(-eng.bird.radius - 1, 4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // Bird body
      ctx.fillStyle = palette.birdBody;
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, eng.bird.radius + 3, eng.bird.radius, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Animated Wing
      const wingCycle =
        eng.state === 'PLAYING'
          ? Math.sin(eng.frameCount * 0.48) * 4.5
          : Math.sin(eng.frameCount * 0.16) * 2;
      ctx.fillStyle = palette.birdWing;
      ctx.beginPath();
      ctx.ellipse(-5, wingCycle, 9.5, 6.2, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Eye
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(7, -5, 6.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(9, -5, 2.7, 0, Math.PI * 2);
      ctx.fill();

      // Eye glint
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(10, -6.2, 1, 0, Math.PI * 2);
      ctx.fill();

      // Beak
      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.moveTo(13, -1);
      ctx.lineTo(25, 3);
      ctx.lineTo(13, 8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.restore();

      // 8. Floating +1 Score Popups
      for (const pop of eng.popups) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, pop.alpha);
        ctx.font = '700 18px "JetBrains Mono", monospace';
        ctx.fillStyle = '#FEF08A';
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 3;
        ctx.strokeText(pop.text, pop.x, pop.y);
        ctx.fillText(pop.text, pop.x, pop.y);
        ctx.restore();
      }

      // 9. In-Canvas Live Score Counter
      if (eng.state === 'PLAYING' || eng.state === 'PAUSED') {
        ctx.save();
        ctx.font = '800 48px "Syne", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 6;
        ctx.strokeText(String(eng.score), CANVAS_WIDTH / 2, 74);
        ctx.fillText(String(eng.score), CANVAS_WIDTH / 2, 74);
        ctx.restore();
      }

      // 10. Impact Flash Overlay
      if (eng.flashAlpha > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${eng.flashAlpha})`;
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        ctx.restore();
      }
    };

    const tick = () => {
      updatePhysics();
      drawScene();
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrameId);
  }, [PLAY_HEIGHT, triggerGameOver]);

  const currentMedal = getMedalForScore(score);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B1120] text-[#F8FAFC]">
      {/* Top Bar Contract: Zone 1 (Brand) — Zone 2 (4 Nav Links) — Zone 3 (2 Primary Actions) */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800/80 bg-[#0F172A]">
        <a
          href="#top"
          onClick={(e) => {
            e.preventDefault();
            setActiveTab('stage');
          }}
          className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0"
        >
          Flappy Canvas
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-300">
          <button
            type="button"
            onClick={() => setActiveTab('stage')}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'stage' ? 'text-amber-400 underline' : ''
            }`}
          >
            Arcade Stage
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('physics')}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'physics' ? 'text-amber-400 underline' : ''
            }`}
          >
            Flight Physics
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'history' ? 'text-amber-400 underline' : ''
            }`}
          >
            Run History
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('html')}
            className={`hover:text-white hover:underline underline-offset-8 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === 'html' ? 'text-amber-400 underline' : ''
            }`}
          >
            Standalone HTML
          </button>
        </nav>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundEnabled ? 'Mute sound effects' : 'Enable sound effects'}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-200 bg-slate-800/90 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
            <span>{soundEnabled ? 'Audio On' : 'Audio Muted'}</span>
          </button>

          <button
            type="button"
            onClick={startOrRestartGame}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {gameState === 'PLAYING' || gameState === 'GAME_OVER' ? (
              <>
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Restart Game</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Start Game</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Main 1440px Desktop Workspace */}
      <main className="flex-1 w-full max-w-[1360px] mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: HTML5 Canvas Game Cabinet (7 Cols) */}
          <section className="lg:col-span-7 flex flex-col items-center">
            <div className="w-full max-w-[520px] bg-[#1E293B] border border-slate-800 rounded-2xl overflow-hidden shadow-2xl">
              {/* Unobtrusive Top HUD Bar (Zero-Pill Metadata with · separators) */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-[#0F172A] border-b border-slate-800/80 text-xs text-slate-300 font-mono tabular-nums">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">Score</span>
                  <span className="text-base font-semibold text-amber-400">{score}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span className="text-slate-400">High Score</span>
                  <span className="text-base font-semibold text-emerald-400">{highScore}</span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="capitalize text-slate-300">{difficulty}</span>
                  <span aria-hidden="true" className="text-slate-600">·</span>
                  <span>
                    {gameState === 'PLAYING'
                      ? 'In Flight'
                      : gameState === 'PAUSED'
                      ? 'Paused'
                      : gameState === 'GAME_OVER'
                      ? 'Impact'
                      : 'Ready'}
                  </span>
                  {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
                    <button
                      type="button"
                      onClick={togglePause}
                      className="ml-2 px-2.5 py-1 text-xs font-sans font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      {gameState === 'PAUSED' ? 'Resume' : 'Pause'}
                    </button>
                  )}
                </div>
              </div>

              {/* Interactive HTML5 Canvas Stage */}
              <div className="relative w-full aspect-[520/640] select-none bg-slate-950">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_WIDTH}
                  height={CANVAS_HEIGHT}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    flapBird();
                  }}
                  className="block w-full h-full cursor-pointer touch-none"
                />

                {/* START SCREEN OVERLAY */}
                {gameState === 'TITLE_MENU' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/55 backdrop-blur-[2px]">
                    <div className="w-full max-w-[360px] bg-[#0F172A]/95 border border-slate-700/80 rounded-xl p-7 text-center shadow-2xl">
                      <p className="text-xs font-mono text-amber-400 mb-2">
                        HTML5 Canvas Arcade · 60 FPS
                      </p>
                      <h1
                        className="font-display text-3xl font-extrabold text-white tracking-tight mb-2"
                        style={{ textWrap: 'balance' }}
                      >
                        Flappy Bird
                      </h1>
                      <p className="text-sm text-slate-300 leading-relaxed mb-6">
                        Guide the bird through the emerald pipe gaps. Each cleared obstacle awards one point.
                      </p>

                      <button
                        type="button"
                        onClick={startOrRestartGame}
                        className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 text-sm font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-transform active:scale-[0.99] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Start Game</span>
                      </button>

                      <div className="mt-5 pt-4 border-t border-slate-800 text-xs text-slate-400 flex items-center justify-center gap-2">
                        <span>Space / Up Arrow / W</span>
                        <span aria-hidden="true">·</span>
                        <span>Click or Tap Canvas</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* PAUSED OVERLAY */}
                {gameState === 'PAUSED' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/65 backdrop-blur-[2px]">
                    <div className="w-full max-w-[340px] bg-[#0F172A]/95 border border-slate-700/80 rounded-xl p-7 text-center shadow-2xl">
                      <h2 className="font-display text-2xl font-bold text-white mb-2">
                        Flight Paused
                      </h2>
                      <p className="text-sm text-slate-300 mb-6 font-mono tabular-nums">
                        Current Score: {score} · Best: {highScore}
                      </p>
                      <div className="flex flex-col gap-2.5">
                        <button
                          type="button"
                          onClick={togglePause}
                          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 text-sm font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Resume Flight</span>
                        </button>
                        <button
                          type="button"
                          onClick={startOrRestartGame}
                          className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-5 text-sm font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-4 h-4" />
                          <span>Restart Game</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* GAME OVER SCREEN OVERLAY */}
                {gameState === 'GAME_OVER' && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center p-6 bg-slate-950/65 backdrop-blur-[2px]">
                    <div className="w-full max-w-[360px] bg-[#0F172A]/95 border border-slate-700/80 rounded-xl p-7 text-center shadow-2xl">
                      <p className="text-xs font-mono text-rose-400 mb-1">
                        Collision Detected · Flight Terminated
                      </p>
                      <h2
                        className="font-display text-3xl font-extrabold text-white tracking-tight mb-4"
                        style={{ textWrap: 'balance' }}
                      >
                        Game Over
                      </h2>

                      <div className="py-4 px-4 my-4 border-y border-slate-800 grid grid-cols-3 gap-2 font-mono tabular-nums text-left">
                        <div>
                          <div className="text-xs text-slate-400">Score</div>
                          <div className="text-xl font-semibold text-white mt-0.5">{score}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">High Score</div>
                          <div className="text-xl font-semibold text-amber-400 mt-0.5">{highScore}</div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400">Honour</div>
                          <div
                            className="text-sm font-semibold mt-1.5"
                            style={{ color: currentMedal.color }}
                          >
                            {currentMedal.label}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={startOrRestartGame}
                        className="w-full inline-flex items-center justify-center gap-2 py-3 px-5 text-sm font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-transform active:scale-[0.99] whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Play Again</span>
                      </button>

                      <div className="mt-4 text-xs text-slate-400">
                        Press Space or Enter to restart immediately
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Right Column: Contextual Studio Controls & Standalone HTML Export (5 Cols) */}
          <section className="lg:col-span-5 flex flex-col gap-6">
            {/* Mobile / Compact Segmented View Switcher */}
            <div className="flex items-center gap-1 p-1 bg-[#1E293B] rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('stage')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'stage'
                    ? 'bg-[#0F172A] text-amber-400 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Gamepad2 className="w-3.5 h-3.5" />
                <span>Controls</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('physics')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'physics'
                    ? 'bg-[#0F172A] text-amber-400 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Physics</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-[#0F172A] text-amber-400 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Trophy className="w-3.5 h-3.5" />
                <span>Runs ({runHistory.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('html')}
                className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'html'
                    ? 'bg-[#0F172A] text-amber-400 shadow-sm'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Code2 className="w-3.5 h-3.5" />
                <span>HTML File</span>
              </button>
            </div>

            {/* TAB 1: ARCADE STAGE & ENVIRONMENT CONTROLS */}
            {activeTab === 'stage' && (
              <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 flex flex-col gap-6">
                <div>
                  <h2 className="font-display text-xl font-bold text-white mb-1">
                    01. Flight Deck Configuration
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Select pipe speed presets and sky lighting or trigger a manual flap directly from the deck.
                  </p>
                </div>

                {/* Quick Action Deck */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={flapBird}
                    className="flex-1 py-2.5 px-4 text-sm font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {gameState === 'PLAYING' ? 'Flap Wings (Space)' : 'Launch Flight (Space)'}
                  </button>
                  <button
                    type="button"
                    onClick={
                      gameState === 'PLAYING' || gameState === 'PAUSED'
                        ? togglePause
                        : startOrRestartGame
                    }
                    className="py-2.5 px-4 text-sm font-medium text-slate-200 bg-[#0F172A] hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {gameState === 'PAUSED' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Play className="w-3.5 h-3.5" /> Resume
                      </span>
                    ) : gameState === 'PLAYING' ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Pause className="w-3.5 h-3.5" /> Pause
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5">
                        <RotateCcw className="w-3.5 h-3.5" /> Reset
                      </span>
                    )}
                  </button>
                </div>

                {/* Difficulty Selector */}
                <div className="pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-sm font-semibold text-white">Difficulty Preset</span>
                    <span className="text-xs font-mono text-slate-400 tabular-nums">
                      Gap {physics.pipeGap}px · Speed {physics.pipeSpeed.toFixed(1)}x
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 bg-[#0F172A] rounded-lg">
                    {(['relaxed', 'classic', 'turbo'] as DifficultyMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => handleDifficultyChange(mode)}
                        className={`flex-1 py-2 px-3 text-xs font-medium capitalize rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          difficulty === mode
                            ? 'bg-[#1E293B] text-amber-400 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {mode}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Atmosphere Selector */}
                <div className="pt-4 border-t border-slate-800">
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="text-sm font-semibold text-white">Canvas Atmosphere</span>
                    <span className="text-xs text-slate-400 capitalize">{theme} Horizon</span>
                  </div>
                  <div className="flex items-center gap-1.5 p-1 bg-[#0F172A] rounded-lg">
                    {(['daylight', 'sunset', 'midnight'] as ThemeMode[]).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setTheme(t)}
                        className={`flex-1 py-2 px-3 text-xs font-medium capitalize rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          theme === t
                            ? 'bg-[#1E293B] text-amber-400 shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Keyboard & Mouse Reference */}
                <div className="pt-4 border-t border-slate-800">
                  <h3 className="text-sm font-semibold text-white mb-3">
                    02. Input Bindings & Honours
                  </h3>
                  <div className="space-y-2 text-xs text-slate-300 font-mono tabular-nums">
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Flap / Ascend</span>
                      <span>Space · ArrowUp · KeyW · Click</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Pause / Resume</span>
                      <span>KeyP · Escape</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-800/60">
                      <span className="text-slate-400">Quick Restart</span>
                      <span>KeyR · Enter</span>
                    </div>
                    <div className="flex justify-between py-1">
                      <span className="text-slate-400">Honour Tiers</span>
                      <span>Bronze 5 · Silver 10 · Gold 25 · Plat 40</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: FLIGHT PHYSICS TUNING */}
            {activeTab === 'physics' && (
              <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 flex flex-col gap-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h2 className="font-display text-xl font-bold text-white mb-1">
                      01. Real-Time Physics Parameters
                    </h2>
                    <p className="text-sm text-slate-300">
                      Adjust canvas kinematics dynamically during or between flights.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPhysics(DIFFICULTY_PRESETS[difficulty])}
                    className="px-3 py-1.5 text-xs font-medium text-slate-200 bg-[#0F172A] hover:bg-slate-800 rounded-lg border border-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Reset Defaults
                  </button>
                </div>

                <div className="space-y-4 pt-2 border-t border-slate-800 font-mono text-xs tabular-nums">
                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label htmlFor="gravity-slider" className="text-slate-300 font-sans">
                        Gravity Acceleration
                      </label>
                      <span className="text-amber-400">{physics.gravity.toFixed(2)} px/frame²</span>
                    </div>
                    <input
                      id="gravity-slider"
                      type="range"
                      min="0.22"
                      max="0.65"
                      step="0.01"
                      value={physics.gravity}
                      onChange={(e) =>
                        setPhysics((p) => ({ ...p, gravity: parseFloat(e.target.value) }))
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label htmlFor="flap-slider" className="text-slate-300 font-sans">
                        Flap Impulse Velocity
                      </label>
                      <span className="text-amber-400">{Math.abs(physics.flapStrength).toFixed(1)} px/frame</span>
                    </div>
                    <input
                      id="flap-slider"
                      type="range"
                      min="5.5"
                      max="10.0"
                      step="0.1"
                      value={Math.abs(physics.flapStrength)}
                      onChange={(e) =>
                        setPhysics((p) => ({ ...p, flapStrength: -parseFloat(e.target.value) }))
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label htmlFor="gap-slider" className="text-slate-300 font-sans">
                        Pipe Vertical Aperture
                      </label>
                      <span className="text-amber-400">{physics.pipeGap} px</span>
                    </div>
                    <input
                      id="gap-slider"
                      type="range"
                      min="115"
                      max="195"
                      step="1"
                      value={physics.pipeGap}
                      onChange={(e) =>
                        setPhysics((p) => ({ ...p, pipeGap: parseInt(e.target.value, 10) }))
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between mb-1.5">
                      <label htmlFor="speed-slider" className="text-slate-300 font-sans">
                        Horizontal Scroll Speed
                      </label>
                      <span className="text-amber-400">{physics.pipeSpeed.toFixed(2)} px/frame</span>
                    </div>
                    <input
                      id="speed-slider"
                      type="range"
                      min="1.8"
                      max="4.5"
                      step="0.05"
                      value={physics.pipeSpeed}
                      onChange={(e) =>
                        setPhysics((p) => ({ ...p, pipeSpeed: parseFloat(e.target.value) }))
                      }
                      className="w-full accent-amber-500 cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: RUN HISTORY TABLE */}
            {activeTab === 'history' && (
              <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="font-display text-xl font-bold text-white mb-1">
                      01. Flight Telemetry Log
                    </h2>
                    <p className="text-xs text-slate-400">
                      Recorded scores across your recent sessions
                    </p>
                  </div>
                  {runHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setRunHistory([]);
                        try {
                          localStorage.removeItem('flappy_canvas_runs');
                        } catch {
                          // Ignore
                        }
                      }}
                      className="px-3 py-1.5 text-xs font-medium text-slate-300 bg-[#0F172A] hover:bg-slate-800 rounded-lg border border-slate-700 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      Clear Log
                    </button>
                  )}
                </div>

                {runHistory.length === 0 ? (
                  <div className="py-12 text-center border border-dashed border-slate-700/80 rounded-xl">
                    <p className="text-sm text-slate-300 font-medium">No completed flights recorded yet</p>
                    <p className="text-xs text-slate-400 mt-1">
                      Launch a game on the canvas to log your score and honour tier.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse font-mono text-xs tabular-nums">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400">
                          <th className="py-2.5 pr-3 font-medium">Time</th>
                          <th className="py-2.5 px-3 font-medium">Mode</th>
                          <th className="py-2.5 px-3 font-medium">Honour</th>
                          <th className="py-2.5 pl-3 text-right font-medium">Score</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {runHistory.map((item) => (
                          <tr key={item.id} className="text-slate-200">
                            <td className="py-2.5 pr-3 text-slate-400">{item.timestamp}</td>
                            <td className="py-2.5 px-3 capitalize">{item.difficulty}</td>
                            <td className="py-2.5 px-3">{item.medal}</td>
                            <td className="py-2.5 pl-3 text-right font-semibold text-amber-400">
                              {item.score}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* TAB 4: SELF-CONTAINED SINGLE-FILE HTML EXPORT */}
            {activeTab === 'html' && (
              <div className="bg-[#1E293B] border border-slate-800 rounded-2xl p-6 flex flex-col gap-4">
                <div>
                  <h2 className="font-display text-xl font-bold text-white mb-1">
                    01. Self-Contained HTML5 Canvas File
                  </h2>
                  <p className="text-sm text-slate-300 leading-relaxed">
                    Complete, dependency-free single HTML file (`index.html`) ready for direct deployment to Vercel, Netlify, or GitHub Pages.
                  </p>
                </div>

                <div className="p-3.5 rounded-xl bg-[#0F172A] border border-slate-800 text-xs text-slate-300 leading-relaxed">
                  <strong className="text-amber-400 font-semibold">Vercel Deployment Tip:</strong> Make sure the file in the root of your GitHub repository is named <code className="font-mono text-white">index.html</code> (not <code className="font-mono text-slate-400">flappy-bird-canvas.html</code>), so Vercel serves it automatically at <code className="font-mono text-white">/</code> without a <code className="font-mono text-rose-400">404: NOT_FOUND</code> error.
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCopyStandaloneHtml}
                    className="flex-1 inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {copiedHtml ? (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Copied HTML Source</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        <span>Copy Single-File HTML</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadStandaloneHtml}
                    className="inline-flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-medium text-slate-200 bg-[#0F172A] hover:bg-slate-800 border border-slate-700 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-4 h-4 text-amber-400" />
                    <span>Download index.html</span>
                  </button>
                </div>

                <div className="relative rounded-xl overflow-hidden border border-slate-800 bg-[#0B1120]">
                  <pre className="p-4 text-[11px] leading-relaxed font-mono text-slate-300 overflow-x-auto max-h-[340px]">
                    <code>{STANDALONE_FLAPPY_HTML}</code>
                  </pre>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Quiet Footer */}
      <footer className="mt-auto border-t border-slate-800/70 py-4 px-6 text-xs text-slate-400">
        <div className="max-w-[1360px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Flappy Bird Canvas Arcade · HTML5 2D Context</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('html')}
              className="hover:text-white transition-colors cursor-pointer"
            >
              Export Standalone HTML
            </button>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              onClick={startOrRestartGame}
              className="hover:text-white transition-colors cursor-pointer"
            >
              New Flight
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
