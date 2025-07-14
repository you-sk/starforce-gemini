const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- Constants & Global State ---
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;

const player = { x: canvasWidth / 2 - 25, y: canvasHeight - 60, width: 50, height: 50, speed: 5, lives: 3, invincible: false, invincibilityTimer: 0, fireCooldown: 0, powerUpTimer: 0 };
const bullets = [];
const enemies = [];
const stars = [];
const particles = [];
const powerUps = [];
const boss = { bullets: [] };
const keys = {};

let score = 0;
let highScore = 0;
let stage = 1;
let isGameOver = false;
let isBossActive = false;
let isStageClearing = false;
let enemySpawnTimer = 0;
let animationFrameId; // Global variable to hold the animation frame ID
let isJourneyActive = false;
let journeyEnemySpawnedCount = 0;
const maxJourneyEnemies = 30; // Adjust this number as needed
let bossSpawned = false;

// --- Asset Manager ---
const assetManager = {
    images: {},
    imageUrls: { player: 'assets/player.svg', enemy1: 'assets/enemy1.svg', enemy2: 'assets/enemy2.svg' },
    totalAssets: 0, loadedAssets: 0,
    init() { this.totalAssets = Object.keys(this.imageUrls).length; },
    load(callback) {
        if (this.totalAssets === 0) { callback(); return; }
        for (const key in this.imageUrls) {
            const img = new Image();
            img.src = this.imageUrls[key];
            img.onload = () => { this.loadedAssets++; if (this.loadedAssets === this.totalAssets) callback(); };
            this.images[key] = img;
        }
    },
};

// --- Audio Synthesis ---
const audio = {
    audioContext: null, bgmOscillator: null, bgmGain: null, bgmTimer: null,
    init() { try { this.audioContext = new (window.AudioContext || window.webkitAudioContext)(); } catch(e) { console.error('Web Audio API is not supported'); } },
    resume() { if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume(); },
    playShoot() { if (!this.audioContext) return; const o = this.audioContext.createOscillator(), g = this.audioContext.createGain(); o.connect(g); g.connect(this.audioContext.destination); o.type = 'square'; o.frequency.setValueAtTime(880, this.audioContext.currentTime); g.gain.setValueAtTime(0.1, this.audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + 0.1); o.start(); o.stop(this.audioContext.currentTime + 0.1); },
    playExplosion(isBoss = false) { if (!this.audioContext) return; const buf = this.audioContext.createBuffer(1, this.audioContext.sampleRate * (isBoss ? 0.8 : 0.2), this.audioContext.sampleRate); const out = buf.getChannelData(0); for (let i = 0; i < buf.length; i++) out[i] = Math.random() * 2 - 1; const n = this.audioContext.createBufferSource(); n.buffer = buf; const g = this.audioContext.createGain(); g.gain.setValueAtTime(isBoss ? 0.5 : 0.2, this.audioContext.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, this.audioContext.currentTime + (isBoss ? 0.8 : 0.2)); n.connect(g); g.connect(this.audioContext.destination); n.start(); n.stop(this.audioContext.currentTime + (isBoss ? 0.8 : 0.2)); },
    playBgm() { if (!this.audioContext) return; this.stopBgm(); const notes = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25]; let i = 0; this.bgmOscillator = this.audioContext.createOscillator(); this.bgmGain = this.audioContext.createGain(); this.bgmOscillator.connect(this.bgmGain); this.bgmGain.connect(this.audioContext.destination); this.bgmOscillator.type = 'triangle'; this.bgmGain.gain.value = 0.05; this.bgmOscillator.start(); const next = () => { this.bgmOscillator.frequency.setValueAtTime(notes[i++ % notes.length], this.audioContext.currentTime); this.bgmTimer = setTimeout(next, 200); }; next(); },
    stopBgm() { if (this.bgmTimer) clearTimeout(this.bgmTimer); if (this.bgmOscillator) { this.bgmOscillator.stop(); this.bgmOscillator = null; } },
};

// --- High Score --- 
function loadHighScore() { highScore = localStorage.getItem('starforce_highscore') || 0; }
function saveHighScore() { if (score > highScore) { highScore = score; localStorage.setItem('starforce_highscore', highScore); } }

// --- Core Game Logic & Drawing Functions ---
function createStars() { if (stars.length === 0) for (let i = 0; i < 100; i++) stars.push({ x: Math.random() * canvasWidth, y: Math.random() * canvasHeight, size: Math.random() * 2 + 1, speed: Math.random() * 1 + 0.5 }); }
function drawStars() { ctx.fillStyle = 'white'; stars.forEach(star => ctx.fillRect(star.x, star.y, star.size, star.size)); }
function createExplosion(x, y, color, count = 20) { for (let i = 0; i < count; i++) particles.push({ x, y, color, vx: (Math.random() - 0.5) * 4, vy: (Math.random() - 0.5) * 4, lifespan: 30 }); }

function handleInput() {
    if (isGameOver) { if (keys['r'] || keys['R']) resetGame(); return; }
    if (keys['ArrowLeft'] || keys['a']) player.x -= player.speed;
    if (keys['ArrowRight'] || keys['d']) player.x += player.speed;
    if (keys[' '] && player.fireCooldown <= 0) {
        audio.playShoot();
        bullets.push({ x: player.x + player.width / 2 - 2.5, y: player.y, width: 5, height: 10 });
        player.fireCooldown = player.powerUpTimer > 0 ? 10 : 20;
    }
}

function update() {
    if (isGameOver || isStageClearing) return;
    handleInput();

    // Cooldowns & Timers
    if (player.fireCooldown > 0) player.fireCooldown--;
    if (player.powerUpTimer > 0) player.powerUpTimer--;
    if (player.invincibilityTimer > 0) player.invincibilityTimer--; else player.invincible = false;

    // Player & Stars
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvasWidth) player.x = canvasWidth - player.width;
    stars.forEach(star => { star.y += star.speed; if (star.y > canvasHeight) { star.y = 0; star.x = Math.random() * canvasWidth; } });

    // Update everything else
    updateParticles();
    updateBullets();
    updatePowerUps();

    if (isBossActive) updateBoss();
    else if (isJourneyActive) {
        updateEnemies();
        // Check if enough enemies have been spawned for the journey
        if (journeyEnemySpawnedCount >= maxJourneyEnemies && !bossSpawned) {
            isJourneyActive = false; // End journey
            spawnBoss();
            bossSpawned = true;
        }
    } else if (!bossSpawned) {
        // Fallback for stage 1 or if journey is not active but boss hasn't spawned yet
        updateEnemies();
        if (score >= 200 * stage) {
            spawnBoss();
            bossSpawned = true;
        }
    }
    handleCollisions();
}

function updateParticles() { for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.x += p.vx; p.y += p.vy; p.lifespan--; if (p.lifespan <= 0) particles.splice(i, 1); } }
function updateBullets() { for (let i = bullets.length - 1; i >= 0; i--) { bullets[i].y -= 7; if (bullets[i].y < 0) bullets.splice(i, 1); } }
function updatePowerUps() { for (let i = powerUps.length - 1; i >= 0; i--) { const p = powerUps[i]; p.y += 2; if (p.y > canvasHeight) powerUps.splice(i, 1); if (player.x < p.x + p.width && player.x + player.width > p.x && player.y < p.y + p.height && player.y + player.height > p.y) { player.powerUpTimer = 600; powerUps.splice(i, 1); } } }

function updateEnemies() {
    enemySpawnTimer++;
    const spawnRate = Math.max(20, 100 - stage * 10);
    if (enemySpawnTimer % spawnRate === 0) {
        enemies.push({ x: Math.random() * (canvasWidth - 50), y: -50, width: 50, height: 50, type: 'enemy1', speed: 2 + stage * 0.2 });
        if (isJourneyActive) journeyEnemySpawnedCount++;
    }
    if (enemySpawnTimer % (spawnRate * 2.5) === 0) {
        enemies.push({ x: Math.random() * (canvasWidth - 50), y: -50, width: 50, height: 50, type: 'enemy2', speed: 1 + stage * 0.1, angle: 0 });
        if (isJourneyActive) journeyEnemySpawnedCount++;
    }
    for (let i = enemies.length - 1; i >= 0; i--) {
        const e = enemies[i];
        if (e.type === 'enemy1') e.y += e.speed;
        else { e.y += e.speed; e.x += Math.sin(e.angle) * 2; e.angle += 0.1; }
        if (e.y > canvasHeight) enemies.splice(i, 1);
    }
}

function spawnBoss() {
    isBossActive = true;
    enemies.length = 0; // Clear regular enemies
    boss.x = canvasWidth / 2 - 75; boss.y = -150; boss.width = 150; boss.height = 100;
    boss.speed = 2; boss.dx = 1; boss.hp = 100 * stage; boss.maxHp = 100 * stage;
    boss.fireCooldown = 0; boss.bullets = [];
}

function updateBoss() {
    // Movement
    if (boss.y < 50) boss.y += 1;
    boss.x += boss.speed * boss.dx;
    if (boss.x <= 0 || boss.x + boss.width >= canvasWidth) boss.dx *= -1;

    // Shooting
    boss.fireCooldown--;
    if (boss.fireCooldown <= 0) {
        boss.bullets.push({ x: boss.x + boss.width / 2 - 5, y: boss.y + boss.height, width: 10, height: 20, speed: 4 });
        boss.fireCooldown = Math.max(30, 100 - stage * 10);
    }
    for (let i = boss.bullets.length - 1; i >= 0; i--) {
        const b = boss.bullets[i];
        b.y += b.speed;
        if (b.y > canvasHeight) boss.bullets.splice(i, 1);
    }
}

function handleCollisions() {
    // Player Bullets vs Enemies
    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            const b = bullets[i], e = enemies[j];
            if (b && e && b.x < e.x + e.width && b.x + b.width > e.x && b.y < e.y + e.height && b.y + b.height > e.y) {
                audio.playExplosion(); createExplosion(e.x + e.width / 2, e.y + e.height / 2, 'red');
                if (Math.random() < 0.1) powerUps.push({ x: e.x, y: e.y, width: 20, height: 20 });
                bullets.splice(i, 1); enemies.splice(j, 1); score += 10;
                break;
            }
        }
    }
    // Player vs Enemies & Boss Bullets
    if (!player.invincible) {
        const allHostiles = [...enemies, ...boss.bullets];
        for (const hostile of allHostiles) {
            if (player.x < hostile.x + hostile.width && player.x + player.width > hostile.x && player.y < hostile.y + hostile.height && player.y + player.height > hostile.y) {
                handlePlayerHit();
                break;
            }
        }
        // Player vs Boss body
        if (isBossActive && player.x < boss.x + boss.width && player.x + player.width > boss.x && player.y < boss.y + boss.height && player.y + player.height > boss.y) {
            handlePlayerHit();
        }
    }
    // Player Bullets vs Boss
    if (isBossActive) {
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            if (b.x < boss.x + boss.width && b.x + b.width > boss.x && b.y < boss.y + boss.height && b.y + b.height > boss.y) {
                boss.hp -= 5;
                bullets.splice(i, 1);
                createExplosion(b.x, b.y, 'orange', 5);
                if (boss.hp <= 0) clearStage();
                break;
            }
        }
    }
}

function handlePlayerHit() {
    player.lives--;
    audio.playExplosion();
    createExplosion(player.x + player.width / 2, player.y + player.height / 2, 'white');
    if (player.lives <= 0) gameOver();
    else { player.invincible = true; player.invincibilityTimer = 120; }
}

function draw() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    drawStars();

    if (!player.invincible || Math.floor(player.invincibilityTimer / 10) % 2 === 0) ctx.drawImage(assetManager.images.player, player.x, player.y, player.width, player.height);

    ctx.fillStyle = 'yellow'; bullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));
    enemies.forEach(e => { if (assetManager.images[e.type]) ctx.drawImage(assetManager.images[e.type], e.x, e.y, e.width, e.height); });
    ctx.fillStyle = 'lime'; ctx.font = 'bold 20px Arial'; powerUps.forEach(p => ctx.fillText('P', p.x, p.y));
    particles.forEach(p => { ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 2, 2); });

    if (isBossActive) {
        ctx.fillStyle = 'purple'; ctx.fillRect(boss.x, boss.y, boss.width, boss.height);
        ctx.fillStyle = 'red'; boss.bullets.forEach(b => ctx.fillRect(b.x, b.y, b.width, b.height));
        // Boss HP Bar
        ctx.fillStyle = '#555'; ctx.fillRect(canvasWidth / 4, 10, canvasWidth / 2, 20);
        ctx.fillStyle = 'red'; ctx.fillRect(canvasWidth / 4, 10, (canvasWidth / 2) * (boss.hp / boss.maxHp), 20);
    }

    drawUI();

    if (isStageClearing) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = 'white'; ctx.font = '50px Arial'; ctx.textAlign = 'center';
        ctx.fillText(`STAGE ${stage} CLEAR`, canvasWidth / 2, canvasHeight / 2);
    }
    if (isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        ctx.fillStyle = 'white'; ctx.font = '50px Arial'; ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', canvasWidth / 2, canvasHeight / 2);
        ctx.font = '20px Arial'; ctx.fillText('Press R to Restart', canvasWidth / 2, canvasHeight / 2 + 40);
    }
}

function drawUI() {
    ctx.fillStyle = 'white'; ctx.font = '20px Arial'; ctx.textAlign = 'left';
    ctx.fillText(`Score: ${score}`, 10, 30);
    ctx.fillText(`Lives: ${player.lives}`, 10, 60);
    ctx.fillText(`Stage: ${stage}`, canvasWidth - 100, 60);
    ctx.textAlign = 'center';
    ctx.fillText(`Hi-Score: ${highScore}`, canvasWidth / 2, 30);
}

function gameOver() { if (!isGameOver) { isGameOver = true; audio.stopBgm(); saveHighScore(); } }

function clearStage() {
    isBossActive = false;
    isStageClearing = true;
    score += 1000 * stage; // Stage clear bonus
    audio.playExplosion(true);
    createExplosion(boss.x + boss.width / 2, boss.y + boss.height / 2, 'purple', 200);
    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId); // Stop the loop
        animationFrameId = null;
    }
    setTimeout(nextStage, 3000); // Go to next stage after 3 seconds
}

function nextStage() {
    stage++;
    isStageClearing = false;
    // Reset positions but keep lives and score
    player.x = canvasWidth / 2 - 25; player.y = canvasHeight - 60;
    bullets.length = 0; enemies.length = 0; particles.length = 0; powerUps.length = 0; boss.bullets = [];
    isJourneyActive = true; // Activate journey for the new stage
    journeyEnemySpawnedCount = 0;
    bossSpawned = false;
    // Restart the game loop after resetting state
    gameLoop();
}

function resetGame() {
    stage = 1;
    score = 0;
    player.lives = 3; player.invincible = false; player.invincibilityTimer = 0; player.powerUpTimer = 0; player.fireCooldown = 0;
    player.x = canvasWidth / 2 - 25; player.y = canvasHeight - 60;
    bullets.length = 0; enemies.length = 0; particles.length = 0; powerUps.length = 0; boss.bullets = [];
    isGameOver = false; isBossActive = false; isStageClearing = false;
    isJourneyActive = true; // Start with journey active
    journeyEnemySpawnedCount = 0;
    bossSpawned = false;
    audio.playBgm();
    gameLoop();
}

function gameLoop() {
    handleInput(); // Always process input

    if (isGameOver || isStageClearing) {
        draw();
        return; // Stop updating game logic
    }

    update();
    draw();
    animationFrameId = requestAnimationFrame(gameLoop); // Schedule next frame
}

// --- Game Initialization ---
function drawStartScreen() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    createStars(); drawStars();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)'; ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = 'white'; ctx.font = '50px Arial'; ctx.textAlign = 'center';
    ctx.fillText('STAR FORCE', canvasWidth / 2, canvasHeight / 2 - 60);
    ctx.font = '20px Arial';
    ctx.fillText(`HI-SCORE: ${highScore}`, canvasWidth / 2, canvasHeight / 2 - 20);
    ctx.fillText('Click to Start', canvasWidth / 2, canvasHeight / 2 + 40);
}

function main() {
    document.addEventListener('keydown', e => {
        keys[e.key] = true;
        // Handle restart on game over
        if (isGameOver && (e.key === 'r' || e.key === 'R')) {
            startGame();
        }
    });
    document.addEventListener('keyup', e => keys[e.key] = false);
    loadHighScore();
    audio.init();
    assetManager.init();
    drawStartScreen();
    assetManager.load(() => {
        console.log('All images loaded!');
        canvas.addEventListener('click', startGame, { once: true });
    });
}

function startGame() {
    audio.resume();
    resetGame();
    // Only start the game loop if it's not already running
    if (!animationFrameId) {
        animationFrameId = requestAnimationFrame(gameLoop);
    }
}

main();