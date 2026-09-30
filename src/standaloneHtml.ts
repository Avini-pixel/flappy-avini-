export const STANDALONE_FLAPPY_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Flappy Bird — HTML5 Canvas</title>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      user-select: none;
      -webkit-user-select: none;
    }
    body {
      background-color: #0B1120;
      color: #F8FAFC;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .arcade-shell {
      position: relative;
      width: 480px;
      max-width: 100%;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 24px 48px rgba(0, 0, 0, 0.55);
      border: 1px solid rgba(255, 255, 255, 0.12);
      background: #1E293B;
    }
    .hud-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 18px;
      background: #0F172A;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 14px;
      font-variant-numeric: tabular-nums;
    }
    .hud-score {
      font-weight: 700;
      color: #F59E0B;
      font-size: 16px;
    }
    .canvas-wrap {
      position: relative;
      width: 480px;
      height: 640px;
      max-width: 100%;
      display: block;
    }
    canvas {
      display: block;
      width: 100%;
      height: 100%;
      cursor: pointer;
    }
    .overlay-panel {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(11, 17, 32, 0.55);
      backdrop-filter: blur(2px);
      text-align: center;
      padding: 24px;
      pointer-events: auto;
    }
    .overlay-panel.hidden {
      display: none;
      pointer-events: none;
    }
    .card {
      background: rgba(15, 23, 42, 0.94);
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 14px;
      padding: 28px 32px;
      max-width: 360px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
    }
    h1 {
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: #F8FAFC;
      margin-bottom: 8px;
    }
    p.sub {
      font-size: 14px;
      color: #94A3B8;
      line-height: 1.5;
      margin-bottom: 20px;
    }
    .score-summary {
      display: flex;
      justify-content: space-between;
      padding: 12px 0;
      margin-bottom: 20px;
      border-top: 1px solid rgba(255, 255, 255, 0.08);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      font-size: 14px;
      color: #CBD5E1;
      font-variant-numeric: tabular-nums;
    }
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      padding: 12px 24px;
      font-size: 15px;
      font-weight: 600;
      color: #0F172A;
      background: #F59E0B;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      transition: transform 0.15s ease, opacity 0.15s ease;
    }
    .btn:hover {
      opacity: 0.92;
      transform: translateY(-1px);
    }
    .btn:active {
      transform: translateY(0);
    }
    .controls-hint {
      margin-top: 14px;
      font-size: 12px;
      color: #94A3B8;
    }
  </style>
</head>
<body>
  <div class="arcade-shell">
    <div class="hud-bar">
      <span>Flappy Bird</span>
      <span class="hud-score">Score: <span id="scoreDisplay">0</span> &middot; Best: <span id="bestDisplay">0</span></span>
    </div>
    <div class="canvas-wrap">
      <canvas id="gameCanvas" width="480" height="640"></canvas>

      <!-- Start Screen -->
      <div id="startScreen" class="overlay-panel">
        <div class="card">
          <h1>Flappy Bird</h1>
          <p class="sub">Navigate through the emerald pipes without touching the ground or obstacles.</p>
          <button id="startBtn" class="btn">Start Game</button>
          <div class="controls-hint">Press Space, Up Arrow, W, or Click to Flap</div>
        </div>
      </div>

      <!-- Game Over Screen -->
      <div id="gameOverScreen" class="overlay-panel hidden">
        <div class="card">
          <h1>Game Over</h1>
          <p class="sub" id="medalText">Flight terminated upon impact.</p>
          <div class="score-summary">
            <span>Final Score: <strong id="finalScore">0</strong></span>
            <span>High Score: <strong id="finalBest">0</strong></span>
          </div>
          <button id="restartBtn" class="btn">Restart Game</button>
          <div class="controls-hint">Press Space or Enter to Play Again</div>
        </div>
      </div>
    </div>
  </div>

  <script>
    (function () {
      const canvas = document.getElementById('gameCanvas');
      const ctx = canvas.getContext('2d');
      const startScreen = document.getElementById('startScreen');
      const gameOverScreen = document.getElementById('gameOverScreen');
      const startBtn = document.getElementById('startBtn');
      const restartBtn = document.getElementById('restartBtn');
      const scoreDisplay = document.getElementById('scoreDisplay');
      const bestDisplay = document.getElementById('bestDisplay');
      const finalScore = document.getElementById('finalScore');
      const finalBest = document.getElementById('finalBest');
      const medalText = document.getElementById('medalText');

      const WIDTH = canvas.width;
      const HEIGHT = canvas.height;
      const GROUND_HEIGHT = 84;
      const PLAY_HEIGHT = HEIGHT - GROUND_HEIGHT;

      let state = 'START'; // 'START' | 'PLAYING' | 'GAMEOVER'
      let score = 0;
      let bestScore = Number(localStorage.getItem('flappy_standalone_best') || 0);
      bestDisplay.textContent = bestScore;

      let frameCount = 0;
      let groundScroll = 0;

      const bird = {
        x: 115,
        y: PLAY_HEIGHT / 2 - 20,
        radius: 17,
        velocity: 0,
        gravity: 0.42,
        flapStrength: -7.8,
        rotation: 0
      };

      const pipes = [];
      const PIPE_WIDTH = 66;
      const PIPE_GAP = 148;
      const PIPE_SPEED = 2.75;
      const PIPE_SPAWN_INTERVAL = 100;

      const clouds = [
        { x: 60, y: 90, scale: 1.0, speed: 0.35 },
        { x: 240, y: 135, scale: 0.85, speed: 0.25 },
        { x: 390, y: 75, scale: 1.15, speed: 0.4 }
      ];

      function resetGame() {
        score = 0;
        frameCount = 0;
        bird.y = PLAY_HEIGHT / 2 - 20;
        bird.velocity = 0;
        bird.rotation = 0;
        pipes.length = 0;
        scoreDisplay.textContent = '0';
      }

      function startGame() {
        resetGame();
        state = 'PLAYING';
        startScreen.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        flap();
      }

      function triggerGameOver() {
        if (state === 'GAMEOVER') return;
        state = 'GAMEOVER';
        if (score > bestScore) {
          bestScore = score;
          localStorage.setItem('flappy_standalone_best', String(bestScore));
        }
        bestDisplay.textContent = bestScore;
        finalScore.textContent = score;
        finalBest.textContent = bestScore;
        if (score >= 40) medalText.textContent = 'Platinum Flight Honour Awarded';
        else if (score >= 25) medalText.textContent = 'Gold Flight Honour Awarded';
        else if (score >= 10) medalText.textContent = 'Silver Flight Honour Awarded';
        else if (score >= 5) medalText.textContent = 'Bronze Flight Honour Awarded';
        else medalText.textContent = 'Keep practicing your flap rhythm.';
        gameOverScreen.classList.remove('hidden');
      }

      function flap() {
        if (state === 'START') {
          startGame();
          return;
        }
        if (state === 'PLAYING') {
          bird.velocity = bird.flapStrength;
        }
      }

      function spawnPipe() {
        const minTop = 55;
        const maxTop = PLAY_HEIGHT - PIPE_GAP - 75;
        const topHeight = Math.floor(Math.random() * (maxTop - minTop + 1)) + minTop;
        pipes.push({
          x: WIDTH + 10,
          topHeight: topHeight,
          bottomY: topHeight + PIPE_GAP,
          passed: false
        });
      }

      function update() {
        frameCount++;

        clouds.forEach(c => {
          c.x -= c.speed;
          if (c.x < -100) c.x = WIDTH + 80;
        });

        if (state !== 'GAMEOVER') {
          groundScroll = (groundScroll + PIPE_SPEED) % 24;
        }

        if (state === 'START') {
          bird.y = PLAY_HEIGHT / 2 - 20 + Math.sin(frameCount * 0.08) * 8;
          bird.rotation = 0;
          return;
        }

        if (state === 'PLAYING') {
          bird.velocity += bird.gravity;
          bird.y += bird.velocity;

          if (bird.velocity < 0) {
            bird.rotation = -0.38;
          } else {
            bird.rotation = Math.min(Math.PI / 2.2, bird.rotation + 0.045);
          }

          if (bird.y - bird.radius < 0) {
            bird.y = bird.radius;
            bird.velocity = 0;
          }

          if (bird.y + bird.radius >= PLAY_HEIGHT) {
            bird.y = PLAY_HEIGHT - bird.radius;
            triggerGameOver();
            return;
          }

          if (frameCount % PIPE_SPAWN_INTERVAL === 0) {
            spawnPipe();
          }

          for (let i = pipes.length - 1; i >= 0; i--) {
            const p = pipes[i];
            p.x -= PIPE_SPEED;

            // Collision check
            const withinX = bird.x + bird.radius - 3 > p.x && bird.x - bird.radius + 3 < p.x + PIPE_WIDTH;
            if (withinX) {
              const hitTop = bird.y - bird.radius + 3 < p.topHeight;
              const hitBottom = bird.y + bird.radius - 3 > p.bottomY;
              if (hitTop || hitBottom) {
                triggerGameOver();
                return;
              }
            }

            if (!p.passed && p.x + PIPE_WIDTH < bird.x) {
              p.passed = true;
              score++;
              scoreDisplay.textContent = String(score);
            }

            if (p.x + PIPE_WIDTH < -20) {
              pipes.splice(i, 1);
            }
          }
        }
      }

      function drawCloud(x, y, s) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(s, s);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.beginPath();
        ctx.arc(0, 0, 20, 0, Math.PI * 2);
        ctx.arc(18, -6, 24, 0, Math.PI * 2);
        ctx.arc(38, 0, 19, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      function drawPipe(x, topHeight, bottomY) {
        const capH = 26;
        const grad = ctx.createLinearGradient(x, 0, x + PIPE_WIDTH, 0);
        grad.addColorStop(0, '#15803D');
        grad.addColorStop(0.3, '#4ADE80');
        grad.addColorStop(0.75, '#16A34A');
        grad.addColorStop(1, '#14532D');

        ctx.fillStyle = grad;
        ctx.strokeStyle = '#052E16';
        ctx.lineWidth = 2.5;

        // Top pipe shaft
        ctx.fillRect(x, 0, PIPE_WIDTH, topHeight - capH);
        ctx.strokeRect(x, -2, PIPE_WIDTH, topHeight - capH + 2);

        // Top pipe cap
        ctx.fillRect(x - 4, topHeight - capH, PIPE_WIDTH + 8, capH);
        ctx.strokeRect(x - 4, topHeight - capH, PIPE_WIDTH + 8, capH);

        // Bottom pipe cap
        const bottomHeight = PLAY_HEIGHT - bottomY;
        ctx.fillRect(x - 4, bottomY, PIPE_WIDTH + 8, capH);
        ctx.strokeRect(x - 4, bottomY, PIPE_WIDTH + 8, capH);

        // Bottom pipe shaft
        ctx.fillRect(x, bottomY + capH, PIPE_WIDTH, bottomHeight - capH);
        ctx.strokeRect(x, bottomY + capH, PIPE_WIDTH, bottomHeight - capH + 2);
      }

      function drawBird() {
        ctx.save();
        ctx.translate(bird.x, bird.y);
        ctx.rotate(bird.rotation);

        // Body
        ctx.fillStyle = '#F59E0B';
        ctx.strokeStyle = '#1E293B';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, bird.radius + 3, bird.radius, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Wing
        const wingOffset = state === 'PLAYING' ? Math.sin(frameCount * 0.45) * 4 : Math.sin(frameCount * 0.15) * 2;
        ctx.fillStyle = '#FEF3C7';
        ctx.beginPath();
        ctx.ellipse(-5, wingOffset, 9, 6, -0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Eye
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(7, -5, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#0F172A';
        ctx.beginPath();
        ctx.arc(9, -5, 2.6, 0, Math.PI * 2);
        ctx.fill();

        // Beak
        ctx.fillStyle = '#EF4444';
        ctx.beginPath();
        ctx.moveTo(13, -1);
        ctx.lineTo(24, 3);
        ctx.lineTo(13, 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        ctx.restore();
      }

      function draw() {
        // Sky gradient
        const skyGrad = ctx.createLinearGradient(0, 0, 0, PLAY_HEIGHT);
        skyGrad.addColorStop(0, '#38BDF8');
        skyGrad.addColorStop(1, '#BAE6FD');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, WIDTH, PLAY_HEIGHT);

        // Clouds
        clouds.forEach(c => drawCloud(c.x, c.y, c.scale));

        // Distant skyline silhouette
        ctx.fillStyle = 'rgba(14, 116, 144, 0.22)';
        for (let i = 0; i < WIDTH; i += 48) {
          const h = 45 + ((i * 19) % 50);
          ctx.fillRect(i, PLAY_HEIGHT - h, 42, h);
        }

        // Pipes
        pipes.forEach(p => drawPipe(p.x, p.topHeight, p.bottomY));

        // Ground
        ctx.fillStyle = '#D97706';
        ctx.fillRect(0, PLAY_HEIGHT, WIDTH, GROUND_HEIGHT);

        // Grass strip
        ctx.fillStyle = '#22C55E';
        ctx.fillRect(0, PLAY_HEIGHT, WIDTH, 16);
        ctx.strokeStyle = '#052E16';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, PLAY_HEIGHT);
        ctx.lineTo(WIDTH, PLAY_HEIGHT);
        ctx.stroke();

        // Ground stripes
        ctx.fillStyle = '#B45309';
        for (let x = -groundScroll; x < WIDTH; x += 24) {
          ctx.beginPath();
          ctx.moveTo(x, PLAY_HEIGHT + 16);
          ctx.lineTo(x + 12, PLAY_HEIGHT + 16);
          ctx.lineTo(x + 4, HEIGHT);
          ctx.lineTo(x - 8, HEIGHT);
          ctx.closePath();
          ctx.fill();
        }

        // Bird
        drawBird();

        // In-Canvas Live Score Counter
        if (state === 'PLAYING') {
          ctx.save();
          ctx.font = '800 44px -apple-system, BlinkMacSystemFont, sans-serif';
          ctx.textAlign = 'center';
          ctx.fillStyle = '#FFFFFF';
          ctx.strokeStyle = '#0F172A';
          ctx.lineWidth = 5;
          ctx.strokeText(String(score), WIDTH / 2, 72);
          ctx.fillText(String(score), WIDTH / 2, 72);
          ctx.restore();
        }
      }

      function loop() {
        update();
        draw();
        requestAnimationFrame(loop);
      }

      // Keyboard controls
      window.addEventListener('keydown', function (e) {
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
          e.preventDefault();
          if (state === 'GAMEOVER') {
            startGame();
          } else {
            flap();
          }
        } else if (e.code === 'Enter' && state !== 'PLAYING') {
          e.preventDefault();
          startGame();
        }
      });

      // Mouse / Touch controls
      canvas.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        flap();
      });

      startBtn.addEventListener('click', startGame);
      restartBtn.addEventListener('click', startGame);

      loop();
    })();
  </script>
</body>
</html>`;
