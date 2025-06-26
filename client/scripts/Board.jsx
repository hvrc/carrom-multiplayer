import { useEffect, useRef, useState } from "react";
import Coin from "./Coin";
import Physics from "./Physics";
import Draw from "./Draw";
import Hand from "./Hand";
import Animation from "./Animation";
import * as Events from "./Events";

// Add custom hook for responsive scaling
function useResponsiveScale() {
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const updateScale = () => {
            const isMobile = window.innerWidth <= 768;
            const width = window.innerWidth;
            const height = window.innerHeight;
            
            if (isMobile) {
                // Mobile: fit to window width with small margins
                const horizontalScale = (width - 20) / Draw.FRAME_SIZE;
                setScale(horizontalScale);
            } else {                // Desktop: moderately zoomed out view
                const horizontalScale = (width - 100) / Draw.FRAME_SIZE;
                const verticalScale = (height - 100) / Draw.FRAME_SIZE;
                // Use 0.65 for moderate zoom out on desktop
                setScale(Math.min(horizontalScale, verticalScale) * 0.7);
            }
        };

        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, []);

    return scale;
}

function GameCanvas({
    isMyTurn = true,
    socket,
    playerRole,
    roomName,
    manager,
    onLeaveRoom,
    creatorUsername = "",
    joinerUsername = "",
}) {
    const [showHelp, setShowHelp] = useState(false);

    // Help text toggle handler
    const handleHelpToggle = () => {
        setShowHelp(prev => !prev);
    };

    // Add custom CSS for slider thumb styling
    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `                 <div style={{
                    width: '900px',
                    padding: '20px',
                    backgroundColor: 'white',
                    border: '2px solid black',
                    fontFamily: 'Helvetica, Arial, sans-serif',
                    fontSize: '16px',
                    position: 'absolute',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    pointerEvents: 'none',
                    zIndex: 2
                }}>
                    Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
                </div>)WebKit browsers (Chrome, Safari) - HIDDEN */
            input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 30px;
                height: 120px; /* Much taller thumb covering entire vertical bottom space */
                border-radius: 0; /* No rounding for minimal rectangle */
                background: transparent; /* Invisible - no color */
                cursor: pointer;
                border: none; /* No border for minimal look */
                box-shadow: none; /* No shadow for minimal look */
                transition: none; /* No transitions for minimal look */
                margin-top: -54px; /* Center the thumb on the track: (120px - 12px) / 2 = 54px */
                opacity: 0; /* Completely invisible */
            }
            
            input[type="range"]::-webkit-slider-thumb:hover {
                background: transparent; /* Keep invisible even on hover */
                box-shadow: none; /* No shadow on hover */
                transform: none; /* No scaling on hover */
                opacity: 0; /* Keep invisible on hover */
            }
            
            /* Firefox - HIDDEN */
            input[type="range"]::-moz-range-thumb {
                width: 30px;
                height: 120px; /* Much taller thumb covering entire vertical bottom space */
                border-radius: 0; /* No rounding for minimal rectangle */
                background: transparent; /* Invisible - no color */
                cursor: pointer;
                border: none; /* No border for minimal look */
                box-shadow: none; /* No shadow for minimal look */
                margin-top: -54px; /* Center the thumb on the track: (120px - 12px) / 2 = 54px */
                opacity: 0; /* Completely invisible */
            }
            
            input[type="range"]::-moz-range-thumb:hover {
                background: transparent; /* Keep invisible even on hover */
                box-shadow: none; /* No shadow on hover */
                opacity: 0; /* Keep invisible on hover */
            }
            
            /* Remove default track styling for Firefox - HIDDEN */
            input[type="range"]::-moz-range-track {
                background: transparent; /* No fill - transparent background */
                height: 12px;
                border-radius: 0; /* No rounded edges */
                border: none; /* No border - completely invisible */
                outline: none; /* Remove any default outline */
                box-shadow: none; /* Remove any default box shadow */
                opacity: 0; /* Completely invisible */
            }
            
            /* Track styling for WebKit - HIDDEN */
            input[type="range"]::-webkit-slider-runnable-track {
                width: 100%;
                height: 12px;
                background: transparent; /* No fill - transparent background */
                border-radius: 0; /* No rounded edges */
                border: none; /* No border - completely invisible */
                outline: none; /* Remove any default outline */
                box-shadow: none; /* Remove any default box shadow */
                opacity: 0; /* Completely invisible */
            }
            
            /* Additional overrides to ensure invisibility */
            input[type="range"] {
                background: transparent !important;
                outline: none;
                opacity: 0; /* Make the entire slider invisible */
            }
            
            /* Override any remaining browser default track styling - HIDDEN */
            input[type="range"]::-webkit-slider-track {
                background: transparent !important;
                border: none; /* No border */
                border-radius: 0;
                height: 12px;
                opacity: 0; /* Completely invisible */
            }
            
            /* Disabled slider styling - HIDDEN */
            input[type="range"]:disabled::-webkit-slider-thumb {
                background: transparent; /* Keep invisible when disabled */
                cursor: not-allowed;
                opacity: 0; /* Keep invisible when disabled */
            }
            
            input[type="range"]:disabled::-moz-range-thumb {
                background: transparent; /* Keep invisible when disabled */
                cursor: not-allowed;
                opacity: 0; /* Keep invisible when disabled */
            }
            
            input[type="range"]:disabled::-webkit-slider-track {
                border: none; /* No border when disabled */
                opacity: 0; /* Keep invisible when disabled */
            }
            
            input[type="range"]:disabled::-moz-range-track {
                border: none; /* No border when disabled */
                opacity: 0; /* Keep invisible when disabled */
            }
        `;
        document.head.appendChild(style);
        
        // Cleanup function to remove style when component unmounts
        return () => {
            document.head.removeChild(style);
        };
    }, []);

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
        };        // Set up Hand callbacks
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
                animationRef.current.updateState({ isAnimating: true }),            onRedraw: (collisionState) => {
                const ctx = canvasRef.current?.getContext("2d");
                if (ctx) {
                    // Use current hand state directly to avoid React state timing issues
                    const currentGameState = {
                        strikerRef,
                        coinsRef,
                        isStrikerColliding,
                        isFlickerActive: handRef.current.isFlickerActive,
                        flick: handRef.current.flick,
                        flickMaxLength: handRef.current.flickMaxLength,
                    };
                    Draw.drawBoard(
                        ctx,
                        currentGameState,
                        playerRole,
                        collisionState,
                    );
                }
            },
            onSliderChange: (data) => {
                if (socket && roomName) {
                    socket.emit("strikerSliderUpdate", {
                        roomName,
                        playerRole,
                        ...data,
                    });
                }
            },
        });

        // Initialize slider boundaries
        handRef.current.calculateSliderBoundaries(canvasRef);        // Set up Animation callbacks
        animationRef.current.setCallbacks({
            setIsAnimating: (isAnimating) =>
                setAnimationState((prev) => ({ ...prev, isAnimating })),
            setHandState: (newState) => {
                handRef.current._updateState(newState);
                setHandState(handRef.current.getState());
            },
            createGameState: () => createGameState(),            onStrikerReset: (newX) => {
                // Reset slider to center when striker resets
                const newSliderValue = handRef.current.xToSlider(newX, playerRole);
                handRef.current.sliderValue = newSliderValue;
                setHandState(handRef.current.getState());
            },
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
    });    // Handle slider change
    const handleSliderChange = (e) => {
        const newValue = parseFloat(e.target.value);
        handRef.current.handleSliderChange(newValue, strikerRef, socket, roomName, playerRole);
        setHandState(handRef.current.getState());
    };

    // Mouse and touch event handlers delegated to Hand class
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
            isMyTurn,
            strikerRef,
            canvasRef,
            playerRole,
        });
    };

    const handleMouseUp = (e) => {
        handRef.current.handleMouseUp(e, {
            isMyTurn,
            strikerRef,
            isStrikerColliding,
        });
    };    // Convert touch event to canvas coordinates
    const getTouchPosition = (touch, canvas) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (touch.clientX - rect.left) * scaleX,
            y: (touch.clientY - rect.top) * scaleY
        };
    };

    // Store the last known touch position for touch end
    const lastTouchRef = useRef({ clientX: 0, clientY: 0, screenX: 0, screenY: 0 });

    // Create a synthetic mouse event from a touch event
    const createSyntheticMouseEvent = (type, touch, canvas) => {
        // For touchend, use the last known position
        const eventProps = {
            bubbles: true,
            cancelable: true,
            view: window,
            clientX: touch ? touch.clientX : lastTouchRef.current.clientX,
            clientY: touch ? touch.clientY : lastTouchRef.current.clientY,
            screenX: touch ? touch.screenX : lastTouchRef.current.screenX,
            screenY: touch ? touch.screenY : lastTouchRef.current.screenY,
            button: 0,
            buttons: type === 'mouseup' ? 0 : 1,
            detail: 1,
            isTrusted: true
        };

        const event = new MouseEvent(type, eventProps);

        // Add missing properties that some browsers expect
        if (!event.offsetX) {
            const rect = canvas.getBoundingClientRect();
            event.offsetX = eventProps.clientX - rect.left;
            event.offsetY = eventProps.clientY - rect.top;
        }

        return event;
    };

    // Touch event handlers
    const handleTouchStart = (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            // Store the touch position
            lastTouchRef.current = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                screenX: touch.screenX,
                screenY: touch.screenY
            };
            const mouseEvent = createSyntheticMouseEvent('mousedown', touch, canvasRef.current);
            handleMouseDown(mouseEvent);
        }
    };

    const handleTouchMove = (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            // Update the last known position
            lastTouchRef.current = {
                clientX: touch.clientX,
                clientY: touch.clientY,
                screenX: touch.screenX,
                screenY: touch.screenY
            };
            const mouseEvent = createSyntheticMouseEvent('mousemove', touch, canvasRef.current);
            handleMouseMove(mouseEvent);
        }
    };

    const handleTouchEnd = (e) => {
        e.preventDefault();
        // Create mouseup event using the last known position
        const mouseEvent = createSyntheticMouseEvent('mouseup', null, canvasRef.current);
        handleMouseUp(mouseEvent);

        // Clear the last touch position
        lastTouchRef.current = { clientX: 0, clientY: 0, screenX: 0, screenY: 0 };

        // Also trigger the global mouse up handler in Hand.js
        if (handRef.current._lastContext) {
            handRef.current.handleFlickMouseUp(mouseEvent, {
                isMyTurn,
                strikerRef,
                isStrikerColliding
            });
        }
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
        };        const handleStrikerAnimation = (data) => {
            Events.handleStrikerAnimation(data, {
                roomName,
                strikerRef,
                animationRef,
                canvasRef,
                playerRole,
                createGameState,
            });
        };

        const handleStrikerSliderUpdate = (data) => {
            Events.handleStrikerSliderUpdate(data, {
                roomName,
                strikerRef,
                handRef,
                setHandState,
                canvasRef,
                playerRole,
                createGameState,
            });
        };

        socket.on("strikerMove", handleStrikerMove);
        socket.on("strikerCollisionUpdate", handleStrikerCollisionUpdate);
        socket.on("strikerAnimation", handleStrikerAnimation);
        socket.on("strikerSliderUpdate", handleStrikerSliderUpdate);

        return () => {
            socket.off("strikerMove", handleStrikerMove);
            socket.off("strikerCollisionUpdate", handleStrikerCollisionUpdate);
            socket.off("strikerAnimation", handleStrikerAnimation);
            socket.off("strikerSliderUpdate", handleStrikerSliderUpdate);
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
                socket,
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
                socket,
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
    }, [isStrikerColliding, coins]); // re-run when coins change    // separate useEffect for initial canvas drawing
    useEffect(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        Draw.drawBoard(ctx, createGameState(), playerRole);
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
    
    // handle room closed event - return to menu if any player leaves
    useEffect(() => {
        if (!socket || !onLeaveRoom) return;

        const handleRoomClosed = () => {
            onLeaveRoom();
        };

        socket.on("roomClosed", handleRoomClosed);
        return () => {
            socket.off("roomClosed", handleRoomClosed);
        };
    }, [socket, onLeaveRoom]);

    // Get the responsive scale factor
    const scale = useResponsiveScale();    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            width: '100vw',
            height: '100vh',
            position: 'fixed',
            top: 0,
            left: 0,
            backgroundColor: '#fff'
        }}>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                transformOrigin: 'center center',
                transform: `scale(${scale})`,
            }}>
                <div style={{
                    position: 'relative',
                    width: '900px',
                    marginBottom: '10px',
                    height: '40px'
                }}>
                    {/* Help toggle button */}
                    <button
                        onClick={handleHelpToggle}
                        style={{
                            position: 'absolute',
                            left: '0',
                            width: '40px',
                            height: '40px',
                            backgroundColor: 'white',
                            border: '2px solid black',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontFamily: 'Helvetica, Arial, sans-serif',
                            fontSize: '24px'
                        }}
                    >{showHelp ? 'X' : '?'}</button>

                    {/* Info bar */}
                    <div style={{
                        position: 'absolute',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        display: 'flex',
                        gap: '20px',
                        alignItems: 'center',
                        fontFamily: 'Helvetica, Arial, sans-serif',
                        fontSize: '20px'
                    }}>
                        <span style={{ fontWeight: 'bold' }}>{roomName.toUpperCase()}</span>
                        <span>{creatorUsername ? creatorUsername.toUpperCase() : "?"} &nbsp; {manager?.getPlayerData("creator")?.score || 0}</span>
                        <span>{joinerUsername ? joinerUsername.toUpperCase() : "?"} &nbsp; {manager?.getPlayerData("joiner")?.score || 0}</span>
                    </div>

                    {/* Exit button */}
                    {onLeaveRoom && (
                        <button onClick={onLeaveRoom} style={{
                            position: 'absolute',
                            right: '0',
                            width: '100px',
                            height: '40px',
                            backgroundColor: 'white',
                            border: '2px solid black',
                            cursor: 'pointer',
                            fontWeight: 'bold',
                            fontFamily: 'Helvetica, Arial, sans-serif',
                            fontSize: '20px'
                        }}>
                            EXIT
                        </button>
                    )}
                </div>

                <canvas
                    ref={canvasRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={(e) => handRef.current.handleMouseLeave(e, {
                        isAnimating: animationState.isAnimating,
                        isMyTurn,
                        strikerRef,
                        isStrikerColliding,
                    })}
                    onTouchStart={handleTouchStart}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    width={900}
                    height={900}
                    style={{
                        backgroundColor: "#fff",
                        cursor: animationState.isAnimating
                            ? "not-allowed"
                            : handState.isFlickerActive
                                ? "crosshair"
                                : isMyTurn && !strikerRef.current?.isStrikerMoving
                                    ? "grab"
                                    : "default",
                        border: "1px solid black",
                        borderRadius: "0",
                        touchAction: "none"
                    }}
                />

                {/* Help text box */}
                {showHelp && (
                    <div style={{
                        width: '855px',
                        padding: '20px',
                        backgroundColor: 'white',
                        border: '2px solid black',
                        fontFamily: 'Helvetica, Arial, sans-serif',
                        fontSize: '20px',
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        pointerEvents: 'none',
                        zIndex: 2,
                        textTransform: 'uppercase',
                        textAlign: 'center'
                    }}>
                        DRAG ALONG THE AREA BELOW THE BOARD TO MOVE THE STRIKER <br />
                        DRAG ANYWHERE ON THE BOARD TO AIM AND RELEASE TO FLICK <br />
                        THE FURTHER YOU DRAG THE HARDER YOU'LL FLICK
                    </div>
                )}

                {/* Striker Position Slider */}
                <div style={{
                    width: '470px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '160px',
                    justifyContent: 'center',
                    position: 'relative',
                    zIndex: 1
                }}>
                    <input
                        type="range"
                        min="0"
                        max="100"
                        value={handState.sliderValue || 50}
                        onChange={handleSliderChange}
                        disabled={!isMyTurn || animationState.isAnimating || strikerRef.current?.isStrikerMoving}
                        style={{
                            width: '100%',
                            height: '130px',
                            borderRadius: '0',
                            background: 'transparent',
                            outline: 'none',
                            cursor: isMyTurn && !animationState.isAnimating && !strikerRef.current?.isStrikerMoving ? 'pointer' : 'not-allowed',
                            WebkitAppearance: 'none',
                            appearance: 'none',
                            opacity: 0,
                            border: 'none'
                        }}
                    />
                </div>
            </div>
        </div>
    );
}

export default GameCanvas;
