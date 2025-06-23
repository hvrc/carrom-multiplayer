import Physics from "./Physics";
import Pocket from "./Pocket";
import Draw from "./Draw";

class Animation {
    constructor() {
        // Animation state
        this.isAnimating = false;
        this.isFlickerActive = false;

        // Animation refs
        this.beingPocketedCoinsRef = [];
        this.beingPocketedStrikerRef = null;
        this.pendingTurnActionRef = null;

        // Constants
        this.MOVEMENT_THRESHOLD = 0.21;

        // Animation frame ID for cleanup
        this.animationId = null;

        // Callbacks that will be set from Board component
        this.callbacks = {};
    }

    // Set callbacks from the parent component
    setCallbacks(callbacks) {
        this.callbacks = {
            setIsAnimating: callbacks.setIsAnimating || (() => {}),
            setHandState: callbacks.setHandState || (() => {}),
            onStrikerMove: callbacks.onStrikerMove || (() => {}),
            onCoinsMove: callbacks.onCoinsMove || (() => {}),
            onStrikerAnimation: callbacks.onStrikerAnimation || (() => {}),
            onCoinsPocketed: callbacks.onCoinsPocketed || (() => {}),
            onUpdateScore: callbacks.onUpdateScore || (() => {}),
            onCoverTurnUpdate: callbacks.onCoverTurnUpdate || (() => {}),
            onQueenPocketedUpdate: callbacks.onQueenPocketedUpdate || (() => {}),
            onQueenCoveredUpdate: callbacks.onQueenCoveredUpdate || (() => {}),
            onQueenReset: callbacks.onQueenReset || (() => {}),
            onUpdateDebt: callbacks.onUpdateDebt || (() => {}),
            onSwitchTurn: callbacks.onSwitchTurn || (() => {}),
            onContinueTurn: callbacks.onContinueTurn || (() => {}),
            onGameReset: callbacks.onGameReset || (() => {}),
            ...callbacks,
        };
    }

    // Get current animation state
    getState() {
        return {
            isAnimating: this.isAnimating,
            isFlickerActive: this.isFlickerActive,
        };
    }

    // Update animation state
    updateState(newState) {
        if (newState.isAnimating !== undefined) {
            this.isAnimating = newState.isAnimating;
            this.callbacks.setIsAnimating?.(this.isAnimating);
        }
        if (newState.isFlickerActive !== undefined) {
            this.isFlickerActive = newState.isFlickerActive;
        }
    }

    // Reset striker position when all movement has stopped
    executeStrikerReset(actionData, strikerRef, canvasRef, playerRole, continuedTurnsRef, pocketedThisTurnRef, ) {
        if (!strikerRef.current) return;

        const ctx = canvasRef.current?.getContext("2d");
        if (!ctx) return;

        const boardX = (ctx.canvas.width - Draw.BOARD_SIZE) / 2;
        const boardY = (ctx.canvas.height - Draw.BOARD_SIZE) / 2;
        const bottomBaselineY =
            boardY +
            Draw.BOARD_SIZE -
            Draw.BASE_DISTANCE -
            Draw.BASE_HEIGHT / 2;
        const topBaselineY = boardY + Draw.BASE_DISTANCE + Draw.BASE_HEIGHT / 2;

        let newX = boardX + Draw.BOARD_SIZE / 2;
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
        const gameState = this.callbacks.createGameState?.() || {};
        Draw.drawBoard(ctx, gameState, playerRole);
    }

    // Main animation loop function
    animate(params) {
        const {
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
        } = params;

        if (!strikerRef.current || !isMyTurn) return;

        const boardX = (canvasRef.current.width - Draw.BOARD_SIZE) / 2;
        const boardY = (canvasRef.current.height - Draw.BOARD_SIZE) / 2;

        strikerRef.current.update(
            0.98,
            this.MOVEMENT_THRESHOLD,
            boardX,
            boardY,
            Draw.BOARD_SIZE,
        );

        coinsRef.current.forEach((coin) => {
            coin.update();
            coin.handleBorderCollision(boardX, boardY, Draw.BOARD_SIZE);
        });

        coinsRef.current.forEach((coin) => {
            Physics.resolveCircleCollision(strikerRef.current, coin);
        });

        for (let i = 0; i < coinsRef.current.length; i++) {
            for (let j = i + 1; j < coinsRef.current.length; j++) {
                Physics.resolveCircleCollision(
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
        const pocketRadius = Pocket.POCKET_DIAMETER / 2;

        const pockets = [
            { x: boardX + pocketRadius, y: boardY + pocketRadius },
            {
                x: boardX + Draw.BOARD_SIZE - pocketRadius,
                y: boardY + pocketRadius,
            },
            {
                x: boardX + pocketRadius,
                y: boardY + Draw.BOARD_SIZE - pocketRadius,
            },
            {
                x: boardX + Draw.BOARD_SIZE - pocketRadius,
                y: boardY + Draw.BOARD_SIZE - pocketRadius,
            },
        ];

        // check if striker is pocketed
        const striker = strikerRef.current;
        if (
            !striker.beingPocketed &&
            Pocket.isNearAnyPocket(striker.x, striker.y, pockets)
        ) {
            for (const pocket of pockets) {
                const strikerDist = Math.hypot(
                    striker.x - pocket.x,
                    striker.y - pocket.y,
                );

                if (strikerDist < pocketRadius - striker.radius / 2) {
                    // start striker pocketing animation instead of immediate processing
                    striker.startPocketing(pocket.x, pocket.y);
                    this.beingPocketedStrikerRef = {
                        striker: striker,
                        pocket: pocket,
                        playerRole: playerRole,
                    };

                    // ensure animation loop is running for striker pocketing
                    this.updateState({ isAnimating: true });

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
        this.beingPocketedCoinsRef = this.beingPocketedCoinsRef.filter(
            (item) => {
                const animationComplete = item.coin.updatePocketAnimation();

                if (animationComplete) {
                    // animation is complete, remove coin and broadcast
                    Pocket.removeCoin(item.coin.id, coinsRef, setCoins);
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
            },
        );

        // process striker pocketing animation
        if (this.beingPocketedStrikerRef) {
            const animationComplete =
                strikerRef.current.updatePocketAnimation();
            if (animationComplete) {

                // animation complete, process striker pocketing
                const strikerData = this.beingPocketedStrikerRef;
                this.beingPocketedStrikerRef = null;

                // reset striker's pocketing state and radius
                strikerRef.current.resetPocketingState();

                // immediately reset striker position to correct baseline for next player
                const boardX = (canvasRef.current.width - Draw.BOARD_SIZE) / 2;
                const boardY = (canvasRef.current.height - Draw.BOARD_SIZE) / 2;
                const bottomBaselineY =
                    boardY +
                    Draw.BOARD_SIZE -
                    Draw.BASE_DISTANCE -
                    Draw.BASE_HEIGHT / 2;
                const topBaselineY =
                    boardY + Draw.BASE_DISTANCE + Draw.BASE_HEIGHT / 2;

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

                strikerRef.current.x = boardX + Draw.BOARD_SIZE / 2;
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

                const currentPlayerData = manager.getPlayerData(playerRole);

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
                !this.beingPocketedCoinsRef.some(
                    (item) => item.coin.id === coin.id,
                )
            ) {
                // coin just started being pocketed, add to animation list
                this.beingPocketedCoinsRef.push({
                    coin: coin,
                    pocket: null, // will be set when animation starts
                });
            }
        });

        // track the last scored coin to prevent duplicate scoring
        let lastScoredCoinId = null;

        // check coin pocketing
        const pocketedCoins = [];
        coinsRef.current.forEach((coin) => {
            // skip coins already being pocketed
            if (coin.beingPocketed) return;

            if (Pocket.isNearAnyPocket(coin.x, coin.y, pockets)) {
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
                                    manager.getPlayerData(playerRole);

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
        const gameState = this.callbacks.createGameState?.() || {};
        Draw.drawBoard(ctx, gameState, playerRole);

        // check if anything is still moving using consistent threshold
        const isAnythingMoving =
            striker.isMoving(this.MOVEMENT_THRESHOLD) ||
            coinsRef.current.some((coin) =>
                coin.isMoving(this.MOVEMENT_THRESHOLD),
            ) ||
            this.beingPocketedCoinsRef.length > 0 || // keep animating while coins are being pocketed
            this.beingPocketedStrikerRef !== null; // keep animating while striker is being pocketed

        if (isAnythingMoving) {
            this.animationId = requestAnimationFrame(() =>
                this.animate(params),
            );
        } else {
            this.updateState({ isAnimating: false });
            // Reset Hand state when animation stops
            this.callbacks.setHandState?.({
                isFlickerActive: false,
                canPlace: true,
            });

            // execute any pending turn actions now that all movement has stopped
            if (this.pendingTurnActionRef) {
                const pendingAction = this.pendingTurnActionRef;
                this.pendingTurnActionRef = null; // clear the pending action
                this.executeStrikerReset(
                    pendingAction,
                    strikerRef,
                    canvasRef,
                    playerRole,
                    continuedTurnsRef,
                    pocketedThisTurnRef,
                );
                return; // exit early to avoid game logic interference
            }

            // reset the last scored coin when animation stops
            lastScoredCoinId = null;
            const playerColor = playerRole === "creator" ? "white" : "black";
            const currentPlayerData = manager.getPlayerData(playerRole);

            // check if queen was pocketed this turn
            const queenPocketed = pocketedThisTurnRef.current.some(
                (coin) => coin.color === "red",
            );

            // if queen was pocketed this turn
            // count other coins pocketed, excluding queen to determine continued turns
            if (queenPocketed) {
                const otherCoinsThisTurn = pocketedThisTurnRef.current.filter(
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
                        continuedTurnsRef.current += pocketedOwnColorCoins.length - 1;
                        socket.emit("continueTurn", { roomName, continuedTurns: continuedTurnsRef.current, });
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
                );
                
                // exclude queen
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

    // Start animation loop
    startAnimation(params) {
        if (!this.isAnimating) {
            this.updateState({ isAnimating: true });
            this.animate(params);
        }
    }

    // Stop animation loop
    stopAnimation() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.updateState({ isAnimating: false });
    }

    // Cleanup method
    cleanup() {
        this.stopAnimation();
        this.beingPocketedCoinsRef = [];
        this.beingPocketedStrikerRef = null;
        this.pendingTurnActionRef = null;
    }
}

export default Animation;
