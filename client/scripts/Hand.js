import Physics from "./Physics.js";

/**
 * Hand interaction manager for carrom game
 * Handles all mouse events, striker placement, and flicking mechanics
 */
export class Hand {
    // Flick constants - reduced power for finer linear scaling
    static FLICK_MAX_LENGTH = 100;
    static FLICK_POWER = 0.4;  // Reduced base power for finer control

    constructor() {
        // State management
        this.isPlacing = false;
        this.canPlace = true;
        this.isFlickerActive = false;
        this.flick = {
            active: false,
            startX: 0,
            startY: 0,
            endX: 0,
            endY: 0,
        };
        this.flickMaxLength = Hand.FLICK_MAX_LENGTH;

        // Callbacks that will be set by the parent component
        this.onStateChange = null;
        this.onStrikerMove = null;
        this.onCollisionUpdate = null;
        this.onAnimationStart = null;
        this.onRedraw = null;
    }

    /**
     * Set callback functions for communication with parent component
     */
    setCallbacks({
        onStateChange,
        onStrikerMove,
        onCollisionUpdate,
        onAnimationStart,
        onRedraw,
    }) {
        this.onStateChange = onStateChange;
        this.onStrikerMove = onStrikerMove;
        this.onCollisionUpdate = onCollisionUpdate;
        this.onAnimationStart = onAnimationStart;
        this.onRedraw = onRedraw;
    }

    /**
     * Update internal state and notify parent
     */
    _updateState(updates) {
        Object.assign(this, updates);        if (this.onStateChange) {
            this.onStateChange({
                isPlacing: this.isPlacing,
                canPlace: this.canPlace,
                isFlickerActive: this.isFlickerActive,
                flick: { ...this.flick },
                flickMaxLength: this.flickMaxLength,
            });
        }
    }

    /**
     * Handle flick button click
     */
    handleFlick(isStrikerColliding) {
        // prevent flicking if striker is colliding with coins
        if (isStrikerColliding) {
            return;
        }

        this._updateState({
            canPlace: false,
            isFlickerActive: true,
        });

        setTimeout(() => {
            this._updateState({ canPlace: true });
        }, 0);
    }

    /**
     * Handle place button click
     */
    handlePlace(strikerRef, socket, roomName, playerRole) {
        this._updateState({
            canPlace: true,
            isPlacing: false,
            isFlickerActive: false,
            flick: { active: false, startX: 0, startY: 0, endX: 0, endY: 0 },
        });

        if (strikerRef.current) {
            strikerRef.current.isPlacing = false;
        }

        // emit collision state reset to other players
        if (socket && roomName) {
            socket.emit("strikerCollisionUpdate", {
                roomName,
                playerRole,
                isColliding: false,
            });
        }

        // Notify parent about collision update
        if (this.onCollisionUpdate) {
            this.onCollisionUpdate(false);
        }
    }

    /**
     * Handle flick mouse down event
     */
    handleFlickMouseDown(
        e,
        { isMyTurn, strikerRef, isStrikerColliding, canvasRef, playerRole },
    ) {
        if (!isMyTurn || !strikerRef.current || !this.isFlickerActive) return;

        // prevent flicking if striker is colliding with coins
        if (isStrikerColliding) {
            return;
        }

        const rect = canvasRef.current.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        if (playerRole === "joiner") {
            x = canvasRef.current.width - x;
            y = canvasRef.current.height - y;
        }

        this._updateState({
            flick: {
                active: true,
                startX: strikerRef.current.x,
                startY: strikerRef.current.y,
                endX: x,
                endY: y,
            },
        });
    }

    /**
     * Handle flick mouse move event
     */    handleFlickMouseMove(e, { isMyTurn, strikerRef, canvasRef, playerRole }) {
        if (
            !isMyTurn ||
            !strikerRef.current ||
            !this.isFlickerActive ||
            !this.flick.active
        ) {
            return;
        }

        const rect = canvasRef.current.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        if (playerRole === "joiner") {
            x = canvasRef.current.width - x;
            y = canvasRef.current.height - y;
        }

        // Calculate the distance from start to current mouse position
        const dx = x - this.flick.startX;
        const dy = y - this.flick.startY;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Cap the flick line at maximum length
        if (distance > this.flickMaxLength) {
            // Calculate the direction vector
            const directionX = dx / distance;
            const directionY = dy / distance;
            
            // Set the end point at maximum distance
            x = this.flick.startX + directionX * this.flickMaxLength;
            y = this.flick.startY + directionY * this.flickMaxLength;
        }

        this._updateState({
            flick: { ...this.flick, endX: x, endY: y },
        });
    }

    /**
     * Handle flick mouse up event
     */
    handleFlickMouseUp(e, { isMyTurn, strikerRef, isStrikerColliding }) {
        if (
            !isMyTurn ||
            !strikerRef.current ||
            !this.isFlickerActive ||
            !this.flick.active
        ) {
            return;
        }

        // prevent execution if striker is colliding with coins
        if (isStrikerColliding) {
            this._updateState({
                flick: {
                    active: false,
                    startX: 0,
                    startY: 0,
                    endX: 0,
                    endY: 0,
                },
            });
            return;
        }        // calculate velocity (opposite direction of pull)
        let dx = this.flick.startX - this.flick.endX;
        let dy = this.flick.startY - this.flick.endY;
        const dist = Math.hypot(dx, dy);        // Calculate proportional power based on distance pulled
        // Linear scaling with finest possible precision
        // Every single pixel of movement creates proportional power increase
        const distanceRatio = Math.min(dist / this.flickMaxLength, 1.0);
        
        // Pure linear scaling: power = ratio (1:1 relationship)
        // This gives the finest possible control:
        // - 1 pixel = 0.67% power (ultra-fine)
        // - 10 pixels = 6.7% power (very fine)  
        // - 25 pixels = 16.7% power (fine)
        // - 50 pixels = 33.3% power (moderate)
        // - 75 pixels = 50% power (medium)
        // - 100 pixels = 66.7% power (strong)
        // - 150 pixels = 100% power (maximum)
        const powerRatio = distanceRatio;
        const effectivePower = Hand.FLICK_POWER * powerRatio;

        // Normalize direction vector
        if (dist > 0) {
            dx = (dx / dist) * dist; // Keep original magnitude for direction
            dy = (dy / dist) * dist;
        }

        strikerRef.current.velocity.x = dx * effectivePower;
        strikerRef.current.velocity.y = dy * effectivePower;
        strikerRef.current.isStrikerMoving = true;

        this._updateState({
            flick: { active: false, startX: 0, startY: 0, endX: 0, endY: 0 },
        });

        // Notify parent to start animation
        if (this.onAnimationStart) {
            this.onAnimationStart();
        }
    }

    /**
     * Handle mouse down event (unified handler)
     */
    handleMouseDown(
        e,
        {
            isAnimating,
            isMyTurn,
            strikerRef,
            canvasRef,
            playerRole,
            isStrikerColliding,
        },
    ) {
        // block all input when animation is active
        if (isAnimating) return;

        if (this.isFlickerActive) {
            this.handleFlickMouseDown(e, {
                isMyTurn,
                strikerRef,
                isStrikerColliding,
                canvasRef,
                playerRole,
            });
        } else if (this.canPlace) {
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
                this._updateState({ isPlacing: true });
                strikerRef.current.isPlacing = true;
            }
        }
    }

    /**
     * Handle mouse move event (unified handler)
     */
    handleMouseMove(
        e,
        {
            isAnimating,
            isMyTurn,
            strikerRef,
            canvasRef,
            playerRole,
            coinsRef,
            socket,
            roomName,
        },
    ) {
        // block all input when animation is active
        if (isAnimating) return;

        if (this.isFlickerActive) {
            this.handleFlickMouseMove(e, {
                isMyTurn,
                strikerRef,
                canvasRef,
                playerRole,
            });
        } else if (
            this.isPlacing &&
            this.canPlace &&
            isMyTurn &&
            strikerRef.current
        ) {
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

            // check for collision in real-time during drag
            const isCurrentlyColliding = Physics.checkStrikerCoinCollision(
                strikerRef.current,
                coinsRef.current,
            );

            // Notify parent about collision state change
            if (this.onCollisionUpdate) {
                this.onCollisionUpdate(isCurrentlyColliding);
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
            if (socket && roomName && this.onStrikerMove) {
                this.onStrikerMove({
                    roomName,
                    position: {
                        x: strikerRef.current.x,
                        y: strikerRef.current.y,
                    },
                });
            }

            // Request redraw with real-time collision state
            if (this.onRedraw) {
                this.onRedraw(isCurrentlyColliding);
            }
        }
    }

    /**
     * Handle mouse up event (unified handler)
     */
    handleMouseUp(
        e,
        {
            isAnimating,
            isMyTurn,
            strikerRef,
            isStrikerColliding,
            coinsRef,
            socket,
            roomName,
            playerRole,
        },
    ) {
        // block all input when animation is active
        if (isAnimating) return;

        if (this.isFlickerActive) {
            this.handleFlickMouseUp(e, {
                isMyTurn,
                strikerRef,
                isStrikerColliding,
            });
        } else if (this.isPlacing) {
            this._updateState({ isPlacing: false });

            if (strikerRef.current) {
                strikerRef.current.isPlacing = false;
            }

            // emit final collision state when placement ends
            if (socket && roomName) {
                const finalCollisionState = Physics.checkStrikerCoinCollision(
                    strikerRef.current,
                    coinsRef.current,
                );

                socket.emit("strikerCollisionUpdate", {
                    roomName,
                    playerRole,
                    isColliding: finalCollisionState,
                });
            }
        }
    }

    /**
     * Get current state for external access
     */    getState() {
        return {
            isPlacing: this.isPlacing,
            canPlace: this.canPlace,
            isFlickerActive: this.isFlickerActive,
            flick: { ...this.flick },
            flickMaxLength: this.flickMaxLength,
        };
    }

    /**
     * Reset state (useful for game resets)
     */    reset() {
        this.flickMaxLength = Hand.FLICK_MAX_LENGTH;
        this._updateState({
            isPlacing: false,
            canPlace: true,
            isFlickerActive: false,
            flick: { active: false, startX: 0, startY: 0, endX: 0, endY: 0 },
        });
    }
}

export default Hand;
