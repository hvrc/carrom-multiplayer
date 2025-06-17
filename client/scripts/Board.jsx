import { useEffect, useRef, useState } from "react";
import Coin from "./Coin";
import Physics from "./Physics";
import Draw from "./Draw";
import Hand from "./Hand";
import Animation from "./Animation";
import * as Events from "./Events";

function GameCanvas({
    isMyTurn = true,
    socket,
    playerRole,
    roomName,
    manager,
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
    const [animationState, setAnimationState] = useState(
        animationRef.current.getState(),
    );

    const [isStrikerColliding, setIsStrikerColliding] = useState(false);
    const [coins, setCoins] = useState([]);
    const coinsRef = useRef([]);

    // all-time pocketed coins
    // coins pocketed in current turn
    const pocketedCoinsRef = useRef(new Set());
    const pocketedThisTurnRef = useRef([]);
    
    // track initial coin counts for game end detection
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
            red: allCoins.filter((coin) => coin.color === "red").length,
        };

        // Set up Hand callbacks
        handRef.current.setCallbacks({
            onStateChange: (newState) => setHandState(newState),
            onStrikerMove: (data) => {
                if (socket && roomName) {
                    socket.emit("strikerMove", {
                        roomName,
                        ...data,
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
            onAnimationStart: () =>
                animationRef.current.updateState({ isAnimating: true }),
            onRedraw: (collisionState) => {
                const ctx = canvasRef.current?.getContext("2d");
                if (ctx) {
                    Draw.drawBoard(
                        ctx,
                        createGameState(),
                        playerRole,
                        collisionState,
                    );
                }
            },
        });

        // Set up Animation callbacks
        animationRef.current.setCallbacks({
            setIsAnimating: (isAnimating) =>
                setAnimationState((prev) => ({ ...prev, isAnimating })),
            setHandState: (newState) => {
                handRef.current._updateState(newState);
                setHandState(handRef.current.getState());
            },
            createGameState: () => createGameState(),
        });
    }, []);

    // Helper function to create game state object for drawing
    const createGameState = () => ({
        strikerRef,
        coinsRef,
        isStrikerColliding,
        isFlickerActive: handState.isFlickerActive,
        flick: handState.flick,
        flickMaxLength: handState.flickMaxLength,
    });

    // show place button immediately after clicking flick
    const handleFlick = () => {
        handRef.current.handleFlick(isStrikerColliding);
    };

    const handlePlace = () => {
        handRef.current.handlePlace(strikerRef, socket, roomName, playerRole);
    };

    // Mouse event handlers delegated to Hand class
    const handleMouseDown = (e) => {
        handRef.current.handleMouseDown(e, {
            isAnimating: animationState.isAnimating,
            isMyTurn,
            strikerRef,
            canvasRef,
            playerRole,
            isStrikerColliding,
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
            roomName,
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
            playerRole,
        });
    };

    // animation loop for striker and coin movement
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
                manager,
                continuedTurnsRef,
                debtRef,
                pocketedThisTurnRef,
                pocketedCoinsRef,
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

        const handleStrikerMove = (data) => {
            Events.handleStrikerMove(data, {
                roomName,
                strikerRef,
                canvasRef,
                playerRole,
                createGameState,
            });
        };

        const handleStrikerCollisionUpdate = (data) => {
            Events.handleStrikerCollisionUpdate(data, {
                roomName,
                setIsStrikerColliding,
                canvasRef,
                playerRole,
                createGameState,
            });
        };

        const handleStrikerAnimation = (data) => {
            Events.handleStrikerAnimation(data, {
                roomName,
                strikerRef,
                animationRef,
                canvasRef,
                playerRole,
                createGameState,
            });
        };

        socket.on("strikerMove", handleStrikerMove);
        socket.on("strikerCollisionUpdate", handleStrikerCollisionUpdate);
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
            Events.handleTurnSwitched(data, {
                roomName,
                strikerRef,
                coinsRef,
                animationRef,
                canvasRef,
                playerRole,
                continuedTurnsRef,
                pocketedThisTurnRef,
            });
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
            Events.handleTurnContinued(data, {
                roomName,
                strikerRef,
                coinsRef,
                animationRef,
                canvasRef,
                playerRole,
                continuedTurnsRef,
                pocketedThisTurnRef,
            });
        };

        socket.on("turnContinued", handleTurnContinued);
        return () => socket.off("turnContinued", handleTurnContinued);
    }, [socket, roomName, playerRole]);

    // striker movement sync, sync coin positions to other player
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
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleCoinsMove = (data) => {
            Events.handleCoinsMove(data, {
                roomName,
                isMyTurn,
                coinsRef,
                setCoins,
                canvasRef,
                playerRole,
                createGameState,
            });
        };

        socket.on("coinsMove", handleCoinsMove);
        return () => socket.off("coinsMove", handleCoinsMove);
    }, [socket, roomName, isMyTurn]);

    // listen for pocketed coins from other player
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleCoinsPocketed = (data) => {
            Events.handleCoinsPocketed(data, {
                roomName,
                coinsRef,
                setCoins,
                canvasRef,
                playerRole,
                createGameState,
            });
        };

        socket.on("coinsPocketed", handleCoinsPocketed);
        return () => socket.off("coinsPocketed", handleCoinsPocketed);
    }, [socket, roomName]);

    // listen for debt payment events
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleDebtPaid = (data) => {
            Events.handleDebtPaid(data, {
                roomName,
                canvasRef,
                coinsRef,
                setCoins,
                pocketedCoinsRef,
                playerRole,
                createGameState,
            });
        };

        socket.on("debtPaid", handleDebtPaid);
        return () => socket.off("debtPaid", handleDebtPaid);
    }, [socket, roomName]);

    // listen for queen reset events
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleQueenReset = (data) => {
            Events.handleQueenReset(data, {
                roomName,
                canvasRef,
                coinsRef,
                setCoins,
                pocketedCoinsRef,
                playerRole,
                createGameState,
            });
        };

        socket.on("queenReset", handleQueenReset);
        return () => socket.off("queenReset", handleQueenReset);
    }, [socket, roomName]);
    
    // listen for cover turn state updates
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleCoverTurnUpdate = (data) => {
            Events.handleCoverTurnUpdate(data, {
                roomName,
                manager,
            });
        };

        socket.on("coverTurnUpdate", handleCoverTurnUpdate);
        return () => socket.off("coverTurnUpdate", handleCoverTurnUpdate);
    }, [socket, roomName, manager]);

    // listen for queen pocketed state updates
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleQueenPocketedUpdate = (data) => {
            Events.handleQueenPocketedUpdate(data, {
                roomName,
                manager,
            });
        };

        socket.on("queenPocketedUpdate", handleQueenPocketedUpdate);
        return () =>
            socket.off("queenPocketedUpdate", handleQueenPocketedUpdate);
    }, [socket, roomName, manager]);

    // listen for queen covered state updates
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleQueenCoveredUpdate = (data) => {
            Events.handleQueenCoveredUpdate(data, {
                roomName,
                manager,
            });
        };

        socket.on("queenCoveredUpdate", handleQueenCoveredUpdate);
        return () => socket.off("queenCoveredUpdate", handleQueenCoveredUpdate);
    }, [socket, roomName, manager]);

    // listen for game reset events
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleGameReset = (data) => {
            Events.handleGameReset(data, {
                roomName,
                animationRef,
                canvasRef,
                strikerRef,
                coinsRef,
                setCoins,
                initialCoinCountsRef,
                pocketedCoinsRef,
                pocketedThisTurnRef,
                continuedTurnsRef,
                debtRef,
                manager,
                playerRole,
                createGameState,
            });
        };

        socket.on("gameReset", handleGameReset);
        return () => socket.off("gameReset", handleGameReset);
    }, [socket, roomName, manager]);

    // continuously check for striker-coin collisions
    useEffect(() => {
        if (!strikerRef.current) return;
        const checkCollisions = () => {
            const isCurrentlyColliding = Physics.checkStrikerCoinCollision(
                strikerRef.current,
                coinsRef.current,
            );
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
    }, [
        handState.isPlacing,
        isMyTurn,
        handState.isFlickerActive,
        handState.flick,
    ]);
    
    // cleanup pending actions on component unmount or room change
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
                height={900}
                style={{
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
            <br />

            {isMyTurn &&
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
