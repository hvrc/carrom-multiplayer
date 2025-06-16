import Pocket from './Pocket.js';

export default class Striker3D {
    constructor(x, y) {
        this.radius = 21;
        this.strikerMass = 1;
        this.x = x;
        this.y = y;
        this.velocity = { x: 0, y: 0 };
        this.acceleration = { x: 0, y: 0 };
        this.isPlacing = false;
        this.isStrikerMoving = false;
        this.restitution = 0.5;
        this.friction = 0.98
        
        // pocketing animation state
        this.beingPocketed = false;
        this.pocketTarget = null;
        this.pocketAnimationProgress = 0;
        this.pocketAnimationSpeed = 0.08;
        this.originalRadius = 21;
        this.startPocketPosition = { x: 0, y: 0 };
    }

    draw(ctx, strokeStyle = "black", lineWidth = 1) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
        ctx.restore();
    }

    isPointInside(x, y) {
        const distance = Math.sqrt(
            Math.pow(this.x - x, 2) + Math.pow(this.y - y, 2)
        );
        return distance <= this.radius;
    }
    
    updatePosition(x, y) {
        this.x = x;
        this.y = y;
    }

    handleBorderCollision(boardX, boardY, boardSize) {
        const minX = boardX + this.radius;
        const maxX = boardX + boardSize - this.radius;
        const minY = boardY + this.radius;
        const maxY = boardY + boardSize - this.radius;
        let collided = false;

        if (this.x < minX) {
            this.x = minX;
            this.velocity.x = Math.abs(this.velocity.x) * this.restitution;
            collided = true;
        } else if (this.x > maxX) {
            this.x = maxX;
            this.velocity.x = -Math.abs(this.velocity.x) * this.restitution;
            collided = true;
        }

        if (this.y < minY) {
            this.y = minY;
            this.velocity.y = Math.abs(this.velocity.y) * this.restitution;
            collided = true;
        } else if (this.y > maxY) {
            this.y = maxY;
            this.velocity.y = -Math.abs(this.velocity.y) * this.restitution;
            collided = true;
        }
        return collided;
    }
    
    isMoving(threshold = 0.2) {
        // if being pocketed, consider it as moving until animation completes
        if (this.beingPocketed) return true;
        return Math.abs(this.velocity.x) > threshold || Math.abs(this.velocity.y) > threshold;
    }

    update(friction = this.friction, stopThreshold = 0.2, boardX, boardY, boardSize) {
        if (this.isPlacing) return;
        this.x += this.velocity.x;
        this.y += this.velocity.y;

        if (boardX !== undefined && boardY !== undefined && boardSize !== undefined) {
            this.handleBorderCollision(boardX, boardY, boardSize);
        }
        
        this.velocity.x *= friction;
        this.velocity.y *= friction;

        if (Math.abs(this.velocity.x) <= stopThreshold && Math.abs(this.velocity.y) <= stopThreshold) {
            this.velocity.x = 0;
            this.velocity.y = 0;
            this.isStrikerMoving = false;
        } else {
            this.isStrikerMoving = true;
        }
    }    
    // start pocketing animation
    startPocketing(pocketX, pocketY) {
        Pocket.startPocketing(this, pocketX, pocketY);
    }
    
    // update pocketing animation
    updatePocketAnimation() {
        return Pocket.updatePocketAnimation(this);
    }
    
    // reset pocketing state (for when striker is reset to base)
    resetPocketingState() {
        Pocket.resetPocketingState(this);
    }
}
