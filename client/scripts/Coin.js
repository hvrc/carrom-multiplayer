// Coin.js
// Carrom coin class for physics and rendering

export default class Coin {
    constructor({
        id,
        color = 'white',
        radius = 15,
        coinMass = 5,
        x = 0,
        y = 0,
        velocity = { x: 0, y: 0 },
        acceleration = { x: 0, y: 0 },
        restitution = 0.7,
        friction = 0.98
    }) {
        this.id = id; // integer
        this.color = color;
        this.radius = radius;
        this.coinMass = coinMass;
        this.x = x;
        this.y = y;
        this.velocity = { ...velocity };
        this.acceleration = { ...acceleration };
        this.restitution = restitution;
        this.friction = friction;
    }    draw(ctx) {
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

    update() {
        this.velocity.x += this.acceleration.x;
        this.velocity.y += this.acceleration.y;
        this.x += this.velocity.x;
        this.y += this.velocity.y;
        this.velocity.x *= this.friction;
        this.velocity.y *= this.friction;
        // Optionally, reset acceleration after each update
        this.acceleration.x = 0;
        this.acceleration.y = 0;
    }
}
