/**
 * Physics utility functions for collision detection and resolution
 */
export class Physics {
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
                    a.restitution || 1,
                    b.restitution || 1,
                );
                
                // Calculate impulse
                const impulse = (-(1 + restitution) * vn) / (1 / aMass + 1 / bMass);
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
        return distance < (a.radius + b.radius);
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
    }

    /**
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
}

export default Physics;
