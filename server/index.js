import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

// express() returns ?
// createServer() creates an HTTP server, what is the nature of this server?
// Server() creates a socket.io server that listens on the HTTP server
// cors allows all origins *, and  allows GET and POST methods
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});

// port for the server to listen on
// rooms is a Map to store active rooms, map stores key-value pairs
// lastHeartbeat is a Map to track the last heartbeat time for each client
// 5 minutes heartbeat timeout (client sends every 5 minutes)
const PORT = 3000;
const rooms = new Map();
const lastHeartbeat = new Map();
const heartbeatTimeout = 5 * 60 * 1000;

// this function takes a room name and a creator object,
// what is the nature of the creator object?
// the joiner is null
// client itds is a set of client ids, initialized with the creator's id
// the turn is intitially set to the creator
// debts for both is initially zero
function createRoom(roomName, creator) {
    return {
        creator,
        joiner: null,
        clientIds: new Set([creator.clientId]),
        whoseTurn: "creator",
        debts: {
            creator: 0,
            joiner: 0,
        },
    };
}

// for each room, get the room sockets from the io.sockets.adapter.rooms,
// if the room sockets are undefined or if the room sockets size is zero,
// delete that room from the rooms map
function cleanupEmptyRooms() {
    for (const [roomName, room] of rooms.entries()) {
        const roomSockets = io.sockets.adapter.rooms.get(roomName);
        if (!roomSockets || roomSockets.size === 0) {
            rooms.delete(roomName);
        }
    }
}

// default route for server, backend
// intialize empty html string
// if rooms size is zero append a message to the html string saying there are no active rooms
// if rooms have a size greater than zero, then add a list to the html string,
// for eaech room in the rooms map, display the room's name, creator and joiner usernames
// rest is a simple HTML response that sends the final html string
app.get("/", (req, res) => {
    let html = "";
    if (rooms.size === 0) {
        html += "<p>No rooms currently active.</p>";
    } else {
        html += "<ul>";
        for (const [roomName, room] of rooms.entries()) {
            html += `<li>${roomName} - Creator: ${room.creator?.username || "N/A"}${room.joiner ? ", Joiner: " + room.joiner.username : ""}</li>`;
        }
        html += "</ul>";
    }
    res.send(html);
});

// this section does the following every 5 seconds:
// it promotes the joiner to creator if the creator has left,
// deletes the room if both creator and joiner have left

// !
// joiner does not need to become creator,
// 10 seconds is too short
// smoother swapping of clients

// get the current date (and time?),
// for each time stamp and client id in the map of heartbeats,
// if the time difference between now and the last heartbeat is greater than the heartbeat timeout,
// iterate through each room in the rooms map,
setInterval(() => {
    const now = Date.now();
    lastHeartbeat.forEach((lastTime, clientId) => {
        if (now - lastTime > heartbeatTimeout) {
            rooms.forEach((room, roomName) => {                // if either the creator or joiner leaves, delete the room and notify all players
                if (room.creator && room.creator.clientId === clientId) {
                    // Creator left - close the room
                    io.to(roomName).emit("roomClosed", "Creator has left the room");
                    rooms.delete(roomName);
                } else if (room.joiner && room.joiner.clientId === clientId) {
                    // Joiner left - close the room  
                    io.to(roomName).emit("roomClosed", "Player has left the room");
                    rooms.delete(roomName);
                }
            });

            // delete the client id from the lastHeartbeat map
            lastHeartbeat.delete(clientId);
        }
    });

// every 5 seconds
}, 5000);

// listens for new client connections and handles their interactions
// io.on is the main event listener that waits for new players to connect
// the "connection" string is a predefined event name in socket.io,
// that automatically triggers when a new client connects to the server,
// socket parameter represents one sepcific player's connection channel,
// it contains a unique identifier for that player, 
// methods to communicate with that player (emit, on),
// connection info like socket.handshake.query.clientId,
// room membership abilities like join, leave
// sets a client id through the socket handshake query,
io.on("connection", (socket) => {
    const clientId = socket.handshake.query.clientId;

    // if client id has not been set or if client id's value is null/undefined,
    // emit an error to all? clients
    // disconnect the socket from ?
    // return to stop further processing
    if (!clientId || clientId === "null" || clientId === "undefined") {
        socket.emit("error", "Invalid client ID");
        socket.disconnect();
        return;
    }

    // add to the lastHeartbeat map with the current time and clientId
    // listen for heartbeat events from the client,
    // if the incoming clientId matches the one stored in lastHeartbeat,
    // update the last heartbeat time for that clientId, to the current time
    lastHeartbeat.set(clientId, Date.now());
    socket.on("heartbeat", ({ clientId: incomingClientId }) => {
        if (incomingClientId === clientId) {
            lastHeartbeat.set(clientId, Date.now());
        }
    });

    // ! can the error handling be removed?
    // listen for a checkRoomAccess event, which checks if a player can access a room
    // it has parameters, room name and the incoming client id
    // if the incoming clientId is invalid, emit an error and return
    // if the room name is not found in the rooms map, emit an error and return
    // get the room from the rooms map that has the room name,
    // if the room's clientIds set has 2 or more unique client ids and,
    // if the incoming clientId is not in that set,
    // emit an error that the room is full and return
    // else, join the room using socket.join,
    // emit an accessGranted event to the client
    // how does the socket emit work, who is it emitting that access granted to?
    socket.on("checkRoomAccess", ({ roomName, clientId: incomingClientId }) => {
        if (
            !incomingClientId ||
            incomingClientId === "null" ||
            incomingClientId === "undefined"
        ) {
            socket.emit("error", "Invalid client ID");
            return;
        }
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }
        const room = rooms.get(roomName);
        if (room.clientIds.size >= 2 && !room.clientIds.has(incomingClientId)) {
            socket.emit("error", "Room is full");
            return;
        }
        socket.join(roomName);
        socket.emit("accessGranted");
    });
    
    // ! can the error handling be removed?
    // rejoin room is to rejoin an existing room aftger a disconnection
    // takes room name, username, incoming client id and player role as parameters
    // if the incoming clientId is invalid, emit an error and return
    // if the room name is not found in the rooms map, emit an error and return
    // get the room from the rooms map that has the room name,
    // if the player role is creator and the room's creator is set and the id matches the incoming clientId,
    // join the room using socket.join, emit an accessGranted event
    // else if the player role is joiner and the room's joiner is set and the id matches the incoming clientId,
    // join the room using socket.join, emit an accessGranted event
    // else, emit an error, saying that the session or role is invalid
    socket.on("rejoinRoom", ({ roomName, username, clientId: incomingClientId, playerRole }) => {
        if (
            !incomingClientId ||
            incomingClientId === "null" ||
            incomingClientId === "undefined"
        ) {
            socket.emit("error", "Invalid client ID");
            return;
        }
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }
        const room = rooms.get(roomName);
        if (
            playerRole === "creator" &&
            room.creator &&
            room.creator.clientId === incomingClientId
        ) {
            socket.join(roomName);
            socket.emit("accessGranted");
        } else if (
            playerRole === "joiner" &&
            room.joiner &&
            room.joiner.clientId === incomingClientId
        ) {
            socket.join(roomName);
            socket.emit("accessGranted");
        } else {
            socket.emit("error", "Invalid session or role");
        }
    });

    // creates room... takes room name, username, and incoming client id as parameters
    // if incoming clientId is invalid, emit an error and return
    // if the room name already exists in the rooms map, emit an error and return
    // create a new room object with the creator's username and client id,
    // set the joiner to null, initialize clientIds with the incoming clientId,
    // set whoseTurn to "creator",
    // join the room using socket.join,
    // emit a playerJoined event to the client with username and room name,
    // emit a roomUpdate event to the client with room name, creator's username, no joiner, and whoseTurn set to "creator"
    socket.on("createRoom", ({ roomName, username, clientId: incomingClientId }) => {
        if (
            !incomingClientId ||
            incomingClientId === "null" ||
            incomingClientId === "undefined"
        ) {
            socket.emit("error", "Invalid client ID");
            return;
        }
        if (rooms.has(roomName)) {
            socket.emit("error", "Room already exists");
            return;
        }
        rooms.set(roomName, {
            creator: { username, clientId: incomingClientId },
            joiner: null,
            clientIds: new Set([incomingClientId]),
            whoseTurn: "creator",
        });

        socket.join(roomName);
        socket.emit("playerJoined", { username, roomName });
        socket.emit("roomUpdate", {
            roomName,
            creator: { username },
            joiner: null,
            whoseTurn: "creator",
        });
    });

    // join room, takes room name, username, and incoming client id as parameters
    // whose username ?
    // if incoming clientId is invalid, emit an error and return
    // if the room name does not exist in the rooms map, emit an error and return
    // get the room from the rooms map that has the room name,
    // if the incoming clientId is already in the room's clientIds set, emit an error and return
    // if the room's clientIds set has 2 or more unique client ids, emit an error that the room is full and return
    // if the room's joiner is already set, emit an error that the room is full and return,
    // why check if specifically joiner is already in if we are checking if 2 or more are already in the room? 
    // set the room's joiner to an object with the username and incoming clientId,
    // add the incoming clientId to the room's clientIds set,
    // join the room using socket.join, emit a playerJoined event to the client with username and room name,
    // io to means emit to all clients in the room,
    // emit a roomUpdate event to all clients in the room with,
    // the room name, creator's username, joiner's username, and whoseTurn set to "creator" or "joiner",
    // based on the current state of the room
    socket.on("joinRoom", ({ roomName, username, clientId: incomingClientId }) => {
        if (
            !incomingClientId ||
            incomingClientId === "null" ||
            incomingClientId === "undefined"
        ) {
            socket.emit("error", "Invalid client ID");
            return;
        }
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }
        const room = rooms.get(roomName);
        if (room.clientIds.has(incomingClientId)) {
            socket.emit("error", "Client already in room");
            return;
        }
        if (room.clientIds.size >= 2) {
            socket.emit("error", "Room is full");
            return;
        }
        if (room.joiner) {
            socket.emit("error", "Room is full");
            return;
        }

        room.joiner = { username, clientId: incomingClientId };
        room.clientIds.add(incomingClientId);
        socket.join(roomName);
        socket.emit("playerJoined", { username, roomName });
        io.to(roomName).emit("roomUpdate", {
            roomName,
            creator: { username: room.creator.username },
            joiner: { username },
            whoseTurn: room.whoseTurn,
        });
    });

    // asks for room data
    socket.on("requestRoomData", ({ roomName }) => {
        if (rooms.has(roomName)) {
            const room = rooms.get(roomName);

            socket.emit("roomUpdate", {
                roomName,
                creator: room.creator
                    ? { username: room.creator.username }
                    : null,
                joiner: room.joiner ? { username: room.joiner.username } : null,
                whoseTurn: room.whoseTurn,
            });
        } else {
            socket.emit("error", "Room does not exist");
        }
    });

    // handle switching turns

    socket.on("switchTurn", ({ roomName, clientId: incomingClientId }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        const room = rooms.get(roomName);

        if (room.clientIds.size < 2) {
            socket.emit("error", "Waiting for another player");
            return;
        }

        // toggle turn
        room.whoseTurn = room.whoseTurn === "creator" ? "joiner" : "creator";

        // broadcast updated room state
        io.to(roomName).emit("roomUpdate", {
            roomName,
            creator: { username: room.creator.username },
            joiner: room.joiner ? { username: room.joiner.username } : null,
            whoseTurn: room.whoseTurn,
        });

        // Emit explicit turnSwitched event for striker reset
        io.to(roomName).emit("turnSwitched", {
            roomName,
            nextTurn: room.whoseTurn,
        });
    });

    // handle continuing turn

    socket.on("continueTurn", ({ roomName, continuedTurns }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        const room = rooms.get(roomName);
        if (room.clientIds.size < 2) {
            socket.emit("error", "Waiting for another player");
            return;
        }

        // keep the same turn but update the continued turns count
        // include remaining turns in room update
        io.to(roomName).emit("roomUpdate", {
            roomName,
            creator: { username: room.creator.username },
            joiner: room.joiner ? { username: room.joiner.username } : null,
            whoseTurn: room.whoseTurn,
            continuedTurns,
        });

        // emit turnContinued event for striker reset
        io.to(roomName).emit("turnContinued", {
            roomName,
            continueWith: room.whoseTurn,
            continuedTurns,
        });
    });

    // handle explicit leave action, immediate
    // check if clientId is valid
    // check if room exists
    // check if clientId is the creator or joiner
    // if creator, promote joiner to creator
    // if joiner, remove joiner
    // emit room update, emit room closed if creator leaves
    // cleanup empty rooms
    socket.on("leaveRoom", ({ roomName, clientId: incomingClientId }) => {
        if (
            !incomingClientId ||
            incomingClientId === "null" ||
            incomingClientId === "undefined"
        ) {
            socket.emit("error", "Invalid client ID");
            return;
        }

        if (rooms.has(roomName)) {
            const room = rooms.get(roomName);
            if (room.creator && room.creator.clientId === incomingClientId) {
                if (room.joiner) {
                    // promote joiner to creator
                    room.creator = {
                        username: room.joiner.username,
                        clientId: room.joiner.clientId,
                    };
                    room.joiner = null;
                    room.clientIds.delete(incomingClientId);
                    room.whoseTurn = "creator";
                    io.to(roomName).emit("roomUpdate", {
                        roomName,
                        creator: { username: room.creator.username },
                        joiner: null,
                        whoseTurn: room.whoseTurn,
                    });
                } else {
                    rooms.delete(roomName);
                    io.to(roomName).emit(
                        "roomClosed",
                        "Creator has left the room",
                    );
                }
            } else if (
                room.joiner &&
                room.joiner.clientId === incomingClientId
            ) {
                room.joiner = null;
                room.clientIds.delete(incomingClientId);
                io.to(roomName).emit("roomUpdate", {
                    roomName,
                    creator: { username: room.creator.username },
                    joiner: null,
                    whoseTurn: room.whoseTurn,
                });
            }
            lastHeartbeat.delete(incomingClientId);
            cleanupEmptyRooms();
        }
    });    // handle client disconnection - if either player leaves, close the room
    socket.on("disconnect", () => {
        // Find and close any room this client was in
        rooms.forEach((room, roomName) => {
            if (room.creator && room.creator.clientId === socket.id) {
                // Creator disconnected - close the room
                io.to(roomName).emit("roomClosed", "Creator has left the room");
                rooms.delete(roomName);
            } else if (room.joiner && room.joiner.clientId === socket.id) {
                // Joiner disconnected - close the room
                io.to(roomName).emit("roomClosed", "Player has left the room");
                rooms.delete(roomName);
            }
        });
        
        // Clean up heartbeat tracking
        lastHeartbeat.delete(socket.id);
        
        cleanupEmptyRooms();
    });

    // coin and striker movement

    // handle striker movement sync
    socket.on("strikerMove", (data) => {
        socket.to(data.roomName).emit("strikerMove", data);
    });

    // handle striker animation sync
    socket.on("strikerAnimation", (data) => {
        socket.to(data.roomName).emit("strikerAnimation", data);
    });

    // handle coin movement sync
    socket.on("coinsMove", (data) => {
        socket.to(data.roomName).emit("coinsMove", data);
    });

    // handle coin pocketing sync
    socket.on("coinsPocketed", (data) => {
        socket.to(data.roomName).emit("coinsPocketed", data);
    });

    // scoring and debt

    // handle striker pocketing and debt increment
    socket.on("strikerPocketed", (data) => {
        const { roomName, playerRole, debt } = data;
        if (!rooms.has(roomName)) return;

        const room = rooms.get(roomName);
        if (!room.debts) {
            room.debts = { creator: 0, joiner: 0 };
        }

        // increment debt for the player who pocketed their striker
        room.debts[playerRole] = debt;

        // emit debt update to all players in the room
        io.to(roomName).emit("debtUpdate", {
            roomName,
            playerRole,
            debt,
        });
    });

    // handle score updates when coins are pocketed
    socket.on("updateScore", (data) => {
        const { roomName, playerRole, coinColor, increment } = data;
        if (!rooms.has(roomName)) return;

        const room = rooms.get(roomName);
        if (!room.scores) {
            room.scores = { creator: 0, joiner: 0 };
        }
        if (!room.debts) {
            room.debts = { creator: 0, joiner: 0 };
        }

        // check if player pocketed their own color coin
        const playerColor = playerRole === "creator" ? "white" : "black";
        if (coinColor === playerColor) {
            const currentDebt = room.debts[playerRole] || 0;
            const currentScore = room.scores[playerRole] || 0;

            // if player has debt > 0 and pockets their own color coin
            if (currentDebt > 0) {
                // decrement debt by 1
                room.debts[playerRole] = currentDebt - 1;

                // DON'T change the score - it stays the same due to debt payment
                // room.scores[playerRole] remains unchanged

                // emit debt update immediately
                io.to(roomName).emit("debtUpdate", {
                    roomName,
                    playerRole,
                    debt: room.debts[playerRole],
                });

                // delay the coin addition until after animation completes (2 seconds)
                setTimeout(() => {
                    io.to(roomName).emit("debtPaid", {
                        roomName,
                        playerRole,
                        newScore: room.scores[playerRole],
                        newDebt: room.debts[playerRole],
                        coinColor: playerColor,
                        coinId: Date.now() + Math.random(),
                    });
                }, 2000);
            } else {
                // no debt, increment score normally
                const scoreChange = increment !== undefined ? increment : 1;
                room.scores[playerRole] = currentScore + scoreChange;
            }

            // emit score update to sync scores
            io.to(roomName).emit("scoreUpdate", {
                roomName: roomName,
                scores: room.scores,
            });

            // emit room update to sync everything in UI
            io.to(roomName).emit("roomUpdate", {
                roomName,
                creator: {
                    username: room.creator.username,
                    debt: room.debts.creator,
                    score: room.scores.creator,
                },
                joiner: room.joiner
                    ? {
                          username: room.joiner.username,
                          debt: room.debts.joiner,
                          score: room.scores.joiner,
                      }
                    : null,
                whoseTurn: room.whoseTurn,
                debts: room.debts,
                scores: room.scores,
            });

            // early return to avoid double processing
            return;
        }

        // normal scoring logic for all other cases (opponent's coins, queen, etc.)
        const scoreChange = increment !== undefined ? increment : 1;
        room.scores[playerRole] = (room.scores[playerRole] || 0) + scoreChange;

        // emit score update to all players in the room
        io.to(roomName).emit("scoreUpdate", {
            roomName: roomName,
            scores: room.scores,
        });
    });

    socket.on("updateDebt", ({ roomName, playerRole, debt }) => {
        if (!rooms.has(roomName)) return;
        const room = rooms.get(roomName);

        if (!room.debts) {
            room.debts = { creator: 0, joiner: 0 };
        }

        if (!room.scores) {
            room.scores = { creator: 0, joiner: 0 };
        }

        const currentScore = room.scores[playerRole] || 0;

        // check if player can pay debt automatically, has score > 0
        if (currentScore > 0) {
            // reduce score by 1 instead of increasing debt
            room.scores[playerRole] = currentScore - 1;
            // keep debt the same, don't increase it
            // room.debts[playerRole] remains unchanged

            // determine coin color based on player role
            const coinColor = playerRole === "creator" ? "white" : "black";

            // broadcast debt payment to all players in room
            // keep existing debt
            // generate a unique ID for the new coin
            io.to(roomName).emit("debtPaid", {
                roomName,
                playerRole,
                newScore: room.scores[playerRole],
                newDebt: room.debts[playerRole],
                coinColor,
                coinId: Date.now() + Math.random(),
            });

            // also broadcast score update
            io.to(roomName).emit("scoreUpdate", {
                roomName: roomName,
                scores: room.scores,
            });
        } else {
            // if can't pay debt, increment debt as before
            room.debts[playerRole]++;

            // broadcast updated room state including debts
            io.to(roomName).emit("roomUpdate", {
                roomName,
                creator: {
                    username: room.creator.username,
                    debt: room.debts.creator,
                },
                joiner: room.joiner
                    ? {
                          username: room.joiner.username,
                          debt: room.debts.joiner,
                      }
                    : null,
                whoseTurn: room.whoseTurn,
                debts: room.debts,
            });
        }
    });

    // handle striker pocketed event
    socket.on( "striker-pocketed", ({ roomName, playerRole, scoreChange, respawnCoin }) => {
            if (!rooms.has(roomName)) return;
            const room = rooms.get(roomName);

            // update score
            if (!room.scores) {
                room.scores = { creator: 0, joiner: 0 };
            }

            room.scores[playerRole] += scoreChange;

            // broadcast score update and coin respawn in one event
            io.to(roomName).emit("striker-penalty", {
                roomName,
                playerRole,
                newScore: room.scores[playerRole],
                respawnCoin,
            });
        },
    );

    // handle coin respawn event
    // broadcast new coin position to other players
    socket.on("coin-respawned", ({ roomId, coin }) => {
        socket.to(roomId).emit("coin-respawned", {
            coin,
        });
    });

    // handle debt payment, when player has both score > 0 and debt > 0
    socket.on("payDebt", ({ roomName, playerRole }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        const room = rooms.get(roomName);
        if (!room.scores) room.scores = { creator: 0, joiner: 0 };
        if (!room.debts) room.debts = { creator: 0, joiner: 0 };
        const currentScore = room.scores[playerRole] || 0;
        const currentDebt = room.debts[playerRole] || 0;

        // check if player can pay debt, has both score > 0 and debt > 0
        if (currentScore > 0 && currentDebt > 0) {
            // reduce score by 1 and debt by 1
            room.scores[playerRole] = currentScore - 1;
            room.debts[playerRole] = currentDebt - 1;

            // determine coin color based on player role
            const coinColor = playerRole === "creator" ? "white" : "black";

            // broadcast debt payment to all players in room
            // generate a unique ID for the new coin
            io.to(roomName).emit("debtPaid", {
                roomName,
                playerRole,
                newScore: room.scores[playerRole],
                newDebt: room.debs[playerRole],
                coinColor,
                coinId: Date.now() + Math.random(),
            });
        } else {
            socket.emit(
                "error",
                "Cannot pay debt: insufficient score or no debt to pay",
            );
        }
    });

    // handle queen reset event, when queen needs to be returned to center
    // broadcast queen reset to all players in the room
    socket.on("queenReset", ({ roomName, playerRole }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        io.to(roomName).emit("queenReset", {
            roomName,
            playerRole,
        });
    });

    // handle cover turn state updates
    // broadcast cover turn state to all players in the room
    socket.on("coverTurnUpdate", ({ roomName, playerRole, isCoverTurn }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        io.to(roomName).emit("coverTurnUpdate", {
            roomName,
            playerRole,
            isCoverTurn,
        });
    });

    // handle queen pocketed state updates
    // broadcast queen pocketed state to all players in the room
    socket.on(
        "queenPocketedUpdate",
        ({ roomName, playerRole, hasPocketedQueen }) => {
            if (!rooms.has(roomName)) {
                socket.emit("error", "Room does not exist");
                return;
            }

            io.to(roomName).emit("queenPocketedUpdate", {
                roomName,
                playerRole,
                hasPocketedQueen,
            });
        },
    );

    // handle queen covered state updates
    // broadcast queen covered state to all players in the room
    socket.on(
        "queenCoveredUpdate",
        ({ roomName, playerRole, hasCoveredQueen }) => {
            if (!rooms.has(roomName)) {
                socket.emit("error", "Room does not exist");
                return;
            }

            io.to(roomName).emit("queenCoveredUpdate", {
                roomName,
                playerRole,
                hasCoveredQueen,
            });
        },
    );

    // handle game reset events
    // reset room state to initial state
    // always reset to creator's turn
    // broadcast game reset to all players in the room
    // broadcast room update to sync turn state and ensure UI updates
    socket.on("gameReset", ({ roomName, reason }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        const room = rooms.get(roomName);
        room.whoseTurn = "creator";
        room.debts = {
            creator: 0,
            joiner: 0,
        };

        io.to(roomName).emit("gameReset", {
            roomName,
            reason,
        });

        io.to(roomName).emit("roomUpdate", room);
    });

    // handle striker slider position updates
    socket.on("strikerSliderUpdate", ({ roomName, playerRole, sliderValue, strikerX }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        // broadcast slider position to other players in the room
        socket.to(roomName).emit("strikerSliderUpdate", {
            roomName,
            playerRole,
            sliderValue,
            strikerX,
        });
    });
});

// start server
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
