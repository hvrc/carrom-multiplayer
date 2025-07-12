import { useEffect, useRef, useState } from "react";
import Coin from "./Coin";
import Physics from "./Physics";
import Draw from "./Draw";
import Hand from "./Hand";
import Animation from "./Animation";
import * as Events from "./Events";

// a custom hook for responsive scaling
// returns a scale value
// use state; i remember this sets scale variable to 1,
// and defines setscale as a function that can change the value of scale
// define a bool that is set to true if width is lesser than normal desktop width,
// to recognize if device is a Mobile
// define variables for width and height
// frame size is the length of outer side of board square
// set horizontal scale such that board is almost the same width as screen, with a small gap
// if on desktop, set horizontal and vertical scale with more gap between borders and outer gap of board
// set scale using both horizontal and vertical scale, 
// idk if we should have another multiplier 0.71!
// call the update scale function, the hook is called evey time the component first mounts
// theres a listener for whenever window resizes which calls the update scale function when it does resize
// 'resize' is an event
// returning the removal of the listener, as a cleanup function, i don't quite get this!

function useResponsiveScale() {
    const [scale, setScale] = useState(1);

    useEffect(() => {
        const updateScale = () => {
            const isMobile = window.innerWidth <= 768;
            const width = window.innerWidth;
            const height = window.innerHeight;
            
            if (isMobile) {
                const horizontalScale = (width - 20) / Draw.FRAME_SIZE;
                setScale(horizontalScale);
            } else {
                const horizontalScale = (width - 100) / Draw.FRAME_SIZE;
                const verticalScale = (height - 100) / Draw.FRAME_SIZE;
                setScale(Math.min(horizontalScale, verticalScale) * 0.7);
            }
        };

        updateScale();
        window.addEventListener('resize', updateScale);
        return () => window.removeEventListener('resize', updateScale);
    }, []);

    return scale;
}

// game canvas takes these parameters, the feel so unintuitive to me!
// i dont even know what the game canvas is, where is it?
// a function that handles the toggling of the help text
// is this redundant
// a use state to set the bool that shows/hides the help text
//  prev => !prev is a safe way to toggle a bool in react
// instread of directly setting the value we use a function,
// that receives its previous state and returns its opposite
// we wrap it in hand help toggle to follow reacts pattern,
// of having dedicated event handlers
// i still thing we should be able to do this without wrapping inside handler
// create a style element, write some css in its context
// and append it to the document head
// that css is absolutely insane it needs to be formatted and moved somewhere else!
// i assume it is for the invisible slider but it could be for other elements too
// return a cleanup function that removes the style element when the component unmounts

function GameCanvas({isMyTurn = true, socket, playerRole, roomName, manager, onLeaveRoom, creatorUsername = "", joinerUsername = ""}) {
    const [showHelp, setShowHelp] = useState(false);
    const handleHelpToggle = () => {
        setShowHelp(prev => !prev);
    };

    useEffect(() => {
        const style = document.createElement('style');
        style.textContent = `
            <div style={{
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
                Lorem ipsum dolor sit amet, consectetur adipiscing elit.
                Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.
                Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris
                nisi ut aliquip ex ea commodo consequat.
            </div>

            input[type="range"]::-webkit-slider-thumb {
                -webkit-appearance: none;
                appearance: none;
                width: 30px;
                height: 120px;
                border-radius: 0;
                background: transparent;
                cursor: pointer;
                border: none;
                box-shadow: none;
                transition: none;
                margin-top: -54px;
                opacity: 0;
            }

            input[type="range"]::-webkit-slider-thumb:hover {
                background: transparent;
                box-shadow: none;
                transform: none;
                opacity: 0;
            }

            input[type="range"]::-moz-range-thumb {
                width: 30px;
                height: 120px;
                border-radius: 0;
                background: transparent;
                cursor: pointer;
                border: none;
                box-shadow: none;
                margin-top: -54px;
                opacity: 0;
            }

            input[type="range"]::-moz-range-thumb:hover {
                background: transparent;
                box-shadow: none;
                opacity: 0;
            }

            input[type="range"]::-moz-range-track {
                background: transparent;
                height: 12px;
                border-radius: 0;
                border: none;
                outline: none;
                box-shadow: none;
                opacity: 0;
            }

            input[type="range"]::-webkit-slider-runnable-track {
                width: 100%;
                height: 12px;
                background: transparent;
                border-radius: 0;
                border: none;
                outline: none;
                box-shadow: none;
                opacity: 0;
            }

            input[type="range"] {
                background: transparent !important;
                outline: none;
                opacity: 0;
            }

            input[type="range"]::-webkit-slider-track {
                background: transparent !important;
                border: none;
                border-radius: 0;
                height: 12px;
                opacity: 0;
            }

            input[type="range"]:disabled::-webkit-slider-thumb {
                background: transparent;
                cursor: not-allowed;
                opacity: 0;
            }

            input[type="range"]:disabled::-moz-range-thumb {
                background: transparent;
                cursor: not-allowed;
                opacity: 0;
            }

            input[type="range"]:disabled::-webkit-slider-track {
                border: none;
                opacity: 0;
            }

            input[type="range"]:disabled::-moz-range-track {
                border: none;
                opacity: 0;
            }
        `;

        document.head.appendChild(style);
        
        return () => {
            document.head.removeChild(style);
        };

    }, []);

    // null references for canvas and striker
    // what are these references? is it a react thing? why are they usefull?
    // more refs for continued turns and debt,
    // why cant all these just be a simple integer or object?
    // hand, state of hand reference
    // animation, state of animation
    // what is the context of the animation?
    // striker colliding bool reference
    // coins list reference?
    // set of coins pocketed all time
    // list of coins pocketed this turn
    // coins pocketed should be a list that player has,
    // but honestly i guess it's okay for the board to have it,
    // but it should have an intunitive way of accessing it
    // initial coin counts for game end detection? weird?

    const canvasRef = useRef(null);
    const strikerRef = useRef(null);
    const continuedTurnsRef = useRef(0);
    const debtRef = useRef(0);
    const handRef = useRef(new Hand());
    const [handState, setHandState] = useState(handRef.current.getState());
    const animationRef = useRef(new Animation());
    const [animationState, setAnimationState] = useState(animationRef.current.getState());
    const [isStrikerColliding, setIsStrikerColliding] = useState(false);
    const [coins, setCoins] = useState([]);
    const coinsRef = useRef([]);
    const pocketedCoinsRef = useRef(new Set());
    const pocketedThisTurnRef = useRef([]);
    const initialCoinCountsRef = useRef({ white: 0, black: 0, red: 0 });

    // get boards top left x, y then get its center x, y
    // create coin formation, 
    // create coin fotmation returns an array of coin objects,
    // in the form id, color, x, y
    // set the coins refernce to coins list
    // then set the state variable value of coins as the local variable,
    // this is supposedly done because updating the state variable,
    // triggers react to re render the board with the new coin positions
    // this feels messy! shouldnt there be a simpler way of doing this?
    // now a new variable called all coins, used to count coins,
    // for inital coin counts reference... seems unneccessary!

    useEffect(() => {

        // if (!canvasRef.current) return;

        const boardX = (canvasRef.current.width - Draw.BOARD_SIZE) / 2;
        const boardY = (canvasRef.current.height - Draw.BOARD_SIZE) / 2;
        const centerX = boardX + Draw.BOARD_SIZE / 2;
        const centerY = boardY + Draw.BOARD_SIZE / 2;
        const coins = Coin.createCoinFormation(centerX, centerY);

        coinsRef.current = coins;
        setCoins(coins);

        const allCoins = coins;
        initialCoinCountsRef.current = {
            white: allCoins.filter((coin) => coin.color === "white").length,
            black: allCoins.filter((coin) => coin.color === "black").length,
            red: allCoins.filter((coin) => coin.color === "red").length,
        };
        
        // what is a callback?
        // a callback is a function that gets passed as an argument to another function
        // i guess in this case we are passing multiple functions like on state changed etc. 
        // into set call backs
        // and these functions will get executed at a later time. what later time? 
        // how does the code know when the on state change or on striker move actually happens?
        // on state change, i assume if the state of hand ref changes, set the hand state to the new state
        // if striker moves, send a striker move event to the server, with data, what is in data?
        // i beleive its room name, player role, new x, y of striker
        // do the same for collision updates
        // this is too much right? like either server does all the calcualtions and relays to clients,
        // or both clients do the cxaluclations and reconcile the state through the server
        // on animation start, set abunatuoin ref to have its animaintg bool set to true
        // on redraw, have collision state as data
        // ctx is the canvas context, which is used to draw on the canvas
        // set an object called current game state
        // the variables inside these seem pretty random! why have we chosen these?
        // we are supposedly using the current hand ref to avoid react state timing issues, no clue what that means
        // draw board with the context, current game state, player role?, collision state? why the last two?
        // if slider changes, send an event to server with data what is the data??
        // i believe its room name, player role, slider value which is sldier's x, and striker x position 

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
            }
        );

        // set slider boundaries
        // we had previosulsy set callcback for hand refernce
        // now we are setting callpacks for animation refernce
        // what does it even means for animation reference to be set to is animating as a callback
        // the line is giving animation.js a way to tell react when animation starts or stops,
        // while preserving other animation state properties 
        // its a callback function that takes boolean parameters and updates only the is animating property
        // in the animation state while keeping other properties unchanged
        // set hand state updates hand reference's current state to its new state
        // create a game state called here as a callback, it is defined below, again,
        // why have we chosen these particular values as game state?
        // on striker reset, slider is reset to center, hand state is updated

        handRef.current.calculateSliderBoundaries(canvasRef);

        animationRef.current.setCallbacks({

            setIsAnimating: (isAnimating) => setAnimationState((prev) => ({ ...prev, isAnimating })),

            setHandState: (newState) => {
                handRef.current._updateState(newState);
                setHandState(handRef.current.getState());
            },

            createGameState: () => createGameState(),
            
            onStrikerReset: (newX) => {
                const newSliderValue = handRef.current.xToSlider(newX, playerRole);
                handRef.current.sliderValue = newSliderValue;
                setHandState(handRef.current.getState());
            },
        });

    }, []);

    // helper function to create game state object for drawing
    // why have we chosen these values? are all these values used?
    // is it optiam to have these values and not any other?
    // is there a better way to create, store and reference a game state?

    // slider change function takes e as a parameter, 
    // e is an input event object containing, e target, which is the range input element htat trigered the event,
    // and e target value which holds the actual current value of the slider 
    // set a new value variable based on the value of e
    // call handle slider change to set the slider value in the hand reference
    // send hand state to the hand reference state
    // all this s just feels weird

    // call handle mouse down thorugh the hand reference
    // with the is animating bool
    // and other variables

    // call the handle mouse move function through the hand reference

    // call the handle mouse up function from the hand reference

    // get the x y of the touch on the canvas
    // this function is never used, why is that?

    // a reference to store the last known touch position for touch end

    // a function that creates a mouse event out of a touch event 
    // takes data type, touch, canvas
    // type can be mousedown, mousemove, mouseup
    // touch contains coordiantes and screen positions
    // canvas element for calculating correct offset coordiantes?
    // the event props help convert features of a touch event,
    // into the props that we can put in a mouse event
    // creates that mouse event using type and event prop
    // also add missing properties that some browsers expect
    // return the mouse event

    // start of a touch
    // prevent default actions like scrolling, panning, zooming, long press etc.
    // if there is exactly one finger touching the screen
    // get the first touch point from the touch event array
    // update reference that tracks the last known touch position
    // create a mouse event out of the touch
    // pass the mouse event to the existing mouse handler

    // do the same for the touch move,
    // however you end up creating a mouse move type mouse event

    // same for the touch end but you create the mouse event early, 
    // reset the last touch reference,
    // and also trigger a mouse up or flick handler through hand reference

    const createGameState = () => ({
        strikerRef,
        coinsRef,
        isStrikerColliding,
        isFlickerActive: handState.isFlickerActive,
        flick: handState.flick,
        flickMaxLength: handState.flickMaxLength,
    });
    
    const handleSliderChange = (e) => {
        const newValue = parseFloat(e.target.value);
        handRef.current.handleSliderChange(newValue, strikerRef, socket, roomName, playerRole);
        setHandState(handRef.current.getState());
    };

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
    };
    
    const getTouchPosition = (touch, canvas) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        return {
            x: (touch.clientX - rect.left) * scaleX,
            y: (touch.clientY - rect.top) * scaleY
        };
    };

    const lastTouchRef = useRef({ clientX: 0, clientY: 0, screenX: 0, screenY: 0 });

    const createSyntheticMouseEvent = (type, touch, canvas) => {
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

        if (!event.offsetX) {
            const rect = canvas.getBoundingClientRect();
            event.offsetX = eventProps.clientX - rect.left;
            event.offsetY = eventProps.clientY - rect.top;
        }

        return event;
    };

    const handleTouchStart = (e) => {
        e.preventDefault();
        if (e.touches.length === 1) {
            const touch = e.touches[0];
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
        const mouseEvent = createSyntheticMouseEvent('mouseup', null, canvasRef.current);
        handleMouseUp(mouseEvent);
        lastTouchRef.current = {
            clientX: 0,
            clientY: 0,
            screenX: 0,
            screenY: 0
        };

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

    // separate useEffect for initial canvas drawing
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
