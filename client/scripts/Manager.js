// Manager: thin container for room/turn/score/debt state mirrored from the
// server. The client never mutates game rules \u2014 server is sole authority.
// Score/debt/turn updates flow in via the `roomUpdate` and `turnResolved`
// socket events; this object only exists so existing UI code (Room.jsx
// GameInfoTable) can read structured player data.

export default class Manager {
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
}
