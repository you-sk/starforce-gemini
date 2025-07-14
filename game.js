const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// Game settings
const canvasWidth = canvas.width;
const canvasHeight = canvas.height;

// --- Asset Loading ---
const assetManager = {
    images: {},
    sounds: {},
    imageUrls: {
        player: 'assets/player.svg',
        enemy1: 'assets/enemy1.svg',
        enemy2: 'assets/enemy2.svg',
    },
    soundUrls: {
        bgm: 'assets/bgm.wav',
        shoot: 'assets/shoot.wav',
        explosion: 'assets/explosion.wav',
    },
    totalAssets: 0,
    loadedAssets: 0,
    audioContext: null,
    bgmSource: null,

    init() {
        this.totalAssets = Object.keys(this.imageUrls).length + Object.keys(this.soundUrls).length;
        try {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.error('Web Audio API is not supported in this browser');
        }
    },

    load(callback) {
        // Load Images
        for (const key in this.imageUrls) {
            const img = new Image();
            img.src = this.imageUrls[key];
            img.onload = () => this.assetLoaded(callback);
            this.images[key] = img;
        }

        // Load Sounds
        if (!this.audioContext) {
            // If web audio is not supported, just count sound files as loaded.
            this.loadedAssets += Object.keys(this.soundUrls).length;
            if (this.loadedAssets === this.totalAssets) {
                callback();
            }
            return;
        }

        for (const key in this.soundUrls) {
            fetch(this.soundUrls[key])
                .then(response => response.arrayBuffer())
                .then(arrayBuffer => this.audioContext.decodeAudioData(arrayBuffer))
                .then(audioBuffer => {
                    this.sounds[key] = audioBuffer;
                    this.assetLoaded(callback);
                })
                .catch(error => {
                    console.error(`Error loading sound ${key}:`, error);
                    this.assetLoaded(callback); // Still count as loaded to not hang the game
                });
        }
    },

    assetLoaded(callback) {
        this.loadedAssets++;
        if (this.loadedAssets === this.totalAssets) {
            callback();
        }
    },

    playSound(key, loop = false) {
        if (!this.audioContext || !this.sounds[key]) return null;
        const source = this.audioContext.createBufferSource();
        source.buffer = this.sounds[key];
        source.connect(this.audioContext.destination);
        source.loop = loop;
        source.start(0);
        return source;
    },

    playBgm() {
        if (this.bgmSource) {
            this.bgmSource.stop();
        }
        this.bgmSource = this.playSound('bgm', true);
    },

    stopBgm() {
        if (this.bgmSource) {
            this.bgmSource.stop();
            this.bgmSource = null; // Prevent re-stopping
        }
    }
};

// --- Game Objects ---
const player = {
    x: canvasWidth / 2 - 25,
    y: canvasHeight - 60,
    width: 50,
    height: 50,
    speed: 5,
    dx: 0
};

const bullets = [];
const bulletSpeed = 7;

const enemies = [];
const enemyWidth = 50;
const enemyHeight = 50;
let enemySpawnTimer = 0;

const stars = [];

// --- Game Logic ---
function createStars() {
    for (let i = 0; i < 100; i++) {
        stars.push({
            x: Math.random() * canvasWidth,
            y: Math.random() * canvasHeight,
            size: Math.random() * 2 + 1,
            speed: Math.random() * 1 + 0.5
        });
    }
}

function drawStars() {
    ctx.fillStyle = 'white';
    stars.forEach(star => {
        ctx.fillRect(star.x, star.y, star.size, star.size);
    });
}

function updateStars() {
    stars.forEach(star => {
        star.y += star.speed;
        if (star.y > canvasHeight) {
            star.y = 0;
            star.x = Math.random() * canvasWidth;
        }
    });
}

function drawPlayer() {
    ctx.drawImage(assetManager.images.player, player.x, player.y, player.width, player.height);
}

function movePlayer() {
    player.x += player.dx;
    if (player.x < 0) player.x = 0;
    if (player.x + player.width > canvasWidth) player.x = canvasWidth - player.width;
}

function drawBullets() {
    ctx.fillStyle = 'yellow';
    bullets.forEach(bullet => {
        ctx.fillRect(bullet.x, bullet.y, bullet.width, bullet.height);
    });
}

function moveBullets() {
    for (let i = bullets.length - 1; i >= 0; i--) {
        bullets[i].y -= bulletSpeed;
        if (bullets[i].y + bullets[i].height < 0) {
            bullets.splice(i, 1);
        }
    }
}

function spawnEnemies() {
    enemySpawnTimer++;
    if (enemySpawnTimer % 100 === 0) {
        const x = Math.random() * (canvasWidth - enemyWidth);
        enemies.push({ x, y: -enemyHeight, width: enemyWidth, height: enemyHeight, type: 'enemy1', speed: 2 });
    }
    if (enemySpawnTimer % 250 === 0) {
        const x = Math.random() * (canvasWidth - enemyWidth);
        enemies.push({ x, y: -enemyHeight, width: enemyWidth, height: enemyHeight, type: 'enemy2', speed: 1, angle: 0 });
    }
}

function drawEnemies() {
    enemies.forEach(enemy => {
        if(assetManager.images[enemy.type]){
            ctx.drawImage(assetManager.images[enemy.type], enemy.x, enemy.y, enemy.width, enemy.height);
        }
    });
}

function moveEnemies() {
    for (let i = enemies.length - 1; i >= 0; i--) {
        const enemy = enemies[i];
        if (enemy.type === 'enemy1') {
            enemy.y += enemy.speed;
        } else if (enemy.type === 'enemy2') {
            enemy.y += enemy.speed;
            enemy.x += Math.sin(enemy.angle) * 2;
            enemy.angle += 0.1;
        }

        if (enemy.y > canvasHeight) {
            enemies.splice(i, 1);
        }
    }
}

let score = 0;
function drawScore() {
    ctx.fillStyle = 'white';
    ctx.font = '20px Arial';
    ctx.fillText(`Score: ${score}`, 10, 30);
}

function updateScore(points) {
    score += points;
}

function detectCollisions() {
    // Bullets vs Enemies
    for (let i = bullets.length - 1; i >= 0; i--) {
        for (let j = enemies.length - 1; j >= 0; j--) {
            const bullet = bullets[i];
            const enemy = enemies[j];
            if (bullet && enemy &&
                bullet.x < enemy.x + enemy.width &&
                bullet.x + bullet.width > enemy.x &&
                bullet.y < enemy.y + enemy.height &&
                bullet.y + bullet.height > enemy.y) {

                assetManager.playSound('explosion');
                bullets.splice(i, 1);
                enemies.splice(j, 1);
                updateScore(10);
                break; // Move to next bullet
            }
        }
    }

    // Player vs Enemies
    enemies.forEach(enemy => {
        if (player.x < enemy.x + enemy.width &&
            player.x + player.width > enemy.x &&
            player.y < enemy.y + enemy.height &&
            player.y + player.height > enemy.y) {
            gameOver();
        }
    });
}

let isGameOver = false;
function gameOver() {
    if (isGameOver) return;
    isGameOver = true;
    assetManager.stopBgm();
}

function drawGameOver() {
    if (!isGameOver) return;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = 'white';
    ctx.font = '50px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', canvasWidth / 2, canvasHeight / 2);
    ctx.font = '20px Arial';
    ctx.fillText('Press R to Restart', canvasWidth / 2, canvasHeight / 2 + 40);
}

function resetGame() {
    player.x = canvasWidth / 2 - 25;
    player.y = canvasHeight - 60;
    bullets.length = 0;
    enemies.length = 0;
    score = 0;
    isGameOver = false;
    assetManager.playBgm();
    gameLoop();
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
}

function update() {
    if (isGameOver) return;
    movePlayer();
    moveBullets();
    spawnEnemies();
    moveEnemies();
    updateStars();
    detectCollisions();
}

function draw() {
    clearCanvas();
    drawStars();
    drawPlayer();
    drawBullets();
    drawEnemies();
    drawScore();
    drawGameOver();
}

function gameLoop() {
    if (isGameOver) {
        drawGameOver();
        return;
    }
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// --- Input Handling ---
function keyDown(e) {
    if (isGameOver && (e.key === 'r' || e.key === 'R')) {
        resetGame();
        return;
    }
    if (isGameOver) return;

    if (e.key === 'ArrowRight' || e.key === 'Right') {
        player.dx = player.speed;
    } else if (e.key === 'ArrowLeft' || e.key === 'Left') {
        player.dx = -player.speed;
    } else if (e.key === ' ' || e.key === 'Spacebar') {
        assetManager.playSound('shoot');
        bullets.push({
            x: player.x + player.width / 2 - 2.5,
            y: player.y,
            width: 5,
            height: 10,
        });
    }
}

function keyUp(e) {
    if (e.key === 'ArrowRight' || e.key === 'Right' || e.key === 'ArrowLeft' || e.key === 'Left') {
        player.dx = 0;
    }
}

// --- Game Initialization ---
function drawStartScreen() {
    clearCanvas();
    createStars(); // Draw stars on the start screen as well
    drawStars();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    ctx.fillStyle = 'white';
    ctx.font = '50px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('STAR FORCE', canvasWidth / 2, canvasHeight / 2 - 40);
    ctx.font = '20px Arial';
    ctx.fillText('Click to Start', canvasWidth / 2, canvasHeight / 2 + 20);
}

function main() {
    assetManager.init();
    drawStartScreen(); // Show start screen immediately
    assetManager.load(() => {
        console.log('All assets loaded!');
        // Replace the start screen with one that is ready to start
        drawStartScreen(); 
        canvas.addEventListener('click', startGame, { once: true });
    });
}

function startGame() {
    // Resume audio context on user gesture
    if (assetManager.audioContext && assetManager.audioContext.state === 'suspended') {
        assetManager.audioContext.resume();
    }
    assetManager.playBgm();
    gameLoop();
}

document.addEventListener('keydown', keyDown);
document.addEventListener('keyup', keyUp);

main();