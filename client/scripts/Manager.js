class Manager {

    // the constructor takes the room name and optional room data,
    // which means a manager is uniquely created for each room
    // the room data contains info about whose turn it is
    // player data contains info about the two players, specifically
    // their roles, colors, score, debt, and whether it's their turn

    constructor(roomName, roomData = {}) {
        this.roomName = roomName;
        this.whoseTurn = roomData.whoseTurn || "creator";
        this.playerData = [
            {
                role: "creator",
                color: "white",
                score: roomData.creator?.score || 0,
                debt: roomData.creator?.debt || 0,
                isTurn: this.whoseTurn === "creator",
            },
            {
                role: "joiner",
                color: "black",
                score: roomData.joiner?.score || 0,
                debt: roomData.joiner?.debt || 0,
                isTurn: this.whoseTurn === "joiner",
            },
        ];
    }

    // returns player data for a specific role

    getPlayerData(role) {
        return this.playerData.find((p) => p.role === role);
    }

    // updates manager's "whose turn" variable
    // and player data's two "is turn" variables
    // also return's the role string of whose turn it switched to

    switchTurn(newTurn) {
        if (!newTurn) {
            newTurn = this.whoseTurn === "creator" ? "joiner" : "creator";
        }

        this.whoseTurn = newTurn;
        this.playerData[0].isTurn = this.whoseTurn === "creator";
        this.playerData[1].isTurn = this.whoseTurn === "joiner";
        return this.whoseTurn;
    }

    // gets the player data for a specific role,
    // if the player data for that role exists,
    // update the score in that player data, with the new score
    // return the player data for that role

    updateScore(role, newScore) {
        const player = this.playerData.find((p) => p.role === role);
        if (player) { player.score = newScore; }
        return player;
    }

    // gets the player data for a specific role,
    // if the player data for that role exists,
    // update the debt in that player data, with the new debt
    // return the player data for that role

    updateDebt(role, newDebt) {
        const player = this.playerData.find((p) => p.role === role);
        if (player) { player.debt = newDebt; }
        return player;
    }

    // take player role as parameter
    // find the player data object for the given role,
    // return true if the player score and debt are greater than zero

    canPayDebt(role) {
        const player = this.playerData.find((p) => p.role === role);
        return player && player.score > 0 && player.debt > 0;
    }
    
    // get the player data object for the given role,
    // if the player data for that role exists,
    // and if the player can pay debt,
    // decrement the player's score and debt by one,
    // return an object with the score, debt and player's color

    payDebt(role) {
        const player = this.playerData.find((p) => p.role === role);
        if (player && this.canPayDebt(role)) {
            player.score -= 1;
            player.debt -= 1;
            return {
                newScore: player.score,
                newDebt: player.debt,
                coinColor: player.color,
            };
        }
        return null;
    }

    // set whose turn to "creator",
    // for each object in player data,
    // set score and debt to zero,
    // and set is turn to the creator

    resetGame() {
        this.whoseTurn = "creator";
        this.playerData.forEach((player) => {
            player.score = 0;
            player.debt = 0;
            player.isTurn = player.role === "creator";
        });
    }
}

export default Manager;