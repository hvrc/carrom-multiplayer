class Manager {
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

    getPlayerData(role) {
        return this.playerData.find((p) => p.role === role);
    }

    switchTurn(newTurn) {
        if (!newTurn) {
            newTurn = this.whoseTurn === "creator" ? "joiner" : "creator";
        }

        this.whoseTurn = newTurn;
        this.playerData[0].isTurn = this.whoseTurn === "creator";
        this.playerData[1].isTurn = this.whoseTurn === "joiner";
        return this.whoseTurn;
    }

    updateScore(role, newScore) {
        const player = this.playerData.find((p) => p.role === role);
        if (player) {
            player.score = newScore;
        }
        return player;
    }

    updateDebt(role, newDebt) {
        const player = this.playerData.find((p) => p.role === role);
        if (player) {
            player.debt = newDebt;
        }
        return player;
    }

    canPayDebt(role) {
        const player = this.playerData.find((p) => p.role === role);
        return player && player.score > 0 && player.debt > 0;
    }

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
}

export default Manager;
