function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(crypto.getRandomValues(new Uint32Array(1))[0]/4294967296 * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function sweep(board, x, y) { 
  const boardLength = Math.sqrt(board.length); 
  const index = y*boardLength + x; 
  if(index >= 0 && index < board.length) { 
    // valid space 
    if(board[index] > 9) { 
      // valid space to sweep 
      board[index] -= 10; 
      if(0==board[index]) { // empty space, keep sweeping 
        if(x>0) { 
          sweep(board, x-1, y-1); 
          sweep(board, x-1, y  ); 
          sweep(board, x-1, y+1); 
        }
        sweep(board, x  , y-1); 
        sweep(board, x  , y+1); 
        if(x<(boardLength-1)) { 
          sweep(board, x+1, y-1); 
          sweep(board, x+1, y  ); 
          sweep(board, x+1, y+1); 
        }
      }
    }
  }
}

function reveal(board) {
  for(let i=0; i < board.length; i++) { 
    if(19==board[i]) { 
      board[i] = 9; 
    }
  }
}

function getHTMLforCell(num, x, y, marks, outcome) { 
  switch(num) { 
    case 0: 
      return '<span class="minisweeper-cell minisweeper-empty">&nbsp;</span>'; 
    case 1: 
      return '<span class="minisweeper-cell minisweeper-number">1</span>'; 
    case 2: 
      return '<span class="minisweeper-cell minisweeper-number">2</span>'; 
    case 3: 
      return '<span class="minisweeper-cell minisweeper-number">3</span>'; 
    case 4: 
      return '<span class="minisweeper-cell minisweeper-number">4</span>'; 
    case 5: 
      return '<span class="minisweeper-cell minisweeper-number">5</span>'; 
    case 6: 
      return '<span class="minisweeper-cell minisweeper-number">6</span>'; 
    case 7: 
      return '<span class="minisweeper-cell minisweeper-number">7</span>'; 
    case 8: 
      return '<span class="minisweeper-cell minisweeper-number">8</span>'; 
    case 9: 
      return '<span class="minisweeper-cell minisweeper-bomb">💣</span>'; 
    default: 
      switch(outcome) { 
        case "win": 
          return '<span class="minisweeper-cell minisweeper-unrevealed">🚩</span>'; 
        case "lose": 
        case "confirm": 
          return '<span class="minisweeper-cell minisweeper-unrevealed">&nbsp</span>'; 
        default: 
          return `<span onclick="attempt(${x},${y});return false" oncontextmenu="mark(${x},${y});return false" class="minisweeper-cell minisweeper-unrevealed">${-1!=marks.indexOf(`${x}-${y}`) ? "🚩" : "&nbsp;"}</span>`; 
      }
  }
}

function attempt(x,y) {
  let outcome; 
  if(-1!=minisweeperState.marks.indexOf(`${x}-${y}`)) { 
    minisweeperState.marks.splice(minisweeperState.marks.indexOf(`${x}-${y}`), 1); 
  }
  else { 
    sweep(minisweeperState.board, x, y); 
    const index = y*Math.sqrt(minisweeperState.board.length) + x; 
    if(minisweeperState.board[index]==9) { 
      reveal(minisweeperState.board); 
      outcome = "lose"; 
    }
    else if(minisweeperState.board.filter(el => el > 9).length < 11) { 
      // there are only bombs left, the player has won 
      minisweeperState.stats.wins += 1; 
      outcome = "win"; 
    }
  }
  displayBoard(minisweeperElement, minisweeperState.board, minisweeperState.marks, outcome); 
  localStorage.setItem("minisweeperState", JSON.stringify(minisweeperState)); 
}

function mark(x,y) { 
  const markingString = `${x}-${y}`; 
  const markedIndex = minisweeperState.marks.indexOf(markingString); 
  if(-1==markedIndex) { 
    minisweeperState.marks.push(markingString); 
  }
  else { 
    minisweeperState.marks.splice(markedIndex, 1);
  }
  displayBoard(minisweeperElement, minisweeperState.board, minisweeperState.marks); 
  localStorage.setItem("minisweeperState", JSON.stringify(minisweeperState)); 
}

function makeBoard() { 
  const board = [...new Array(10).fill(9),...new Array(71).fill(0)]; 
  shuffleArray(board); 
  // count spaces around bombs 
  const boardLength = Math.sqrt(board.length); // must be a square number... 
  for(let x = 0; x < boardLength; x++) { 
    for(let y = 0; y < boardLength; y++) { 
      // walk array 
      const index = y*boardLength+x; 
      if(board[index]==9) { 
        // we are at a bomb
        // let's try to add 1 to every square around this bomb 
        // we have to do 8 iterations 
        let tmpIndex; 
        if(x > 0) { 
          tmpIndex = (y-1)*boardLength+(x-1); // iteration 1
          if(tmpIndex >= 0 && tmpIndex < board.length && board[tmpIndex] < 9) { 
            board[tmpIndex] += 1; 
          }
          tmpIndex = y*boardLength+(x-1); // iteration 2 
          if(tmpIndex >= 0 && tmpIndex < board.length && board[tmpIndex] < 9) { 
            board[tmpIndex] += 1; 
          }
          tmpIndex = (y+1)*boardLength+(x-1); // iteration 3
          if(tmpIndex >= 0 && tmpIndex < board.length && board[tmpIndex] < 9) { 
            board[tmpIndex] += 1; 
          }
        }
        tmpIndex = (y-1)*boardLength+x; // iteration 4
        if(tmpIndex >= 0 && tmpIndex < board.length && board[tmpIndex] < 9) { 
          board[tmpIndex] += 1; 
        }
        tmpIndex = (y+1)*boardLength+x; // iteration 5
        if(tmpIndex >= 0 && tmpIndex < board.length && board[tmpIndex] < 9) { 
          board[tmpIndex] += 1; 
        }
        if(x < (boardLength-1)) { 
          tmpIndex = (y-1)*boardLength+(x+1); // iteration 6
          if(tmpIndex >= 0 && tmpIndex < board.length && board[tmpIndex] < 9) { 
            board[tmpIndex] += 1; 
          }
          tmpIndex = y*boardLength+(x+1); // iteration 7
          if(tmpIndex >= 0 && tmpIndex < board.length && board[tmpIndex] < 9) { 
            board[tmpIndex] += 1; 
          }
          tmpIndex = (y+1)*boardLength+(x+1); // iteration 8
          if(tmpIndex >= 0 && tmpIndex < board.length && board[tmpIndex] < 9) { 
            board[tmpIndex] += 1; 
          }
        }
      }
    }
  }
  // finally, increment every space by 10 
  for(let i = 0; i < board.length; i++) { 
    board[i] += 10; 
  }
  return board; 
}

const displayBoard = (element, board, marks, outcome) => { 
  element.textContent = ''; 
  const boardLength = Math.sqrt(board.length); 
  const board2D = []; 
  for(let i = 0; i < board.length; i += boardLength) { 
    board2D.push( board.slice(i,i+boardLength) ); 
  }
  const swept = board.filter(el => el < 9).length; 
  const clear = Math.floor((swept/71)*100);
  element.insertAdjacentHTML('beforeend', 
`
  <div id="minisweeper-board" style="text-align:center">
    ${board2D.map( (row, y) => { 
      return `
        <div class="minisweeper-row" style="cursor:pointer">
          ${row.map( (cell, x) => `${getHTMLforCell(cell, x, y, marks, outcome)}` ).join('')}
        </div>
      `; 
    }).join('')}
  </div>
`
  );
  if(outcome=="confirm") { 
    element.insertAdjacentHTML('beforeend', 
      `
        <div id="minisweeper-controls">
          <div>
            <div>Are you sure?</div>
          </div>
          <div>
            <div><a href="#" onclick="cancelRestartMiniSweeper();return false">Cancel</a></div>
            <div><a href="#" onclick="restartMinisweeper();return false">Confirm</a></div>
          </div>
        </div>
      `
          ); 
  }
  else if(outcome) { 
    element.insertAdjacentHTML('beforeend', 
`
  <div id="minisweeper-controls">
    <div>
      <div>${outcome=="win" ? "😎 You won! Play again?" : "😵 You lost. Try again?"}</div>
    </div>
    <div>
      <div><a href="#" onclick="statsMinisweeper();return false">📊</a></div>
      <div><a href="#" onclick="restartMinisweeper();return false">New game</a></div>
    </div>
  </div>
`
    ); 
  }
  else { 
    element.insertAdjacentHTML('beforeend', 
`
  <div id="minisweeper-controls">
    <div>
      <div>Cleared: ${clear}%</div>
      <div><a href="#" onclick="statsMinisweeper();return false">📊</a></div>
    </div>
    <div>
      <div>Right-click to 🚩</div>
      <div><a href="#" onclick="confirmRestartMinisweeper();return false">New game</a></div>
    </div>
  </div>
`
    ); 
  }
}

const confirmRestartMinisweeper = () => { 
  displayBoard(minisweeperElement, minisweeperState.board, minisweeperState.marks, "confirm"); 
  return false;
}

const cancelRestartMiniSweeper = () => { 
  displayBoard(minisweeperElement, minisweeperState.board, minisweeperState.marks);
  return false; 
}

const restartMinisweeper = () => { 
  minisweeperState.board = makeBoard(); 
  minisweeperState.marks = []; 
  minisweeperState.stats.games++; 
  localStorage.setItem("minisweeperState", JSON.stringify(minisweeperState)); 
  startMinisweeper(minisweeperElement); 
  return false;
}

const statsMinisweeper = () => { 
  minisweeperElement.textContent = ''; 
  minisweeperElement.insertAdjacentHTML('beforeend', 
`
    <div><b>Stats</b></div>
    <div id="minisweeper-controls">
      <hr />
      <div>
        <div>Games played</div>
        <div>${minisweeperState.stats.games}</div>
      </div>
      <div>
        <div>Games won</div>
        <div>${minisweeperState.stats.wins}</div>
      </div>
      <div>
        <div>Success rate</div>
        <div>${(Math.round(minisweeperState.stats.wins *100) / minisweeperState.stats.games).toFixed(2)}%</div>
      </div>
      <hr />
      <div>
        <a href="#" onclick="goBackMinisweeper();return false" style="display:inline-block;text-align:center;width:100%">Go Back</a>
      </div>
    </div>
`
  ); 
  return false;
}

const goBackMinisweeper = () => { 
  if(minisweeperState.board.indexOf(19)==-1) { 
    outcome = "lose"; 
  }
  else if(minisweeperState.board.filter(el => el > 9).length < 11) { 
    outcome = "win";
  } 
  displayBoard(minisweeperElement, minisweeperState.board, minisweeperState.marks, outcome); 
  return false; 
}

var minisweeperState; 
var minisweeperElement; 

const startMinisweeper = (element) => { 
  minisweeperElement = element; 
  minisweeperState = localStorage.getItem("minisweeperState"); 
  if(minisweeperState) { 
    minisweeperState = JSON.parse(minisweeperState); 
  } else { 
    minisweeperState = { board: makeBoard(), marks: [], stats: { games:1, wins: 0 }};
  } 
  let outcome; 
  if(minisweeperState.board.indexOf(19)==-1) { 
    outcome = "lose"; 
  }
  else if(minisweeperState.board.filter(el => el > 9).length < 11) { 
    outcome = "win";
  } 
  displayBoard(minisweeperElement, minisweeperState.board, minisweeperState.marks, outcome); 
  localStorage.setItem("minisweeperState", JSON.stringify(minisweeperState)); 
}