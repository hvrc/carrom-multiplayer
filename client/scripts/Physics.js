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
}

export default Physics;
