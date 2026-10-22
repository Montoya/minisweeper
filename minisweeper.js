const MINISWEEPER_MODES = {
  beginner: { width: 9, height: 9, mines: 10 },
  intermediate: { width: 16, height: 16, mines: 40 },
  expert: { width: 30, height: 16, mines: 99 }
};

let minisweeperState;
let minisweeperElement;
let marking = false;
let facePressed = false;
let showingStats = false;
let timerInterval;
let pendingMode = null;

function randomMinisweeperSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result ^= result + Math.imul(result ^ (result >>> 7), 61 | result);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function validMinisweeperSettings(width, height, mines) {
  return Number.isInteger(width) && width >= 1 && width <= 50 &&
    Number.isInteger(height) && height >= 1 && height <= 50 &&
    Number.isInteger(mines) && mines >= 0 && mines <= width * height;
}

function readMinisweeperChallenge() {
  const params = new URLSearchParams(window.location.search);
  if (!params.has('seed')) return null;
  if (['first', 'w', 'h', 'm', 'result', 'time', 'cleared'].some(key => !params.has(key))) return null;
  const seed = Number(params.get('seed'));
  const firstIndex = Number(params.get('first'));
  const width = Number(params.get('w'));
  const height = Number(params.get('h'));
  const mines = Number(params.get('m'));
  const seconds = Number(params.get('time'));
  const cleared = Number(params.get('cleared'));
  const outcome = params.get('result');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff ||
      !validMinisweeperSettings(width, height, mines) ||
      !Number.isInteger(firstIndex) || firstIndex < 0 || firstIndex >= width * height ||
      !['win', 'lose'].includes(outcome) ||
      !Number.isInteger(seconds) || seconds < 0 || seconds > 86400 * 30 ||
      !Number.isInteger(cleared) || cleared < 0 || cleared > 100) return null;
  return { seed, firstIndex, width, height, mines, outcome, seconds, cleared };
}

function challengeKey(challenge) {
  return JSON.stringify(challenge);
}

function clearMinisweeperChallengeURL() {
  const url = new URL(window.location.href);
  for (const key of ['seed', 'first', 'w', 'h', 'm', 'result', 'time', 'cleared', 'by']) {
    url.searchParams.delete(key);
  }
  history.replaceState(null, '', url);
}

function saveMinisweeper() {
  localStorage.setItem('minisweeperState', JSON.stringify(minisweeperState));
}

function emptyMinisweeperStats() {
  return {
    byMode: {
      beginner: { games: 0, wins: 0 },
      intermediate: { games: 0, wins: 0 },
      expert: { games: 0, wins: 0 }
    }
  };
}

function normalizeMinisweeperStats(stats) {
  const normalized = emptyMinisweeperStats();
  if (!stats) return normalized;
  if (stats.byMode) {
    for (const difficulty of Object.keys(MINISWEEPER_MODES)) {
      const entry = stats.byMode[difficulty];
      if (entry) {
        normalized.byMode[difficulty].games = Math.max(0, Number(entry.games) || 0);
        normalized.byMode[difficulty].wins = Math.max(0, Number(entry.wins) || 0);
      }
    }
    const unassignedGames = Math.max(0, Number(stats.unassigned?.games) || 0);
    const unassignedWins = Math.max(0, Number(stats.unassigned?.wins) || 0);
    // Earlier migrations held the known Beginner history here.
    normalized.byMode.beginner.games += unassignedGames;
    normalized.byMode.beginner.wins += unassignedWins;
    return normalized;
  }
  normalized.byMode.beginner.games = Math.max(0, Number(stats.games) || 0);
  normalized.byMode.beginner.wins = Math.max(0, Number(stats.wins) || 0);
  return normalized;
}

function newMinisweeperState(mode, settings, stats, challenge = null) {
  const nextStats = normalizeMinisweeperStats(stats);
  if (nextStats.byMode[mode]) nextStats.byMode[mode].games++;
  return {
    mode, ...settings, board: null, marks: [], startedAt: null,
    finishedAt: null, outcome: null, seed: challenge?.seed ?? randomMinisweeperSeed(),
    firstIndex: challenge?.firstIndex ?? null, challenge,
    stats: nextStats
  };
}

function loadMinisweeperState() {
  try {
    const saved = JSON.parse(localStorage.getItem('minisweeperState'));
    if (!saved || !Array.isArray(saved.marks)) return null;
    if (Number.isInteger(saved.width) && Number.isInteger(saved.height) &&
        Number.isInteger(saved.mines) &&
        (saved.board === null || (Array.isArray(saved.board) && saved.board.length === saved.width * saved.height))) {
      return {
        ...saved,
        seed: Number.isInteger(saved.seed) ? saved.seed : (saved.board === null ? randomMinisweeperSeed() : null),
        firstIndex: saved.firstIndex ?? null,
        stats: normalizeMinisweeperStats(saved.stats)
      };
    }
    // Keep games saved by the original 9×9 version playable after the upgrade.
    if (!Array.isArray(saved.board) || saved.board.length !== 81) return null;
    const mines = saved.board.filter(cell => cell === 9 || cell === 19).length;
    const revealed = saved.board.some(cell => cell < 9);
    const lost = !saved.board.includes(19);
    const won = !lost && saved.board.filter(cell => cell > 9 && cell !== 19).length === 0;
    return {
      mode: 'beginner', width: 9, height: 9, mines,
      board: !revealed && !lost ? null : saved.board, marks: saved.marks,
      startedAt: revealed ? saved.startedAt : null,
      finishedAt: lost || won ? (saved.finishedAt || Date.now()) : null,
      outcome: lost ? 'lose' : won ? 'win' : null,
      stats: normalizeMinisweeperStats(saved.stats || { games: 1, wins: 0 })
    };
  } catch (_) {
    return null;
  }
}

function neighbors(index, width, height) {
  const x = index % width;
  const y = Math.floor(index / width);
  const result = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) result.push(ny * width + nx);
    }
  }
  return result;
}

function makeBoard(width, height, mines, firstIndex, seed) {
  const size = width * height;
  const board = new Array(size).fill(0);
  const candidates = [];
  for (let i = 0; i < size; i++) {
    if (mines === size || i !== firstIndex) candidates.push(i);
  }
  const random = seededRandom(seed);
  for (let i = 0; i < mines; i++) {
    const pick = i + Math.floor(random() * (candidates.length - i));
    [candidates[i], candidates[pick]] = [candidates[pick], candidates[i]];
    board[candidates[i]] = 9;
  }
  for (let i = 0; i < size; i++) {
    if (board[i] === 9) {
      for (const neighbor of neighbors(i, width, height)) {
        if (board[neighbor] !== 9) board[neighbor]++;
      }
    }
  }
  return board.map(cell => cell + 10);
}

function sweep(index) {
  const state = minisweeperState;
  const queue = [index];
  while (queue.length) {
    const current = queue.pop();
    if (state.board[current] < 10) continue;
    const x = current % state.width;
    const y = Math.floor(current / state.width);
    if (state.marks.includes(`${x}-${y}`)) continue;
    state.board[current] -= 10;
    if (state.board[current] === 0) {
      for (const neighbor of neighbors(current, state.width, state.height)) {
        if (state.board[neighbor] > 9 && state.board[neighbor] !== 19) queue.push(neighbor);
      }
    }
  }
}

function attempt(x, y) {
  const state = minisweeperState;
  if (state.outcome || x < 0 || x >= state.width || y < 0 || y >= state.height) return;
  const mark = `${x}-${y}`;
  if (state.marks.includes(mark)) {
    state.marks.splice(state.marks.indexOf(mark), 1);
  } else if (marking) {
    markCell(x, y);
    return;
  } else {
    const index = y * state.width + x;
    if (state.board === null) {
      if (state.firstIndex === null) state.firstIndex = index;
      state.board = makeBoard(state.width, state.height, state.mines, state.firstIndex, state.seed);
      state.startedAt = Date.now();
      startTimer();
    }
    sweep(index);
    if (state.board[index] === 9) {
      state.board = state.board.map(cell => cell === 19 ? 9 : cell);
      state.outcome = 'lose';
      state.finishedAt = Date.now();
    } else if (state.board.every(cell => cell < 10 || cell === 19)) {
      state.outcome = 'win';
      state.finishedAt = Date.now();
      if (state.stats.byMode[state.mode]) state.stats.byMode[state.mode].wins++;
    }
  }
  displayBoard();
  saveMinisweeper();
  if (state.outcome && !state.resultPrompted) {
    state.resultPrompted = true;
    saveMinisweeper();
    showMinisweeperResult();
  }
}

function markCell(x, y) {
  const state = minisweeperState;
  if (state.outcome || x < 0 || x >= state.width || y < 0 || y >= state.height) return;
  if (state.board && state.board[y * state.width + x] < 10) return;
  const key = `${x}-${y}`;
  const index = state.marks.indexOf(key);
  if (index < 0) state.marks.push(key);
  else state.marks.splice(index, 1);
  displayBoard();
  saveMinisweeper();
}

function mark(x, y) { markCell(x, y); }

function contextMenuCell(event, x, y) {
  event.preventDefault();
  if (event.pointerType === 'touch' ||
      (!event.pointerType && window.matchMedia('(hover: none) and (pointer: coarse)').matches)) return;
  markCell(x, y);
}

function getHTMLforCell(cell, x, y) {
  const state = minisweeperState;
  const key = `${x}-${y}`;
  const label = `Row ${y + 1}, column ${x + 1}`;
  if (state.outcome === 'win' && cell === 19) {
    return `<span class="minisweeper-cell minisweeper-unrevealed" aria-label="${label}: mine flagged">🚩</span>`;
  }
  if (cell === null || cell > 9) {
    const flagged = state.marks.includes(key);
    const content = flagged ? '🚩' : '&nbsp;';
    if (state.outcome) return `<span class="minisweeper-cell minisweeper-unrevealed" aria-label="${label}${flagged ? ': flagged' : ': hidden'}">${content}</span>`;
    return `<span role="button" tabindex="0" aria-label="${label}${flagged ? ': flagged' : ': hidden'}" onclick="attempt(${x},${y})" onpointerdown="pressMinisweeperFace(event)" onkeydown="keyMinisweeperCell(event,${x},${y})" oncontextmenu="contextMenuCell(event,${x},${y})" class="minisweeper-cell minisweeper-unrevealed">${content}</span>`;
  }
  if (cell === 9) return `<span class="minisweeper-cell minisweeper-bomb" aria-label="${label}: mine">💣</span>`;
  return `<span class="minisweeper-cell ${cell ? 'minisweeper-number' : 'minisweeper-empty'}" aria-label="${label}: ${cell || 'empty'}">${cell || '&nbsp;'}</span>`;
}

function keyMinisweeperCell(event, x, y) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    attempt(x, y);
  } else if (event.key.toLowerCase() === 'f') {
    event.preventDefault();
    markCell(x, y);
  }
}

function pressMinisweeperFace(event) {
  if (event.button !== 0 || marking || minisweeperState.outcome) return;
  facePressed = true;
  const face = document.getElementById('minisweeper-face');
  if (face) face.textContent = '😮';
}

function releaseMinisweeperFace() {
  if (!facePressed) return;
  facePressed = false;
  const face = document.getElementById('minisweeper-face');
  if (face && !minisweeperState.outcome) face.textContent = '🙂';
}

function elapsedSeconds() {
  const state = minisweeperState;
  return state.startedAt ? Math.floor(Math.max(0, (state.finishedAt || Date.now()) - state.startedAt) / 1000) : 0;
}

function clearedPercent(state) {
  const safeCells = state.width * state.height - state.mines;
  const swept = state.board ? state.board.filter(cell => cell >= 0 && cell < 9).length : 0;
  return safeCells ? Math.floor(swept / safeCells * 100) : 0;
}

function resultSeconds(state) {
  if (!Number.isFinite(state.startedAt) || !Number.isFinite(state.finishedAt)) return 0;
  return Math.floor(Math.max(0, state.finishedAt - state.startedAt) / 1000);
}

function formatScore(seconds) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function compareMinisweeperResults(state, challenge) {
  const player = { outcome: state.outcome, seconds: resultSeconds(state), cleared: clearedPercent(state) };
  if (player.outcome !== challenge.outcome) return player.outcome === 'win' ? 'You beat the challenge!' : 'The challenger did better this time.';
  if (player.outcome === 'win') {
    if (player.seconds < challenge.seconds) return `You beat the challenge by ${formatScore(challenge.seconds - player.seconds)}!`;
    if (player.seconds > challenge.seconds) return `The challenger was faster by ${formatScore(player.seconds - challenge.seconds)}.`;
    return 'You matched the challenger’s time!';
  }
  if (player.cleared > challenge.cleared) return `You cleared ${player.cleared - challenge.cleared}% more of the board.`;
  if (player.cleared < challenge.cleared) return `The challenger cleared ${challenge.cleared - player.cleared}% more of the board.`;
  return 'You cleared the same amount of the board.';
}

function minisweeperChallengeURL() {
  const state = minisweeperState;
  const url = new URL('./', window.location.href);
  url.searchParams.set('seed', state.seed);
  url.searchParams.set('first', state.firstIndex);
  url.searchParams.set('w', state.width);
  url.searchParams.set('h', state.height);
  url.searchParams.set('m', state.mines);
  url.searchParams.set('result', state.outcome);
  url.searchParams.set('time', resultSeconds(state));
  url.searchParams.set('cleared', clearedPercent(state));
  return url.toString();
}

function setMinisweeperShareLink() {
  const link = document.getElementById('minisweeper-share-link');
  if (!link) return;
  const state = minisweeperState;
  const time = formatScore(resultSeconds(state));
  const message = state.outcome === 'win'
    ? `I cleared this Minesweeper board in ${time}! Think you can do better? Take my challenge:`
    : `I cleared ${clearedPercent(state)}% of this Minesweeper board before hitting a mine in ${time}. Can you do better? Take my challenge:`;
  const intent = new URL('https://twitter.com/intent/tweet');
  intent.searchParams.set('text', message);
  intent.searchParams.set('url', minisweeperChallengeURL());
  link.href = intent.toString();
}

function showMinisweeperResult() {
  const state = minisweeperState;
  if (!state.outcome) return;
  const score = state.outcome === 'win'
    ? `You cleared the board in ${formatScore(resultSeconds(state))}.`
    : `You cleared ${clearedPercent(state)}% of the board in ${formatScore(resultSeconds(state))}.`;
  const challenge = state.challenge;
  const comparison = challenge ? `<div class="minisweeper-comparison">
    <p><strong>Challenger:</strong> ${challenge.outcome === 'win' ? `cleared the board in ${formatScore(challenge.seconds)}` : `cleared ${challenge.cleared}% in ${formatScore(challenge.seconds)} before hitting a mine`}.</p>
    <p>${compareMinisweeperResults(state, challenge)}</p>
  </div>` : '';
  const canShare = Number.isInteger(state.seed) && Number.isInteger(state.firstIndex) &&
    Number.isFinite(state.startedAt) && Number.isFinite(state.finishedAt);
  showMinisweeperModal(`<h2 id="minisweeper-dialog-title">${state.outcome === 'win' ? '😎 You won!' : '😵 Game over'}</h2>
    <p>${score}</p>${comparison}
    ${canShare ? `<h3 class="minisweeper-challenge-title">Challenge others to this board</h3>
      <p>Share your result so others can play the same board and try to beat it.</p>` : ''}
    <div class="minisweeper-dialog-actions">
      ${canShare ? '<a id="minisweeper-share-link" class="minisweeper-share-button" target="_blank" rel="noopener noreferrer">Post</a>' : ''}
      <button type="button" onclick="closeMinisweeperModal()">Skip</button>
    </div>`);
  setMinisweeperShareLink();
}

function timerLabel() {
  const seconds = elapsedSeconds();
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const timer = document.getElementById('minisweeper-timer');
    if (timer) timer.textContent = timerLabel();
  }, 250);
}

function calculateMinisweeperCellSize(width, height, viewportWidth, viewportHeight, horizontalPadding, verticalPadding, otherContentHeight) {
  const byWidth = (viewportWidth - horizontalPadding) / width;
  const byHeight = (viewportHeight - verticalPadding - otherContentHeight) / height;
  return Math.max(5, Math.floor(Math.min(26, byWidth, byHeight) * 10) / 10);
}

function fitMinisweeperBoard() {
  const grid = document.querySelector('.minisweeper-grid');
  if (!grid) return;
  const container = document.getElementById('container');
  const bodyStyle = getComputedStyle(document.body);
  const horizontalPadding = parseFloat(bodyStyle.paddingLeft) + parseFloat(bodyStyle.paddingRight);
  const verticalPadding = parseFloat(bodyStyle.paddingTop) + parseFloat(bodyStyle.paddingBottom);
  const viewportWidth = window.visualViewport?.width || window.innerWidth;
  const viewportHeight = window.visualViewport?.height || window.innerHeight;
  for (let pass = 0; pass < 3; pass++) {
    const previous = parseFloat(getComputedStyle(grid).getPropertyValue('--minisweeper-cell-size'));
    const otherContentHeight = container.getBoundingClientRect().height - grid.getBoundingClientRect().height;
    const size = calculateMinisweeperCellSize(
      minisweeperState.width, minisweeperState.height,
      viewportWidth, viewportHeight, horizontalPadding, verticalPadding, otherContentHeight
    );
    container.style.setProperty('--minisweeper-cell-size', `${size}px`);
    container.style.setProperty('--board-width', `${minisweeperState.width * size}px`);
    if (Math.abs(previous - size) < 0.1) break;
  }
}

function displayBoard() {
  if (showingStats) return;
  const state = minisweeperState;
  const container = document.getElementById('container');
  container.style.setProperty('--minisweeper-cell-size', '26px');
  container.style.setProperty('--board-width', `${state.width * 26}px`);
  const clear = clearedPercent(state);
  const face = state.outcome === 'win' ? '😎' : state.outcome === 'lose' ? '😵' : facePressed ? '😮' : '🙂';
  const faceLabel = state.outcome === 'win' ? 'You won. New game' : state.outcome === 'lose' ? 'You lost. New game' : 'New game';
  const boardRows = [];
  for (let y = 0; y < state.height; y++) {
    let row = '';
    for (let x = 0; x < state.width; x++) {
      row += getHTMLforCell(state.board ? state.board[y * state.width + x] : null, x, y);
    }
    boardRows.push(`<div class="minisweeper-row">${row}</div>`);
  }
  const controls = state.outcome
    ? `<div><div>${state.outcome === 'win' ? '😎 You won! Play again?' : '😵 You lost. Try again?'}</div></div>
       <div><div><a href="#" onclick="statsMinisweeper();return false" aria-label="Stats">📊</a></div>
       <div><a href="#" onclick="showMinisweeperResult();return false">Results / Share</a></div>
       <div><a href="#" onclick="restartMinisweeper();return false">New game</a></div></div>`
    : `<div><div>Cleared: ${clear}%</div><div><a href="#" onclick="statsMinisweeper();return false" aria-label="Stats">📊</a></div></div>
       <div><div>${window.matchMedia('(hover: none) and (pointer: coarse)').matches
         ? (marking ? '<a href="#" onclick="setMarking(false);return false" aria-label="Tap to sweep">Tap to 🧹</a>' : '<a href="#" onclick="setMarking(true);return false" aria-label="Tap to flag">Tap to 🚩</a>')
         : 'Right-click to 🚩'}</div>
       <div><a href="#" onclick="confirmRestartMinisweeper();return false">New game</a></div></div>`;
  minisweeperElement.innerHTML = `
    <div class="minisweeper-board-scroll">
      <div id="minisweeper-board" style="--columns:${state.width}">
        <div class="minisweeper-header">
          <span class="minisweeper-counter" aria-label="Mines remaining">${state.mines - state.marks.length} 💣</span>
          <button id="minisweeper-face" type="button" class="minisweeper-face" onclick="confirmRestartMinisweeper()" aria-label="${faceLabel}">${face}</button>
          <span id="minisweeper-timer" class="minisweeper-counter" aria-label="Elapsed time">${timerLabel()}</span>
        </div>
        <div class="minisweeper-grid" role="grid" aria-label="${state.width} by ${state.height} Minesweeper board">${boardRows.join('')}</div>
      </div>
    </div>
    <div id="minisweeper-controls">${controls}</div>`;
  fitMinisweeperBoard();
}

function setMarking(value) {
  marking = value;
  displayBoard();
  return false;
}

function hasProgress() {
  const state = minisweeperState;
  return !state.outcome && (state.board !== null || state.marks.length > 0);
}

function closeGameMenu() {
  document.getElementById('minisweeper-menu-items').hidden = true;
  document.getElementById('minisweeper-menu-button').setAttribute('aria-expanded', 'false');
}

function toggleGameMenu() {
  const items = document.getElementById('minisweeper-menu-items');
  items.hidden = !items.hidden;
  document.getElementById('minisweeper-menu-button').setAttribute('aria-expanded', String(!items.hidden));
}

function closeMinisweeperModal() {
  document.getElementById('minisweeper-modal').hidden = true;
  document.getElementById('minisweeper-modal').innerHTML = '';
  pendingMode = null;
}

function showMinisweeperModal(html) {
  const modal = document.getElementById('minisweeper-modal');
  modal.innerHTML = `<div class="minisweeper-dialog" role="dialog" aria-modal="true" aria-labelledby="minisweeper-dialog-title">${html}</div>`;
  modal.hidden = false;
  modal.querySelector('input, button, a[href]').focus();
}

function showAbandonConfirmation(mode, settings) {
  pendingMode = { mode, settings };
  showMinisweeperModal(`<h2 id="minisweeper-dialog-title">New game</h2>
    <p>Are you sure you want to abandon your current game?</p>
    <div class="minisweeper-dialog-actions">
      <button type="button" onclick="closeMinisweeperModal()">Cancel</button>
      <button type="button" onclick="acceptMinisweeperMode()">Yes</button>
    </div>`);
}

function beginMinisweeperMode(mode, settings) {
  closeMinisweeperModal();
  clearMinisweeperChallengeURL();
  showingStats = false;
  marking = false;
  facePressed = false;
  minisweeperState = newMinisweeperState(mode, settings, minisweeperState.stats);
  clearInterval(timerInterval);
  displayBoard();
  saveMinisweeper();
}

function acceptMinisweeperMode() {
  if (pendingMode) beginMinisweeperMode(pendingMode.mode, pendingMode.settings);
}

function requestMinisweeperMode(mode, settings) {
  if (hasProgress()) showAbandonConfirmation(mode, settings);
  else beginMinisweeperMode(mode, settings);
}

function selectMinisweeperMode(mode) {
  closeGameMenu();
  if (mode === 'custom') {
    const state = minisweeperState;
    showMinisweeperModal(`<h2 id="minisweeper-dialog-title">Custom game</h2>
      <form id="minisweeper-custom-form" onsubmit="submitCustomMinisweeper(event)">
        <label>Width <input name="width" type="number" min="1" max="50" step="1" required value="${state.width}"></label>
        <label>Height <input name="height" type="number" min="1" max="50" step="1" required value="${state.height}"></label>
        <label>Mines <input name="mines" type="number" min="0" max="2500" step="1" required value="${state.mines}"></label>
        <p id="minisweeper-custom-error" role="alert" hidden></p>
        <div class="minisweeper-dialog-actions">
          <button type="button" onclick="closeMinisweeperModal()">Cancel</button>
          <button type="submit">OK</button>
        </div>
      </form>`);
  } else if (MINISWEEPER_MODES[mode]) {
    requestMinisweeperMode(mode, MINISWEEPER_MODES[mode]);
  }
}

function submitCustomMinisweeper(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const width = Number(form.elements.width.value);
  const height = Number(form.elements.height.value);
  const mines = Number(form.elements.mines.value);
  if (!Number.isInteger(width) || !Number.isInteger(height) || !Number.isInteger(mines) ||
      width < 1 || width > 50 || height < 1 || height > 50 || mines < 0 || mines > width * height) {
    const error = document.getElementById('minisweeper-custom-error');
    error.textContent = 'Use a width and height from 1 to 50, and mines from 0 to the number of spaces.';
    error.hidden = false;
    return;
  }
  requestMinisweeperMode('custom', { width, height, mines });
}

function confirmRestartMinisweeper() {
  requestMinisweeperMode(minisweeperState.mode, {
    width: minisweeperState.width, height: minisweeperState.height, mines: minisweeperState.mines
  });
  return false;
}

function cancelRestartMiniSweeper() {
  closeMinisweeperModal();
  return false;
}

function restartMinisweeper() {
  beginMinisweeperMode(minisweeperState.mode, {
    width: minisweeperState.width, height: minisweeperState.height, mines: minisweeperState.mines
  });
  return false;
}

function statsMinisweeper() {
  showingStats = true;
  const labels = { beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' };
  const rows = Object.keys(labels).map(mode => {
    const { games, wins } = minisweeperState.stats.byMode[mode];
    const rate = games ? `${Math.round(wins / games * 100)}%` : '—';
    return `<tr><th scope="row">${labels[mode]}</th><td>${games}</td><td>${wins}</td><td>${rate}</td></tr>`;
  }).join('');
  minisweeperElement.innerHTML = `<div class="minisweeper-stats">
    <h2>Stats</h2>
    <table aria-label="Stats by difficulty">
      <thead><tr><th scope="col">Difficulty</th><th scope="col">Played</th><th scope="col">Won</th><th scope="col">Win %</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <a class="minisweeper-stats-back" href="#" onclick="goBackMinisweeper();return false">Go Back</a>
  </div>`;
  return false;
}

function goBackMinisweeper() {
  showingStats = false;
  displayBoard();
  return false;
}

function startMinisweeper(element) {
  minisweeperElement = element;
  const challenge = readMinisweeperChallenge();
  const saved = loadMinisweeperState();
  const sameChallenge = challenge && saved && saved.challenge &&
    challengeKey(saved.challenge) === challengeKey(challenge);
  const challengeMode = challenge && Object.keys(MINISWEEPER_MODES).find(mode => {
    const settings = MINISWEEPER_MODES[mode];
    return settings.width === challenge.width && settings.height === challenge.height && settings.mines === challenge.mines;
  }) || 'custom';
  minisweeperState = challenge
    ? (sameChallenge ? saved : newMinisweeperState(challengeMode, {
        width: challenge.width, height: challenge.height, mines: challenge.mines
      }, saved?.stats, challenge))
    : (saved?.challenge ? newMinisweeperState(saved.mode, {
        width: saved.width, height: saved.height, mines: saved.mines
      }, saved.stats) : saved) || newMinisweeperState('beginner', MINISWEEPER_MODES.beginner);
  displayBoard();
  startTimer();
  saveMinisweeper();
  document.addEventListener('click', event => {
    if (!event.target.closest('#minisweeper-menu')) closeGameMenu();
    if (event.target.id === 'minisweeper-modal') closeMinisweeperModal();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeGameMenu();
      closeMinisweeperModal();
    }
  });
  document.addEventListener('pointerup', releaseMinisweeperFace);
  document.addEventListener('pointercancel', releaseMinisweeperFace);
  window.addEventListener('resize', fitMinisweeperBoard);
  window.visualViewport?.addEventListener('resize', fitMinisweeperBoard);
}
