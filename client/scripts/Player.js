class Player {
    constructor({ clientId, name, role, room, score = 0, debt = 0, isTurn = false, isCoverTurn = false }) {
        this.clientId = clientId;
        this.name = name;
        this.role = role;
        this.room = room;
        this.color = role === 'creator' ? 'white' : 'black';
        this.score = score;
        this.debt = debt;
        this.isTurn = isTurn;
        this.isCoverTurn = isCoverTurn;
    }
}

export default Player;
