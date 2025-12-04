const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight * 0.6;

// Game variables
let player, obstacles, powerUps, speed, score, highScore, gameOver;
let gravity = 0.6;

// Load high score
highScore = localStorage.getItem("runnerHighScore") || 0;
document.getElementById("highScore").textContent = "High Score: " + highScore;

// Player object
class Player {
    constructor() {
        this.w = 50;
        this.h = 50;
        this.x = 100;
        this.y = canvas.height - this.h - 40;
        this.dy = 0;
        this.jumpForce = 12;
        this.onGround = true;
        this.shield = false;
    }

    draw() {
        ctx.fillStyle = this.shield ? "rgba(0,200,255,0.7)" : "#ff6a00";
        ctx.fillRect(this.x, this.y, this.w, this.h);
    }

    update() {
        this.y += this.dy;

        // Gravity
        if (this.y + this.h < canvas.height - 40) {
            this.dy += gravity;
            this.onGround = false;
        } else {
            this.y = canvas.height - this.h - 40;
            this.dy = 0;
            this.onGround = true;
        }

        this.draw();
    }

    jump() {
        if (this.onGround) {
            this.dy = -this.jumpForce;
        }
    }
}

// Obstacle class
class Obstacle {
    constructor() {
        this.size = 40;
        this.x = canvas.width + this.size;
        this.y = canvas.height - this.size - 40;
        this.speed = speed;
    }

    draw() {
        ctx.fillStyle = "#333";
        ctx.fillRect(this.x, this.y, this.size, this.size);
    }

    update() {
        this.x -= this.speed;
        this.draw();
    }
}

// Power-up class
class PowerUp {
    constructor() {
        this.size = 30;
        this.x = canvas.width;
        this.y = canvas.height - this.size - 120;
        this.speed = speed;
    }

    draw() {
        ctx.fillStyle = "#00ccff";
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size / 2, 0, Math.PI * 2);
        ctx.fill();
    }

    update() {
        this.x -= this.speed;
        this.draw();
    }
}

// Start game
function startGame() {
    player = new Player();
    obstacles = [];
    powerUps = [];
    speed = 5;
    score = 0;
    gameOver = false;

    document.getElementById("startBtn").style.display = "none";

    animate();
}

// Collision detection
function collide(a, b) {
    return (
        a.x < b.x + b.size &&
        a.x + a.w > b.x &&
        a.y < b.y + b.size &&
        a.y + a.h > b.y
    );
}

// Game loop
function animate() {
    if (gameOver) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Speed slowly increases
    speed += 0.001;

    player.update();

    // Spawn obstacles
    if (Math.random() < 0.02) {
        obstacles.push(new Obstacle());
    }

    // Spawn power-ups
    if (Math.random() < 0.003) {
        powerUps.push(new PowerUp());
    }

    // Update obstacles
    obstacles.forEach((ob, i) => {
        ob.speed = speed;
        ob.update();

        if (collide(player, ob)) {
            if (player.shield) {
                player.shield = false;
                obstacles.splice(i, 1);
            } else {
                return endGame();
            }
        }

        if (ob.x + ob.size < 0) obstacles.splice(i, 1);
    });

    // Update power-ups
    powerUps.forEach((p, i) => {
        p.speed = speed;
        p.update();

        if (collide(player, p)) {
            player.shield = true;
            powerUps.splice(i, 1);
        }

        if (p.x + p.size < 0) powerUps.splice(i, 1);
    });

    // Score
    score += 1;
    document.getElementById("score").textContent = "Score: " + score;

    requestAnimationFrame(animate);
}

// End game
function endGame() {
    gameOver = true;

    if (score > highScore) {
        highScore = score;
        localStorage.setItem("runnerHighScore", highScore);
    }

    document.getElementById("highScore").textContent =
        "High Score: " + highScore;

    document.getElementById("startBtn").style.display = "inline-block";
}

// Controls
window.addEventListener("keydown", e => {
    if (e.code === "Space" || e.code === "ArrowUp") {
        player.jump();
    }
});

// Touch controls
canvas.addEventListener("touchstart", () => {
    player.jump();
});

document.getElementById("startBtn").addEventListener("click", startGame);
