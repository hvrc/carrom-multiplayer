import { useEffect, useRef, useState } from "react";
import Striker from "./Striker";
import Coin from "./Coin";
import Physics from "./Physics";
import Pocket from "./Pocket";
import Draw from "./Draw";
import Hand from "./Hand";
import Animation from "./Animation";

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
      // Hand interaction manager
    const handRef = useRef(new Hand());
    const [handState, setHandState] = useState(handRef.current.getState());
    
    // Animation manager
    const animationRef = useRef(new Animation());
    const [animationState, setAnimationState] = useState(animationRef.current.getState());
    
    const [isStrikerColliding, setIsStrikerColliding] = useState(false);
    const [coins, setCoins] = useState([]);
    const coinsRef = useRef([]);

    // all-time pocketed coins
    // coins pocketed in current turn
    const pocketedCoinsRef = useRef(new Set());
    const pocketedThisTurnRef = useRef([]);    // track initial coin counts for game end detection
    const initialCoinCountsRef = useRef({ white: 0, black: 0, red: 0 });

    // add coins at the center of the board
    // place 2 white and 2 black coins, queen
      useEffect(() => {
        if (!canvasRef.current) return;
        const boardX = (canvasRef.current.width - Draw.BOARD_SIZE) / 2;
        const boardY = (canvasRef.current.height - Draw.BOARD_SIZE) / 2;
        
        // Center position for coin formation
        const centerX = boardX + Draw.BOARD_SIZE / 2;
        const centerY = boardY + Draw.BOARD_SIZE / 2;

        // Create coin formation using the static method from Coin class
        const coins = Coin.createCoinFormation(centerX, centerY);

        coinsRef.current = coins;
        setCoins(coins);
        
        // Update initial coin counts for game end detection
        const allCoins = coins;
        initialCoinCountsRef.current = {
            white: allCoins.filter((coin) => coin.color === "white").length,
            black: allCoins.filter((coin) => coin.color === "black").length,
            red: allCoins.filter((coin) => coin.color === "red").length,        };
          // Set up Hand callbacks
        handRef.current.setCallbacks({
            onStateChange: (newState) => setHandState(newState),
            onStrikerMove: (data) => {
                if (socket && roomName) {
                    socket.emit("strikerMove", {
                        roomName,
                        ...data
                    });
                }
            },
            onCollisionUpdate: (isColliding) => {
                setIsStrikerColliding(isColliding);
                if (socket && roomName) {
                    socket.emit("strikerCollisionUpdate", {
                        roomName,
                        playerRole,
                        isColliding,
                    });
                }
            },
            onAnimationStart: () => animationRef.current.updateState({ isAnimating: true }),
            onRedraw: (collisionState) => {
                const ctx = canvasRef.current?.getContext("2d");
                if (ctx) {
                    Draw.drawBoard(ctx, createGameState(), playerRole, collisionState);
                }
            }
        });

        // Set up Animation callbacks
        animationRef.current.setCallbacks({
            setIsAnimating: (isAnimating) => setAnimationState(prev => ({ ...prev, isAnimating })),
            setHandState: (newState) => {
                handRef.current._updateState(newState);
                setHandState(handRef.current.getState());
            },
            createGameState: () => createGameState()
        });    }, []);

    // Helper function to create game state object for drawing
    const createGameState = () => ({
        strikerRef,
        coinsRef,
        isStrikerColliding,
        isFlickerActive: handState.isFlickerActive,
        flick: handState.flick,
        flickMaxLength: handState.flickMaxLength
    });

    // show place button immediately after clicking flick
    const handleFlick = () => {
        handRef.current.handleFlick(isStrikerColliding);
    };

    const handlePlace = () => {
        handRef.current.handlePlace(strikerRef, socket, roomName, playerRole);    };    // Mouse event handlers delegated to Hand class
    const handleMouseDown = (e) => {
        handRef.current.handleMouseDown(e, {
            isAnimating: animationState.isAnimating,
            isMyTurn,
            strikerRef,
            canvasRef,
            playerRole,
            isStrikerColliding
        });
    };

    const handleMouseMove = (e) => {
        handRef.current.handleMouseMove(e, {
            isAnimating: animationState.isAnimating,
            isMyTurn,
            strikerRef,
            canvasRef,
            playerRole,
            coinsRef,
            socket,
            roomName
        });
    };

    const handleMouseUp = (e) => {
        handRef.current.handleMouseUp(e, {
            isAnimating: animationState.isAnimating,
            isMyTurn,
            strikerRef,
            isStrikerColliding,
            coinsRef,
            socket,
            roomName,
            playerRole
        });
    };    // animation loop for striker and coin movement
    useEffect(() => {
        // animation should run if it's my turn OR there are pocketing animations happening
        const shouldAnimate =
            animationState.isAnimating &&
            (isMyTurn ||
                animationRef.current.beingPocketedCoinsRef.length > 0 ||
                animationRef.current.beingPocketedStrikerRef !== null);

        if (shouldAnimate) {
            const params = {
                strikerRef,
                isMyTurn,
                canvasRef,
                coinsRef,
                setCoins,
                socket,
                roomName,
                playerRole,
                gameManager,
                continuedTurnsRef,
                debtRef,
                pocketedThisTurnRef,
                pocketedCoinsRef
            };
            animationRef.current.startAnimation(params);
        }

        return () => {
            animationRef.current.stopAnimation();
        };
    }, [animationState.isAnimating, socket, roomName, isMyTurn]);

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
                    );                }

                const ctx = canvasRef.current.getContext("2d");
                Draw.drawBoard(ctx, createGameState(), playerRole);
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
                Draw.drawBoard(ctx, createGameState(), playerRole);
            }
        };

        socket.on("strikerCollisionUpdate", handleStrikerCollisionUpdate);        // handle striker animation sync
        const handleStrikerAnimation = (data) => {
            if (data.roomName === roomName && strikerRef.current) {
                if (data.type === "startPocketing") {
                    // start pocketing animation on the other client
                    strikerRef.current.startPocketing(
                        data.pocketX,
                        data.pocketY,
                    );
                    animationRef.current.beingPocketedStrikerRef = {
                        striker: strikerRef.current,
                        pocket: { x: data.pocketX, y: data.pocketY },
                        playerRole: data.playerRole,
                    };

                    // ensure animation loop is running on the remote client too
                    animationRef.current.updateState({ isAnimating: true });
                } else if (data.type === "animationComplete") {
                    // complete animation and reset striker position on the other client
                    if (animationRef.current.beingPocketedStrikerRef) {
                        animationRef.current.beingPocketedStrikerRef = null;
                    }
                    strikerRef.current.resetPocketingState();
                    strikerRef.current.x = data.x;
                    strikerRef.current.y = data.y;
                    strikerRef.current.velocity = { x: 0, y: 0 };
                    strikerRef.current.isStrikerMoving = false;

                    const ctx = canvasRef.current.getContext("2d");
                    Draw.drawBoard(ctx, createGameState(), playerRole);
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
        if (!socket || !roomName) return;        const handleTurnSwitched = (data) => {
            if (data.roomName !== roomName) return;

            // check if movement is still happening
            const areObjectsMoving =
                strikerRef.current?.isMoving(animationRef.current.MOVEMENT_THRESHOLD) ||
                coinsRef.current.some((coin) =>
                    coin.isMoving(animationRef.current.MOVEMENT_THRESHOLD),
                );

            if (areObjectsMoving) {
                // queue the action until movement stops
                animationRef.current.pendingTurnActionRef = {
                    type: "turnSwitch",
                    newTurn: data.nextTurn,
                };
            } else {
                // execute immediately if nothing is moving
                animationRef.current.executeStrikerReset(
                    {
                        type: "turnSwitch",
                        newTurn: data.nextTurn,
                    },
                    strikerRef,
                    canvasRef,
                    playerRole,
                    continuedTurnsRef,
                    pocketedThisTurnRef
                );
            }
        };

        socket.on("turnSwitched", handleTurnSwitched);
        return () => {
            socket.off("turnSwitched", handleTurnSwitched);
        };
    }, [socket, roomName, playerRole]);

    // listen for turn continuation and reset striker position
    useEffect(() => {
        if (!socket || !roomName) return;        const handleTurnContinued = (data) => {
            if (data.roomName !== roomName) return;

            // check if movement is still happening
            const areObjectsMoving =
                strikerRef.current?.isMoving(animationRef.current.MOVEMENT_THRESHOLD) ||
                coinsRef.current.some((coin) =>
                    coin.isMoving(animationRef.current.MOVEMENT_THRESHOLD),
                );

            if (areObjectsMoving) {
                // queue the action until movement stops
                animationRef.current.pendingTurnActionRef = {
                    type: "turnContinue",
                    continueWith: data.continueWith,
                    continuedTurns: data.continuedTurns,
                };
            } else {
                // execute immediately if nothing is moving
                animationRef.current.executeStrikerReset(
                    {
                        type: "turnContinue",
                        continueWith: data.continueWith,
                        continuedTurns: data.continuedTurns,
                    },
                    strikerRef,
                    canvasRef,
                    playerRole,
                    continuedTurnsRef,
                    pocketedThisTurnRef
                );
            }
        };

        socket.on("turnContinued", handleTurnContinued);
        return () => socket.off("turnContinued", handleTurnContinued);
    }, [socket, roomName, playerRole]);    // striker movement sync, sync coin positions to other player
    // emit coin positions whenever coins move (animation frame)
    useEffect(() => {
        if (!socket || !roomName) return;
        if (animationState.isAnimating) {
            const coinStates = coinsRef.current.map((coin) => ({
                id: coin.id,
                x: coin.x,
                y: coin.y,
                velocity: { ...coin.velocity },
            }));
            socket.emit("coinsMove", { roomName, coins: coinStates });
        }
    }, [animationState.isAnimating, socket, roomName, coins]);

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
            });            setCoins([...coinsRef.current]);
            const ctx = canvasRef.current.getContext("2d");
            Draw.drawBoard(ctx, createGameState(), playerRole);
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
            if (data.roomName !== roomName) return;            data.pocketedIds.forEach((id) => {
                Pocket.removeCoin(id, coinsRef, setCoins);            });
            const ctx = canvasRef.current.getContext("2d");
            Draw.drawBoard(ctx, createGameState(), playerRole);
        };
        socket.on("coinsPocketed", handleCoinsPocketed);
        return () => socket.off("coinsPocketed", handleCoinsPocketed);
    }, [socket, roomName]);

    // listen for debt payment events
    // add a coin of the player's color at the center
    // force a redraw

    useEffect(() => {
        if (!socket || !roomName) return;        const handleDebtPaid = (data) => {
            if (data.roomName !== roomName) return;
            Pocket.addCoinAtCenter(data.coinId, data.coinColor, canvasRef, Draw.BOARD_SIZE, coinsRef, setCoins, pocketedCoinsRef);            const ctx = canvasRef.current.getContext("2d");
            Draw.drawBoard(ctx, createGameState(), playerRole);
        };
        socket.on("debtPaid", handleDebtPaid);
        return () => socket.off("debtPaid", handleDebtPaid);
    }, [socket, roomName]);

    // listen for queen reset events
    // add queen back to center on both clients
    // force a redraw
    useEffect(() => {
        if (!socket || !roomName) return;        const handleQueenReset = (data) => {
            if (data.roomName !== roomName) return;            Pocket.addCoinAtCenter(5, "red", canvasRef, Draw.BOARD_SIZE, coinsRef, setCoins, pocketedCoinsRef);
            const ctx = canvasRef.current.getContext("2d");
            Draw.drawBoard(ctx, createGameState(), playerRole);
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
        if (!socket || !roomName) return;        const handleGameReset = (data) => {
            if (data.roomName !== roomName) return;

            // clear any pending turn actions
            animationRef.current.pendingTurnActionRef = null;

            // reset all coins to centered formation
            if (!canvasRef.current) return;            const boardX = (canvasRef.current.width - Draw.BOARD_SIZE) / 2;
            const boardY = (canvasRef.current.height - Draw.BOARD_SIZE) / 2;

            // Center position for coin formation
            const centerX = boardX + Draw.BOARD_SIZE / 2;
            const centerY = boardY + Draw.BOARD_SIZE / 2;

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
            };            // reset game state
            pocketedCoinsRef.current.clear();
            pocketedThisTurnRef.current = [];
            animationRef.current.beingPocketedCoinsRef = [];
            animationRef.current.beingPocketedStrikerRef = null;
            continuedTurnsRef.current = 0;
            debtRef.current = 0;

            // reset game manager state
            gameManager.resetGame();

            // reset striker position
            if (strikerRef.current) {                const initialX = boardX + Draw.BOARD_SIZE / 2;
                const initialY =
                    boardY + Draw.BOARD_SIZE - Draw.BASE_DISTANCE - Draw.BASE_HEIGHT / 2;
                strikerRef.current.x = initialX;
                strikerRef.current.y = initialY;
                strikerRef.current.velocity = { x: 0, y: 0 };
                strikerRef.current.isStrikerMoving = false;
            }            // redraw board
            const ctx = canvasRef.current.getContext("2d");
            Draw.drawBoard(ctx, createGameState(), playerRole);
        };

        socket.on("gameReset", handleGameReset);
        return () => socket.off("gameReset", handleGameReset);
    }, [socket, roomName, gameManager]);
    // continuously check for striker-coin collisions
    useEffect(() => {
        if (!strikerRef.current) return;        const checkCollisions = () => {
            const isCurrentlyColliding = Physics.checkStrikerCoinCollision(strikerRef.current, coinsRef.current);
            if (isCurrentlyColliding !== isStrikerColliding) {
                setIsStrikerColliding(isCurrentlyColliding);
            }
        };

        // check collisions on every animation frame
        const intervalId = setInterval(checkCollisions, 16); // ~60fps

        return () => clearInterval(intervalId);
    }, [isStrikerColliding, coins]); // re-run when coins change

    // separate useEffect for canvas event listeners
    useEffect(() => {        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        Draw.drawBoard(ctx, createGameState(), playerRole);
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
    }, [handState.isPlacing, isMyTurn, handState.isFlickerActive, handState.flick]);    // cleanup pending actions on component unmount or room change
    useEffect(() => {
        return () => {
            animationRef.current.cleanup();
        };
    }, [roomName]);

    return (
        <div>
            <canvas
                ref={canvasRef}
                width={900}
                height={900}                style={{
                    backgroundColor: "#fff",
                    cursor: animationState.isAnimating
                        ? "not-allowed"
                        : handState.isPlacing
                          ? "grabbing"
                          : isMyTurn && handState.canPlace
                            ? "grab"
                            : "default",
                }}
            />
            <br />            {isMyTurn &&
                !animationState.isAnimating &&
                !strikerRef.current?.isStrikerMoving &&
                (handState.isFlickerActive ? (
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
