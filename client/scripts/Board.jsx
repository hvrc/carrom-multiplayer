import { useEffect, useRef, useState } from 'react';
import Striker from './Striker';
import Coin from './Coin';

function GameCanvas({ isMyTurn = true, onStrikerMove = () => {}, socket, playerRole, roomName, gameManager }) {    
    const canvasRef = useRef(null);
    const strikerRef = useRef(null);
    const continuedTurnsRef = useRef(0); // Track how many continued turns remain
    const debtRef = useRef(0); // Track how many coins player owes due to striker pocketing
    const [isPlacing, setisPlacing] = useState(false);
    const [canPlace, setCanPlace] = useState(true);
    const [isFlickerActive, setIsFlickerActive] = useState(false);
    const [flick, setFlick] = useState({ active: false, startX: 0, startY: 0, endX: 0, endY: 0 });
    const [isAnimating, setIsAnimating] = useState(false);
    const [coins, setCoins] = useState([]);
    const coinsRef = useRef([]);
    const pocketedCoinsRef = useRef(new Set()); // Track all-time pocketed coins
    const pocketedThisTurnRef = useRef([]); // Track coins pocketed in current turn
    const flickMaxLength = 120;
    const flickPower = 0.15;

    // Board dimensions
    const frameSize = 900;
    const boardSize = 750;
    const pocketDiameter = 45;
    const baseDistance = 102;
    const baseHeight = 32;
    const baseWidth = 470;
    const centerCircleDiameter = 170;

    // Add initial coins at the center on mount
    useEffect(() => {
        if (!canvasRef.current) return;
        const boardX = (canvasRef.current.width - boardSize) / 2;
        const boardY = (canvasRef.current.height - boardSize) / 2;
        const centerX = boardX + boardSize / 2;
        const centerY = boardY + boardSize / 2;

        // Place 2 white and 2 black coins in a small cross at the center
        const offset = 30;
        const whiteCoin1 = new Coin({ id: 1, color: 'white', x: centerX - offset, y: centerY });
        const whiteCoin2 = new Coin({ id: 2, color: 'white', x: centerX + offset, y: centerY });
        const blackCoin1 = new Coin({ id: 3, color: 'black', x: centerX, y: centerY - offset });
        const blackCoin2 = new Coin({ id: 4, color: 'black', x: centerX, y: centerY + offset });
        coinsRef.current = [whiteCoin1, whiteCoin2, blackCoin1, blackCoin2];
        setCoins([whiteCoin1, whiteCoin2, blackCoin1, blackCoin2]);
    }, []);

    // Add a coin to the list
    function addCoin({ id, color, x, y }) {
        const newCoin = new Coin({ id, color, x, y });
        coinsRef.current = [...coinsRef.current, newCoin];
        setCoins([...coinsRef.current]);
        pocketedCoinsRef.current.delete(id); // Remove from pocketed tracking if it was there
    }

    // Add a coin at the center of the board (for debt payment)
    function addCoinAtCenter(id, color) {
        if (!canvasRef.current) return;
        const boardX = (canvasRef.current.width - boardSize) / 2;
        const boardY = (canvasRef.current.height - boardSize) / 2;
        const centerX = boardX + boardSize / 2;
        const centerY = boardY + boardSize / 2;
        addCoin({ id, color, x: centerX, y: centerY });
    }

    // Remove a coin by id
    function removeCoin(id) {
        coinsRef.current = coinsRef.current.filter(coin => coin.id !== id);
        setCoins([...coinsRef.current]);
    }

    const drawBoard = (ctx) => {
        ctx.save();
        if (playerRole === 'joiner') {
            ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
            ctx.rotate(Math.PI);
            ctx.translate(-ctx.canvas.width / 2, -ctx.canvas.height / 2);
        }
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
        
        const frameX = (ctx.canvas.width - frameSize) / 2;
        const frameY = (ctx.canvas.height - frameSize) / 2;
        const boardX = (ctx.canvas.width - boardSize) / 2;
        const boardY = (ctx.canvas.height - boardSize) / 2;
        
        // Initialize striker if not yet created
        if (!strikerRef.current) {
            const initialX = boardX + boardSize / 2;
            const initialY = boardY + boardSize - baseDistance - baseHeight / 2;
            strikerRef.current = new Striker(initialX, initialY);
        }

        // Draw frame and board
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 1;
        ctx.strokeRect(frameX, frameY, frameSize, frameSize);
        ctx.strokeRect(boardX, boardY, boardSize, boardSize);

        // Draw pockets
        const pocketRadius = pocketDiameter / 2;
        const pocketPositions = [
            [boardX + pocketRadius, boardY + pocketRadius],
            [boardX + boardSize - pocketRadius, boardY + pocketRadius],
            [boardX + pocketRadius, boardY + boardSize - pocketRadius],
            [boardX + boardSize - pocketRadius, boardY + boardSize - pocketRadius]
        ];
        
        pocketPositions.forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, pocketRadius, 0, Math.PI * 2);
            ctx.stroke();
        });

        // Draw base lines
        const basePositions = [
            { side: 'bottom', x: boardX + (boardSize - baseWidth) / 2, y: boardY + boardSize - baseDistance - baseHeight },
            { side: 'top', x: boardX + (boardSize - baseWidth) / 2, y: boardY + baseDistance },
            { side: 'left', x: boardX + baseDistance, y: boardY + (boardSize - baseWidth) / 2 },
            { side: 'right', x: boardX + boardSize - baseDistance - baseHeight, y: boardY + (boardSize - baseWidth) / 2 }
        ];

        basePositions.forEach(pos => {
            const isVertical = pos.side === 'left' || pos.side === 'right';
            const baseRadius = baseHeight / 2;

            if (isVertical) {
                // Draw end circles
                ctx.beginPath();
                ctx.arc(pos.x + baseRadius, pos.y + baseRadius, baseRadius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(pos.x + baseRadius, pos.y + baseWidth - baseRadius, baseRadius, 0, Math.PI * 2);
                ctx.stroke();

                // Draw connecting lines
                ctx.beginPath();
                ctx.moveTo(pos.x, pos.y + baseRadius);
                ctx.lineTo(pos.x, pos.y + baseWidth - baseRadius);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(pos.x + baseHeight, pos.y + baseRadius);
                ctx.lineTo(pos.x + baseHeight, pos.y + baseWidth - baseRadius);
                ctx.stroke();
            } else {
                // Draw end circles
                ctx.beginPath();
                ctx.arc(pos.x + baseRadius, pos.y + baseRadius, baseRadius, 0, Math.PI * 2);
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

        // Draw all coins
        coinsRef.current.forEach(coin => coin.draw(ctx));

        // draw flick line if active
        if (isFlickerActive && flick.active) {
            ctx.save();
            ctx.strokeStyle = 'black';
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

    const handleFlick = () => {
        setCanPlace(false);
        setIsFlickerActive(true);
        // show Place button immediately after clicking flick
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
        if (playerRole === 'joiner') {
            x = canvasRef.current.width - x;
            y = canvasRef.current.height - y;
        }
        setFlick({
            active: true,
            startX: strikerRef.current.x,
            startY: strikerRef.current.y,
            endX: x,
            endY: y
        });
    };

    const handleFlickMouseMove = (e) => {
        if (!isMyTurn || !strikerRef.current || !isFlickerActive || !flick.active) return;
        const rect = canvasRef.current.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;
        if (playerRole === 'joiner') {
            x = canvasRef.current.width - x;
            y = canvasRef.current.height - y;
        }
        setFlick(s => ({ ...s, endX: x, endY: y }));
    };

    const handleFlickMouseUp = (e) => {
        if (!isMyTurn || !strikerRef.current || !isFlickerActive || !flick.active) return;
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
    const handleMouseDown = (e) => {
        if (isFlickerActive) {
            handleFlickMouseDown(e);
        } else if (canPlace) {

            // placement mode, allow dragging the striker
            if (!isMyTurn || !strikerRef.current) return;
            const rect = canvasRef.current.getBoundingClientRect();
            let x = e.clientX - rect.left;
            let y = e.clientY - rect.top;
            if (playerRole === 'joiner') {
                x = canvasRef.current.width - x;
                y = canvasRef.current.height - y;
            }

            // check if click is on striker
            const dx = x - strikerRef.current.x;
            const dy = y - strikerRef.current.y;

            // 30px radius for striker hit
            if (Math.hypot(dx, dy) < 30) {
                setisPlacing(true);
                strikerRef.current.isPlacing = true;
            }
        }
    };

    const handleMouseMove = (e) => {
        if (isFlickerActive) {
            handleFlickMouseMove(e);
        } else if (isPlacing && canPlace && isMyTurn && strikerRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            let x = e.clientX - rect.left;
            let y = e.clientY - rect.top;
            if (playerRole === 'joiner') {
                x = canvasRef.current.width - x;
                y = canvasRef.current.height - y;
            }
            strikerRef.current.x = x;
            strikerRef.current.y = y;

            // sync striker position to other player
            if (socket && roomName) {
                socket.emit('strikerMove', { roomName, position: { x, y } });
            }
            const ctx = canvasRef.current.getContext('2d');
            drawBoard(ctx);
        }
    };

    const handleMouseUp = (e) => {
        if (isFlickerActive) {
            handleFlickMouseUp(e);
        } else if (isPlacing) {
            setisPlacing(false);
            if (strikerRef.current) strikerRef.current.isPlacing = false;
        }
    };

    // --- Collision helpers ---
    // Elastic collision between two circles (striker and coin)
    function resolveCircleCollision(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return; // avoid div by zero
        const overlap = a.radius + b.radius - dist;
        if (overlap > 0) {
            // Separate the circles
            const nx = dx / dist;
            const ny = dy / dist;
            const totalMass = a.strikerMass ? a.strikerMass + b.coinMass : a.coinMass + b.coinMass;
            const aMass = a.strikerMass || a.coinMass;
            const bMass = b.coinMass;
            // Move each out of overlap
            a.x -= nx * (overlap * (bMass / totalMass));
            a.y -= ny * (overlap * (bMass / totalMass));
            b.x += nx * (overlap * (aMass / totalMass));
            b.y += ny * (overlap * (aMass / totalMass));
            // Calculate velocities along normal
            const dvx = b.velocity.x - a.velocity.x;
            const dvy = b.velocity.y - a.velocity.y;
            const vn = dvx * nx + dvy * ny;
            if (vn < 0) {
                // 1D elastic collision
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

    // Coin-border collision
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

    // Helper function to check if an object is near any pocket
    function isNearAnyPocket(x, y, pockets, threshold = 60) {
        return pockets.some(pocket => {
            const dist = Math.hypot(x - pocket.x, y - pocket.y);
            return dist < threshold;
        });
    }

    // animation loop for striker and coin movement
    useEffect(() => {
        let animationId;
        let lastScoredCoinId = null;  // Track the last scored coin to prevent duplicate scoring

        function animate() {
            if (!strikerRef.current || !isMyTurn) return;
            
            const boardX = (canvasRef.current.width - boardSize) / 2;
            const boardY = (canvasRef.current.height - boardSize) / 2;
            
            // Update striker and coins positions
            strikerRef.current.update(0.98, 0.3, boardX, boardY, boardSize);
            coinsRef.current.forEach(coin => {
                coin.update();
                handleCoinBorderCollision(coin, boardX, boardY, boardSize);
            });
            
            // Handle collisions
            coinsRef.current.forEach(coin => {
                resolveCircleCollision(strikerRef.current, coin);
            });
            
            for (let i = 0; i < coinsRef.current.length; i++) {
                for (let j = i + 1; j < coinsRef.current.length; j++) {
                    resolveCircleCollision(coinsRef.current[i], coinsRef.current[j]);
                }
            }

            // Sync positions if needed
            if (socket && roomName) {
                socket.emit('strikerMove', { 
                    roomName, 
                    position: { x: strikerRef.current.x, y: strikerRef.current.y }
                });
                
                socket.emit('coinsMove', {
                    roomName,
                    coins: coinsRef.current.map(coin => ({
                        id: coin.id,
                        x: coin.x,
                        y: coin.y,
                        velocity: { ...coin.velocity }
                    }))
                });
            }

            const ctx = canvasRef.current.getContext('2d');

            // Setup pocket data
            const pocketRadius = pocketDiameter / 2;
            const pockets = [
                { x: boardX + pocketRadius, y: boardY + pocketRadius },
                { x: boardX + boardSize - pocketRadius, y: boardY + pocketRadius },
                { x: boardX + pocketRadius, y: boardY + boardSize - pocketRadius },
                { x: boardX + boardSize - pocketRadius, y: boardY + boardSize - pocketRadius }
            ];            // Check striker pocketing
            const striker = strikerRef.current;
            if (isNearAnyPocket(striker.x, striker.y, pockets)) {
                for (const pocket of pockets) {                    const strikerDist = Math.hypot(striker.x - pocket.x, striker.y - pocket.y);
                    if (strikerDist < pocketRadius - striker.radius / 2) {
                        console.log('Striker was pocketed!');
                        setIsAnimating(false);
                        setIsFlickerActive(false);
                        setCanPlace(true);
                        
                        // Increment debt and let server handle automatic payment
                        debtRef.current++;
                        console.log(`Player ${playerRole}'s debt would increase to: ${debtRef.current}`);
                        
                        if (socket && roomName) {
                            // Emit debt update - server will handle automatic payment if score > 0
                            socket.emit('updateDebt', {
                                roomName,
                                playerRole,
                                debt: debtRef.current
                            });
                            
                            // Switch turn as before
                            socket.emit('switchTurn', { roomName });
                        }
                        return;
                    }
                }
            }

            // Check coin pocketing
            const pocketedCoins = [];
            coinsRef.current.forEach(coin => {
                if (isNearAnyPocket(coin.x, coin.y, pockets)) {
                    for (const pocket of pockets) {
                        const coinDist = Math.hypot(coin.x - pocket.x, coin.y - pocket.y);
                        if (coinDist < pocketRadius - coin.radius / 2) {
                            // Only add to pocketed coins if we haven't scored with this coin yet
                            if (lastScoredCoinId !== coin.id) {
                                pocketedCoins.push(coin);
                                lastScoredCoinId = coin.id;
                                
                                // Update score based on coin color
                                if (isMyTurn) {
                                    // Determine which player's color matches the coin
                                    const scoringPlayerRole = coin.color === 'white' ? 'creator' : 'joiner';
                                    socket.emit('updateScore', {
                                        roomName,
                                        playerRole: scoringPlayerRole,
                                        coinColor: coin.color
                                    });
                                }
                            }
                            break;
                        }
                    }
                }
            });            // Remove pocketed coins
            if (pocketedCoins.length > 0) {
                pocketedCoins.forEach(coin => {
                    removeCoin(coin.id);
                    // Add to the turn's pocketed coins list
                    pocketedThisTurnRef.current.push(coin);
                });
                if (socket && roomName) {
                    socket.emit('coinsPocketed', {
                        roomName,
                        pocketedIds: pocketedCoins.map(c => c.id)
                    });
                }
            }

            // Draw updated state
            drawBoard(ctx);            // Check if anything is still moving
            const isAnythingMoving = striker.isStrikerMoving || 
                coinsRef.current.some(coin => 
                    Math.abs(coin.velocity.x) > 0.3 || 
                    Math.abs(coin.velocity.y) > 0.3
                );

            if (isAnythingMoving) {
                animationId = requestAnimationFrame(animate);
            } else {
                setIsAnimating(false);
                setIsFlickerActive(false);
                setCanPlace(true);
                lastScoredCoinId = null;  // Reset the last scored coin when animation stops
                
                if (socket && roomName) {
                    const playerColor = playerRole === 'creator' ? 'white' : 'black';
                    // Count how many coins of player's color were pocketed this turn
                    const pocketedOwnColorCoins = pocketedThisTurnRef.current.filter(coin => coin.color === playerColor);
                    
                    if (pocketedOwnColorCoins.length > 0) {
                        // Add the number of pocketed coins to continued turns
                        continuedTurnsRef.current += pocketedOwnColorCoins.length - 1;
                        socket.emit('continueTurn', { 
                            roomName,
                            continuedTurns: continuedTurnsRef.current 
                        });
                    } else if (continuedTurnsRef.current > 0) {
                        // Still have continued turns left
                        continuedTurnsRef.current--;
                        socket.emit('continueTurn', { 
                            roomName,
                            continuedTurns: continuedTurnsRef.current 
                        });
                    } else {
                        // No more continued turns, switch to other player
                        socket.emit('switchTurn', { roomName });
                    }
                    pocketedThisTurnRef.current = []; // Clear for next turn
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
                // If this is a reset event from server, update striker's state
                if (data.isReset) {
                    strikerRef.current.x = data.x;
                    strikerRef.current.y = data.y;
                    strikerRef.current.velocity = { x: 0, y: 0 };
                    strikerRef.current.isStrikerMoving = false;
                } else if (data.position) {
                    strikerRef.current.updatePosition(data.position.x, data.position.y);
                }
                const ctx = canvasRef.current.getContext('2d');
                drawBoard(ctx);
            }
        };

        socket.on('strikerMove', handleStrikerMove);

        return () => {
            socket.off('strikerMove', handleStrikerMove);
        };
    }, [socket, roomName]);

    // listen for turn switch and reset striker position
    useEffect(() => {
        if (!socket || !roomName) return;
        const handleTurnSwitched = (data) => {
            if (data.roomName !== roomName) return;
            const ctx = canvasRef.current?.getContext('2d');
            const boardX = (ctx?.canvas.width - boardSize) / 2;
            const boardY = (ctx?.canvas.height - boardSize) / 2;
            let newX = boardX + boardSize / 2;
            let newY;
            const bottomBaselineY = boardY + boardSize - baseDistance - baseHeight / 2;
            const topBaselineY = boardY + baseDistance + baseHeight / 2;
            
            if (data.nextTurn === playerRole) {
                newY = playerRole === 'joiner' ? topBaselineY : bottomBaselineY;
            } else {
                newY = playerRole === 'joiner' ? bottomBaselineY : topBaselineY;
            }            if (strikerRef.current) {
                strikerRef.current.x = newX;
                strikerRef.current.y = newY;
                strikerRef.current.velocity = { x: 0, y: 0 };
                strikerRef.current.isStrikerMoving = false;
                // Reset pocketed coins tracker at the start of a new turn
                pocketedThisTurnRef.current = [];
                drawBoard(ctx);
            }
        };
        socket.on('turnSwitched', handleTurnSwitched);
        return () => {
            socket.off('turnSwitched', handleTurnSwitched);
        };
    }, [socket, roomName, playerRole]);

    // listen for turn continuation and reset striker position
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleTurnContinued = (data) => {
            if (data.roomName !== roomName) return;
            const ctx = canvasRef.current?.getContext('2d');
            const boardX = (ctx?.canvas.width - boardSize) / 2;
            const boardY = (ctx?.canvas.height - boardSize) / 2;
            let newX = boardX + boardSize / 2;
            let newY;
            const bottomBaselineY = boardY + boardSize - baseDistance - baseHeight / 2;
            const topBaselineY = boardY + baseDistance + baseHeight / 2;
            
            // Update striker position based on whose turn continues
            if (data.continueWith === playerRole) {
                newY = playerRole === 'joiner' ? topBaselineY : bottomBaselineY;
            } else {
                newY = playerRole === 'joiner' ? bottomBaselineY : topBaselineY;
            }

            if (strikerRef.current) {
                strikerRef.current.x = newX;
                strikerRef.current.y = newY;
                strikerRef.current.velocity = { x: 0, y: 0 };
                strikerRef.current.isStrikerMoving = false;
                
                // Update continued turns count from server
                if (data.continuedTurns !== undefined) {
                    continuedTurnsRef.current = data.continuedTurns;
                    console.log(`Remaining turns: ${continuedTurnsRef.current}`);
                }
                
                drawBoard(ctx);
            }
        };

        socket.on('turnContinued', handleTurnContinued);
        return () => socket.off('turnContinued', handleTurnContinued);
    }, [socket, roomName, playerRole]);

    // --- Striker movement sync (already implemented) ---
    // Sync coin positions to other player
    useEffect(() => {
        if (!socket || !roomName) return;
        // Emit coin positions whenever coins move (animation frame)
        if (isAnimating) {
            const coinStates = coinsRef.current.map(coin => ({
                id: coin.id,
                x: coin.x,
                y: coin.y,
                velocity: { ...coin.velocity }
            }));
            socket.emit('coinsMove', { roomName, coins: coinStates });
        }
    }, [isAnimating, socket, roomName, coins]);

    // Listen for coin movement from other player
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleCoinsMove = (data) => {
            if (data.roomName !== roomName || isMyTurn) return;  // Don't process if it's my turn
            
            // Update each coin's position and velocity
            coinsRef.current.forEach(coin => {
                const remote = data.coins.find(c => c.id === coin.id);
                if (remote) {
                    coin.x = remote.x;
                    coin.y = remote.y;
                    coin.velocity = { ...remote.velocity };
                }
            });
            
            // Update state and redraw
            setCoins([...coinsRef.current]);
            const ctx = canvasRef.current.getContext('2d');
            drawBoard(ctx);
        };

        socket.on('coinsMove', handleCoinsMove);
        return () => socket.off('coinsMove', handleCoinsMove);
    }, [socket, roomName, isMyTurn]);

    // Listen for pocketed coins from other player
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleCoinsPocketed = (data) => {
            if (data.roomName !== roomName) return;
            
            // Remove each pocketed coin
            data.pocketedIds.forEach(id => {
                removeCoin(id);
            });

            // Force a redraw
            const ctx = canvasRef.current.getContext('2d');
            drawBoard(ctx);
        };

        socket.on('coinsPocketed', handleCoinsPocketed);
        return () => socket.off('coinsPocketed', handleCoinsPocketed);
    }, [socket, roomName]);

    // Listen for debt payment events
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleDebtPaid = (data) => {
            if (data.roomName !== roomName) return;
            
            console.log(`Debt paid by ${data.playerRole}: score ${data.newScore}, debt ${data.newDebt}`);
            
            // Add a coin of the player's color at the center
            addCoinAtCenter(data.coinId, data.coinColor);
            
            // Force a redraw
            const ctx = canvasRef.current.getContext('2d');
            drawBoard(ctx);
        };

        socket.on('debtPaid', handleDebtPaid);
        return () => socket.off('debtPaid', handleDebtPaid);
    }, [socket, roomName]);

    // separate useEffect for canvas event listeners
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        
        drawBoard(ctx);
        
        canvas.addEventListener('mousedown', handleMouseDown);
        canvas.addEventListener('mousemove', handleMouseMove);
        canvas.addEventListener('mouseup', handleMouseUp);
        canvas.addEventListener('mouseleave', handleMouseUp);
        
        return () => {
            canvas.removeEventListener('mousedown', handleMouseDown);
            canvas.removeEventListener('mousemove', handleMouseMove);
            canvas.removeEventListener('mouseup', handleMouseUp);
            canvas.removeEventListener('mouseleave', handleMouseUp);
        };
    }, [isPlacing, isMyTurn, isFlickerActive, flick]);

    return (
        <div>
            {isMyTurn && !isAnimating && !strikerRef.current?.isStrikerMoving && (
                isFlickerActive ? (
                    <button onClick={handlePlace} style={{marginBottom: 8}}>Place</button>
                ) : (
                    <button onClick={handleFlick} style={{marginBottom: 8}}>Flick</button>
                )
            )}
            <br />
            <canvas
                ref={canvasRef}
                width={900}
                height={900}
                style={{
                    backgroundColor: '#fff',
                    cursor: isPlacing ? 'grabbing' : (isMyTurn && canPlace ? 'grab' : 'default')
                }}
            />
        </div>
    );
}

export default GameCanvas;
