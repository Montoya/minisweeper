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

function newMinisweeperState(mode, settings, stats) {
  const nextStats = normalizeMinisweeperStats(stats);
  if (nextStats.byMode[mode]) nextStats.byMode[mode].games++;
  return {
    mode, ...settings, board: null, marks: [], startedAt: null,
    finishedAt: null, outcome: null,
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
      return { ...saved, stats: normalizeMinisweeperStats(saved.stats) };
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

function makeBoard(width, height, mines, firstIndex) {
  const size = width * height;
  const board = new Array(size).fill(0);
  const candidates = [];
  for (let i = 0; i < size; i++) {
    if (mines === size || i !== firstIndex) candidates.push(i);
  }
  for (let i = 0; i < mines; i++) {
    const random = crypto.getRandomValues(new Uint32Array(1))[0];
    const pick = i + Math.floor(random / 4294967296 * (candidates.length - i));
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
      state.board = makeBoard(state.width, state.height, state.mines, index);
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

function formatElapsedTime(startedAt, finishedAt) {
  const totalSeconds = Math.floor(Math.max(0, finishedAt - startedAt) / 1000);
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  if (hours) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function elapsedSeconds() {
  const state = minisweeperState;
  return state.startedAt ? Math.floor(Math.max(0, (state.finishedAt || Date.now()) - state.startedAt) / 1000) : 0;
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
  const size = state.width * state.height;
  const safeCells = size - state.mines;
  const swept = state.board ? state.board.filter(cell => cell >= 0 && cell < 9).length : 0;
  const clear = safeCells ? Math.floor(swept / safeCells * 100) : 0;
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
  const canShareWin = state.outcome === 'win' && Number.isFinite(state.startedAt) && Number.isFinite(state.finishedAt);
  const shareText = state.outcome === 'lose'
    ? "I'm playing Minesweeper on X. Play it here: https://montoya.github.io/minisweeper/"
    : canShareWin
      ? `I just beat Minesweeper in ${formatElapsedTime(state.startedAt, state.finishedAt)}! Think you can do better? Play it: https://montoya.github.io/minisweeper/`
      : '';
  const controls = state.outcome
    ? `<div><div>${state.outcome === 'win' ? '😎 You won! Play again?' : '😵 You lost. Try again?'}</div></div>
       <div><div><a href="#" onclick="statsMinisweeper();return false" aria-label="Stats">📊</a></div>
       ${shareText ? `<div><a href="https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}" target="_blank" rel="noopener noreferrer">Share</a></div>` : ''}
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
  modal.querySelector('input, button').focus();
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
  minisweeperState = loadMinisweeperState() || newMinisweeperState('beginner', MINISWEEPER_MODES.beginner);
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
