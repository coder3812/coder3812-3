/* Smooth Runner — Soft Cartoon edition
   - polished visuals (gradients, shadows)
   - parallax background
   - power-ups, increasing speed, high score
   - guaranteed possible obstacle spacing
   - touch and keyboard controls
*/

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const scoreEl = document.getElementById('score');
const highScoreEl = document.getElementById('highScore');

let DPR = window.devicePixelRatio || 1;
function fitCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * DPR);
  canvas.height = Math.floor(rect.height * DPR);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
fitCanvas();
window.addEventListener('resize', () => { fitCanvas(); });

/* GAME STATE */
let player, obstacles, powerUps, parallax, groundY;
let speed, baseSpeed, score, highScore, gameOver;
let lastSpawnTime = 0;
let lastPowerTime = 0;
let lastFrame = 0;
let spawnInterval = 900; // ms, will adapt
let powerInterval = 4000; // ms
let speedIncreaseRate = 0.0006; // per ms
const gravity = 0.6;
const MAX_SPEED = 14;

/* Load high score */
highScore = parseInt(localStorage.getItem('runnerHighScore') || '0', 10);
highScoreEl.textContent = 'High Score: ' + highScore;

/* Utility helpers */
function rand(min, max) { return Math.random() * (max - min) + min; }
function now() { return performance.now(); }

/* Parallax background layers */
class Parallax {
  constructor(w, h) {
    this.w = w; this.h = h;
    this.clouds = [];
    this.hills = [];
    this.init();
  }
  init() {
    for (let i=0;i<6;i++){
      this.clouds.push({x: rand(0,this.w), y: rand(20,this.h*0.25), s: rand(0.6,1.2)});
    }
    for (let i=0;i<3;i++){
      this.hills.push({x: i*this.w/2, y: this.h*0.6 + rand(-10,30), s: rand(0.9,1.2)});
    }
  }
  update(dt) {
    // move clouds slowly
    for (let c of this.clouds) {
      c.x -= speed * 0.2 * c.s * dt/16;
      if (c.x < -200) c.x = this.w + rand(0,200);
    }
    for (let h of this.hills) {
      h.x -= speed * 0.35 * h.s * dt/16;
      if (h.x < -this.w) h.x = this.w;
    }
  }
  draw(ctx) {
    // sky gradient handled by CSS; draw clouds and hills
    // clouds (soft)
    for (let c of this.clouds) {
      drawCloud(ctx, c.x, c.y, 90*c.s, 50*c.s);
    }
    // hills
    for (let h of this.hills) {
      drawHill(ctx, h.x, h.y, this.w*0.8, 120*h.s);
    }
  }
}

/* Player */
class Player {
  constructor(){
    this.w = 54;
    this.h = 54;
    this.x = 110;
    this.y = 0;
    this.vy = 0;
    this.jumpForce = 13.2;    // tweak for nice arc
    this.onGround = false;
    this.shield = 0; // frames remaining
    this.colorA = '#ff9a4a';
    this.colorB = '#ff6a00';
    this.shadowColor = 'rgba(0,0,0,0.15)';
  }
  reset() {
    this.y = groundY - this.h;
    this.vy = 0;
    this.onGround = true;
    this.shield = 0;
  }
  update(dt) {
    this.vy += gravity;
    this.y += this.vy;
    if (this.y + this.h >= groundY) {
      this.y = groundY - this.h;
      this.vy = 0;
      this.onGround = true;
    } else this.onGround = false;

    if (this.shield > 0) this.shield -= dt;
    this.draw(ctx);
  }
  draw(ctx) {
    // shadow
    const shadowW = this.w * (1 + Math.min(0.4, (this.y+this.h - (groundY-this.h)) / 120));
    ctx.beginPath();
    ctx.ellipse(this.x + this.w/2, groundY + 6, shadowW/2, 10, 0, 0, Math.PI*2);
    ctx.fillStyle = this.shadowColor; ctx.fill();

    // body (rounded rect with gradient)
    const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.h);
    g.addColorStop(0, this.colorA); g.addColorStop(1, this.colorB);
    roundRect(ctx, this.x, this.y, this.w, this.h, 12);
    ctx.fillStyle = g; ctx.fill();

    // shine
    ctx.beginPath();
    ctx.ellipse(this.x + this.w*0.65, this.y + this.h*0.3, this.w*0.18, this.h*0.08, 0, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fill();

    // shield ring
    if (this.shield > 0) {
      ctx.beginPath();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,200,255,0.75)';
      ctx.arc(this.x + this.w/2, this.y + this.h/2, this.w*0.85, 0, Math.PI*2);
      ctx.stroke();
    }
  }
  jump(){
    if (this.onGround) {
      this.vy = -this.jumpForce;
      this.onGround = false;
    } else {
      // small mid-air forgiveness: allow tiny extra boost if near ground (not double jump)
      if (this.vy > 0 && this.y + this.h > groundY - 18) {
        this.vy = -this.jumpForce * 0.85;
      }
    }
  }
}

/* Obstacle */
class Obstacle {
  constructor(type='box') {
    this.type = type;
    this.size = (type==='tall')? 64 : 48;
    this.x = canvas.width + rand(20,180);
    this.y = groundY - this.size;
    this.passed = false;
    this.colorTop = '#3a3a3a';
    this.colorBottom = '#2b2b2b';
    if (type === 'cone') { this.size = 50; this.y = groundY - this.size; }
  }
  update(dt){
    this.x -= speed * dt/16;
    this.draw(ctx);
  }
  draw(ctx){
    if (this.type === 'cone') {
      // draw cone / rounded top
      ctx.beginPath();
      ctx.moveTo(this.x + this.size/2, this.y);
      ctx.lineTo(this.x + this.size - 6, this.y + this.size);
      ctx.lineTo(this.x + 6, this.y + this.size);
      ctx.closePath();
      // shading
      let g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.size);
      g.addColorStop(0, '#ffcf6a'); g.addColorStop(1, '#ff9f3a');
      ctx.fillStyle = g; ctx.fill();
      // base shadow
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(this.x + 6, this.y + this.size - 6, this.size - 12, 6);
    } else {
      // rounded block with subtle gradient
      let g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.size);
      g.addColorStop(0, this.colorTop); g.addColorStop(1, this.colorBottom);
      roundRect(ctx, this.x, this.y, this.size, this.size, 10);
      ctx.fillStyle = g; ctx.fill();

      // small highlight
      ctx.beginPath();
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(this.x + 8, this.y + 6, this.size - 16, 8);
    }
  }
}

/* PowerUp */
class PowerUp {
  constructor(){
    this.size = 34;
    this.x = canvas.width + rand(40,260);
    this.y = groundY - this.size - rand(80,160);
    this.type = 'shield';
  }
  update(dt){
    this.x -= speed * dt/16;
    this.draw(ctx);
  }
  draw(ctx){
    // circular with plus icon
    ctx.beginPath();
    ctx.arc(this.x + this.size/2, this.y + this.size/2, this.size/2, 0, Math.PI*2);
    const g = ctx.createLinearGradient(this.x, this.y, this.x, this.y + this.size);
    g.addColorStop(0, '#6feaff'); g.addColorStop(1, '#00c2ff');
    ctx.fillStyle = g; ctx.fill();
    // plus
    ctx.fillStyle = 'white';
    const cx = this.x + this.size/2, cy = this.y + this.size/2;
    ctx.fillRect(cx - 6, cy - 2, 12, 4);
    ctx.fillRect(cx - 2, cy - 6, 4, 12);
  }
}

/* Helpers: rounded rect */
function roundRect(ctx, x, y, w, h, r){
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* Draw cloud and hill helper */
function drawCloud(ctx, x, y, w, h){
  ctx.save();
  ctx.beginPath();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.ellipse(x, y, w*0.55, h*0.6, 0, 0, Math.PI*2);
  ctx.ellipse(x + w*0.25, y - 6, w*0.45, h*0.5, 0, 0, Math.PI*2);
  ctx.ellipse(x - w*0.2, y - 6, w*0.42, h*0.5, 0, 0, Math.PI*2);
  ctx.fill();
  ctx.restore();
}
function drawHill(ctx, x, y, w, h){
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x - 40, y + 40);
  ctx.quadraticCurveTo(x + w*0.25, y - h, x + w*0.6, y + 20);
  ctx.quadraticCurveTo(x + w*0.95, y + 60, x + w + 40, y + 40);
  const g = ctx.createLinearGradient(x, y - h, x, y + 80);
  g.addColorStop(0, '#9fe6a6'); g.addColorStop(1, '#6fcf7d');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
}

/* Collision detection (AABB but sized by obstacle size) */
function collideRect(a, bx, by, bsize) {
  return (
    a.x < bx + bsize &&
    a.x + a.w > bx &&
    a.y < by + bsize &&
    a.y + a.h > by
  );
}

/* Initialize game entities */
function initGame(){
  obstacles = [];
  powerUps = [];
  player = new Player();

  // derive sizes from canvas
  const h = canvas.height;
  groundY = Math.floor(canvas.getBoundingClientRect().height * 0.86);
  // base speed and score
  baseSpeed = 5;
  speed = baseSpeed;
  score = 0;
  gameOver = false;
  lastSpawnTime = now();
  lastPowerTime = now() + 800;
  parallax = new Parallax(canvas.width, canvas.height);
  player.reset();

  scoreEl.textContent = 'Score: 0';
  highScoreEl.textContent = 'High Score: ' + highScore;
}

/* Game loop */
function gameLoop(ts){
  if (!lastFrame) lastFrame = ts;
  const dt = Math.min(40, ts - lastFrame); // cap dt
  lastFrame = ts;

  if (gameOver) { drawGameOver(); return; }

  // clear
  ctx.clearRect(0,0,canvas.width,canvas.height);

  // parallax update/draw
  parallax.update(dt); parallax.draw(ctx);

  // ground
  drawGround(ctx);

  // update player
  player.update(dt);

  // adaptive spawn logic ensuring possible jumps
  // compute player's max airtime for current physics:
  // time to apex = jumpForce / gravity (frames), convert to ms using approx 16ms per frame -> but better treat frames: totalFrames = 2 * jumpForce / gravity
  // airtime_ms ~= totalFrames * 16
  const totalFramesAir = 2 * (player.jumpForce / gravity);
  const airtimeMs = totalFramesAir * 16;
  // required safe gap (in pixels) = speed(px per ms) * airtimeMs * safetyFactor + player.w
  const speedPxPerMs = speed / 16;
  let minGap = Math.max(220, speedPxPerMs * airtimeMs * 0.85 + player.w + 20);
  // convert to spawn interval (ms) = minGap / speedPxPerMs
  spawnInterval = Math.max(360, minGap / Math.max(speedPxPerMs, 0.12));

  // spawn obstacle if enough time passed
  if (now() - lastSpawnTime > spawnInterval) {
    lastSpawnTime = now();
    // choose obstacle types with small probability of tall or cone
    const r = Math.random();
    let type = 'box';
    if (r < 0.13) type = 'cone';
    else if (r > 0.95) type = 'tall';
    // prevent impossible sequences: if last obstacle still too close or many obstacles, delay
    if (obstacles.length && (canvas.width - obstacles[obstacles.length-1].x) < 120) {
      // push spawn later slightly
      lastSpawnTime -= spawnInterval * 0.45;
    } else {
      obstacles.push(new Obstacle(type));
    }
  }

  // spawn powerups occasionally and ensure they don't overlap obstacles
  if (now() - lastPowerTime > powerInterval && Math.random() < 0.7) {
    lastPowerTime = now();
    const pu = new PowerUp();
    // ensure not colliding immediately with upcoming obstacle
    let safe = true;
    for (let ob of obstacles) {
      if (Math.abs(ob.x - pu.x) < 120) { safe = false; break; }
    }
    if (safe) powerUps.push(pu);
  }

  // update obstacles
  for (let i = obstacles.length -1; i >=0; i--) {
    const ob = obstacles[i];
    ob.update(dt);
    // mark passed for scoring
    if (!ob.passed && ob.x + ob.size < player.x) {
      ob.passed = true;
      score += 12; // reward for passing
    }
    // collision
    if (!gameOver && collideRect(player, ob.x, ob.y, ob.size)) {
      if (player.shield > 0) {
        player.shield = 0;
        obstacles.splice(i,1);
      } else {
        gameOver = true;
      }
    }
    // remove off-screen
    if (ob.x + ob.size < -40) obstacles.splice(i,1);
  }

  // update powerups
  for (let i = powerUps.length -1; i >=0; i--) {
    const p = powerUps[i];
    p.update(dt);
    if (collideRect(player, p.x, p.y, p.size)) {
      // shield pickup
      player.shield = 2300; // ms
      powerUps.splice(i,1);
      score += 60;
    }
    if (p.x + p.size < -40) powerUps.splice(i,1);
  }

  // score increases with time and speed
  score += Math.floor(0.03 * speed * dt);
  scoreEl.textContent = 'Score: ' + Math.floor(score);

  // increase speed slowly but clamp
  speed = Math.min(MAX_SPEED, speed + speedIncreaseRate * dt * 16);

  // draw obstacles/powerups already done in update
  // update HUD high score live
  if (Math.floor(score) > highScore) {
    highScore = Math.floor(score);
    localStorage.setItem('runnerHighScore', highScore);
    highScoreEl.textContent = 'High Score: ' + highScore;
  }

  requestAnimationFrame(gameLoop);
}

/* draw ground strip and small decorative tiles */
function drawGround(ctx){
  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;
  // ground rectangle
  ctx.fillStyle = '#eaf9ff';
  ctx.fillRect(0, groundY, w, h - groundY + 80);
  // top border
  ctx.fillStyle = '#d0f0ff';
  ctx.fillRect(0, groundY - 6, w, 10);

  // little repeating rectangles to feel like texture
  const tileW = 28;
  for (let x = -((now()/6) % (tileW*2)); x < w; x += tileW + 22) {
    ctx.beginPath();
    ctx.fillStyle = 'rgba(10,40,80,0.04)';
    ctx.fillRect(x, groundY - 12, tileW * 0.9, 6);
  }
}

/* Draw initial attract screen (overlay handles most) */
function drawGameOver(){
  // dim canvas and draw "Game Over" prompt
  ctx.save();
  ctx.fillStyle = 'rgba(6,50,70,0.06)';
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.restore();

  // show overlay again with start button (reset)
  overlay.classList.add('show');
  overlay.style.pointerEvents = 'auto';
  startBtn.textContent = 'Restart';
}

/* Start and stop */
function startFromOverlay(){
  overlay.classList.remove('show');
  overlay.style.pointerEvents = 'none';
  // small fade effect via opacity
  overlay.style.transition = 'opacity .45s ease';
  overlay.style.opacity = '0';
  setTimeout(()=> {
    overlay.style.opacity = '1';
    overlay.style.display = 'none';
  }, 480);

  initGame();
  lastFrame = 0;
  requestAnimationFrame(gameLoop);
}

/* Controls */
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'ArrowUp') && !gameOver) {
    player.jump();
  } else if ((e.code === 'Space' || e.code === 'ArrowUp') && gameOver) {
    // restart quickly
    startFromOverlay();
  }
});
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  if (!gameOver && player) player.jump();
  else if (gameOver) startFromOverlay();
}, {passive:false});
startBtn.addEventListener('click', () => {
  overlay.style.display = 'none';
  startFromOverlay();
});

/* initial draw: nice starter screen */
function drawStarterScreen(){
  ctx.clearRect(0,0,canvas.width,canvas.height);
  const w = canvas.getBoundingClientRect().width;
  const h = canvas.getBoundingClientRect().height;
  // subtle background sky (canvas over CSS)
  const g = ctx.createLinearGradient(0,0,w,h);
  g.addColorStop(0, '#9dd6ff'); g.addColorStop(1, '#e9fbff');
  ctx.fillStyle = g; ctx.fillRect(0,0,w,h);

  // small parallax decorative
  const starterPar = new Parallax(w,h);
  starterPar.draw(ctx);

  // simple runner preview
  groundY = Math.floor(h * 0.86);
  // draw ground and example player
  drawGround(ctx);
  const demo = new Player(); demo.reset(); demo.x = 180; demo.y = groundY - demo.h;
  demo.draw(ctx);

  // sample obstacle
  const ob = new Obstacle('cone'); ob.x = w * 0.7; ob.y = groundY - ob.size; ob.draw(ctx);

  // hint text
  ctx.fillStyle = '#023242'; ctx.font = '20px Inter, Arial';
  ctx.fillText('Tap / Space to jump. Collect power-ups to gain a shield.', 26, groundY + 40);
}
drawStarterScreen();

/* ensure canvas fits on load */
setTimeout(()=> {
  fitCanvas(); drawStarterScreen();
}, 80);

/* Accessibility: let user double-tap start on mobile if overlay hidden */
document.addEventListener('dblclick', () => {
  if (overlay.style.display !== 'none') startFromOverlay();
});
