/**
 * Physics utility functions for collision detection and resolution
 */
export class Physics {
    // Continuous Collision Detection configuration
    static CCD_CONFIG = {
        SPEED_THRESHOLD: 2,      // Speed above which CCD is used
        MAX_SUB_STEPS: 4,        // Maximum number of sub-steps per frame
        SPEED_DIVISOR: 5,        // Divide speed by this to get sub-steps
        MIN_REMAINING_TIME: 0.01 // Minimum time to continue after collision
    };

    /**
     * Resolves elastic collision between two circular objects
     * @param {Object} a - First circular object (coin or striker)
     * @param {Object} b - Second circular object (coin or striker)
     */
    static resolveCircleCollision(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy);

        // Avoid division by zero
        if (dist === 0) return;

        const overlap = a.radius + b.radius - dist;

        // Only resolve if objects are actually overlapping
        if (overlap > 0) {
            // Normalized collision direction
            const nx = dx / dist;
            const ny = dy / dist;

            // Calculate masses (striker has strikerMass, coins have coinMass)
            const totalMass = a.strikerMass
                ? a.strikerMass + b.coinMass
                : a.coinMass + b.coinMass;
            const aMass = a.strikerMass || a.coinMass;
            const bMass = b.coinMass;

            // Separate overlapping objects based on mass ratio
            a.x -= nx * (overlap * (bMass / totalMass));
            a.y -= ny * (overlap * (bMass / totalMass));
            b.x += nx * (overlap * (aMass / totalMass));
            b.y += ny * (overlap * (aMass / totalMass));

            // Calculate relative velocity
            const dvx = b.velocity.x - a.velocity.x;
            const dvy = b.velocity.y - a.velocity.y;
            const vn = dvx * nx + dvy * ny;

            // Only resolve if objects are moving towards each other
            if (vn < 0) {
                // Use minimum restitution of both objects
                const restitution = Math.min(
                    a.restitution, // || 1,
                    b.restitution  // || 1,
                );

                // Calculate impulse
                const impulse =
                    (-(1 + restitution) * vn) / (1 / aMass + 1 / bMass);
                const impulseX = impulse * nx;
                const impulseY = impulse * ny;

                // Apply impulse to velocities
                a.velocity.x -= impulseX / aMass;
                a.velocity.y -= impulseY / aMass;
                b.velocity.x += impulseX / bMass;
                b.velocity.y += impulseY / bMass;
            }
        }
    }

    /**
     * Check if two circular objects are colliding
     * @param {Object} a - First circular object
     * @param {Object} b - Second circular object
     * @returns {boolean} True if objects are colliding
     */
    static areCirclesColliding(a, b) {
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy);
        return distance < a.radius + b.radius;
    }

    /**
     * Calculate distance between two objects
     * @param {Object} a - First object with x, y properties
     * @param {Object} b - Second object with x, y properties
     * @returns {number} Distance between objects
     */
    static getDistance(a, b) {
        return Math.hypot(b.x - a.x, b.y - a.y);
    }

    /**
     * Handle border collision for circular objects with board boundaries
     * @param {Object} obj - The circular object (coin or striker)
     * @param {number} boardX - Board X position
     * @param {number} boardY - Board Y position
     * @param {number} boardSize - Board size
     * @returns {boolean} True if collision occurred
     */
    static handleBorderCollision(obj, boardX, boardY, boardSize) {
        let collided = false;
        const minX = boardX + obj.radius;
        const maxX = boardX + boardSize - obj.radius;
        const minY = boardY + obj.radius;
        const maxY = boardY + boardSize - obj.radius;

        if (obj.x < minX) {
            obj.x = minX;
            obj.velocity.x = Math.abs(obj.velocity.x) * obj.restitution;
            collided = true;
        } else if (obj.x > maxX) {
            obj.x = maxX;
            obj.velocity.x = -Math.abs(obj.velocity.x) * obj.restitution;
            collided = true;
        }

        if (obj.y < minY) {
            obj.y = minY;
            obj.velocity.y = Math.abs(obj.velocity.y) * obj.restitution;
            collided = true;
        } else if (obj.y > maxY) {
            obj.y = maxY;
            obj.velocity.y = -Math.abs(obj.velocity.y) * obj.restitution;
            collided = true;
        }

        return collided;
    }    /**
     * Check if striker is colliding with any coins during placement
     * @param {Object} striker - The striker object
     * @param {Array} coins - Array of coin objects
     * @returns {boolean} True if striker is colliding with any coin
     */
    static checkStrikerCoinCollision(striker, coins) {
        if (!striker) return false;

        for (const coin of coins) {
            if (Physics.areCirclesColliding(striker, coin)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Performs continuous collision detection between two moving circles
     * @param {Object} a - First circular object with position and velocity
     * @param {Object} b - Second circular object with position and velocity
     * @returns {number|null} Time of collision (0-1) or null if no collision
     */
    static continuousCircleCollision(a, b) {
        // Calculate relative position and velocity
        const relPosX = a.x - b.x;
        const relPosY = a.y - b.y;
        const relVelX = a.velocity.x - b.velocity.x;
        const relVelY = a.velocity.y - b.velocity.y;
        
        // Distance at collision
        const collisionDist = a.radius + b.radius;
        
        // Quadratic equation coefficients: at² + bt + c = 0
        const a_coeff = relVelX * relVelX + relVelY * relVelY;
        const b_coeff = 2 * (relPosX * relVelX + relPosY * relVelY);
        const c_coeff = relPosX * relPosX + relPosY * relPosY - collisionDist * collisionDist;
        
        // If no relative velocity, no collision possible
        if (Math.abs(a_coeff) < 1e-10) return null;
        
        const discriminant = b_coeff * b_coeff - 4 * a_coeff * c_coeff;
        
        // No collision if discriminant is negative
        if (discriminant < 0) return null;
        
        const sqrtDiscriminant = Math.sqrt(discriminant);
        const t1 = (-b_coeff - sqrtDiscriminant) / (2 * a_coeff);
        const t2 = (-b_coeff + sqrtDiscriminant) / (2 * a_coeff);
        
        // We want the earliest collision time within this frame (0 <= t <= 1)
        const t = Math.min(t1, t2);
        
        if (t >= 0 && t <= 1) {
            return t;
        }
        
        return null;
    }    /**
     * Updates object position with sub-stepping to prevent tunneling
     * @param {Object} obj - Object to update (striker or coin)
     * @param {Array} otherObjects - Other objects to check collisions against
     * @param {number} boardX - Board X position
     * @param {number} boardY - Board Y position  
     * @param {number} boardSize - Board size
     * @param {number} maxSubSteps - Maximum number of sub-steps
     */
    static updateWithCCD(obj, otherObjects = [], boardX, boardY, boardSize, maxSubSteps = Physics.CCD_CONFIG.MAX_SUB_STEPS) {
        const originalVelX = obj.velocity.x;
        const originalVelY = obj.velocity.y;
        
        // Calculate speed to determine if CCD is needed
        const speed = Math.hypot(originalVelX, originalVelY);
        
        // Use CCD only for fast-moving objects
        if (speed < Physics.CCD_CONFIG.SPEED_THRESHOLD) {
            // Simple update for slow objects
            obj.x += originalVelX;
            obj.y += originalVelY;
            Physics.handleBorderCollision(obj, boardX, boardY, boardSize);
            return;
        }
        
        // Determine number of sub-steps based on speed
        const subSteps = Math.min(Math.ceil(speed / Physics.CCD_CONFIG.SPEED_DIVISOR), maxSubSteps);
        const stepSize = 1.0 / subSteps;
        
        for (let step = 0; step < subSteps; step++) {
            // Move by fraction of velocity
            const stepVelX = originalVelX * stepSize;
            const stepVelY = originalVelY * stepSize;
            
            // Store current position
            const startX = obj.x;
            const startY = obj.y;
            
            // Find earliest collision time within this sub-step
            let earliestCollisionTime = 1.0;
            let collisionObject = null;
            
            // Check collision with other objects
            for (const other of otherObjects) {
                if (other === obj) continue;
                
                // Temporarily set velocities for CCD calculation
                const tempVelX = obj.velocity.x;
                const tempVelY = obj.velocity.y;
                obj.velocity.x = stepVelX;
                obj.velocity.y = stepVelY;
                
                const collisionTime = Physics.continuousCircleCollision(obj, other);
                
                // Restore velocity
                obj.velocity.x = tempVelX;
                obj.velocity.y = tempVelY;
                
                if (collisionTime !== null && collisionTime < earliestCollisionTime) {
                    earliestCollisionTime = collisionTime;
                    collisionObject = other;
                }
            }
            
            // Move to collision point
            obj.x = startX + stepVelX * earliestCollisionTime;
            obj.y = startY + stepVelY * earliestCollisionTime;
            
            // Check border collision
            const borderCollided = Physics.handleBorderCollision(obj, boardX, boardY, boardSize);
            
            // If there was a collision, resolve it
            if (collisionObject && earliestCollisionTime < 1.0) {
                Physics.resolveCircleCollision(obj, collisionObject);
                // Continue with remaining time if needed
                const remainingTime = 1.0 - earliestCollisionTime;
                if (remainingTime > Physics.CCD_CONFIG.MIN_REMAINING_TIME) {
                    obj.x += obj.velocity.x * stepSize * remainingTime;
                    obj.y += obj.velocity.y * stepSize * remainingTime;
                }
            } else if (!borderCollided) {
                // Complete the movement if no collision
                obj.x = startX + stepVelX;
                obj.y = startY + stepVelY;
            }
        }
    }
}

export default Physics;
