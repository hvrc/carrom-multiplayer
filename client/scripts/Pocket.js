import Physics from './Physics.js';

/**
 * Pocket utility functions for carrom game
 */
export class Pocket {
    /**
     * Check if an object is near any pocket
     * @param {number} x - X coordinate of the object
     * @param {number} y - Y coordinate of the object
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
