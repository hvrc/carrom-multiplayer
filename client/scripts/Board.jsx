import { useEffect, useRef, useState } from "react";
import Striker from "./Striker";
import Coin from "./Coin";

function GameCanvas({
  isMyTurn = true,
  onStrikerMove = () => {},
  socket,
  playerRole,
  roomName,
  gameManager,
}) {
  const canvasRef = useRef(null);
  const strikerRef = useRef(null);

  // track how many continued turns remain
  // track how many coins player owes
  const continuedTurnsRef = useRef(0);
  const debtRef = useRef(0);
  const [isPlacing, setisPlacing] = useState(false);
  const [canPlace, setCanPlace] = useState(true);
  const [isFlickerActive, setIsFlickerActive] = useState(false);
  const [flick, setFlick] = useState({
    active: false,
    startX: 0,
    startY: 0,
    endX: 0,
    endY: 0,
  });
  const [isAnimating, setIsAnimating] = useState(false);
  const [coins, setCoins] = useState([]);
  const coinsRef = useRef([]);
  // all-time pocketed coins
  // coins pocketed in current turn
  const pocketedCoinsRef = useRef(new Set()); 
  const pocketedThisTurnRef = useRef([]);  // track initial coin counts for game end detection
  const initialCoinCountsRef = useRef({ white: 0, black: 0, red: 0 });
  // queue turn actions until all movement stops
  const pendingTurnActionRef = useRef(null);
  
  const flickMaxLength = 120;
  const flickPower = 0.15;
  
  // consistent movement threshold for both striker and coins
  const MOVEMENT_THRESHOLD = 0.2;

  const frameSize = 900;
  const boardSize = 750;
  const pocketDiameter = 45;
  const baseDistance = 102;
  const baseHeight = 32;
  const baseWidth = 470;
  const centerCircleDiameter = 170;

  // add coins at the center of the board
  // place 2 white and 2 black coins, queen

  useEffect(() => {
    if (!canvasRef.current) return;
    const boardX = (canvasRef.current.width - boardSize) / 2;
    const boardY = (canvasRef.current.height - boardSize) / 2;
    const pocketRadius = pocketDiameter / 2;
    const coinOffset = 60; // distance from pocket center to coin

    // Position coins near each pocket
    // Top-left pocket: white coin
    const whiteCoin1 = new Coin({
      id: 1,
      color: "white",
      x: boardX + pocketRadius + coinOffset,
      y: boardY + pocketRadius + coinOffset,
    });

    // Top-right pocket: black coin
    const blackCoin1 = new Coin({
      id: 2,
      color: "black",
      x: boardX + boardSize - pocketRadius - coinOffset,
      y: boardY + pocketRadius + coinOffset,
    });

    // Bottom-left pocket: black coin
    const blackCoin2 = new Coin({
      id: 3,
      color: "black",
      x: boardX + pocketRadius + coinOffset,
      y: boardY + boardSize - pocketRadius - coinOffset,
    });

    // Bottom-right pocket: white coin
    const whiteCoin2 = new Coin({
      id: 4,
      color: "white",
      x: boardX + boardSize - pocketRadius - coinOffset,
      y: boardY + boardSize - pocketRadius - coinOffset,
    });

    // Queen at center
    const centerX = boardX + boardSize / 2;
    const centerY = boardY + boardSize / 2;
    const queenCoin = new Coin({
      id: 5,
      color: "red",
      x: boardX + pocketRadius + coinOffset - 50,
      y: boardY + boardSize - pocketRadius - coinOffset,
    });    coinsRef.current = [whiteCoin1, blackCoin1, blackCoin2, whiteCoin2, queenCoin];
    setCoins([whiteCoin1, blackCoin1, blackCoin2, whiteCoin2, queenCoin]);
    
    // count initial coins by color for game end detection
    const allCoins = [whiteCoin1, blackCoin1, blackCoin2, whiteCoin2, queenCoin];
    initialCoinCountsRef.current = {
      white: allCoins.filter(coin => coin.color === 'white').length,
      black: allCoins.filter(coin => coin.color === 'black').length,
      red: allCoins.filter(coin => coin.color === 'red').length
    };
  }, []);

  // add a coin to the list
  // remove it from being tracked as pocketed
  function addCoin({ id, color, x, y }) {
    const newCoin = new Coin({ id, color, x, y });
    coinsRef.current = [...coinsRef.current, newCoin];
    setCoins([...coinsRef.current]);
    pocketedCoinsRef.current.delete(id);
  }

  // add a coin at the center of the board
  function addCoinAtCenter(id, color) {
    if (!canvasRef.current) return;
    const boardX = (canvasRef.current.width - boardSize) / 2;
    const boardY = (canvasRef.current.height - boardSize) / 2;
    const centerX = boardX + boardSize / 2;
    const centerY = boardY + boardSize / 2;
    addCoin({ id, color, x: centerX, y: centerY });
  }

  // remove a coin by id
  function removeCoin(id) {
    coinsRef.current = coinsRef.current.filter((coin) => coin.id !== id);
    setCoins([...coinsRef.current]);
  }

  // reset striker position when all movement has stopped
  function executeStrikerReset(actionData) {
    if (!strikerRef.current) return;
    
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    
    const boardX = (ctx.canvas.width - boardSize) / 2;
    const boardY = (ctx.canvas.height - boardSize) / 2;
    const bottomBaselineY = boardY + boardSize - baseDistance - baseHeight / 2;
    const topBaselineY = boardY + baseDistance + baseHeight / 2;
    
    let newX = boardX + boardSize / 2;
    let newY;
    
    if (actionData.type === 'turnSwitch') {
      // reset striker position based on new turn
      newY = actionData.newTurn === playerRole ? 
        (playerRole === "joiner" ? topBaselineY : bottomBaselineY) :
        (playerRole === "joiner" ? bottomBaselineY : topBaselineY);
        
    } else if (actionData.type === 'turnContinue') {
      // reset striker position based on who continues
      newY = actionData.continueWith === playerRole ?
        (playerRole === "joiner" ? topBaselineY : bottomBaselineY) :
        (playerRole === "joiner" ? bottomBaselineY : topBaselineY);
        
      // update continued turns count
      if (actionData.continuedTurns !== undefined) {
        continuedTurnsRef.current = actionData.continuedTurns;
      }
    }
    
    // apply the position reset
    strikerRef.current.x = newX;
    strikerRef.current.y = newY;
    strikerRef.current.velocity = { x: 0, y: 0 };
    strikerRef.current.isStrikerMoving = false;
    
    // clear pocketed coins for new turn
    pocketedThisTurnRef.current = [];
    
    // redraw the board
    drawBoard(ctx);
    
    console.log(`Striker reset executed: ${actionData.type}`, { newX, newY });
  }

  const drawBoard = (ctx) => {
    ctx.save();
    if (playerRole === "joiner") {
      ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-ctx.canvas.width / 2, -ctx.canvas.height / 2);
    }
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    const frameX = (ctx.canvas.width - frameSize) / 2;
    const frameY = (ctx.canvas.height - frameSize) / 2;
    const boardX = (ctx.canvas.width - boardSize) / 2;
    const boardY = (ctx.canvas.height - boardSize) / 2;

    // initialize striker if not already done
    if (!strikerRef.current) {
      const initialX = boardX + boardSize / 2;
      const initialY = boardY + boardSize - baseDistance - baseHeight / 2;
      strikerRef.current = new Striker(initialX, initialY);
    }

    // draw frame and board
    ctx.strokeStyle = "black";
    ctx.lineWidth = 1;
    ctx.strokeRect(frameX, frameY, frameSize, frameSize);
    ctx.strokeRect(boardX, boardY, boardSize, boardSize);

    // draw pockets
    const pocketRadius = pocketDiameter / 2;
    const pocketPositions = [
      [boardX + pocketRadius, boardY + pocketRadius],
      [boardX + boardSize - pocketRadius, boardY + pocketRadius],
      [boardX + pocketRadius, boardY + boardSize - pocketRadius],
      [boardX + boardSize - pocketRadius, boardY + boardSize - pocketRadius],
    ];

    pocketPositions.forEach(([x, y]) => {
      ctx.beginPath();
      ctx.arc(x, y, pocketRadius, 0, Math.PI * 2);
      ctx.stroke();
    });

    // draw base lines
    const basePositions = [
      {
        side: "bottom",
        x: boardX + (boardSize - baseWidth) / 2,
        y: boardY + boardSize - baseDistance - baseHeight,
      },
      {
        side: "top",
        x: boardX + (boardSize - baseWidth) / 2,
        y: boardY + baseDistance,
      },
      {
        side: "left",
        x: boardX + baseDistance,
        y: boardY + (boardSize - baseWidth) / 2,
      },
      {
        side: "right",
        x: boardX + boardSize - baseDistance - baseHeight,
        y: boardY + (boardSize - baseWidth) / 2,
      },
    ];

    // draw moons and base lines
    basePositions.forEach((pos) => {
      const isVertical = pos.side === "left" || pos.side === "right";
      const baseRadius = baseHeight / 2;

      if (isVertical) {
        ctx.beginPath();
        ctx.arc(pos.x + baseRadius, pos.y + baseRadius, baseRadius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pos.x + baseRadius, pos.y + baseWidth - baseRadius, baseRadius, 0, Math.PI * 2);

        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y + baseRadius);
        ctx.lineTo(pos.x, pos.y + baseWidth - baseRadius);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x + baseHeight, pos.y + baseRadius);
        ctx.lineTo(pos.x + baseHeight, pos.y + baseWidth - baseRadius);
        ctx.stroke();

      } else {
        ctx.beginPath();
        ctx.arc(
          pos.x + baseRadius,
          pos.y + baseRadius,
          baseRadius,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(pos.x + baseWidth - baseRadius, pos.y + baseRadius, baseRadius, 0, Math.PI * 2);

        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x + baseRadius, pos.y);
        ctx.lineTo(pos.x + baseWidth - baseRadius, pos.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(pos.x + baseRadius, pos.y + baseHeight);
        ctx.lineTo(pos.x + baseWidth - baseRadius, pos.y + baseHeight);
        ctx.stroke();
      }
    });

    // const centerX = boardX + boardSize / 2;
    // const centerY = boardY + boardSize / 2;
    // ctx.beginPath();
    // ctx.arc(centerX, centerY, centerCircleDiameter / 2, 0, Math.PI * 2);
    // ctx.stroke();

    if (strikerRef.current) {
      strikerRef.current.draw(ctx);
    }

    // draw all coins
    coinsRef.current.forEach((coin) => coin.draw(ctx));

    // draw flick line if active
    if (isFlickerActive && flick.active) {
      ctx.save();
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(flick.startX, flick.startY);

      // cap the line at max length
      let dx = flick.endX - flick.startX;
      let dy = flick.endY - flick.startY;
      let d = Math.hypot(dx, dy);
      let capX = flick.endX, capY = flick.endY;
      if (d > flickMaxLength) {
        const scale = flickMaxLength / d;
        capX = flick.startX + dx * scale;
        capY = flick.startY + dy * scale;
      }
      ctx.lineTo(capX, capY);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  };

  // show place button immediately after clicking flick
  const handleFlick = () => {
    setCanPlace(false);
    setIsFlickerActive(true);
    setTimeout(() => setCanPlace(true), 0);
  };

  const handlePlace = () => {
    setCanPlace(true);
    setisPlacing(false);
    setIsFlickerActive(false);
    setFlick({ active: false, startX: 0, startY: 0, endX: 0, endY: 0 });
    if (strikerRef.current) strikerRef.current.isPlacing = false;
  };

  // flick mouse handlers
  const handleFlickMouseDown = (e) => {
    if (!isMyTurn || !strikerRef.current || !isFlickerActive) return;
    const rect = canvasRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    if (playerRole === "joiner") {
      x = canvasRef.current.width - x;
      y = canvasRef.current.height - y;
    }

    setFlick({
      active: true,
      startX: strikerRef.current.x,
      startY: strikerRef.current.y,
      endX: x,
      endY: y,
    });
  };

  const handleFlickMouseMove = (e) => {
    if (!isMyTurn || !strikerRef.current || !isFlickerActive || !flick.active)
      return;
    const rect = canvasRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;
    if (playerRole === "joiner") {
      x = canvasRef.current.width - x;
      y = canvasRef.current.height - y;
    }
    setFlick((s) => ({ ...s, endX: x, endY: y }));
  };

  const handleFlickMouseUp = (e) => {
    if (!isMyTurn || !strikerRef.current || !isFlickerActive || !flick.active)
      return;
    // calculate velocity (opposite direction of pull)
    let dx = flick.startX - flick.endX;
    let dy = flick.startY - flick.endY;
    const dist = Math.hypot(dx, dy);
    if (dist > flickMaxLength) {
      const scale = flickMaxLength / dist;
      dx *= scale;
      dy *= scale;
    }
    strikerRef.current.velocity.x = dx * flickPower;
    strikerRef.current.velocity.y = dy * flickPower;
    strikerRef.current.isStrikerMoving = true;
    setFlick({ active: false, startX: 0, startY: 0, endX: 0, endY: 0 });
    setIsAnimating(true);
  };
  // unified mouse event handlers to switch between placement and flicker modes
  // placement mode, allow dragging the striker
  // check if click is on striker
  // 30px radius for striker hit
  const handleMouseDown = (e) => {
    // block all input when animation is active (striker/coins are moving)
    if (isAnimating) return;
    
    if (isFlickerActive) {
      handleFlickMouseDown(e);
    } else if (canPlace) {
      if (!isMyTurn || !strikerRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let y = e.clientY - rect.top;
      if (playerRole === "joiner") {
        x = canvasRef.current.width - x;
        y = canvasRef.current.height - y;
      }
      const dx = x - strikerRef.current.x;
      const dy = y - strikerRef.current.y;
      if (Math.hypot(dx, dy) < 30) {
        setisPlacing(true);
        strikerRef.current.isPlacing = true;
      }
    }
  };
  const handleMouseMove = (e) => {
    // block all input when animation is active (striker/coins are moving)
    if (isAnimating) return;
    
    if (isFlickerActive) {
      handleFlickMouseMove(e);
    } else if (isPlacing && canPlace && isMyTurn && strikerRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let y = e.clientY - rect.top;
      if (playerRole === "joiner") {
        x = canvasRef.current.width - x;
        y = canvasRef.current.height - y;
      }
      strikerRef.current.x = x;
      strikerRef.current.y = y;

      // sync striker position to other player
      if (socket && roomName) {
        socket.emit("strikerMove", { roomName, position: { x, y } });
      }

      const ctx = canvasRef.current.getContext("2d");
      drawBoard(ctx);
    }
  };
  const handleMouseUp = (e) => {
    // block all input when animation is active (striker/coins are moving)
    if (isAnimating) return;
    
    if (isFlickerActive) {
      handleFlickMouseUp(e);
    } else if (isPlacing) {
      setisPlacing(false);
      if (strikerRef.current) strikerRef.current.isPlacing = false;
    }
  };

  // collision
  // elastic collision between two circles, striker coin
  function resolveCircleCollision(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy);
    if (dist === 0) return;
    const overlap = a.radius + b.radius - dist;
    if (overlap > 0) {
      const nx = dx / dist;
      const ny = dy / dist;
      const totalMass = a.strikerMass
        ? a.strikerMass + b.coinMass
        : a.coinMass + b.coinMass;
      const aMass = a.strikerMass || a.coinMass;
      const bMass = b.coinMass;
      a.x -= nx * (overlap * (bMass / totalMass));
      a.y -= ny * (overlap * (bMass / totalMass));
      b.x += nx * (overlap * (aMass / totalMass));
      b.y += ny * (overlap * (aMass / totalMass));
      const dvx = b.velocity.x - a.velocity.x;
      const dvy = b.velocity.y - a.velocity.y;
      const vn = dvx * nx + dvy * ny;
      if (vn < 0) {
        const restitution = Math.min(a.restitution || 1, b.restitution || 1);
        const impulse = (-(1 + restitution) * vn) / (1 / aMass + 1 / bMass);
        const impulseX = impulse * nx;
        const impulseY = impulse * ny;
        a.velocity.x -= impulseX / aMass;
        a.velocity.y -= impulseY / aMass;
        b.velocity.x += impulseX / bMass;
        b.velocity.y += impulseY / bMass;
      }
    }
  }

  // coin border
  function handleCoinBorderCollision(coin, boardX, boardY, boardSize) {
    let collided = false;
    const minX = boardX + coin.radius;
    const maxX = boardX + boardSize - coin.radius;
    const minY = boardY + coin.radius;
    const maxY = boardY + boardSize - coin.radius;
    if (coin.x < minX) {
      coin.x = minX;
      coin.velocity.x = Math.abs(coin.velocity.x) * coin.restitution;
      collided = true;
    } else if (coin.x > maxX) {
      coin.x = maxX;
      coin.velocity.x = -Math.abs(coin.velocity.x) * coin.restitution;
      collided = true;
    }
    if (coin.y < minY) {
      coin.y = minY;
      coin.velocity.y = Math.abs(coin.velocity.y) * coin.restitution;
      collided = true;
    } else if (coin.y > maxY) {
      coin.y = maxY;
      coin.velocity.y = -Math.abs(coin.velocity.y) * coin.restitution;
      collided = true;
    }
    return collided;
  }

  // check if an object is near any pocket
  function isNearAnyPocket(x, y, pockets, threshold = 60) {
    return pockets.some((pocket) => {
      const dist = Math.hypot(x - pocket.x, y - pocket.y);
      return dist < threshold;
    });
  }

  // animation loop for striker and coin movement
  // track the last scored coin to prevent duplicate scoring
  useEffect(() => {
    let animationId;
    let lastScoredCoinId = null; 

    function animate() {
      if (!strikerRef.current || !isMyTurn) return;      const boardX = (canvasRef.current.width - boardSize) / 2;
      const boardY = (canvasRef.current.height - boardSize) / 2;

      strikerRef.current.update(0.98, MOVEMENT_THRESHOLD, boardX, boardY, boardSize);
      coinsRef.current.forEach((coin) => {
        coin.update();
        handleCoinBorderCollision(coin, boardX, boardY, boardSize);
      });

      coinsRef.current.forEach((coin) => {
        resolveCircleCollision(strikerRef.current, coin);
      });

      for (let i = 0; i < coinsRef.current.length; i++) {
        for (let j = i + 1; j < coinsRef.current.length; j++) {
          resolveCircleCollision(coinsRef.current[i], coinsRef.current[j]);
        }
      }

      if (socket && roomName) {
        socket.emit("strikerMove", {
          roomName,
          position: { x: strikerRef.current.x, y: strikerRef.current.y },
        });

        socket.emit("coinsMove", {
          roomName,
          coins: coinsRef.current.map((coin) => ({
            id: coin.id,
            x: coin.x,
            y: coin.y,
            velocity: { ...coin.velocity },
          })),
        });
      }

      const ctx = canvasRef.current.getContext("2d");
      const pocketRadius = pocketDiameter / 2;
      
      const pockets = [
        { x: boardX + pocketRadius, y: boardY + pocketRadius },
        { x: boardX + boardSize - pocketRadius, y: boardY + pocketRadius },
        { x: boardX + pocketRadius, y: boardY + boardSize - pocketRadius },
        {
          x: boardX + boardSize - pocketRadius,
          y: boardY + boardSize - pocketRadius,
        },
      ];
      
      // check if striker is pocketed
      const striker = strikerRef.current;
      if (isNearAnyPocket(striker.x, striker.y, pockets)) {
        for (const pocket of pockets) {
          const strikerDist = Math.hypot(
            striker.x - pocket.x,
            striker.y - pocket.y,
          );
          
          if (strikerDist < pocketRadius - striker.radius / 2) {
            setIsAnimating(false);
            setIsFlickerActive(false);
            setCanPlace(true);

            const currentPlayerData = gameManager.getPlayerData(playerRole);
            
            // if player has pocketed queen, reset queen instead of paying debt with player coin
            if (currentPlayerData.hasPocketedQueen) {
              // reset queen to center
              socket.emit("queenReset", {
                roomName,
                playerRole: playerRole,
              });
              
              // reset queen status flags
              currentPlayerData.hasPocketedQueen = false;
              currentPlayerData.hasCoveredQueen = false;
              currentPlayerData.isCoverTurn = false;
              
              // emit state updates to other player
              socket.emit("queenPocketedUpdate", {
                roomName,
                playerRole,
                hasPocketedQueen: false
              });
              
              socket.emit("queenCoveredUpdate", {
                roomName,
                playerRole,
                hasCoveredQueen: false
              });
              
              socket.emit("coverTurnUpdate", {
                roomName,
                playerRole,
                isCoverTurn: false
              });
              
            } else {
              // normal striker pocketing, increment debt and let server handle automatic payment
              debtRef.current++;

              // emit debt update, server will handle automatic payment if score > 0
              socket.emit("updateDebt", {
                roomName,
                playerRole,
                debt: debtRef.current,
              });
            }

            if (socket && roomName) {
              socket.emit("switchTurn", { roomName });
            }
            return;
          }
        }
      }

      // check coin pocketing
      const pocketedCoins = [];
      coinsRef.current.forEach((coin) => {

        if (isNearAnyPocket(coin.x, coin.y, pockets)) {
          for (const pocket of pockets) {
            const coinDist = Math.hypot(coin.x - pocket.x, coin.y - pocket.y);
            if (coinDist < pocketRadius - coin.radius / 2) {
                
              // only add to pocketed coins if we haven't scored with this coin yet
              if (lastScoredCoinId !== coin.id) {
                pocketedCoins.push(coin);
                lastScoredCoinId = coin.id;

                // queen pocketed
                if (coin.color === "red") {
                  const currentPlayerData = gameManager.getPlayerData(playerRole);

                  // set cover turn to true when queen is pocketed
                  currentPlayerData.isCoverTurn = true;
                  currentPlayerData.hasPocketedQueen = true;

                  // emit cover turn state to synchronize across clients
                  if (isMyTurn) {
                    socket.emit("coverTurnUpdate", {
                      roomName,
                      playerRole,
                      isCoverTurn: true
                    });

                    // emit queen pocketed state
                    socket.emit("queenPocketedUpdate", {
                      roomName,
                      playerRole,
                      hasPocketedQueen: true
                    });

                    // increment player score when queen is pocketed
                    socket.emit("updateScore", {
                      roomName,
                      playerRole: playerRole,
                      increment: 1,
                    });
                  }
                } 
                
                // update score based on coin color, excluding queen which is handled above
                // determine which player's color matches the coin
                if (isMyTurn && coin.color !== "red") {
                  let scoringPlayerRole;

                  if (coin.color === "white") {
                    scoringPlayerRole = "creator";
                  } else if (coin.color === "black") {
                    scoringPlayerRole = "joiner";
                  }

                  if (scoringPlayerRole) {
                    socket.emit("updateScore", {
                      roomName,
                      playerRole: scoringPlayerRole,
                      coinColor: coin.color,
                    });
                  }
                }
              }
              break;
            }
          }
        }
      });
      
      // remove pocketed coins
      // add to the turn's pocketed coins list
      if (pocketedCoins.length > 0) {
        pocketedCoins.forEach((coin) => {
          removeCoin(coin.id);
          pocketedThisTurnRef.current.push(coin);
        });

        if (socket && roomName) {
          socket.emit("coinsPocketed", {
            roomName,
            pocketedIds: pocketedCoins.map((c) => c.id),
          });
        }
      }

      // draw updated state
      drawBoard(ctx);      // check if anything is still moving using consistent threshold
      const isAnythingMoving = 
        striker.isMoving(MOVEMENT_THRESHOLD) || 
        coinsRef.current.some(coin => coin.isMoving(MOVEMENT_THRESHOLD));

      if (isAnythingMoving) {
        animationId = requestAnimationFrame(animate);      } else {
        setIsAnimating(false);
        setIsFlickerActive(false);
        setCanPlace(true);
        
        // execute any pending turn actions now that all movement has stopped
        if (pendingTurnActionRef.current) {
          const pendingAction = pendingTurnActionRef.current;
          pendingTurnActionRef.current = null; // clear the pending action
          executeStrikerReset(pendingAction);
          return; // exit early to avoid game logic interference
        }
        
        // reset the last scored coin when animation stops
        lastScoredCoinId = null;
        const playerColor = playerRole === "creator" ? "white" : "black";
        const currentPlayerData = gameManager.getPlayerData(playerRole);

        // check if queen was pocketed this turn
        const queenPocketed = pocketedThisTurnRef.current.some(coin => coin.color === "red",);

        // if queen was pocketed this turn
        // count other coins pocketed, excluding queen to determine continued turns
        if (queenPocketed) {
          const otherCoinsThisTurn = pocketedThisTurnRef.current.filter( (coin) => coin.color !== "red", );
          const pocketedOwnColorCoins = otherCoinsThisTurn.filter( (coin) => coin.color === playerColor, );

          // add continued turns for non-queen coins pocketed in the same turn as queen
          if (pocketedOwnColorCoins.length > 0) {
            continuedTurnsRef.current += pocketedOwnColorCoins.length - 1;
            socket.emit("continueTurn", {
              roomName,
              continuedTurns: continuedTurnsRef.current, 
            });

          } else {
            // no other coins pocketed with queen, just continue for cover turn
            socket.emit("continueTurn", {
              roomName,
              continuedTurns: 0, // cover turn only
            });
          }
          
          // clear pocketed coins for the cover turn
          pocketedThisTurnRef.current = [];
        } 

        // if this is a cover turn attempt (queen was pocketed in previous turn)
        else if (currentPlayerData.isCoverTurn) {
          const pocketedPlayerColorCoins = pocketedThisTurnRef.current.filter((coin) => coin.color === playerColor, );
          
          // if no coins were pocketed this turn, or no player color coins were pocketed
          if ( pocketedThisTurnRef.current.length === 0 || pocketedPlayerColorCoins.length === 0 ) {

            // cover turn failed, reset queen and decrement score
            if (isMyTurn) {
              currentPlayerData.isCoverTurn = false;
              currentPlayerData.hasPocketedQueen = false;
              currentPlayerData.hasCoveredQueen = false;
              
              // emit cover turn state update
              socket.emit("coverTurnUpdate", {
                roomName,
                playerRole,
                isCoverTurn: false
              });

              // emit queen pocketed state reset
              socket.emit("queenPocketedUpdate", {
                roomName,
                playerRole,
                hasPocketedQueen: false
              });

              // emit queen covered state reset
              socket.emit("queenCoveredUpdate", {
                roomName,
                playerRole,
                hasCoveredQueen: false
              });
              
              socket.emit("queenReset", {
                roomName,
                playerRole: playerRole,
              });
              socket.emit("updateScore", {
                roomName,
                playerRole: playerRole,
                increment: -1,
              });
            }
            socket.emit("switchTurn", { roomName });

          } else {
            // cover turn succeeded
            currentPlayerData.isCoverTurn = false;
            currentPlayerData.hasCoveredQueen = true;
            
            // emit cover turn state update
            socket.emit("coverTurnUpdate", {
              roomName,
              playerRole,
              isCoverTurn: false
            });

            // emit queen covered state
            socket.emit("queenCoveredUpdate", {
              roomName,
              playerRole,
              hasCoveredQueen: true
            });
            
            // add continued turns for coins pocketed during successful cover turn
            const pocketedOwnColorCoins = pocketedThisTurnRef.current.filter(
              (coin) => coin.color === playerColor,
            );
            
            if (pocketedOwnColorCoins.length > 0) {
              continuedTurnsRef.current += pocketedOwnColorCoins.length - 1;
              socket.emit("continueTurn", {
                roomName,
                continuedTurns: continuedTurnsRef.current,
              });

            } else {
              // no coins pocketed during cover turn, switch turn
              socket.emit("switchTurn", { roomName });
            }
          }
          
          // clear pocketed coins for next turn
          pocketedThisTurnRef.current = [];
        } 

        // regular turn logic, no queen involved
        else {
          const pocketedOwnColorCoins = pocketedThisTurnRef.current.filter(
            (coin) => coin.color === playerColor,
          );

          if (pocketedOwnColorCoins.length > 0) {
            continuedTurnsRef.current += pocketedOwnColorCoins.length - 1;
            socket.emit("continueTurn", {
              roomName,
              continuedTurns: continuedTurnsRef.current,
            });

          } else {
            socket.emit("switchTurn", { roomName });
          }
          // clear pocketed coins for next turn
          pocketedThisTurnRef.current = [];
        }

        // check if all coins of one color have been pocketed (game end condition)
        if (isMyTurn) {
          const remainingCoins = coinsRef.current.filter(coin => coin.color !== "red"); // exclude queen
          const whiteCoinsRemaining = remainingCoins.filter(coin => coin.color === "white");
          const blackCoinsRemaining = remainingCoins.filter(coin => coin.color === "black");

          // if all white or all black coins are pocketed, reset the game
          if (whiteCoinsRemaining.length === 0 || blackCoinsRemaining.length === 0) {            
            // emit game reset event to server
            socket.emit("gameReset", {
              roomName,
              reason: whiteCoinsRemaining.length === 0 ? "All white coins pocketed" : "All black coins pocketed"
            });
          }
        }
      }
    }

    if (isAnimating && isMyTurn) {
      animationId = requestAnimationFrame(animate);
    }

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isAnimating, socket, roomName, isMyTurn]);

  // listen for striker moves from other player
  useEffect(() => {
    if (!socket || !roomName) return;

    // reset event versus regular move event
    const handleStrikerMove = (data) => {
      if (data.roomName === roomName && strikerRef.current) {
        
        // if this is a reset event from server, update striker's state
        if (data.isReset) {
          strikerRef.current.x = data.x;
          strikerRef.current.y = data.y;
          strikerRef.current.velocity = { x: 0, y: 0 };
          strikerRef.current.isStrikerMoving = false;
        } else if (data.position) {
          strikerRef.current.updatePosition(data.position.x, data.position.y);
        }
        const ctx = canvasRef.current.getContext("2d");
        drawBoard(ctx);
      }
    };

    socket.on("strikerMove", handleStrikerMove);

    return () => {
      socket.off("strikerMove", handleStrikerMove);
    };
  }, [socket, roomName]);

  // listen for turn switch and reset striker position
  useEffect(() => {
    if (!socket || !roomName) return;    const handleTurnSwitched = (data) => {
      if (data.roomName !== roomName) return;
      
      // check if movement is still happening
      const areObjectsMoving = 
        strikerRef.current?.isMoving(MOVEMENT_THRESHOLD) ||
        coinsRef.current.some(coin => coin.isMoving(MOVEMENT_THRESHOLD));
      
      if (areObjectsMoving) {
        // queue the action until movement stops
        pendingTurnActionRef.current = {
          type: 'turnSwitch',
          newTurn: data.nextTurn
        };
        console.log('Turn switch queued - waiting for movement to stop');
      } else {
        // execute immediately if nothing is moving
        executeStrikerReset({
          type: 'turnSwitch',
          newTurn: data.nextTurn
        });
      }
    };

    socket.on("turnSwitched", handleTurnSwitched);
    return () => {
      socket.off("turnSwitched", handleTurnSwitched);
    };
  }, [socket, roomName, playerRole]);

  // listen for turn continuation and reset striker position
  useEffect(() => {
    if (!socket || !roomName) return;    const handleTurnContinued = (data) => {
      if (data.roomName !== roomName) return;
      
      // check if movement is still happening
      const areObjectsMoving = 
        strikerRef.current?.isMoving(MOVEMENT_THRESHOLD) ||
        coinsRef.current.some(coin => coin.isMoving(MOVEMENT_THRESHOLD));
      
      if (areObjectsMoving) {
        // queue the action until movement stops
        pendingTurnActionRef.current = {
          type: 'turnContinue',
          continueWith: data.continueWith,
          continuedTurns: data.continuedTurns
        };
        console.log('Turn continue queued - waiting for movement to stop');
      } else {
        // execute immediately if nothing is moving
        executeStrikerReset({
          type: 'turnContinue',
          continueWith: data.continueWith,
          continuedTurns: data.continuedTurns
        });
      }
    };

    socket.on("turnContinued", handleTurnContinued);
    return () => socket.off("turnContinued", handleTurnContinued);
  }, [socket, roomName, playerRole]);

  // striker movement sync, sync coin positions to other player
  // emit coin positions whenever coins move (animation frame)
  useEffect(() => {
    if (!socket || !roomName) return;
    if (isAnimating) {
      const coinStates = coinsRef.current.map((coin) => ({
        id: coin.id,
        x: coin.x,
        y: coin.y,
        velocity: { ...coin.velocity },
      }));
      socket.emit("coinsMove", { roomName, coins: coinStates });
    }
  }, [isAnimating, socket, roomName, coins]);

  // listen for coin movement from other player
  // don't process if it's my turn
  // update each coin's position and velocity
  // update state and redraw

  useEffect(() => {
    if (!socket || !roomName) return;
    const handleCoinsMove = (data) => {
      if (data.roomName !== roomName || isMyTurn) return; 
      coinsRef.current.forEach((coin) => {
        const remote = data.coins.find((c) => c.id === coin.id);
        if (remote) {
          coin.x = remote.x;
          coin.y = remote.y;
          coin.velocity = { ...remote.velocity };
        }
      });
      setCoins([...coinsRef.current]);
      const ctx = canvasRef.current.getContext("2d");
      drawBoard(ctx);
    };

    socket.on("coinsMove", handleCoinsMove);
    return () => socket.off("coinsMove", handleCoinsMove);
  }, [socket, roomName, isMyTurn]);

  // listen for pocketed coins from other player
  // remove each pocketed coin
  // force a redraw

  useEffect(() => {
    if (!socket || !roomName) return;
    const handleCoinsPocketed = (data) => {
      if (data.roomName !== roomName) return;
      data.pocketedIds.forEach((id) => {
        removeCoin(id);
      });
      const ctx = canvasRef.current.getContext("2d");
      drawBoard(ctx);
    };
    socket.on("coinsPocketed", handleCoinsPocketed);
    return () => socket.off("coinsPocketed", handleCoinsPocketed);
  }, [socket, roomName]);

  // listen for debt payment events
  // add a coin of the player's color at the center
  // force a redraw

  useEffect(() => {
    if (!socket || !roomName) return;
    const handleDebtPaid = (data) => {
      if (data.roomName !== roomName) return;
      addCoinAtCenter(data.coinId, data.coinColor);
      const ctx = canvasRef.current.getContext("2d");
      drawBoard(ctx);
    };
    socket.on("debtPaid", handleDebtPaid);
    return () => socket.off("debtPaid", handleDebtPaid);
  }, [socket, roomName]);

  // listen for queen reset events
  // add queen back to center on both clients
  // force a redraw
  useEffect(() => {
    if (!socket || !roomName) return;
    const handleQueenReset = (data) => {
      if (data.roomName !== roomName) return;
      addCoinAtCenter(5, "red");
      const ctx = canvasRef.current.getContext("2d");
      drawBoard(ctx);
    };
    socket.on("queenReset", handleQueenReset);
    return () => socket.off("queenReset", handleQueenReset);
  }, [socket, roomName]);
  // listen for cover turn state updates
  useEffect(() => {
    if (!socket || !roomName) return;
    const handleCoverTurnUpdate = (data) => {
      if (data.roomName !== roomName) return;
      
      // update the cover turn state for the specified player
      const playerData = gameManager.getPlayerData(data.playerRole);
      if (playerData) {
        playerData.isCoverTurn = data.isCoverTurn;
      }
    };
    socket.on("coverTurnUpdate", handleCoverTurnUpdate);
    return () => socket.off("coverTurnUpdate", handleCoverTurnUpdate);
  }, [socket, roomName, gameManager]);

  // listen for queen pocketed state updates
  useEffect(() => {
    if (!socket || !roomName) return;
    const handleQueenPocketedUpdate = (data) => {
      if (data.roomName !== roomName) return;
      
      const playerData = gameManager.getPlayerData(data.playerRole);
      if (playerData) {
        playerData.hasPocketedQueen = data.hasPocketedQueen;
      }
    };
    socket.on("queenPocketedUpdate", handleQueenPocketedUpdate);
    return () => socket.off("queenPocketedUpdate", handleQueenPocketedUpdate);
  }, [socket, roomName, gameManager]);

  // listen for queen covered state updates
  useEffect(() => {
    if (!socket || !roomName) return;
    const handleQueenCoveredUpdate = (data) => {
      if (data.roomName !== roomName) return;
      
      const playerData = gameManager.getPlayerData(data.playerRole);
      if (playerData) {
        playerData.hasCoveredQueen = data.hasCoveredQueen;
      }
    };
    socket.on("queenCoveredUpdate", handleQueenCoveredUpdate);    return () => socket.off("queenCoveredUpdate", handleQueenCoveredUpdate);
  }, [socket, roomName, gameManager]);

  // listen for game reset events
  useEffect(() => {
    if (!socket || !roomName) return;    const handleGameReset = (data) => {
      if (data.roomName !== roomName) return;      
      
      // clear any pending turn actions
      pendingTurnActionRef.current = null;
      
      // reset all coins to initial positions
      if (!canvasRef.current) return;
      const boardX = (canvasRef.current.width - boardSize) / 2;
      const boardY = (canvasRef.current.height - boardSize) / 2;
      const pocketRadius = pocketDiameter / 2;
      const coinOffset = 60;

      // recreate initial coin setup
      const whiteCoin1 = new Coin({
        id: 1,
        color: "white",
        x: boardX + pocketRadius + coinOffset,
        y: boardY + pocketRadius + coinOffset,
      });

      const blackCoin1 = new Coin({
        id: 2,
        color: "black",
        x: boardX + boardSize - pocketRadius - coinOffset,
        y: boardY + pocketRadius + coinOffset,
      });

      const blackCoin2 = new Coin({
        id: 3,
        color: "black",
        x: boardX + pocketRadius + coinOffset,
        y: boardY + boardSize - pocketRadius - coinOffset,
      });

      const whiteCoin2 = new Coin({
        id: 4,
        color: "white",
        x: boardX + boardSize - pocketRadius - coinOffset,
        y: boardY + boardSize - pocketRadius - coinOffset,
      });

      const queenCoin = new Coin({
        id: 5,
        color: "red",
        x: boardX + pocketRadius + coinOffset - 50,
        y: boardY + boardSize - pocketRadius - coinOffset,
      });      // reset coins array
      coinsRef.current = [whiteCoin1, blackCoin1, blackCoin2, whiteCoin2, queenCoin];
      setCoins([whiteCoin1, blackCoin1, blackCoin2, whiteCoin2, queenCoin]);
      
      // reset initial coin counts
      const allCoins = [whiteCoin1, blackCoin1, blackCoin2, whiteCoin2, queenCoin];
      initialCoinCountsRef.current = {
        white: allCoins.filter(coin => coin.color === 'white').length,
        black: allCoins.filter(coin => coin.color === 'black').length,
        red: allCoins.filter(coin => coin.color === 'red').length
      };      // reset game state
      pocketedCoinsRef.current.clear();
      pocketedThisTurnRef.current = [];
      continuedTurnsRef.current = 0;
      debtRef.current = 0;
      
      // reset game manager state
      gameManager.resetGame();
      
      // reset striker position
      if (strikerRef.current) {
        const initialX = boardX + boardSize / 2;
        const initialY = boardY + boardSize - baseDistance - baseHeight / 2;
        strikerRef.current.x = initialX;
        strikerRef.current.y = initialY;
        strikerRef.current.velocity = { x: 0, y: 0 };
        strikerRef.current.isStrikerMoving = false;
      }
        // redraw board
      const ctx = canvasRef.current.getContext("2d");
      drawBoard(ctx);
    };
    
    socket.on("gameReset", handleGameReset);
    return () => socket.off("gameReset", handleGameReset);
  }, [socket, roomName, gameManager]);

  // separate useEffect for canvas event listeners
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    drawBoard(ctx);
    canvas.addEventListener("mousedown", handleMouseDown);
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseup", handleMouseUp);
    canvas.addEventListener("mouseleave", handleMouseUp);
    return () => {
      canvas.removeEventListener("mousedown", handleMouseDown);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseup", handleMouseUp);
      canvas.removeEventListener("mouseleave", handleMouseUp);
    };  }, [isPlacing, isMyTurn, isFlickerActive, flick]);

  // cleanup pending actions on component unmount or room change
  useEffect(() => {
    return () => {
      pendingTurnActionRef.current = null;
    };
  }, [roomName]);

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={900}
        height={900}        style={{
          backgroundColor: "#fff",
          cursor: isAnimating
            ? "not-allowed"
            : isPlacing
            ? "grabbing"
            : isMyTurn && canPlace
              ? "grab"
              : "default",
        }}
      />
      <br />
      {isMyTurn &&
        !isAnimating &&
        !strikerRef.current?.isStrikerMoving &&
        (isFlickerActive ? (
          <button onClick={handlePlace} style={{ marginBottom: 8 }}>
            Place
          </button>
        ) : (
          <button onClick={handleFlick} style={{ marginBottom: 8 }}>
            Flick
          </button>
        ))}
    </div>
  );
}

export default GameCanvas;