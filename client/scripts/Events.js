import Draw from "./Draw";
import Coin from "./Coin";
import Pocket from "./Pocket";

/**
 * Centralized socket event handlers for the carrom game
 * This module contains all socket event handler functions extracted from Board.jsx
 */

/**
 * Handle striker movement events from other players
 */
export const handleStrikerMove = (
    data,
    { roomName, strikerRef, canvasRef, playerRole, createGameState },
) => {
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
        Draw.drawBoard(ctx, createGameState(), playerRole);
    }
};

/**
 * Handle striker collision state updates from other players
 */
export const handleStrikerCollisionUpdate = (
    data,
    { roomName, setIsStrikerColliding, canvasRef, playerRole, createGameState },
) => {
    if (data.roomName === roomName) {
        // update collision state based on remote player's collision check
        setIsStrikerColliding(data.isColliding);

        // redraw board immediately with updated collision state
        const ctx = canvasRef.current.getContext("2d");
        Draw.drawBoard(ctx, createGameState(), playerRole);
    }
};

/**
 * Handle striker animation synchronization
 */
export const handleStrikerAnimation = (
    data,
    {
        roomName,
        strikerRef,
        animationRef,
        canvasRef,
        playerRole,
        createGameState,
    },
) => {
    if (data.roomName === roomName && strikerRef.current) {
        if (data.type === "startPocketing") {
            // start pocketing animation on the other client
            strikerRef.current.startPocketing(data.pocketX, data.pocketY);
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

/**
 * Handle turn switch events
 */
export const handleTurnSwitched = (
    data,
    {
        roomName,
        strikerRef,
        coinsRef,
        animationRef,
        canvasRef,
        playerRole,
        continuedTurnsRef,
        pocketedThisTurnRef,
    },
) => {
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
            pocketedThisTurnRef,
        );
    }
};

/**
 * Handle turn continuation events
 */
export const handleTurnContinued = (
    data,
    {
        roomName,
        strikerRef,
        coinsRef,
        animationRef,
        canvasRef,
        playerRole,
        continuedTurnsRef,
        pocketedThisTurnRef,
    },
) => {
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
            pocketedThisTurnRef,
        );
    }
};

/**
 * Handle coin movement events from other players
 */
export const handleCoinsMove = (
    data,
    {
        roomName,
        isMyTurn,
        coinsRef,
        setCoins,
        canvasRef,
        playerRole,
        createGameState,
    },
) => {
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
    Draw.drawBoard(ctx, createGameState(), playerRole);
};

/**
 * Handle coins pocketed events
 */
export const handleCoinsPocketed = (
    data,
    { roomName, coinsRef, setCoins, canvasRef, playerRole, createGameState },
) => {
    if (data.roomName !== roomName) return;

    data.pocketedIds.forEach((id) => {
        Pocket.removeCoin(id, coinsRef, setCoins);
    });

    const ctx = canvasRef.current.getContext("2d");
    Draw.drawBoard(ctx, createGameState(), playerRole);
};

/**
 * Handle debt payment events
 */
export const handleDebtPaid = (
    data,
    {
        roomName,
        canvasRef,
        coinsRef,
        setCoins,
        pocketedCoinsRef,
        playerRole,
        createGameState,
    },
) => {
    if (data.roomName !== roomName) return;

    Pocket.addCoinAtCenter(
        data.coinId,
        data.coinColor,
        canvasRef,
        Draw.BOARD_SIZE,
        coinsRef,
        setCoins,
        pocketedCoinsRef,
    );

    const ctx = canvasRef.current.getContext("2d");
    Draw.drawBoard(ctx, createGameState(), playerRole);
};

/**
 * Handle queen reset events
 */
export const handleQueenReset = (
    data,
    {
        roomName,
        canvasRef,
        coinsRef,
        setCoins,
        pocketedCoinsRef,
        playerRole,
        createGameState,
    },
) => {
    if (data.roomName !== roomName) return;

    Pocket.addCoinAtCenter(
        5,
        "red",
        canvasRef,
        Draw.BOARD_SIZE,
        coinsRef,
        setCoins,
        pocketedCoinsRef,
    );

    const ctx = canvasRef.current.getContext("2d");
    Draw.drawBoard(ctx, createGameState(), playerRole);
};

/**
 * Handle cover turn state updates
 */
export const handleCoverTurnUpdate = (data, { roomName, manager }) => {
    if (data.roomName !== roomName) return;

    // update the cover turn state for the specified player
    const playerData = manager.getPlayerData(data.playerRole);
    if (playerData) {
        playerData.isCoverTurn = data.isCoverTurn;
    }
};

/**
 * Handle queen pocketed state updates
 */
export const handleQueenPocketedUpdate = (data, { roomName, manager }) => {
    if (data.roomName !== roomName) return;

    const playerData = manager.getPlayerData(data.playerRole);
    if (playerData) {
        playerData.hasPocketedQueen = data.hasPocketedQueen;
    }
};

/**
 * Handle queen covered state updates
 */
export const handleQueenCoveredUpdate = (data, { roomName, manager }) => {
    if (data.roomName !== roomName) return;

    const playerData = manager.getPlayerData(data.playerRole);
    if (playerData) {
        playerData.hasCoveredQueen = data.hasCoveredQueen;
    }
};

/**
 * Handle game reset events
 */
export const handleGameReset = (
    data,
    {
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
    },
) => {
    if (data.roomName !== roomName) return;

    // clear any pending turn actions
    animationRef.current.pendingTurnActionRef = null;

    // reset all coins to centered formation
    if (!canvasRef.current) return;
    const boardX = (canvasRef.current.width - Draw.BOARD_SIZE) / 2;
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
            const x = coinFormation.centerX + ring.radius * Math.cos(angle);
            const y = coinFormation.centerY + ring.radius * Math.sin(angle);

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
    animationRef.current.beingPocketedCoinsRef = [];
    animationRef.current.beingPocketedStrikerRef = null;
    continuedTurnsRef.current = 0;
    debtRef.current = 0;

    // reset game manager state
    manager.resetGame();

    // reset striker position
    if (strikerRef.current) {
        const initialX = boardX + Draw.BOARD_SIZE / 2;
        const initialY =
            boardY +
            Draw.BOARD_SIZE -
            Draw.BASE_DISTANCE -
            Draw.BASE_HEIGHT / 2;
        strikerRef.current.x = initialX;
        strikerRef.current.y = initialY;
        strikerRef.current.velocity = { x: 0, y: 0 };
        strikerRef.current.isStrikerMoving = false;
    }

    // redraw board
    const ctx = canvasRef.current.getContext("2d");
    Draw.drawBoard(ctx, createGameState(), playerRole);
};
