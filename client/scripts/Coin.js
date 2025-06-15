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
        friction = 0.7
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
        this.beingPocketed = true;
        this.pocketTarget = { x: pocketX, y: pocketY };
        this.pocketAnimationProgress = 0;
        this.startPocketPosition = { x: this.x, y: this.y };
        
        // stop all velocity when pocketing starts
        this.velocity = { x: 0, y: 0 };
        this.acceleration = { x: 0, y: 0 };
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
        return this.pocketAnimationProgress >= 1;
    }
    
    // reset pocketing state (for safety, though coins are usually removed)
    resetPocketingState() {
        this.beingPocketed = false;
        this.pocketTarget = null;
        this.pocketAnimationProgress = 0;
        this.radius = this.originalRadius;
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
    }

    // Keep isMoving as a METHOD, not a property
    isMoving(threshold = 0.2) {
        // if being pocketed, consider it as moving until animation completes
        if (this.beingPocketed) return true;
        return Math.abs(this.velocity.x) > threshold || Math.abs(this.velocity.y) > threshold;
    }
}
