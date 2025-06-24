import Physics from "./Physics.js";
import { Draw } from "./Draw.js";

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

        // Slider state management
        this.sliderValue = 50; // 0-100 percentage
        this.sliderMin = 0;
        this.sliderMax = 0;
        this.sliderSensitivity = 0.2;

        // Callbacks that will be set by the parent component
        this.onStateChange = null;
        this.onStrikerMove = null;
        this.onCollisionUpdate = null;
        this.onAnimationStart = null;
        this.onRedraw = null;
        this.onSliderChange = null;
    }    /**
     * Set callback functions for communication with parent component
     */
    setCallbacks({
        onStateChange,
        onStrikerMove,
        onCollisionUpdate,
        onAnimationStart,
        onRedraw,
        onSliderChange,
    }) {
        this.onStateChange = onStateChange;
        this.onStrikerMove = onStrikerMove;
        this.onCollisionUpdate = onCollisionUpdate;
        this.onAnimationStart = onAnimationStart;
        this.onRedraw = onRedraw;
        this.onSliderChange = onSliderChange;
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
    }    /**
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
        if (isAnimating || !isMyTurn || !strikerRef.current) return;

        const rect = canvasRef.current.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        if (playerRole === "joiner") {
            x = canvasRef.current.width - x;
            y = canvasRef.current.height - y;
        }

        // Check if striker is in idle state (not moving)
        if (!strikerRef.current.isStrikerMoving) {
            // Start flick interaction - click anywhere on board
            this._updateState({
                isFlickerActive: true,
                flick: {
                    ...this.flick,
                    active: true,
                    startX: strikerRef.current.x,
                    startY: strikerRef.current.y,
                    endX: x,
                    endY: y,
                },            });

            // Redraw to show flick line
            if (this.onRedraw) {
                this.onRedraw();
            }
        }
    }    /**
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
        if (isAnimating || !isMyTurn) return;

        if (this.isFlickerActive && strikerRef.current) {
            const rect = canvasRef.current.getBoundingClientRect();
            let x = e.clientX - rect.left;
            let y = e.clientY - rect.top;

            if (playerRole === "joiner") {
                x = canvasRef.current.width - x;
                y = canvasRef.current.height - y;
            }

            // Update flick end position
            const dx = x - strikerRef.current.x;
            const dy = y - strikerRef.current.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Cap the flick line at maximum length
            if (distance > this.flickMaxLength) {
                const directionX = dx / distance;
                const directionY = dy / distance;
                x = strikerRef.current.x + directionX * this.flickMaxLength;
                y = strikerRef.current.y + directionY * this.flickMaxLength;
            }

            this._updateState({
                flick: { ...this.flick, endX: x, endY: y },            });

            // Redraw to show updated flick line
            if (this.onRedraw) {
                this.onRedraw();
            }
        }
    }    /**
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
        if (isAnimating || !isMyTurn) return;

        if (this.isFlickerActive && strikerRef.current) {
            // Calculate flick power and direction
            const dx = this.flick.endX - this.flick.startX;
            const dy = this.flick.endY - this.flick.startY;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 5) { // Minimum distance to register flick
                // Calculate power (normalize distance to 0-1 range)
                const normalizedDistance = Math.min(distance / this.flickMaxLength, 1);
                const power = normalizedDistance * Hand.FLICK_POWER;

                // Apply velocity opposite to drag direction
                const velocityX = -(dx / distance) * power * 100;
                const velocityY = -(dy / distance) * power * 100;

                strikerRef.current.velocity.x = velocityX;
                strikerRef.current.velocity.y = velocityY;
                strikerRef.current.isStrikerMoving = true;

                // Start animation
                if (this.onAnimationStart) {
                    this.onAnimationStart();
                }
            }

            // Reset flick state
            this._updateState({
                isFlickerActive: false,
                flick: {
                    ...this.flick,
                    active: false,
                },
            });

            // Redraw to clear flick line
            if (this.onRedraw) {
                this.onRedraw();
            }
        }
    }    /**
     * Calculate slider boundaries based on legal striker movement area
     * Restricts slider to the base width (legal striker X axis) instead of full board
     */
    calculateSliderBoundaries(canvasRef, strikerRadius = 21) {
        if (!canvasRef.current) return;

        const ctx = canvasRef.current.getContext("2d");
        const boardX = (ctx.canvas.width - Draw.BOARD_SIZE) / 2;
        
        // Calculate the legal striker area boundaries (base width, not full board)
        const baseX = boardX + (Draw.BOARD_SIZE - Draw.BASE_WIDTH) / 2;
        
        this.sliderMin = baseX + strikerRadius;
        this.sliderMax = baseX + Draw.BASE_WIDTH - strikerRadius;
    }/**
     * Convert slider percentage to X coordinate
     */
    sliderToX(percentage, playerRole = "creator") {
        if (this.sliderMax === 0) return 0;
        
        // Invert percentage for joiner player due to canvas rotation
        const adjustedPercentage = playerRole === "joiner" ? (100 - percentage) : percentage;
        
        return this.sliderMin + (this.sliderMax - this.sliderMin) * (adjustedPercentage / 100);
    }

    /**
     * Convert X coordinate to slider percentage
     */
    xToSlider(x, playerRole = "creator") {
        if (this.sliderMax === 0) return 50;
        
        const percentage = Math.max(0, Math.min(100, ((x - this.sliderMin) / (this.sliderMax - this.sliderMin)) * 100));
        
        // Invert percentage for joiner player due to canvas rotation
        return playerRole === "joiner" ? (100 - percentage) : percentage;
    }    /**
     * Handle slider value change
     */
    handleSliderChange(newValue, strikerRef, socket, roomName, playerRole) {
        this.sliderValue = Math.max(0, Math.min(100, newValue));
        
        if (strikerRef.current) {
            const newX = this.sliderToX(this.sliderValue, playerRole);
            strikerRef.current.updatePosition(newX, strikerRef.current.y);
              // Emit slider position to other player
            // Always send the actual slider value, let the receiver handle coordinate conversion
            if (socket && roomName && this.onSliderChange) {
                this.onSliderChange({
                    sliderValue: this.sliderValue,
                    strikerX: newX,
                    playerRole
                });
            }
        }
    }

    /**
     * Handle delta-based slider movement for touch/mouse
     */
    handleSliderDelta(deltaX, strikerRef, socket, roomName, playerRole) {
        const deltaValue = deltaX * this.sliderSensitivity;
        const newValue = this.sliderValue + deltaValue;
        this.handleSliderChange(newValue, strikerRef, socket, roomName, playerRole);
    }    /**
     * Get current state for external access
     */
    getState() {
        return {
            isPlacing: this.isPlacing,
            canPlace: this.canPlace,
            isFlickerActive: this.isFlickerActive,
            flick: { ...this.flick },
            flickMaxLength: this.flickMaxLength,
            sliderValue: this.sliderValue,
        };
    }

    /**
     * Reset state (useful for game resets)
     */
    reset() {
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
