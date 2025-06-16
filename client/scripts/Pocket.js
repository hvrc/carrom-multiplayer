import Physics from './Physics.js';
import Coin from './Coin.js';

/**
 * Pocket utility functions for carrom game
 */
export class Pocket {
    // Pocket dimensions
    static POCKET_DIAMETER = 45;
    
    /**
     * Check if an object is near any pocket
     * @param {number} x - X coordinate of the object
     * @param {number} y - Y Coordinate of the object
     * @param {Array} pockets - Array of pocket objects with x, y coordinates
     * @param {number} threshold - Distance threshold (default: 60)
     * @returns {boolean} - True if object is near any pocket
     */
    static isNearAnyPocket(x, y, pockets, threshold = 60) {
        return pockets.some((pocket) => {
            const dist = Physics.getDistance({ x, y }, pocket);
            return dist < threshold;
        });
    }

    /**
     * Start pocketing animation for an object
     * @param {Object} obj - The object to pocket (coin or striker)
     * @param {number} pocketX - Target pocket X coordinate
     * @param {number} pocketY - Target pocket Y coordinate
     */
    static startPocketing(obj, pocketX, pocketY) {
        obj.beingPocketed = true;
        obj.pocketTarget = { x: pocketX, y: pocketY };
        obj.pocketAnimationProgress = 0;
        obj.startPocketPosition = { x: obj.x, y: obj.y };
        
        // stop all velocity when pocketing starts
        obj.velocity = { x: 0, y: 0 };
        obj.acceleration = { x: 0, y: 0 };
        
        // stop striker movement if it's a striker
        if (obj.isStrikerMoving !== undefined) {
            obj.isStrikerMoving = false;
        }
    }

    /**
     * Update pocketing animation for an object
     * @param {Object} obj - The object being pocketed
     * @returns {boolean} - True if animation is complete
     */
    static updatePocketAnimation(obj) {
        if (!obj.beingPocketed || !obj.pocketTarget) return false;
        
        obj.pocketAnimationProgress += obj.pocketAnimationSpeed;
        
        if (obj.pocketAnimationProgress >= 1) {
            obj.pocketAnimationProgress = 1;
        }
        
        // easing function for smooth animation
        const easeProgress = obj.pocketAnimationProgress * obj.pocketAnimationProgress;
        
        // interpolate position
        obj.x = obj.startPocketPosition.x + (obj.pocketTarget.x - obj.startPocketPosition.x) * easeProgress;
        obj.y = obj.startPocketPosition.y + (obj.pocketTarget.y - obj.startPocketPosition.y) * easeProgress;
        
        // shrink radius as it gets closer to pocket
        obj.radius = obj.originalRadius * (1 - easeProgress * 0.5);
        
        // animation complete
        return obj.pocketAnimationProgress >= 1;
    }

    /**
     * Add a coin at the center of the board as penalty
     * @param {number} id - Coin ID
     * @param {string} color - Coin color
     * @param {Object} canvasRef - Canvas reference
     * @param {number} boardSize - Board size
     * @param {Object} coinsRef - Coins reference
     * @param {Function} setCoins - Set coins function
     * @param {Object} pocketedCoinsRef - Pocketed coins reference
     * @returns {Object} The new coin created
     */
    static addCoinAtCenter(id, color, canvasRef, boardSize, coinsRef, setCoins, pocketedCoinsRef) {
        if (!canvasRef.current) return null;
        
        const boardX = (canvasRef.current.width - boardSize) / 2;
        const boardY = (canvasRef.current.height - boardSize) / 2;
        const centerX = boardX + boardSize / 2;
        const centerY = boardY + boardSize / 2;
        
        const newCoin = Coin.createCoinAtCenter(id, color, centerX, centerY);
        coinsRef.current = [...coinsRef.current, newCoin];
        setCoins([...coinsRef.current]);
        pocketedCoinsRef.current.delete(id);
        
        return newCoin;
    }

    /**
     * Remove a coin by id
     * @param {number} id - Coin ID to remove
     * @param {Object} coinsRef - Coins reference
     * @param {Function} setCoins - Set coins function
     */
    static removeCoin(id, coinsRef, setCoins) {
        coinsRef.current = coinsRef.current.filter((coin) => coin.id !== id);
        setCoins([...coinsRef.current]);
    }

    /**
     * Reset pocketing state for an object
     * @param {Object} obj - The object to reset
     */
    static resetPocketingState(obj) {
        obj.beingPocketed = false;
        obj.pocketTarget = null;
        obj.pocketAnimationProgress = 0;
        obj.radius = obj.originalRadius;
    }
}

export default Pocket;
