// coin handler border collision
// coin state management ?

import Pocket from './Pocket.js';
import Physics from './Physics.js';

export default class Coin {
    constructor({
        id,
        color = 'white',
        radius = 15,
        coinMass = 1,
        x = 0,
        y = 0,
        velocity = { x: 0, y: 0 },
        acceleration = { x: 0, y: 0 },
        restitution = 0.5,
        friction = 0.98
    }) 
    {
        this.id = id;
        this.color = color;
        this.radius = radius;
        this.coinMass = coinMass;
        this.x = x;
        this.y = y;
        this.velocity = { ...velocity };
        this.acceleration = { ...acceleration };
        this.restitution = restitution;
        this.friction = friction;
        
        // pocketing animation state
        this.beingPocketed = false;
        this.pocketTarget = null;
        this.pocketAnimationProgress = 0;
        this.pocketAnimationSpeed = 0.08;
        this.originalRadius = radius;
        this.startPocketPosition = { x: 0, y: 0 };
    }    
    // start pocketing animation
    startPocketing(pocketX, pocketY) {
        Pocket.startPocketing(this, pocketX, pocketY);
    }
    
    // update pocketing animation
    updatePocketAnimation() {
        return Pocket.updatePocketAnimation(this);
    }
    
    // reset pocketing state (for safety, though coins are usually removed)
    resetPocketingState() {
        Pocket.resetPocketingState(this);
    }
    
    draw(ctx) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = 'black';

        if (this.color === 'black') {
            ctx.fillStyle = 'black';
            ctx.fill();
        } else if (this.color === 'red') {
            ctx.fillStyle = 'red';
            ctx.fill();
        }
        
        ctx.stroke();
        ctx.restore();
    }
    
    update(stopThreshold = 0.2) {
        // don't update position if being pocketed, animation handles position
        if (this.beingPocketed) return;
        
        this.velocity.x += this.acceleration.x;
        this.velocity.y += this.acceleration.y;
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;

        // reset acceleration after each update
        this.acceleration.x = 0;
        this.acceleration.y = 0;

        // force stop when velocity is below threshold (similar to Striker)
        if (Math.abs(this.velocity.x) <= stopThreshold && Math.abs(this.velocity.y) <= stopThreshold) {
            this.velocity.x = 0;
            this.velocity.y = 0;
        }
    }    // Keep isMoving as a METHOD, not a property
    isMoving(threshold = 0.2) {
        // if being pocketed, consider it as moving until animation completes
        if (this.beingPocketed) return true;
        return Math.abs(this.velocity.x) > threshold || Math.abs(this.velocity.y) > threshold;
    }    // Handle coin border collision with board boundaries
    handleBorderCollision(boardX, boardY, boardSize) {
        return Physics.handleBorderCollision(this, boardX, boardY, boardSize);
    }

    // Static method to create coin formation
    static createCoinFormation(centerX, centerY) {
        // Configuration for centered coin formation
        const coinFormation = {
            centerX: centerX,
            centerY: centerY,
            rings: [
                { count: 6, radius: 32 }, // Inner ring - 6 coins
                { count: 12, radius: 62 }, // Outer ring - 12 coins
            ],
        };

        const coins = [];
        let coinId = 1;
        let colorIndex = 1; // Start with 1 to alternate colors properly

        // Create rings of coins
        coinFormation.rings.forEach((ring) => {
            for (let i = 0; i < ring.count; i++) {
                const angle = i * ((2 * Math.PI) / ring.count);
                const x = coinFormation.centerX + ring.radius * Math.cos(angle);
                const y = coinFormation.centerY + ring.radius * Math.sin(angle);

                // Alternate between white and black
                const color = colorIndex % 2 ? "white" : "black";

                coins.push(
                    new Coin({
                        id: coinId++,
                        color: color,
                        x: x,
                        y: y,
                    }),
                );

                colorIndex++;
            }
        });

        // Add queen at exact center
        const queenCoin = new Coin({
            id: coinId++,
            color: "red",
            x: coinFormation.centerX,
            y: coinFormation.centerY,
        });
        coins.push(queenCoin);

        return coins;
    }    // Static method to check if an object is near any pocket
    static isNearAnyPocket(x, y, pockets, threshold = 60) {
        return Pocket.isNearAnyPocket(x, y, pockets, threshold);
    }

    // Static method to create a single coin at specified position
    static createCoin({ id, color, x, y }) {
        return new Coin({ id, color, x, y });
    }

    // Static method to create a coin at center position
    static createCoinAtCenter(id, color, centerX, centerY) {
        return new Coin({ id, color, x: centerX, y: centerY });
    }
}
