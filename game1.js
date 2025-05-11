const canvas = document.getElementById('gameCanvas');
const gl = canvas.getContext('webgl');
// Start the background music when the page loads
if (!gl) {
    alert("WebGL not supported!");
    throw new Error("WebGL not supported!");
}

// Vertex shader source
const vertexShader = `
    attribute vec3 a_position;
    uniform mat4 u_modelViewMatrix;
    uniform mat4 u_projectionMatrix;
    void main() {
        gl_Position = u_projectionMatrix * u_modelViewMatrix * vec4(a_position, 1.0);
    }
`;

// Fragment shader source
const fragmentShader = `
    precision mediump float;
    uniform vec4 u_color;
    void main() {
        gl_FragColor = u_color;
    }
`;


// Initialize shaders
function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}



// Initialize program
function createProgram(gl, vertexShaderSource, fragmentShaderSource) {
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);

    if (!vertexShader || !fragmentShader) {
        console.error("Failed to compile shaders.");
        return null;
    }

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program link error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }

    return program;
}


const program = createProgram(gl, vertexShader, fragmentShader);

// Look up locations
const positionLocation = gl.getAttribLocation(program, "a_position");
const colorLocation = gl.getUniformLocation(program, "u_color");
const modelViewMatrixLocation = gl.getUniformLocation(program, "u_modelViewMatrix");
const projectionMatrixLocation = gl.getUniformLocation(program, "u_projectionMatrix");

// Buffers
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

// Projection Matrix
const projectionMatrix = mat4.create();
mat4.perspective(projectionMatrix, Math.PI / 4, canvas.width / canvas.height, 0.1, 100);

// Adjust Camera Angle
const cameraMatrix = mat4.create();
mat4.translate(cameraMatrix, cameraMatrix, [0, -2, -15]);
mat4.rotateX(cameraMatrix, cameraMatrix, Math.PI / 8);
mat4.multiply(projectionMatrix, projectionMatrix, cameraMatrix);

// Game variables
const player = { x: 0, y: -10, z: -15, width: 1, height: 0.5, speed: 0.5 };
const bullets = [];
const enemies = []
const descendingEnemies = [];
const enemyBullets = [];
let enemySpeed = 0.05;
const enemyBulletSpeed = 0.2;
let direction = 1;
let score = 0;
let level = 1;
let time = 0;
let lastBulletTime = 0;
const bulletCooldown = 200;
let lastAppearanceChange = 0;
const appearanceCooldown = 500; // Milliseconds between appearance changes
let rows = 3;
const cols = 6;
let specialMode = false;
// Create enemies
function spawnEnemies() {
    enemies.length = 0; // Clear the array instead of reassigning it
    const spacingX = 3;
    const spacingY = 2;

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            enemies.push({
                x: col * spacingX - (cols - 1) * spacingX / 2,
                y: row * spacingY + 2,
                z: -20,
                width: 1.5,
                height: 1,
                alive: true,
                appearance: 0,
                sinAmplitude: 0,
            });
        }
    }
}



// Render function for objects
function renderObject(vertices, modelViewMatrix, color) {
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);
    gl.uniform4fv(colorLocation, color);

    gl.drawArrays(gl.TRIANGLES, 0, vertices.length / 3);
}

function createEnemyShape(appearance) {
    if (appearance === 0) {
        // Cube: six faces with different colors
        return {
            vertices: [
                // Front face
                -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,
                 0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
                // Back face
                -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,
                 0.5, -0.5, -0.5,   0.5,  0.5, -0.5,  -0.5,  0.5, -0.5,
                // Left face
                -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,  -0.5, -0.5,  0.5,
                -0.5,  0.5, -0.5,  -0.5,  0.5,  0.5,  -0.5, -0.5,  0.5,
                // Right face
                 0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5, -0.5,  0.5,
                 0.5,  0.5, -0.5,   0.5,  0.5,  0.5,   0.5, -0.5,  0.5,
                // Top face
                -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,  -0.5,  0.5,  0.5,
                 0.5,  0.5, -0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
                // Bottom face
                -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,
                 0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
            ],
            colors: [
                [1, 0, 0, 1], // Front face (red)
                [0, 1, 0, 1], // Back face (green)
                [0, 0, 1, 1], // Left face (blue)
                [1, 1, 0, 1], // Right face (yellow)
                [0, 1, 1, 1], // Top face (cyan)
                [1, 0, 1, 1], // Bottom face (magenta)
            ],
        };
    } else {
        // Sphere: generated dynamically
        const vertices = [];
        const latitudeBands = 16;
        const longitudeBands = 16;
        const radius = 0.5;

        for (let lat = 0; lat <= latitudeBands; lat++) {
            const theta = (lat * Math.PI) / latitudeBands;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let lon = 0; lon <= longitudeBands; lon++) {
                const phi = (lon * 2 * Math.PI) / longitudeBands;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);

                const x = cosPhi * sinTheta;
                const y = cosTheta;
                const z = sinPhi * sinTheta;

                vertices.push(radius * x, radius * y, radius * z);
            }
        }
        return { vertices, colors: [[0.5, 0.5, 1, 1]] }; // Light blue for the sphere
    }
}


function createPlayerShape() {
    return {
        base: [
            // Square base (two triangles)
            -1, 0, -1,   1, 0, -1,   -1, 0, 1,
             1, 0, -1,   1, 0, 1,    -1, 0, 1,
        ],
        faces: [
            // Front face
            [0, 2, 0,  -1, 0, -1,   1, 0, -1],
            // Right face
            [0, 2, 0,   1, 0, -1,   1, 0,  1],
            // Back face
            [0, 2, 0,   1, 0,  1,  -1, 0,  1],
            // Left face
            [0, 2, 0,  -1, 0,  1,  -1, 0, -1],
        ],
    };
}


function createBullet() {
    const arrowHead = [
        // Arrowhead (triangular prism)
        // Front face
        0, 0.2, 0.2,   -0.1, 0, 0.1,   0.1, 0, 0.1,
        // Right face
        0, 0.2, 0.2,    0.1, 0, 0.1,   0.1, 0, -0.1,
        // Left face
        0, 0.2, 0.2,   -0.1, 0, 0.1,  -0.1, 0, -0.1,
        // Bottom face
        -0.1, 0, 0.1,   0.1, 0, 0.1,   0.1, 0, -0.1,
        -0.1, 0, 0.1,   0.1, 0, -0.1,  -0.1, 0, -0.1,
    ];

    const arrowShaft = [
        // Shaft (rectangular prism)
        // Front face
        -0.05, 0, 0.05,  0.05, 0, 0.05,  -0.05, -0.4, 0.05,
         0.05, 0, 0.05,   0.05, -0.4, 0.05,  -0.05, -0.4, 0.05,
        // Back face
        -0.05, 0, -0.05,  0.05, 0, -0.05,  -0.05, -0.4, -0.05,
         0.05, 0, -0.05,   0.05, -0.4, -0.05,  -0.05, -0.4, -0.05,
        // Top face
        -0.05, 0, 0.05,   0.05, 0, 0.05,   0.05, 0, -0.05,
        -0.05, 0, 0.05,   0.05, 0, -0.05,  -0.05, 0, -0.05,
        // Bottom face
        -0.05, -0.4, 0.05,   0.05, -0.4, 0.05,   0.05, -0.4, -0.05,
        -0.05, -0.4, 0.05,   0.05, -0.4, -0.05,  -0.05, -0.4, -0.05,
        // Left face
        -0.05, 0, 0.05,   -0.05, 0, -0.05,   -0.05, -0.4, -0.05,
        -0.05, 0, 0.05,   -0.05, -0.4, -0.05,  -0.05, -0.4, 0.05,
        // Right face
        0.05, 0, 0.05,    0.05, 0, -0.05,    0.05, -0.4, -0.05,
        0.05, 0, 0.05,    0.05, -0.4, -0.05,  0.05, -0.4, 0.05,
    ];

    return arrowHead.concat(arrowShaft);
}


// Render function for objects
function renderObject(vertices, modelViewMatrix, color) {
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.STATIC_DRAW);

    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

    gl.uniformMatrix4fv(modelViewMatrixLocation, false, modelViewMatrix);
    gl.uniform4fv(colorLocation, color);

    gl.drawArrays(gl.TRIANGLE_FAN, 0, vertices.length / 3);
}

// Render function for bullets
function renderBullet(bullet, color) {
    const bulletVertices = createBullet(bullet.radius, bullet.height, 16, color);
    const bulletModelViewMatrix = mat4.create();
    mat4.translate(bulletModelViewMatrix, bulletModelViewMatrix, [bullet.x, bullet.y, bullet.z]);
    renderObject(bulletVertices, bulletModelViewMatrix, color);
}

function fireAlienBullets(enemy) {
    const baseSpeed = 0.4; // Speed of bullets (greater than enemy speed)
    const baseSlope = -(Math.sin(time) * enemy.sinAmplitude); // Negative of alien's trajectory slope

    for (let i = -1; i <= 1; i++) {
        enemyBullets.push({
            x: enemy.x,
            y: enemy.y,
            z: enemy.z,
            speed: baseSpeed,
            slope: baseSlope + i * 0.1, // Spread bullets slightly
        });
    }
}



// Update functions
function updateEnemies() {
    time += 0.03;

    // Change appearance every few milliseconds
    const currentTime = Date.now();
    if (currentTime - lastAppearanceChange > appearanceCooldown) {
        for (const enemy of enemies) {
            if (enemy.alive) {
                enemy.appearance = 1 - enemy.appearance; // Toggle between 0 and 1
            }
        }
        lastAppearanceChange = currentTime;
    }

    // Move enemies left and right
    for (const enemy of enemies) {
        if (enemy.alive && !descendingEnemies.includes(enemy)) {
            enemy.x += direction * enemySpeed;

            // **Check collision with player**
            if (checkCollision(enemy, player)) {
                playCollisionSound();
                alert("Game Over! You collided with an enemy.");
                resetGame();
                return;
            }
        }
    }

    const edgeReached = enemies.some((enemy) => enemy.alive && (enemy.x < -9 || enemy.x > 9));
    if (edgeReached) {
        direction *= -1;
    }

    // Spawn descending enemies
    const descendingProbability = 0.01 + level * 0.005;
    if (descendingEnemies.length < 2 && Math.random() < descendingProbability) {
        const descendingEnemy = enemies.find((enemy) => enemy.alive && !descendingEnemies.includes(enemy));
        if (descendingEnemy) {
            descendingEnemy.sinAmplitude = Math.random() * 0.1 + 0.1; // Random amplitude for sinusoidal motion
            descendingEnemies.push(descendingEnemy);
        }
    }

    // Update descending enemies
    for (let i = descendingEnemies.length - 1; i >= 0; i--) {
        const enemy = descendingEnemies[i];
        if (enemy.alive) {
            enemy.y -= 0.1; // Descend at constant speed
            enemy.x += Math.sin(time) * enemy.sinAmplitude; // Sinusoidal motion

            // Fire bullets when below the lower row
            if (enemy.y < 2 && !enemy.hasFiredBullets) {
                fireAlienBullets(enemy);
                enemy.hasFiredBullets = true; // Prevent repeated firing
            }

            // **Check collision with player**
            if (checkCollision(enemy, player)) {
                playCollisionSound(); // Play the collision sound
                alert(`Game Over!You collided with an enemy.`);
                resetGame();
                
            }

            // Remove enemy if it goes out of bounds
            if (enemy.y < -10.5) {
                enemy.alive = false; // Mark enemy as dead
                descendingEnemies.splice(i, 1); // Remove from descending list
            }
        }
    }

    if (enemies.every(enemy => !enemy.alive)) {
        level++;
        rows++; // Increase the number of rows
        enemySpeed += 0.05; // Increase enemy speed
        document.getElementById('level').textContent = level;

        spawnEnemies(); // Spawn new enemies for the next level
    }
}





function updatePlayerBullet() {
    if (playerBullet) {
        playerBullet.y += playerBullet.speed;

        // Remove bullet if off-screen
        if (playerBullet.y > 10) {
            playerBullet = null;
            return;
        }

        // Check collision with enemies
        for (const enemy of enemies) {
            if (enemy.alive && checkCollision(playerBullet, enemy)) {
                enemy.alive = false; // Destroy the enemy
                playerBullet = null; // Remove the bullet
                score += 10;
                document.getElementById('score').textContent = score;

                // Check if all enemies are killed
                if (enemies.every(e => !e.alive)) {
                    // Increase level, rows, and enemy speed
                    level++;
                    rows++; // Add one more row of enemies
                    enemySpeed += 0.05; // Increase horizontal speed
                    document.getElementById('level').textContent = level;

                    // Respawn enemies for the next level
                    spawnEnemies();
                }
                return;
            }
        }
    }
}


function updateEnemyBullets() {
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const bullet = enemyBullets[i];

        // Move bullet along its trajectory
        bullet.x += bullet.slope * bullet.speed;
        bullet.y -= bullet.speed;

        // Remove bullet if off-screen
        if (bullet.y < -10.5) {
            enemyBullets.splice(i, 1);
            continue;
        }

        if (checkCollision(bullet, player)) {
            playCollisionSound(); // Play the collision sound
            alert(`Game Over! Alien projectile hit the player.`);
            resetGame();
            return;
        }
        

        // // Check collision with player
        // if (checkCollision(bullet, player)) {
        //     alert(`Game Over! Alien projectile hit the player.`);
        //     resetGame();
        //     return;
        // }
    }
}


function renderAlienBullets() {
    for (const bullet of enemyBullets) {
        const bulletModelViewMatrix = mat4.create();
        mat4.translate(bulletModelViewMatrix, bulletModelViewMatrix, [bullet.x, bullet.y, bullet.z]);
        renderObject(createBullet(), bulletModelViewMatrix, [1, 0, 0, 1]); // Red bullets
    }
}



// Update functions
let playerBullet = null; // Single active player bullet

function updatePlayer() {
    // Define fixed boundaries for the game screen
    const horizontalLeftBoundary = -10; // Left edge of the screen
    const horizontalRightBoundary = 10; // Right edge of the screen
    const verticalTopBoundary = -5; // Top limit for vertical movement
    const verticalBottomBoundary = -15; // Bottom limit for vertical movement

    // Horizontal movement (common for both modes)
    if (keyState['ArrowLeft'] && player.x > horizontalLeftBoundary) {
        player.x -= player.speed;
    }
    if (keyState['ArrowRight'] && player.x < horizontalRightBoundary) {
        player.x += player.speed;
    }

    // Vertical movement (only in special mode)
    if (specialMode) {
        if (keyState['ArrowUp'] && player.y < verticalTopBoundary) {
            player.y += player.speed;
        }
        if (keyState['ArrowDown'] && player.y > verticalBottomBoundary) {
            player.y -= player.speed;
        }
    } else {
        player.y = -10; // Reset to default vertical position in normal mode
    }

    // Shooting logic remains the same
    if (keyState['Space'] && !playerBullet) {
        playerBullet = { x: player.x, y: player.y + 1, z: player.z, speed: 0.3 };
        playShotSound(); // Play the shooting sound
    }
    
}






function checkCollision(obj1, obj2) {
    if (!obj1 || !obj2) return false;
    return (
        Math.abs(obj1.x - obj2.x) < 0.3 &&
        Math.abs(obj1.y - obj2.y) < 0.3
    );
}

function renderEnemies() {
    for (const enemy of enemies) {
        if (enemy.alive) {
            const enemyModelViewMatrix = mat4.create();
            mat4.translate(enemyModelViewMatrix, enemyModelViewMatrix, [enemy.x, enemy.y, enemy.z]);

            const { vertices, colors } = createEnemyShape(enemy.appearance);

            if (enemy.appearance === 0) {
                // Cube: Render each face with its corresponding color
                for (let i = 0; i < colors.length; i++) {
                    const startIndex = i * 6 * 3; // 6 vertices per face, 3 coordinates per vertex
                    const faceVertices = vertices.slice(startIndex, startIndex + 6 * 3);
                    renderObject(faceVertices, enemyModelViewMatrix, colors[i]);
                }
            } else {
                // Sphere: Render entire object with one color
                renderObject(vertices, enemyModelViewMatrix, colors[0]);
            }
        }
    }
}



function renderPlayer() {
    const playerModelViewMatrix = mat4.create();
    mat4.translate(playerModelViewMatrix, playerModelViewMatrix, [player.x, player.y, player.z]);

    const playerShape = createPlayerShape();

    // Render base
    renderObject(playerShape.base, playerModelViewMatrix, [0.5, 0.5, 0.5, 1]); // Gray for base

    // Render each triangular face with a different color
    const faceColors = [
        [1, 0, 0, 1], // Red
        [0, 1, 0, 1], // Green
        [0, 0, 1, 1], // Blue
        [1, 1, 0, 1], // Yellow
    ];

    for (let i = 0; i < playerShape.faces.length; i++) {
        renderObject(playerShape.faces[i], playerModelViewMatrix, faceColors[i]);
    }
}

function renderPlayerBullet() {
    if (playerBullet) {
        const bulletModelViewMatrix = mat4.create();
        mat4.translate(bulletModelViewMatrix, bulletModelViewMatrix, [playerBullet.x, playerBullet.y, playerBullet.z]);
        renderObject(createBullet(), bulletModelViewMatrix, [1, 1, 0, 1]); // Yellow bullet
    }
}



function render() {
    gl.viewport(0, 0, canvas.width, canvas.height);
    // gl.clearColor(0, 0, 0, 1);
    // gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(program);
    gl.uniformMatrix4fv(projectionMatrixLocation, false, projectionMatrix);

    renderPlayer();
    renderPlayerBullet();
    renderEnemies();
    renderAlienBullets();

    updatePlayer();
    updatePlayerBullet();
    updateEnemies();
    updateEnemyBullets();

    requestAnimationFrame(render);
}



let keyState = {};
window.addEventListener('keydown', (e) => keyState[e.code] = true);
window.addEventListener('keyup', (e) => keyState[e.code] = false);

function resetGame() {
    alert(`Game Over! Your final score is: ${score}`);
    score = 0;
    level = 1;
    rows = 3; // Reset the rows to the starting value
    enemySpeed = 0.1;
    direction = 1;
    bullets.length = 0;
    enemyBullets.length = 0;
    descendingEnemies.length = 0;
    spawnEnemies();
    renderPlayer();
    document.getElementById('score').textContent = score;
    document.getElementById('level').textContent = level;
}

window.addEventListener('keydown', (e) => {
    if (e.key === '!') {
        specialMode = !specialMode; // Toggle special mode

        // Update the canvas background image based on mode
        if (specialMode) {
            canvas.style.backgroundImage = "url('space.webp')"; // Special mode background
        } else {
            canvas.style.backgroundImage = "url('stars.jpg')"; // Default background
        }
    }
});

window.addEventListener('keyup', (e) => keyState[e.code] = false);
// Get references to audio elements
const backgroundMusic = document.getElementById('background-music');
const shotSound = document.getElementById('shot-sound');
const collisionSound = document.getElementById('collision-sound');

// Play background music when the game starts
function startMusic() {
    backgroundMusic.volume = 0.5; // Set volume (0.0 to 1.0)
    backgroundMusic.play();
}

// Play sound effects
function playShotSound() {
    shotSound.currentTime = 0; // Reset to the beginning
    shotSound.volume = 0.7;
    shotSound.play();
}

function playCollisionSound() {
    collisionSound.currentTime = 0; // Reset to the beginning
    collisionSound.volume = 0.7;
    collisionSound.play();
}




resetGame();
render();
