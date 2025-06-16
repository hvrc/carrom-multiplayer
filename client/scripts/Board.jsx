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
    const [isStrikerColliding, setIsStrikerColliding] = useState(false);
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
    const pocketedThisTurnRef = useRef([]);

    // track initial coin counts for game end detection
    const initialCoinCountsRef = useRef({ white: 0, black: 0, red: 0 });
    // queue turn actions until all movement stops
    const pendingTurnActionRef = useRef(null);
    // track coins being pocketed (for animation)
    const beingPocketedCoinsRef = useRef([]);
    // track striker being pocketed (for animation)
    const beingPocketedStrikerRef = useRef(null);

    const flickMaxLength = 120;
    const flickPower = 0.4;

    // consistent movement threshold for both striker and coins
    const MOVEMENT_THRESHOLD = 0.21;

    const frameSize = 900;
    const boardSize = 750;
    const pocketDiameter = 45;
    const baseDistance = 102;
    const baseHeight = 32;
    const baseWidth = 470;
    const centerCircleDiameter = 170;    // add coins at the center of the board
    // place 2 white and 2 black coins, queen
    
    useEffect(() => {
        if (!canvasRef.current) return;
        const boardX = (canvasRef.current.width - boardSize) / 2;
        const boardY = (canvasRef.current.height - boardSize) / 2;

        // Center position for coin formation
        const centerX = boardX + boardSize / 2;
        const centerY = boardY + boardSize / 2;

        // Create coin formation using the static method from Coin class
        const coins = Coin.createCoinFormation(centerX, centerY);

        coinsRef.current = coins;
        setCoins(coins);

        // Update initial coin counts for game end detection
        const allCoins = coins;
        initialCoinCountsRef.current = {
            white: allCoins.filter((coin) => coin.color === "white").length,
            black: allCoins.filter((coin) => coin.color === "black").length,
            red: allCoins.filter((coin) => coin.color === "red").length,
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
        const bottomBaselineY =
            boardY + boardSize - baseDistance - baseHeight / 2;
        const topBaselineY = boardY + baseDistance + baseHeight / 2;

        let newX = boardX + boardSize / 2;
        let newY;

        if (actionData.type === "turnSwitch") {
            // reset striker position based on new turn
            newY =
                actionData.newTurn === playerRole
                    ? playerRole === "joiner"
                        ? topBaselineY
                        : bottomBaselineY
                    : playerRole === "joiner"
                      ? bottomBaselineY
                      : topBaselineY;
        } else if (actionData.type === "turnContinue") {
            // reset striker position based on who continues
            newY =
                actionData.continueWith === playerRole
                    ? playerRole === "joiner"
                        ? topBaselineY
                        : bottomBaselineY
                    : playerRole === "joiner"
                      ? bottomBaselineY
                      : topBaselineY;

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
    }
    // check if striker is colliding with any coins during placement
    function checkStrikerCoinCollision() {
        if (!strikerRef.current) return false;

        for (const coin of coinsRef.current) {
            const distance = Math.hypot(
                strikerRef.current.x - coin.x,
                strikerRef.current.y - coin.y,
            );
            const combinedRadius = strikerRef.current.radius + coin.radius;

            if (distance < combinedRadius) {
                return true;
            }
        }
        return false;
    }

    const drawBoard = (ctx, overrideCollisionState = null) => {
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
            [
                boardX + boardSize - pocketRadius,
                boardY + boardSize - pocketRadius,
            ],
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
                ctx.arc(
                    pos.x + baseRadius,
                    pos.y + baseRadius,
                    baseRadius,
                    0,
                    Math.PI * 2,
                );
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(
                    pos.x + baseRadius,
                    pos.y + baseWidth - baseRadius,
                    baseRadius,
                    0,
                    Math.PI * 2,
                );

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
                ctx.arc(
                    pos.x + baseWidth - baseRadius,
                    pos.y + baseRadius,
                    baseRadius,
                    0,
                    Math.PI * 2,
                );

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

        // draw all coins first
        coinsRef.current.forEach((coin) => coin.draw(ctx));

        // draw striker with appropriate opacity based on collision state
        if (strikerRef.current) {
            // use override collision state if provided (for real-time feedback during drag), otherwise use React state
            const currentCollisionState =
                overrideCollisionState !== null
                    ? overrideCollisionState
                    : isStrikerColliding;
            ctx.save();

            // set opacity based on collision state - lower opacity when colliding
            if (currentCollisionState) {
                ctx.globalAlpha = 0.4; // 40% opacity when colliding
            } else {
                ctx.globalAlpha = 1.0; // full opacity when not colliding
            }

            // draw striker with consistent border style
            ctx.beginPath();
            ctx.arc(
                strikerRef.current.x,
                strikerRef.current.y,
                strikerRef.current.radius,
                0,
                Math.PI * 2,
            );
            ctx.strokeStyle = "black";
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.restore();
        }

        // draw flick line if active
        if (isFlickerActive && flick.active) {
            ctx.save();

            // use override collision state if provided, otherwise use React state
            const currentCollisionState =
                overrideCollisionState !== null
                    ? overrideCollisionState
                    : isStrikerColliding;

            // set opacity and style based on collision state
            if (currentCollisionState) {
                ctx.globalAlpha = 0.4; // reduced opacity when colliding
                ctx.strokeStyle = "black";
                ctx.lineWidth = 1;
                ctx.setLineDash([5, 5]); // dashed line to indicate disabled state
            } else {
                ctx.globalAlpha = 1.0; // full opacity when not colliding
                ctx.strokeStyle = "black";
                ctx.lineWidth = 1;
            }

            ctx.beginPath();
            ctx.moveTo(flick.startX, flick.startY);

            // cap the line at max length
            let dx = flick.endX - flick.startX;
            let dy = flick.endY - flick.startY;
            let d = Math.hypot(dx, dy);
            let capX = flick.endX,
                capY = flick.endY;
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
        // prevent flicking if striker is colliding with coins
        if (isStrikerColliding) {
            // console.log("Cannot flick: striker is overlapping with coins");
            return;
        }

        setCanPlace(false);
        setIsFlickerActive(true);
        setTimeout(() => setCanPlace(true), 0);
    };

    const handlePlace = () => {
        setCanPlace(true);
        setisPlacing(false);
        setIsFlickerActive(false);
        setIsStrikerColliding(false); // reset collision state when not placing
        setFlick({ active: false, startX: 0, startY: 0, endX: 0, endY: 0 });
        if (strikerRef.current) strikerRef.current.isPlacing = false;

        // emit collision state reset to other players
        if (socket && roomName) {
            socket.emit("strikerCollisionUpdate", {
                roomName,
                playerRole,
                isColliding: false,
            });
        }
    };

    // flick mouse handlers
    const handleFlickMouseDown = (e) => {
        if (!isMyTurn || !strikerRef.current || !isFlickerActive) return;

        // prevent flicking if striker is colliding with coins
        if (isStrikerColliding) {
            // console.log("Cannot start flick: striker is overlapping with coins");
            return;
        }

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
        if (
            !isMyTurn ||
            !strikerRef.current ||
            !isFlickerActive ||
            !flick.active
        )
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
        if (
            !isMyTurn ||
            !strikerRef.current ||
            !isFlickerActive ||
            !flick.active
        )
            return;

        // prevent execution if striker is colliding with coins
        if (isStrikerColliding) {
            // console.log("Cannot execute flick: striker is overlapping with coins");
            setFlick({ active: false, startX: 0, startY: 0, endX: 0, endY: 0 });
            return;
        }

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

            // Only update x position, keep y position fixed
            // Constrain x position to be between 226 and 667
            const minX = 226;
            const maxX = 673;
            strikerRef.current.x = Math.max(minX, Math.min(maxX, x));
            // strikerRef.current.y remains unchanged

            // check for collision in real-time during drag
            const isCurrentlyColliding = checkStrikerCoinCollision();
            if (isCurrentlyColliding !== isStrikerColliding) {
                setIsStrikerColliding(isCurrentlyColliding);
            }

            // emit collision/invalid state updates to other player
            if (socket && roomName) {
                socket.emit("strikerCollisionUpdate", {
                    roomName,
                    playerRole,
                    isColliding: isCurrentlyColliding,
                });
            }

            // sync striker position to other player
            if (socket && roomName) {
                socket.emit("strikerMove", {
                    roomName,
                    position: {
                        x: strikerRef.current.x,
                        y: strikerRef.current.y,
                    },
                });
            }

            const ctx = canvasRef.current.getContext("2d");
            // pass the real-time collision state to drawBoard for immediate visual feedback
            drawBoard(ctx, isCurrentlyColliding);
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

            // emit final collision state when placement ends
            if (socket && roomName) {
                const finalCollisionState = checkStrikerCoinCollision();
                socket.emit("strikerCollisionUpdate", {
                    roomName,
                    playerRole,
                    isColliding: finalCollisionState,
                });
            }
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
                const restitution = Math.min(
                    a.restitution || 1,
                    b.restitution || 1,
                );
                const impulse =
                    (-(1 + restitution) * vn) / (1 / aMass + 1 / bMass);
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
            if (!strikerRef.current || !isMyTurn) return;
            const boardX = (canvasRef.current.width - boardSize) / 2;
            const boardY = (canvasRef.current.height - boardSize) / 2;

            strikerRef.current.update(
                0.994,
                MOVEMENT_THRESHOLD,
                boardX,
                boardY,
                boardSize,
            );
            coinsRef.current.forEach((coin) => {
                coin.update();
                handleCoinBorderCollision(coin, boardX, boardY, boardSize);
            });

            coinsRef.current.forEach((coin) => {
                resolveCircleCollision(strikerRef.current, coin);
            });

            for (let i = 0; i < coinsRef.current.length; i++) {
                for (let j = i + 1; j < coinsRef.current.length; j++) {
                    resolveCircleCollision(
                        coinsRef.current[i],
                        coinsRef.current[j],
                    );
                }
            }

            if (socket && roomName) {
                socket.emit("strikerMove", {
                    roomName,
                    position: {
                        x: strikerRef.current.x,
                        y: strikerRef.current.y,
                    },
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
                {
                    x: boardX + boardSize - pocketRadius,
                    y: boardY + pocketRadius,
                },
                {
                    x: boardX + pocketRadius,
                    y: boardY + boardSize - pocketRadius,
                },
                {
                    x: boardX + boardSize - pocketRadius,
                    y: boardY + boardSize - pocketRadius,
                },
            ];

            // check if striker is pocketed
            const striker = strikerRef.current;
            if (
                !striker.beingPocketed &&
                isNearAnyPocket(striker.x, striker.y, pockets)
            ) {
                for (const pocket of pockets) {
                    const strikerDist = Math.hypot(
                        striker.x - pocket.x,
                        striker.y - pocket.y,
                    );

                    if (strikerDist < pocketRadius - striker.radius / 2) {
                        // start striker pocketing animation instead of immediate processing
                        striker.startPocketing(pocket.x, pocket.y);
                        beingPocketedStrikerRef.current = {
                            striker: striker,
                            pocket: pocket,
                            playerRole: playerRole,
                        };

                        // ensure animation loop is running for striker pocketing
                        setIsAnimating(true);

                        // emit striker animation event to synchronize across clients
                        if (socket && roomName) {
                            socket.emit("strikerAnimation", {
                                roomName,
                                type: "startPocketing",
                                pocketX: pocket.x,
                                pocketY: pocket.y,
                                playerRole: playerRole,
                            });
                        }

                        // scoring/debt logic will be handled when animation completes
                        // don't process scoring immediately, let animation complete first
                        // exit the pocket loop since striker is now being pocketed

                        break;
                    }
                }
            }

            // process coin pocketing animations
            beingPocketedCoinsRef.current =
                beingPocketedCoinsRef.current.filter((item) => {
                    const animationComplete = item.coin.updatePocketAnimation();
                    if (animationComplete) {
                        // animation is complete, remove coin and broadcast
                        removeCoin(item.coin.id);
                        pocketedThisTurnRef.current.push(item.coin);

                        if (socket && roomName) {
                            socket.emit("coinsPocketed", {
                                roomName,
                                pocketedIds: [item.coin.id],
                            });
                        }

                        // remove from animation list
                        return false;
                    }

                    // keep in animation list
                    return true;
                });

            // process striker pocketing animation
            if (beingPocketedStrikerRef.current) {
                const animationComplete =
                    strikerRef.current.updatePocketAnimation();
                if (animationComplete) {
                    // animation complete, process striker pocketing
                    const strikerData = beingPocketedStrikerRef.current;
                    beingPocketedStrikerRef.current = null;

                    // reset striker's pocketing state and radius
                    strikerRef.current.resetPocketingState();

                    // immediately reset striker position to correct baseline for next player
                    const boardX = (canvasRef.current.width - boardSize) / 2;
                    const boardY = (canvasRef.current.height - boardSize) / 2;
                    const bottomBaselineY =
                        boardY + boardSize - baseDistance - baseHeight / 2;
                    const topBaselineY = boardY + baseDistance + baseHeight / 2;

                    // determine next player, turn will switch after striker pocketing
                    const nextPlayer =
                        playerRole === "creator" ? "joiner" : "creator";

                    // position striker for the next player's turn
                    let newY;
                    if (nextPlayer === playerRole) {
                        // next turn is ours, shouldn't happen with striker pocketing, but just in case
                        newY =
                            playerRole === "joiner"
                                ? topBaselineY
                                : bottomBaselineY;
                    } else {
                        // next turn is opponent's
                        newY =
                            playerRole === "joiner"
                                ? bottomBaselineY
                                : topBaselineY;
                    }

                    strikerRef.current.x = boardX + boardSize / 2;
                    strikerRef.current.y = newY;
                    strikerRef.current.velocity = { x: 0, y: 0 };
                    strikerRef.current.isStrikerMoving = false;

                    // sync striker position reset across clients
                    if (socket && roomName) {
                        socket.emit("strikerMove", {
                            roomName,
                            x: strikerRef.current.x,
                            y: strikerRef.current.y,
                            isReset: true,
                        });

                        // emit striker animation complete event
                        socket.emit("strikerAnimation", {
                            roomName,
                            type: "animationComplete",
                            x: strikerRef.current.x,
                            y: strikerRef.current.y,
                            playerRole: playerRole,
                        });
                    }

                    const currentPlayerData =
                        gameManager.getPlayerData(playerRole);

                    // handle queen reset or debt increment
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
                            hasPocketedQueen: false,
                        });

                        socket.emit("queenCoveredUpdate", {
                            roomName,
                            playerRole,
                            hasCoveredQueen: false,
                        });

                        socket.emit("coverTurnUpdate", {
                            roomName,
                            playerRole,
                            isCoverTurn: false,
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

                    // clear pocketed coins from this turn since striker pocketing always switches turn
                    pocketedThisTurnRef.current = [];

                    // exit early after processing striker pocketing
                    return;
                }
            }

            // start new coin pocketing animations
            coinsRef.current.forEach((coin) => {
                if (
                    coin.beingPocketed &&
                    !beingPocketedCoinsRef.current.some(
                        (item) => item.coin.id === coin.id,
                    )
                ) {
                    // coin just started being pocketed, add to animation list
                    beingPocketedCoinsRef.current.push({
                        coin: coin,
                        pocket: null, // will be set when animation starts
                    });
                }
            });

            // check coin pocketing
            const pocketedCoins = [];
            coinsRef.current.forEach((coin) => {
                // skip coins already being pocketed
                if (coin.beingPocketed) return;

                if (isNearAnyPocket(coin.x, coin.y, pockets)) {
                    for (const pocket of pockets) {
                        const coinDist = Math.hypot(
                            coin.x - pocket.x,
                            coin.y - pocket.y,
                        );
                        if (coinDist < pocketRadius - coin.radius / 2) {
                            // only add to pocketed coins if we haven't scored with this coin yet
                            if (lastScoredCoinId !== coin.id) {
                                // start pocketing animation instead of immediately removing
                                coin.startPocketing(pocket.x, pocket.y);
                                pocketedCoins.push(coin);
                                lastScoredCoinId = coin.id;

                                // queen pocketed
                                if (coin.color === "red") {
                                    const currentPlayerData =
                                        gameManager.getPlayerData(playerRole);

                                    // set cover turn to true when queen is pocketed
                                    currentPlayerData.isCoverTurn = true;
                                    currentPlayerData.hasPocketedQueen = true;

                                    // emit cover turn state to synchronize across clients
                                    if (isMyTurn) {
                                        socket.emit("coverTurnUpdate", {
                                            roomName,
                                            playerRole,
                                            isCoverTurn: true,
                                        });

                                        // emit queen pocketed state
                                        socket.emit("queenPocketedUpdate", {
                                            roomName,
                                            playerRole,
                                            hasPocketedQueen: true,
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

            // remove pocketed coins section is now handled by animation processing above
            // draw updated state
            drawBoard(ctx);

            // check if anything is still moving using consistent threshold
            const isAnythingMoving =
                striker.isMoving(MOVEMENT_THRESHOLD) ||
                coinsRef.current.some((coin) =>
                    coin.isMoving(MOVEMENT_THRESHOLD),
                ) ||
                beingPocketedCoinsRef.current.length > 0 || // keep animating while coins are being pocketed
                beingPocketedStrikerRef.current !== null; // keep animating while striker is being pocketed

            if (isAnythingMoving) {
                animationId = requestAnimationFrame(animate);
            } else {
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
                const playerColor =
                    playerRole === "creator" ? "white" : "black";
                const currentPlayerData = gameManager.getPlayerData(playerRole);

                // check if queen was pocketed this turn
                const queenPocketed = pocketedThisTurnRef.current.some(
                    (coin) => coin.color === "red",
                );

                // if queen was pocketed this turn
                // count other coins pocketed, excluding queen to determine continued turns
                if (queenPocketed) {
                    const otherCoinsThisTurn =
                        pocketedThisTurnRef.current.filter(
                            (coin) => coin.color !== "red",
                        );
                    const pocketedOwnColorCoins = otherCoinsThisTurn.filter(
                        (coin) => coin.color === playerColor,
                    );

                    // add continued turns for non-queen coins pocketed in the same turn as queen
                    if (pocketedOwnColorCoins.length > 0) {
                        continuedTurnsRef.current +=
                            pocketedOwnColorCoins.length - 1;
                        socket.emit("continueTurn", {
                            roomName,
                            continuedTurns: continuedTurnsRef.current,
                        });
                    } else {
                        // no other coins pocketed with queen, just continue for cover turn
                        // cover turn only
                        socket.emit("continueTurn", {
                            roomName,
                            continuedTurns: 0,
                        });
                    }

                    // clear pocketed coins for the cover turn
                    pocketedThisTurnRef.current = [];
                }

                // if this is a cover turn attempt (queen was pocketed in previous turn)
                else if (currentPlayerData.isCoverTurn) {
                    const pocketedPlayerColorCoins =
                        pocketedThisTurnRef.current.filter(
                            (coin) => coin.color === playerColor,
                        );

                    // if no coins were pocketed this turn, or no player color coins were pocketed
                    if (
                        pocketedThisTurnRef.current.length === 0 ||
                        pocketedPlayerColorCoins.length === 0
                    ) {
                        // cover turn failed, reset queen and decrement score
                        if (isMyTurn) {
                            currentPlayerData.isCoverTurn = false;
                            currentPlayerData.hasPocketedQueen = false;
                            currentPlayerData.hasCoveredQueen = false;

                            // emit cover turn state update
                            socket.emit("coverTurnUpdate", {
                                roomName,
                                playerRole,
                                isCoverTurn: false,
                            });

                            // emit queen pocketed state reset
                            socket.emit("queenPocketedUpdate", {
                                roomName,
                                playerRole,
                                hasPocketedQueen: false,
                            });

                            // emit queen covered state reset
                            socket.emit("queenCoveredUpdate", {
                                roomName,
                                playerRole,
                                hasCoveredQueen: false,
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
                            isCoverTurn: false,
                        });

                        // emit queen covered state
                        socket.emit("queenCoveredUpdate", {
                            roomName,
                            playerRole,
                            hasCoveredQueen: true,
                        });

                        // add continued turns for coins pocketed during successful cover turn
                        const pocketedOwnColorCoins =
                            pocketedThisTurnRef.current.filter(
                                (coin) => coin.color === playerColor,
                            );

                        if (pocketedOwnColorCoins.length > 0) {
                            continuedTurnsRef.current +=
                                pocketedOwnColorCoins.length - 1;
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
                    const pocketedOwnColorCoins =
                        pocketedThisTurnRef.current.filter(
                            (coin) => coin.color === playerColor,
                        );

                    if (pocketedOwnColorCoins.length > 0) {
                        continuedTurnsRef.current +=
                            pocketedOwnColorCoins.length - 1;
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
                    const remainingCoins = coinsRef.current.filter(
                        (coin) => coin.color !== "red",
                    ); // exclude queen
                    const whiteCoinsRemaining = remainingCoins.filter(
                        (coin) => coin.color === "white",
                    );
                    const blackCoinsRemaining = remainingCoins.filter(
                        (coin) => coin.color === "black",
                    );

                    // if all white or all black coins are pocketed, reset the game
                    if (
                        whiteCoinsRemaining.length === 0 ||
                        blackCoinsRemaining.length === 0
                    ) {
                        // emit game reset event to server
                        socket.emit("gameReset", {
                            roomName,
                            reason:
                                whiteCoinsRemaining.length === 0
                                    ? "All white coins pocketed"
                                    : "All black coins pocketed",
                        });
                    }
                }
            }
        }

        // animation should run if it's my turn OR there are pocketing animations happening
        const shouldAnimate =
            isAnimating &&
            (isMyTurn ||
                beingPocketedCoinsRef.current.length > 0 ||
                beingPocketedStrikerRef.current !== null);

        if (shouldAnimate) {
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
                    strikerRef.current.updatePosition(
                        data.position.x,
                        data.position.y,
                    );
                }

                const ctx = canvasRef.current.getContext("2d");
                drawBoard(ctx);
            }
        };

        socket.on("strikerMove", handleStrikerMove);

        // listen for striker collision state updates from other player
        const handleStrikerCollisionUpdate = (data) => {
            if (data.roomName === roomName) {
                // update collision state based on remote player's collision check
                setIsStrikerColliding(data.isColliding);

                // redraw board immediately with updated collision state
                const ctx = canvasRef.current.getContext("2d");
                drawBoard(ctx);
            }
        };

        socket.on("strikerCollisionUpdate", handleStrikerCollisionUpdate);

        // handle striker animation sync
        const handleStrikerAnimation = (data) => {
            if (data.roomName === roomName && strikerRef.current) {
                if (data.type === "startPocketing") {
                    // start pocketing animation on the other client
                    strikerRef.current.startPocketing(
                        data.pocketX,
                        data.pocketY,
                    );
                    beingPocketedStrikerRef.current = {
                        striker: strikerRef.current,
                        pocket: { x: data.pocketX, y: data.pocketY },
                        playerRole: data.playerRole,
                    };

                    // ensure animation loop is running on the remote client too
                    setIsAnimating(true);
                } else if (data.type === "animationComplete") {
                    // complete animation and reset striker position on the other client
                    if (beingPocketedStrikerRef.current) {
                        beingPocketedStrikerRef.current = null;
                    }
                    strikerRef.current.resetPocketingState();
                    strikerRef.current.x = data.x;
                    strikerRef.current.y = data.y;
                    strikerRef.current.velocity = { x: 0, y: 0 };
                    strikerRef.current.isStrikerMoving = false;

                    const ctx = canvasRef.current.getContext("2d");
                    drawBoard(ctx);
                }
            }
        };

        socket.on("strikerAnimation", handleStrikerAnimation);
        return () => {
            socket.off("strikerMove", handleStrikerMove);
            socket.off("strikerCollisionUpdate", handleStrikerCollisionUpdate);
            socket.off("strikerAnimation", handleStrikerAnimation);
        };
    }, [socket, roomName]);

    // listen for turn switch and reset striker position
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleTurnSwitched = (data) => {
            if (data.roomName !== roomName) return;

            // check if movement is still happening
            const areObjectsMoving =
                strikerRef.current?.isMoving(MOVEMENT_THRESHOLD) ||
                coinsRef.current.some((coin) =>
                    coin.isMoving(MOVEMENT_THRESHOLD),
                );

            if (areObjectsMoving) {
                // queue the action until movement stops
                pendingTurnActionRef.current = {
                    type: "turnSwitch",
                    newTurn: data.nextTurn,
                };
            } else {
                // execute immediately if nothing is moving
                executeStrikerReset({
                    type: "turnSwitch",
                    newTurn: data.nextTurn,
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
        if (!socket || !roomName) return;

        const handleTurnContinued = (data) => {
            if (data.roomName !== roomName) return;

            // check if movement is still happening
            const areObjectsMoving =
                strikerRef.current?.isMoving(MOVEMENT_THRESHOLD) ||
                coinsRef.current.some((coin) =>
                    coin.isMoving(MOVEMENT_THRESHOLD),
                );

            if (areObjectsMoving) {
                // queue the action until movement stops
                pendingTurnActionRef.current = {
                    type: "turnContinue",
                    continueWith: data.continueWith,
                    continuedTurns: data.continuedTurns,
                };
            } else {
                // execute immediately if nothing is moving
                executeStrikerReset({
                    type: "turnContinue",
                    continueWith: data.continueWith,
                    continuedTurns: data.continuedTurns,
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
        return () =>
            socket.off("queenPocketedUpdate", handleQueenPocketedUpdate);
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
        socket.on("queenCoveredUpdate", handleQueenCoveredUpdate);
        return () => socket.off("queenCoveredUpdate", handleQueenCoveredUpdate);
    }, [socket, roomName, gameManager]);

    // listen for game reset events
    useEffect(() => {
        if (!socket || !roomName) return;
        const handleGameReset = (data) => {
            if (data.roomName !== roomName) return;

            // clear any pending turn actions
            pendingTurnActionRef.current = null;

            // reset all coins to centered formation
            if (!canvasRef.current) return;
            const boardX = (canvasRef.current.width - boardSize) / 2;
            const boardY = (canvasRef.current.height - boardSize) / 2;

            // Center position for coin formation
            const centerX = boardX + boardSize / 2;
            const centerY = boardY + boardSize / 2;

            // Configuration for centered coin formation
            const coinFormation = {
                centerX: centerX,
                centerY: centerY,
                rings: [
                    { count: 6, radius: 32 }, // Inner ring - 6 coins
                    { count: 12, radius: 62 }, // Outer ring - 12 coins
                ],
            };

            const coins = [];
            let coinId = 1;
            let colorIndex = 1;

            // Create rings of coins
            coinFormation.rings.forEach((ring) => {
                for (let i = 0; i < ring.count; i++) {
                    const angle = i * ((2 * Math.PI) / ring.count);
                    const x =
                        coinFormation.centerX + ring.radius * Math.cos(angle);
                    const y =
                        coinFormation.centerY + ring.radius * Math.sin(angle);

                    // Alternate between white and black
                    const color = colorIndex % 2 ? "white" : "black";

                    coins.push(
                        new Coin({
                            id: coinId++,
                            color: color,
                            x: x,
                            y: y,
                        }),
                    );

                    colorIndex++;
                }
            });

            // Add queen at exact center
            const queenCoin = new Coin({
                id: coinId++,
                color: "red",
                x: coinFormation.centerX,
                y: coinFormation.centerY,
            });
            coins.push(queenCoin);

            // Reset coins array
            coinsRef.current = coins;
            setCoins(coins);

            // Reset initial coin counts
            initialCoinCountsRef.current = {
                white: coins.filter((coin) => coin.color === "white").length,
                black: coins.filter((coin) => coin.color === "black").length,
                red: coins.filter((coin) => coin.color === "red").length,
            };

            // reset game state
            pocketedCoinsRef.current.clear();
            pocketedThisTurnRef.current = [];
            beingPocketedCoinsRef.current = [];
            beingPocketedStrikerRef.current = null;
            continuedTurnsRef.current = 0;
            debtRef.current = 0;

            // reset game manager state
            gameManager.resetGame();

            // reset striker position
            if (strikerRef.current) {
                const initialX = boardX + boardSize / 2;
                const initialY =
                    boardY + boardSize - baseDistance - baseHeight / 2;
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
    // continuously check for striker-coin collisions
    useEffect(() => {
        if (!strikerRef.current) return;

        const checkCollisions = () => {
            const isCurrentlyColliding = checkStrikerCoinCollision();
            if (isCurrentlyColliding !== isStrikerColliding) {
                setIsStrikerColliding(isCurrentlyColliding);
            }
        };

        // check collisions on every animation frame
        const intervalId = setInterval(checkCollisions, 16); // ~60fps

        return () => clearInterval(intervalId);
    }, [isStrikerColliding, coins]); // re-run when coins change

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
        };
    }, [isPlacing, isMyTurn, isFlickerActive, flick]);

    // cleanup pending actions on component unmount or room change
    useEffect(() => {
        return () => {
            pendingTurnActionRef.current = null;
            beingPocketedCoinsRef.current = [];
            beingPocketedStrikerRef.current = null;
        };
    }, [roomName]);

    return (
        <div>
            <canvas
                ref={canvasRef}
                width={900}
                height={900}
                style={{
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
