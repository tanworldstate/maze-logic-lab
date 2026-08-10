const SIZE = 8;
const STORAGE_KEY = "mazeLogicLabSavedLevels";
const TILE_INFO = {
empty: { label: "Empty", symbol: "", className: "empty", description: "Normal space"
},
wall: { label: "Wall", symbol: "#", className: "wall", description: "Blocks movement"
},
start: { label: "Start", symbol: "S", className: "start", description: "Where the
player begins" },
goal: { label: "Goal", symbol: "G", className: "goal", description: "Where the player
must finish" },
key: { label: "Key", symbol: "K", className: "key", description: "Unlocks doors" },
door: { label: "Door", symbol: "D", className: "door", description: "Requires a key"
},
trap: { label: "Trap", symbol: "!", className: "trap", description: "Costs extra
energy" },
coin: { label: "Coin", symbol: "$", className: "coin", description: "Optional or
required treasure" }
};
let selectedTool = "wall";
let grid = makeEmptyGrid();
let lastSolution = null;
let animationTimer = null;
const board = document.getElementById("board");
const toolGrid = document.getElementById("toolGrid");
const energyInput = document.getElementById("energyInput");
const requireCoinsInput = document.getElementById("requireCoinsInput");
const statusCard = document.getElementById("statusCard");
const explanationList = document.getElementById("explanationList");
const boardStats = document.getElementById("boardStats");
const savedLevels = document.getElementById("savedLevels");
const levelNameInput = document.getElementById("levelNameInput");
const jsonBox = document.getElementById("jsonBox");
function makeEmptyGrid() {
return Array.from({ length: SIZE }, () => Array.from({ length: SIZE }, () =>
"empty"));
}
function loadStarterLevel() {
grid = makeEmptyGrid();
grid[0][0] = "start";
grid[7][7] = "goal";
grid[1][1] = "wall";
grid[1][2] = "wall";
grid[1][3] = "wall";
grid[2][3] = "door";
grid[3][1] = "key";
grid[4][3] = "trap";
grid[5][5] = "coin";
grid[6][2] = "coin";
}
function createTools() {
toolGrid.innerHTML = "";
  Object.entries(TILE_INFO).forEach(([tile, info]) => {
const button = document.createElement("button");
button.className = "tool-button";
button.type = "button";
button.textContent = `${info.symbol || "."} ${info.label}`;
button.title = info.description;
button.addEventListener("click", () => {
selectedTool = tile;
renderTools();
});
toolGrid.appendChild(button);
});
renderTools();
}
function renderTools() {
[...toolGrid.children].forEach((button, index) => {
const tile = Object.keys(TILE_INFO)[index];
button.classList.toggle("selected", tile === selectedTool);
});
}
function renderBoard(path = []) {
board.innerHTML = "";
const pathIndexByCell = new Map();
path.forEach((step, index) => {
pathIndexByCell.set(`${step.r},${step.c}`, index);
});
for (let r = 0; r < SIZE; r++) {
for (let c = 0; c < SIZE; c++) {
const tile = grid[r][c];
const button = document.createElement("button");
button.className = `cell ${TILE_INFO[tile].className}`;
button.type = "button";
button.setAttribute("aria-label", `Row ${r + 1}, column ${c + 1},
${TILE_INFO[tile].label}`);
button.textContent = TILE_INFO[tile].symbol;
const stepIndex = pathIndexByCell.get(`${r},${c}`);
if (stepIndex !== undefined) {
button.classList.add("path");
const badge = document.createElement("span");
badge.className = "step-badge";
badge.textContent = stepIndex;
button.appendChild(badge);
}
button.addEventListener("click", () => setTile(r, c));
board.appendChild(button);
}
}
updateBoardStats();
}
function setTile(row, col) {
clearAnimation();
  lastSolution = null;
if (selectedTool === "start") {
removeTileEverywhere("start");
}
if (selectedTool === "goal") {
removeTileEverywhere("goal");
}
if (selectedTool === "key") {
removeTileEverywhere("key");
}
grid[row][col] = selectedTool;
renderBoard();
setStatus("Tile placed. Click Solve Maze when your level is ready.", "");
explanationList.innerHTML = "";
}
function removeTileEverywhere(tileType) {
for (let r = 0; r < SIZE; r++) {
for (let c = 0; c < SIZE; c++) {
if (grid[r][c] === tileType) {
grid[r][c] = "empty";
}
}
}
}
function updateBoardStats() {
const counts = countTiles();
boardStats.textContent = `Walls: ${counts.wall || 0} | Doors: ${counts.door || 0} |
Coins: ${counts.coin || 0}`;
}
function countTiles() {
const counts = {};
for (const row of grid) {
for (const tile of row) {
counts[tile] = (counts[tile] || 0) + 1;
}
}
return counts;
}
function findTile(tileType) {
for (let r = 0; r < SIZE; r++) {
for (let c = 0; c < SIZE; c++) {
if (grid[r][c] === tileType) {
return { r, c };
}
}
}
return null;
}
function findAllTiles(tileType) {
  const results = [];
for (let r = 0; r < SIZE; r++) {
for (let c = 0; c < SIZE; c++) {
if (grid[r][c] === tileType) {
results.push({ r, c });
}
}
}
return results;
}
function validateLevel() {
const start = findTile("start");
const goal = findTile("goal");
const coins = findAllTiles("coin");
const doors = findAllTiles("door");
const key = findTile("key");
const energy = Number(energyInput.value);
if (!start) return { ok: false, message: "Every level needs exactly one Start tile."
};
if (!goal) return { ok: false, message: "Every level needs exactly one Goal tile." };
if (!Number.isInteger(energy) || energy < 1) return { ok: false, message: "Energy must
be a whole number greater than 0." };
if (coins.length > 10) return { ok: false, message: "Use 10 or fewer coins. The solver
tracks coins with a bitmask." };
if (doors.length > 0 && !key) return { ok: false, message: "This level has doors, so
it also needs one key." };
return { ok: true, start, goal, coins, energy };
}
function solveMaze() {
clearAnimation();
renderBoard();
const validation = validateLevel();
if (!validation.ok) {
lastSolution = null;
setStatus(validation.message, "error");
explanationList.innerHTML = "";
return;
}
const { start, goal, coins, energy } = validation;
const requireCoins = requireCoinsInput.checked;
const coinIndexByCell = new Map(coins.map((coin, index) => [`${coin.r},${coin.c}`,
index]));
const allCoinsMask = coins.length === 0 ? 0 : (1 << coins.length) - 1;
const startState = {
r: start.r,
c: start.c,
hasKey: grid[start.r][start.c] === "key",
coinMask: getCoinMask(start.r, start.c, 0, coinIndexByCell),
energy,
path: [{ r: start.r, c: start.c, action: "Start here", energy, hasKey: false,
coinMask: 0 }]
  };
const queue = [startState];
const bestEnergyByState = new Map();
bestEnergyByState.set(makeStateKey(startState), startState.energy);
const directions = [
{ dr: -1, dc: 0, name: "up" },
{ dr: 1, dc: 0, name: "down" },
{ dr: 0, dc: -1, name: "left" },
{ dr: 0, dc: 1, name: "right" }
];
let explored = 0;
while (queue.length > 0) {
const current = queue.shift();
explored++;
const reachedGoal = current.r === goal.r && current.c === goal.c;
const hasAllCoins = current.coinMask === allCoinsMask;
if (reachedGoal && (!requireCoins || hasAllCoins)) {
lastSolution = {
success: true,
path: current.path,
explored,
finalEnergy: current.energy,
coinsCollected: countBits(current.coinMask),
totalCoins: coins.length
};
showSolution(lastSolution);
return;
}
for (const direction of directions) {
const nr = current.r + direction.dr;
const nc = current.c + direction.dc;
if (!isInsideBoard(nr, nc)) continue;
const tile = grid[nr][nc];
if (tile === "wall") continue;
if (tile === "door" && !current.hasKey) continue;
const moveCost = tile === "trap" ? 3 : 1;
const nextEnergy = current.energy - moveCost;
if (nextEnergy < 0) continue;
const nextHasKey = current.hasKey || tile === "key";
const nextCoinMask = getCoinMask(nr, nc, current.coinMask, coinIndexByCell);
const nextState = {
r: nr,
c: nc,
hasKey: nextHasKey,
coinMask: nextCoinMask,
energy: nextEnergy
};
  const stateKey = makeStateKey(nextState);
const bestEnergy = bestEnergyByState.get(stateKey);
if (bestEnergy !== undefined && bestEnergy >= nextEnergy) {
continue;
}
bestEnergyByState.set(stateKey, nextEnergy);
const action = describeMove(direction.name, tile, nextEnergy, nextHasKey,
nextCoinMask, coins.length);
queue.push({
...nextState,
path: [...current.path, { r: nr, c: nc, action, energy: nextEnergy,
hasKey: nextHasKey, coinMask: nextCoinMask }]
});
}
}
lastSolution = { success: false, explored };
setStatus(`No valid route found. The solver explored ${explored} possible states.`,
"error");
explanationList.innerHTML = "";
addExplanation("Try increasing energy, removing walls, adding a key, or making sure
doors do not block every route.");
}
function getCoinMask(r, c, currentMask, coinIndexByCell) {
const coinIndex = coinIndexByCell.get(`${r},${c}`);
if (coinIndex === undefined) return currentMask;
return currentMask | (1 << coinIndex);
}
function makeStateKey(state) {
return `${state.r},${state.c},${state.hasKey ? 1 : 0},${state.coinMask}`;
}
function isInsideBoard(r, c) {
return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}
function countBits(number) {
let count = 0;
let value = number;
while (value > 0) {
count += value & 1;
value = value >> 1;
}
return count;
}
function describeMove(directionName, tile, energy, hasKey, coinMask, totalCoins) {
let sentence = `Move ${directionName}. Energy left: ${energy}.`;
if (tile === "key") sentence += " Pick up the key.";
if (tile === "door") sentence += " Open the door because you have the key.";
if (tile === "trap") sentence += " Trap tile: this move costs 3 energy.";
if (tile === "coin") sentence += ` Collect coin ${countBits(coinMask)} of
${totalCoins}.`;
if (hasKey && tile !== "key") sentence += " Key status: yes.";
return sentence;
}
function showSolution(solution) {
renderBoard(solution.path);
setStatus(
`Solved in ${solution.path.length - 1} moves. Energy left:
${solution.finalEnergy}. Coins: ${solution.coinsCollected}/${solution.totalCoins}.
States explored: ${solution.explored}.`,
"success"
);
explanationList.innerHTML = "";
solution.path.forEach((step, index) => {
addExplanation(`${index}. Row ${step.r + 1}, column ${step.c + 1}:
${step.action}`);
});
}
function addExplanation(text) {
const item = document.createElement("li");
item.textContent = text;
explanationList.appendChild(item);
}
function setStatus(message, type) {
statusCard.className = "status-card";
if (type) statusCard.classList.add(type);
statusCard.innerHTML = message;
}
function animatePath() {
if (!lastSolution || !lastSolution.success) {
setStatus("Solve the maze successfully before animating the path.", "error");
return;
}
clearAnimation();
renderBoard();
let index = 0;
animationTimer = setInterval(() => {
const cells = [...document.querySelectorAll(".cell")];
if (index > 0) {
const previous = lastSolution.path[index - 1];
cells[previous.r * SIZE + previous.c].classList.remove("animated");
cells[previous.r * SIZE + previous.c].classList.add("path");
}
if (index >= lastSolution.path.length) {
clearAnimation();
renderBoard(lastSolution.path);
return;
}
const step = lastSolution.path[index];
  cells[step.r * SIZE + step.c].classList.add("animated");
index++;
}, 260);
}
function clearAnimation() {
if (animationTimer) {
clearInterval(animationTimer);
animationTimer = null;
}
}
function resetLevel() {
clearAnimation();
lastSolution = null;
loadStarterLevel();
renderBoard();
explanationList.innerHTML = "";
setStatus("Starter level loaded.", "");
}
function randomLevel() {
clearAnimation();
lastSolution = null;
grid = makeEmptyGrid();
grid[0][0] = "start";
grid[7][7] = "goal";
placeRandomTiles("wall", 12);
placeRandomTiles("trap", 5);
placeRandomTiles("coin", 3);
const useDoor = Math.random() > 0.35;
if (useDoor) {
placeRandomTiles("key", 1);
placeRandomTiles("door", 2);
}
energyInput.value = 24;
requireCoinsInput.checked = Math.random() > 0.5;
renderBoard();
explanationList.innerHTML = "";
setStatus("Random level created. It might or might not be solvable. Test it!", "");
}
function placeRandomTiles(tileType, amount) {
let placed = 0;
let attempts = 0;
while (placed < amount && attempts < 500) {
attempts++;
const r = Math.floor(Math.random() * SIZE);
const c = Math.floor(Math.random() * SIZE);
const isProtected = (r === 0 && c === 0) || (r === 7 && c === 7);
if (!isProtected && grid[r][c] === "empty") {
grid[r][c] = tileType;
placed++;
}

Maze Logic Lab - Advanced Coding Exercise Page 37

}
}
function getSavedLevels() {
try {
return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
} catch {
return [];
}
}
function writeSavedLevels(levels) {
localStorage.setItem(STORAGE_KEY, JSON.stringify(levels));
}
function saveLevel() {
const name = levelNameInput.value.trim() || `Level ${new Date().toLocaleString()}`;
const levels = getSavedLevels();
levels.push({
name,
createdAt: new Date().toISOString(),
grid,
energy: Number(energyInput.value),
requireCoins: requireCoinsInput.checked
});
writeSavedLevels(levels);
levelNameInput.value = "";
renderSavedLevels();
setStatus(`Saved level: ${name}`, "success");
}
function renderSavedLevels() {
const levels = getSavedLevels();
savedLevels.innerHTML = "";
if (levels.length === 0) {
savedLevels.innerHTML = `<p class="hint">No saved levels yet.</p>`;
return;
}
levels.forEach((level, index) => {
const row = document.createElement("div");
row.className = "saved-level";
row.innerHTML = `
<strong title="${level.name}">${level.name}</strong>
<button class="secondary" type="button">Load</button>
<button class="secondary" type="button">Delete</button>
`;
row.children[1].addEventListener("click", () => loadSavedLevel(index));
row.children[2].addEventListener("click", () => deleteSavedLevel(index));
savedLevels.appendChild(row);
});
}
function loadSavedLevel(index) {
const levels = getSavedLevels();
const level = levels[index];
if (!level) return;
  grid = level.grid;
energyInput.value = level.energy;
requireCoinsInput.checked = Boolean(level.requireCoins);
lastSolution = null;
clearAnimation();
renderBoard();
explanationList.innerHTML = "";
setStatus(`Loaded level: ${level.name}`, "success");
}
function deleteSavedLevel(index) {
const levels = getSavedLevels();
levels.splice(index, 1);
writeSavedLevels(levels);
renderSavedLevels();
}
function exportCurrentLevel() {
const data = {
app: "Maze Logic Lab",
version: 1,
grid,
energy: Number(energyInput.value),
requireCoins: requireCoinsInput.checked
};
jsonBox.value = JSON.stringify(data, null, 2);
setStatus("Current level exported into the JSON box.", "success");
}
function importFromBox() {
try {
const data = JSON.parse(jsonBox.value);
if (!Array.isArray(data.grid) || data.grid.length !== SIZE) {
throw new Error("The JSON does not contain an 8 x 8 grid.");
}
grid = data.grid;
energyInput.value = Number(data.energy) || 24;
requireCoinsInput.checked = Boolean(data.requireCoins);
lastSolution = null;
clearAnimation();
renderBoard();
explanationList.innerHTML = "";
setStatus("Imported level from JSON.", "success");
} catch (error) {
setStatus(`Import failed: ${error.message}`, "error");
}
}
document.getElementById("solveBtn").addEventListener("click", solveMaze);
document.getElementById("animateBtn").addEventListener("click", animatePath);
document.getElementById("randomBtn").addEventListener("click", randomLevel);
document.getElementById("resetBtn").addEventListener("click", resetLevel);
document.getElementById("saveBtn").addEventListener("click", saveLevel);
document.getElementById("exportBtn").addEventListener("click", exportCurrentLevel);
document.getElementById("importBtn").addEventListener("click", importFromBox);
createTools();
loadStarterLevel();
renderBoard();
renderSavedLevels();
       
