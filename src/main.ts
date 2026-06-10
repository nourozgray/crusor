import "./style.css";

type GameMode = "ready" | "playing" | "gameOver";
type FallingKind = "star" | "meteor";

interface Player {
  x: number;
  y: number;
  targetX: number;
  radius: number;
}

interface FallingEntity {
  kind: FallingKind;
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  rotation: number;
  spin: number;
}

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  life: number;
  maxLife: number;
  color: string;
}

interface BackgroundStar {
  x: number;
  y: number;
  radius: number;
  twinkle: number;
}

const BEST_SCORE_KEY = "crusor.bestScore";
const INITIAL_SHIELDS = 3;
const TARGET_FRAME_MS = 1000 / 60;

const canvas = getElement<HTMLCanvasElement>("#game-canvas");
const context = getCanvasContext(canvas);

const scoreElement = getElement<HTMLElement>("#score");
const bestScoreElement = getElement<HTMLElement>("#best-score");
const shieldsElement = getElement<HTMLElement>("#shields");
const messageElement = getElement<HTMLElement>("#message");
const messageTitle = getChild<HTMLElement>(messageElement, "h1");
const messageCopy = getChild<HTMLParagraphElement>(messageElement, "p:not(.eyebrow)");
const startButton = getElement<HTMLButtonElement>("#start-button");

let mode: GameMode = "ready";
let width = 0;
let height = 0;
let dpr = 1;
let score = 0;
let bestScore = loadBestScore();
let shields = INITIAL_SHIELDS;
let elapsedMs = 0;
let spawnTimerMs = 0;
let screenShakeMs = 0;
let lastFrameTime = performance.now();
let isPointerDown = false;

const player: Player = {
  x: 0,
  y: 0,
  targetX: 0,
  radius: 24,
};

const keys = {
  left: false,
  right: false,
};

const fallingEntities: FallingEntity[] = [];
const sparks: Spark[] = [];
let backgroundStars: BackgroundStar[] = [];

bestScoreElement.textContent = String(bestScore);
resizeCanvas();
showReadyMessage();
requestAnimationFrame(loop);

window.addEventListener("resize", resizeCanvas);
window.addEventListener("orientationchange", resizeCanvas);

startButton.addEventListener("click", (event) => {
  event.stopPropagation();
  startGame();
});

window.addEventListener("pointerdown", (event) => {
  isPointerDown = true;
  setPlayerTarget(event.clientX);
});

window.addEventListener("pointermove", (event) => {
  if (isPointerDown) {
    setPlayerTarget(event.clientX);
  }
});

window.addEventListener("pointerup", () => {
  isPointerDown = false;
});

window.addEventListener("pointercancel", () => {
  isPointerDown = false;
});

window.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    keys.left = true;
  }

  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    keys.right = true;
  }

  if ((event.key === " " || event.key === "Enter") && mode !== "playing") {
    startGame();
  }
});

window.addEventListener("keyup", (event) => {
  if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
    keys.left = false;
  }

  if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
    keys.right = false;
  }
});

function getElement<T extends HTMLElement>(selector: string): T {
  const element = document.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required element: ${selector}`);
  }

  return element;
}

function getChild<T extends HTMLElement>(parent: HTMLElement, selector: string): T {
  const element = parent.querySelector<T>(selector);

  if (!element) {
    throw new Error(`Missing required child element: ${selector}`);
  }

  return element;
}

function getCanvasContext(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const renderingContext = element.getContext("2d");

  if (!renderingContext) {
    throw new Error("Canvas rendering is not supported in this browser.");
  }

  return renderingContext;
}

function resizeCanvas(): void {
  const rect = canvas.getBoundingClientRect();
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  width = Math.max(1, rect.width);
  height = Math.max(1, rect.height);
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  player.radius = clamp(width * 0.058, 18, 30);
  player.y = height - Math.max(82, height * 0.14);
  player.x = player.x || width / 2;
  player.targetX = player.targetX || player.x;
  player.x = clamp(player.x, player.radius, width - player.radius);
  player.targetX = clamp(player.targetX, player.radius, width - player.radius);
  backgroundStars = createBackgroundStars();
}

function startGame(): void {
  mode = "playing";
  score = 0;
  shields = INITIAL_SHIELDS;
  elapsedMs = 0;
  spawnTimerMs = 0;
  screenShakeMs = 0;
  player.x = width / 2;
  player.targetX = player.x;
  fallingEntities.length = 0;
  sparks.length = 0;
  updateHud();
  messageElement.classList.add("is-hidden");
  startButton.textContent = "Restart";
}

function endGame(): void {
  mode = "gameOver";
  screenShakeMs = 320;

  if (score > bestScore) {
    bestScore = score;
    saveBestScore(bestScore);
  }

  updateHud();
  messageTitle.textContent = "Run complete";
  messageCopy.textContent = `You scored ${score}. Drag to steer, then try to beat your best run.`;
  startButton.textContent = "Play Again";
  messageElement.classList.remove("is-hidden");
}

function showReadyMessage(): void {
  messageTitle.textContent = "Catch stars. Dodge meteors.";
  messageCopy.textContent = "Drag anywhere to steer your ship. Tap start when you are ready.";
  startButton.textContent = "Start Game";
  updateHud();
}

function updateHud(): void {
  scoreElement.textContent = String(score);
  bestScoreElement.textContent = String(bestScore);
  shieldsElement.textContent = String(shields);
}

function setPlayerTarget(clientX: number): void {
  const rect = canvas.getBoundingClientRect();
  player.targetX = clamp(clientX - rect.left, player.radius, width - player.radius);
}

function loop(now: number): void {
  const deltaMs = Math.min(now - lastFrameTime, TARGET_FRAME_MS * 2.5);
  lastFrameTime = now;
  update(deltaMs);
  draw();
  requestAnimationFrame(loop);
}

function update(deltaMs: number): void {
  const deltaSeconds = deltaMs / 1000;

  if (screenShakeMs > 0) {
    screenShakeMs = Math.max(0, screenShakeMs - deltaMs);
  }

  updateSparks(deltaSeconds);

  if (mode !== "playing") {
    return;
  }

  elapsedMs += deltaMs;
  updatePlayer(deltaSeconds);
  updateSpawns(deltaMs);
  updateFallingEntities(deltaSeconds);
}

function updatePlayer(deltaSeconds: number): void {
  const keyboardSpeed = 540;

  if (keys.left) {
    player.targetX -= keyboardSpeed * deltaSeconds;
  }

  if (keys.right) {
    player.targetX += keyboardSpeed * deltaSeconds;
  }

  player.targetX = clamp(player.targetX, player.radius, width - player.radius);
  player.x += (player.targetX - player.x) * Math.min(1, 18 * deltaSeconds);
}

function updateSpawns(deltaMs: number): void {
  const difficulty = 1 + elapsedMs / 25000;
  spawnTimerMs -= deltaMs;

  while (spawnTimerMs <= 0) {
    spawnFallingEntity(difficulty);
    spawnTimerMs += clamp(760 - difficulty * 84, 230, 760);
  }
}

function spawnFallingEntity(difficulty: number): void {
  const meteorChance = clamp(0.28 + difficulty * 0.035, 0.28, 0.58);
  const kind: FallingKind = Math.random() < meteorChance ? "meteor" : "star";
  const radius =
    kind === "star" ? randomBetween(13, 20) : randomBetween(18, Math.min(34, width * 0.08));
  const speed =
    kind === "star"
      ? randomBetween(130, 190 + difficulty * 18)
      : randomBetween(170, 245 + difficulty * 28);

  fallingEntities.push({
    kind,
    x: randomBetween(radius, width - radius),
    y: -radius * 2,
    radius,
    speed,
    drift: randomBetween(-38, 38),
    rotation: randomBetween(0, Math.PI * 2),
    spin: randomBetween(-2.4, 2.4),
  });
}

function updateFallingEntities(deltaSeconds: number): void {
  for (let index = fallingEntities.length - 1; index >= 0; index -= 1) {
    const entity = fallingEntities[index];
    entity.y += entity.speed * deltaSeconds;
    entity.x += entity.drift * deltaSeconds;
    entity.rotation += entity.spin * deltaSeconds;

    if (entity.x < entity.radius || entity.x > width - entity.radius) {
      entity.drift *= -1;
      entity.x = clamp(entity.x, entity.radius, width - entity.radius);
    }

    if (isCollidingWithPlayer(entity)) {
      resolveCollision(entity);
      fallingEntities.splice(index, 1);
      continue;
    }

    if (entity.y - entity.radius > height) {
      fallingEntities.splice(index, 1);
    }
  }
}

function resolveCollision(entity: FallingEntity): void {
  if (entity.kind === "star") {
    score += 10;
    createSparkBurst(entity.x, entity.y, "#facc15", 12);
  } else {
    shields -= 1;
    screenShakeMs = 220;
    createSparkBurst(entity.x, entity.y, "#fb7185", 18);

    if (shields <= 0) {
      shields = 0;
      endGame();
    }
  }

  updateHud();
}

function isCollidingWithPlayer(entity: FallingEntity): boolean {
  const dx = entity.x - player.x;
  const dy = entity.y - player.y;
  const distance = Math.hypot(dx, dy);

  return distance < (entity.radius + player.radius) * 0.82;
}

function createSparkBurst(x: number, y: number, color: string, count: number): void {
  for (let index = 0; index < count; index += 1) {
    const angle = randomBetween(0, Math.PI * 2);
    const speed = randomBetween(70, 260);

    sparks.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: randomBetween(2, 5),
      life: 0,
      maxLife: randomBetween(0.32, 0.68),
      color,
    });
  }
}

function updateSparks(deltaSeconds: number): void {
  for (let index = sparks.length - 1; index >= 0; index -= 1) {
    const spark = sparks[index];
    spark.life += deltaSeconds;
    spark.x += spark.vx * deltaSeconds;
    spark.y += spark.vy * deltaSeconds;
    spark.vy += 180 * deltaSeconds;

    if (spark.life >= spark.maxLife) {
      sparks.splice(index, 1);
    }
  }
}

function draw(): void {
  context.save();

  if (screenShakeMs > 0) {
    const shake = (screenShakeMs / 220) * 5;
    context.translate(randomBetween(-shake, shake), randomBetween(-shake, shake));
  }

  drawBackground();
  drawFallingEntities();
  drawPlayer();
  drawSparks();
  context.restore();
}

function drawBackground(): void {
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#111827");
  gradient.addColorStop(1, "#020617");
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  const drift = elapsedMs * 0.000018;
  backgroundStars.forEach((star) => {
    const alpha = 0.35 + Math.sin(elapsedMs * 0.002 + star.twinkle) * 0.25;
    context.beginPath();
    context.fillStyle = `rgba(191, 219, 254, ${alpha})`;
    context.arc((star.x + drift * width) % width, star.y, star.radius, 0, Math.PI * 2);
    context.fill();
  });

  context.strokeStyle = "rgba(96, 165, 250, 0.12)";
  context.lineWidth = 1;

  for (let lane = 1; lane < 4; lane += 1) {
    const x = (width / 4) * lane;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
}

function drawFallingEntities(): void {
  fallingEntities.forEach((entity) => {
    if (entity.kind === "star") {
      drawStar(entity.x, entity.y, entity.radius, entity.rotation);
    } else {
      drawMeteor(entity.x, entity.y, entity.radius, entity.rotation);
    }
  });
}

function drawStar(x: number, y: number, radius: number, rotation: number): void {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.shadowColor = "#facc15";
  context.shadowBlur = 16;
  context.fillStyle = "#facc15";
  context.beginPath();

  for (let point = 0; point < 10; point += 1) {
    const pointRadius = point % 2 === 0 ? radius : radius * 0.45;
    const angle = (Math.PI / 5) * point - Math.PI / 2;
    const pointX = Math.cos(angle) * pointRadius;
    const pointY = Math.sin(angle) * pointRadius;

    if (point === 0) {
      context.moveTo(pointX, pointY);
    } else {
      context.lineTo(pointX, pointY);
    }
  }

  context.closePath();
  context.fill();
  context.restore();
}

function drawMeteor(x: number, y: number, radius: number, rotation: number): void {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.shadowColor = "#fb7185";
  context.shadowBlur = 14;
  context.fillStyle = "#fb7185";
  context.beginPath();
  context.ellipse(0, 0, radius * 0.92, radius * 1.12, 0.45, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "rgba(127, 29, 29, 0.55)";
  context.beginPath();
  context.arc(-radius * 0.24, -radius * 0.2, radius * 0.22, 0, Math.PI * 2);
  context.arc(radius * 0.18, radius * 0.22, radius * 0.14, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawPlayer(): void {
  context.save();
  context.translate(player.x, player.y);
  context.shadowColor = "#38bdf8";
  context.shadowBlur = 18;
  context.fillStyle = "#38bdf8";
  context.beginPath();
  context.moveTo(0, -player.radius * 1.25);
  context.lineTo(player.radius * 0.92, player.radius);
  context.lineTo(0, player.radius * 0.55);
  context.lineTo(-player.radius * 0.92, player.radius);
  context.closePath();
  context.fill();
  context.fillStyle = "#e0f2fe";
  context.beginPath();
  context.arc(0, -player.radius * 0.22, player.radius * 0.28, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawSparks(): void {
  sparks.forEach((spark) => {
    const alpha = 1 - spark.life / spark.maxLife;
    context.globalAlpha = alpha;
    context.fillStyle = spark.color;
    context.beginPath();
    context.arc(spark.x, spark.y, spark.radius * alpha, 0, Math.PI * 2);
    context.fill();
    context.globalAlpha = 1;
  });
}

function createBackgroundStars(): BackgroundStar[] {
  const count = Math.floor(clamp((width * height) / 9000, 42, 110));
  const stars: BackgroundStar[] = [];

  for (let index = 0; index < count; index += 1) {
    stars.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: randomBetween(0.6, 1.9),
      twinkle: randomBetween(0, Math.PI * 2),
    });
  }

  return stars;
}

function loadBestScore(): number {
  try {
    return Number(window.localStorage.getItem(BEST_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBestScore(value: number): void {
  try {
    window.localStorage.setItem(BEST_SCORE_KEY, String(value));
  } catch {
    // Some mobile browsers can deny local storage in private mode.
  }
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
