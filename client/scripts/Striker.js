export default class Striker3D {    constructor(x, y) {
        this.radius = 21;
        this.strikerMass = 15;
        this.x = x;
        this.y = y;
        this.velocity = { x: 0, y: 0 };
        this.acceleration = { x: 0, y: 0 };
        this.isPlacing = false;
        this.isStrikerMoving = false;
        this.restitution = 0.8;
        this.friction = 0.98;
        
        // pocketing animation state
        this.beingPocketed = false;
        this.pocketTarget = null;
        this.pocketAnimationProgress = 0;
        this.pocketAnimationSpeed = 0.08;
        this.originalRadius = 21;
        this.startPocketPosition = { x: 0, y: 0 };
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.stroke();
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
    }    isMoving(threshold = 0.2) {
        // if being pocketed, consider it as moving until animation completes
        if (this.beingPocketed) return true;
        return Math.abs(this.velocity.x) > threshold || Math.abs(this.velocity.y) > threshold;
    }

    update(friction = this.friction, stopThreshold = 0.3, boardX, boardY, boardSize) {
        if (this.isPlacing) return;
        this.x += this.velocity.x;
        this.y += this.velocity.y;

        if (boardX !== undefined && boardY !== undefined && boardSize !== undefined) {
            this.handleBorderCollision(boardX, boardY, boardSize);
        }
        
        this.velocity.x *= friction;
        this.velocity.y *= friction;

        if (Math.abs(this.velocity.x) < stopThreshold && Math.abs(this.velocity.y) < stopThreshold) {
            this.velocity.x = 0;
            this.velocity.y = 0;
            this.isStrikerMoving = false;
        } else {
            this.isStrikerMoving = true;
        }
    }    // start pocketing animation
    startPocketing(pocketX, pocketY) {
        this.beingPocketed = true;
        this.pocketTarget = { x: pocketX, y: pocketY };
        this.pocketAnimationProgress = 0;
        this.startPocketPosition = { x: this.x, y: this.y };
        
        // stop all velocity when pocketing starts
        this.velocity = { x: 0, y: 0 };
        this.acceleration = { x: 0, y: 0 };
        this.isStrikerMoving = false;
    }
      // update pocketing animation
    updatePocketAnimation() {
        if (!this.beingPocketed || !this.pocketTarget) return false;
        
        this.pocketAnimationProgress += this.pocketAnimationSpeed;
        
        if (this.pocketAnimationProgress >= 1) {
            this.pocketAnimationProgress = 1;
        }
        
        // easing function for smooth animation
        const easeProgress = this.pocketAnimationProgress * this.pocketAnimationProgress;
        
        // interpolate position
        this.x = this.startPocketPosition.x + (this.pocketTarget.x - this.startPocketPosition.x) * easeProgress;
        this.y = this.startPocketPosition.y + (this.pocketTarget.y - this.startPocketPosition.y) * easeProgress;
          // shrink radius as it gets closer to pocket
        this.radius = this.originalRadius * (1 - easeProgress * 0.5);
        
        // animation complete
        if (this.pocketAnimationProgress >= 1) {
            return true;
        }
        return false;
    }
    
    // reset pocketing state (for when striker is reset to base)
    resetPocketingState() {
        this.beingPocketed = false;
        this.pocketTarget = null;
        this.pocketAnimationProgress = 0;
        this.radius = this.originalRadius;
    }
}
