// when a client connects via socket.connect() in Menu.jsx, Room.jsx,
// it creates a unique socket connection for that client
// socket.on(), this waits for specific events from the client
// socket emit(), sends an event to client who initiated the connection
// when client join a room using socket.join(room), 
// socket.io maintains a registry, which sockets are in which room
// socket.to(room).emit(), sends an event to all clients in room except the sender
// io.to(room).emit(), sends event to all clients in room

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from 'cors';

// express() returns ?
// createServer() creates an HTTP server, what is the nature of this server?
// Server() creates a socket.io server that listens on the HTTP server
// cors allows all origins *, and  allows GET and POST methods

const app = express();

// Add CORS middleware for Express routes

app.use(cors({
    origin: [
        "https://carrom-2222.el.r.appspot.com",
        "http://localhost:3001"
    ],
    credentials: true
}));

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: [
            "https://carrom-2222.el.r.appspot.com",
            "http://localhost:3001"
        ],
        methods: ["GET", "POST"],
        credentials: true
    },
});

// port for the server to listen on
// rooms is a Map to store active rooms, map stores key-value pairs
// lastHeartbeat is a Map to track the last heartbeat time for each client
// 5 minutes heartbeat timeout (client sends every 5 minutes)

const PORT = process.env.PORT || 3000;
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
            rooms.forEach((room, roomName) => {
                // if either the creator or joiner leaves, delete the room and notify all players
                if (room.creator && room.creator.clientId === clientId) {
                    io.to(roomName).emit("roomClosed", "Creator has left the room");
                    rooms.delete(roomName);
                } else if (room.joiner && room.joiner.clientId === clientId) {
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
    console.log("New client connected:", socket.id);
    
    const clientId = socket.handshake.query.clientId;
    console.log("Client ID:", clientId);

    if (!clientId || clientId === "null" || clientId === "undefined") {
        console.error("Invalid client ID:", clientId);
        socket.emit("error", "Invalid client ID");
        socket.disconnect();
        return;
    }

    // Add error handling for socket events
    socket.on("error", (error) => {
        console.error("Socket error:", error);
    });

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

    // listen for a event sent by clients, with a room name
    // if the room name exists in the rooms map, get the room object
    // send an event to the clients called a room update
    // with the room name, the creator as the creator's username in the room object,
    // the joiner as the joiner's username in the room object,
    // and whose turn it is from the room object
    // if the room does not exist, emit an error that the room does not exist

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

    // listen for a switch turn event sent by clients, that comes with,
    // the room name and an incoming client id
    // do i need the incoming client id?

    // if the rooms map does not have the room name, emit an error
    // get the room object from the map of rooms using the room name
    // if there arent more that two client ids in the room,
    // emit and error, do we need this?
    // toggle whose turn between the strings creator or joiner

    // send a event to all clients called room update
    // with room name, creator's username in the room object,
    // joiner's username in the room object if it exists,
    // and whose turn it is from the room object

    // send a event called turn switched to all clients,
    // with a room name and and a variable called next turn,
    // which has the value of the whose turn variable that the room object has
    // this is supposedly used to reset the striker on the client side
    // but i am not sure how it works?

    socket.on("switchTurn", ({ roomName, clientId: incomingClientId }) => {

        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        const room = rooms.get(roomName);

        // if (room.clientIds.size < 2) {
        //     socket.emit("error", "Waiting for another player");
        //     return;
        // }

        room.whoseTurn = room.whoseTurn === "creator" ? "joiner" : "creator";

        io.to(roomName).emit("roomUpdate", {
            roomName,
            creator: { username: room.creator.username },
            joiner: room.joiner ? { username: room.joiner.username } : null,
            whoseTurn: room.whoseTurn,
        });

        io.to(roomName).emit("turnSwitched", {
            roomName,
            nextTurn: room.whoseTurn,
        });
    });

    // listen for a continue turn event sent by clients,
    // emit a room update event to all clients in the room,
    // with the room name, creator's username in the room object,
    // joiner's username in the room object if it exists,
    // whose turn it is from the room object,
    // and the continued turns count that was received in the event data

    // sent a continued turn event to all clients,
    // with the room name, a continue turn variable,
    // which has the value of whose turn variable that the room object has,
    // and the continued turns count that was received in the event data

    socket.on("continueTurn", ({ roomName, continuedTurns }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        const room = rooms.get(roomName);
        // if (room.clientIds.size < 2) {
        //     socket.emit("error", "Waiting for another player");
        //     return;
        // }

        io.to(roomName).emit("roomUpdate", {
            roomName,
            creator: { username: room.creator.username },
            joiner: room.joiner ? { username: room.joiner.username } : null,
            whoseTurn: room.whoseTurn,
            continuedTurns,
        });

        io.to(roomName).emit("turnContinued", {
            roomName,
            continueWith: room.whoseTurn,
            continuedTurns,
        });
    });

    // listen for a leave room event ent by clients,
    // it sends the room name and the incoming client id
    // if rooms map has the received room name, get the room object from the map

    // if the room's creator is set and the incoming client id matches the creator's client id,
    // WHICH MEANS IT WAS THE CREATOR WHO SENT THE LEAVE ROOM EVENT TO THE CLIENT
    // if the room's joiner is set, set the room creator's username and client id to that of the joiner
    // set the room joiner to null, remove the incoming client id from the room's client ids set,
    // set whose turn to "creator",
    // send an event to all clients called room update,
    // with room name, the creator as the new creator, the joiner as null,
    // and whose turn, which was set to "creator"
    // if the room's joiner is not set, delete the room from the rooms map,
    // send an event to all clients in the room called room closed
    
    // else if the room joiner is set and the incoming client id matches the joiner's client id,
    // WHICH MEANS IT WAS THE JOINER THAT LEFT THE ROOM
    // set the joiner to null
    // remove the incoming client id from the room's client ids set,
    // send an event to all clients called room update,
    // with room name, the creator as the creator's username in the room object,
    // the joiner as null, and whose turn, which was set to "creator"

    // delete the incoming client id from the lastHeartbeat map,
    // clear rooms that are empty from the rooms map

    socket.on("leaveRoom", ({ roomName, clientId: incomingClientId }) => {
        // if (!incomingClientId || incomingClientId === "null" || incomingClientId === "undefined") {
        //     socket.emit("error", "Invalid client ID");
        //     return;
        // }

        if (rooms.has(roomName)) {
            const room = rooms.get(roomName);

            if (room.creator && room.creator.clientId === incomingClientId) {
                if (room.joiner) {

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
                    io.to(roomName).emit("roomClosed", "Creator has left the room");
                }

            } else if ( room.joiner && room.joiner.clientId === incomingClientId ) {
                room.joiner = null;
                room.clientIds.delete(incomingClientId);
                room.whoseTurn = "creator";

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
    });
    
    // listen for a disconnect event sent by the clients or is the socket, if it is, what's the difference?
    // loop through each room in the rooms map,
    // if the room's creator is set and the creator's client id matches the incoming socket id, or
    // if the room's joiner is set and the joiner's client id matches the incoming socket id,
    // send a room closed event to the respecitve room, and delete the room from the map of rooms
    // delete the incoming socket id from the last heart beat map
    // remove empty rooms from the rooms map

    socket.on("disconnect", () => {
        rooms.forEach((room, roomName) => {

            if (room.creator && room.creator.clientId === socket.id) {
                io.to(roomName).emit("roomClosed", "Creator has left the room");
                rooms.delete(roomName);

            } else if (room.joiner && room.joiner.clientId === socket.id) {
                io.to(roomName).emit("roomClosed", "Player has left the room");
                rooms.delete(roomName);
            }
        });
        
        lastHeartbeat.delete(socket.id);
        cleanupEmptyRooms();
    });

    // coin and striker movement

    // listen for a striker move event sent by clients,
    // it has a data object containing room name, striker x, y
    // send a striker move event to all clients in the room
    // so basically on the active client's window, the striker moves,
    // that client sends a striker move event with the data? to the server
    // socket refers to that client's socket connection
    // socket.to; the server then sends the same event to all clients in the room,
    // EXCEPT the client who sent it, so only the inactive player receives the event

    socket.on("strikerMove", (data) => {
        socket.to(data.roomName).emit("strikerMove", data);
    });

    // listens for a striker animation event sent by a client,
    // and sends it back to all clients in the room
    // it has a data object containing room name, striker x, y, and animation type
    // supposedly handles striker animation sync

    socket.on("strikerAnimation", (data) => {
        socket.to(data.roomName).emit("strikerAnimation", data);
    });

    // listens for a coins pocketed event sent by a client,
    // and sends it back to all clients in the room
    // what does the data contain?

    socket.on("coinsPocketed", (data) => {
        socket.to(data.roomName).emit("coinsPocketed", data);
    });

    // scoring and debt

    // handle striker pocketing and debt increment

    // listen for a striker pocketed event sent by client
    // split the data sent by client into room name, role, 
    // debt of the player who pocketed their striker
    // return if the room does not exist in the rooms map
    // get room from the rooms map using the room name,
    // if the room does not have a property called debts,
    // initialize a debts object for the room set to zero for each player role
    // set the debt of the respecitve player role in the room object,
    // to the actual debt of the player client who sent the event
    // send a event to all client called debt update,
    // with the same contents as in the data that the server recceived

    socket.on("strikerPocketed", (data) => {
        const { roomName, playerRole, debt } = data;

        if (!rooms.has(roomName)) return;

        const room = rooms.get(roomName);
        if (!room.debts) {room.debts = { creator: 0, joiner: 0 };}

        room.debts[playerRole] = debt;

        io.to(roomName).emit("debtUpdate", {
            roomName,
            playerRole,
            debt,
        });
    });

    // listen for an update score event sent by a client
    // data sent over contains room name, player role, coin color, and increment
    // THE COIN COLOR REFERS TO THE COLOR OF THE COIN THAT WAS POCKETED
    // THE INCREMENT COULD BE POSITIVE OR NEGATIVE
    // get the room from the rooms map using the room name,
    // if the room does not have a property scores and or debts set,
    // initialize them to zero for each player role

    // get the player color based on their role, this means role is attached to color
    // if the coin color sent by the client matches the color of the player role
    // WHICH MEANS A PLAYER POCKETED THEIR OWN COLOR COIN,
    // WHERE IS THE LOGIC FOR IF PLAYER POCKETS A COIN THAT IS NOT THEIR OWN COLOR?

    // THE LOGIC BELOW BASICALLY TAKES CARE OF PAYING DEBT IF DEBT WAS GREATER THAN ZERO
    // get the current debt and score for the player role from the room map, 
    // if they havent been set, set them to zero
    // if the player's debt is greater than zero,
    // decrement the debt for the player in the room object by one
    // send an event to all clients in the room called debt update,
    // with the room name, player role whose debt needs to be updated, and the new debt value
    // set a two second delay,
    // send an event to all clients saying debt paid, 
    // with the new score, debt in the room object in the map for the player role
    // the player/coin color, and the coin id
    // I AM UNSURE WHY THIS DEBT PAID EVENT IS BEING SENT, WHAT PURPOSE IS IT SERVING?
    // I AM SURE THERE IS A VALID REASON BUT DON'T KNOW WHAT IT IS

    // if player who pocketed coin does not have debt greater than zero,
    // create a score change variable that is set to the increment, which would usually be one
    // and set the room map room object score for the player role to,
    // the sum of the current score and this score change

    // send a score update to all the clients with the room name,
    // and score object for scores of both players
    // WHY ARE WE SENDING ROOM NAME?

    // send a room update to all clients to synchronise all data 
    // NOPT USRE IF THIS IS REDUNDANT OR NECESSARY,
    // I SEE THAT THAT THE ROOM VARIABLE THAT IS IS REFERENCING ALL THE VALUES FROM
    // IS THE ROOM OBJECT IN THE ROOMS MAP
    
    // return statement to avoid double processing, not sure what that means?
    // set a score change variable to the increment, if no increment set it to one
    // THIS IS VERY CONFUSING TO ME! 
    // increment the score of the player role that was sent by the event,
    // SO THIS MEANS IN THE CASE THAT THE PLAYER COLOR IS NOT EQUAL TO THE,
    // COIN COLOR THAT WAS POCKETED, THE INCREMENT SENT BY CLIENT SHOULDBE NEGATIVE ONE
    // in the case of a queen it should be positive one, basically there will be seperate sends,
    // for this update score based on which color was pocketed,
    // this calcualtion of color is not being done on the server, which begs the quyestion why is there
    // a check for if the color was the same for player and coin? if (coinColor === playerColor)
    // send a score update to all clients

    socket.on("updateScore", (data) => {
        const { roomName, playerRole, coinColor, increment } = data;
        if (!rooms.has(roomName)) return;

        const room = rooms.get(roomName);

        if (!room.scores) { room.scores = { creator: 0, joiner: 0 }; }
        if (!room.debts) { room.debts = { creator: 0, joiner: 0 }; }

        const playerColor = playerRole === "creator" ? "white" : "black";

        if (coinColor === playerColor) {
            const currentDebt = room.debts[playerRole] || 0;
            const currentScore = room.scores[playerRole] || 0;

            if (currentDebt > 0) {
                room.debts[playerRole] = currentDebt - 1;

                io.to(roomName).emit("debtUpdate", {
                    roomName,
                    playerRole,
                    debt: room.debts[playerRole],
                });

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
                const scoreChange = increment !== undefined ? increment : 1;
                room.scores[playerRole] = currentScore + scoreChange;
            }

            io.to(roomName).emit("scoreUpdate", {
                roomName: roomName,
                scores: room.scores,
            });

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

            return;
        }

        const scoreChange = increment !== undefined ? increment : 1;
        room.scores[playerRole] = (room.scores[playerRole] || 0) + scoreChange;

        io.to(roomName).emit("scoreUpdate", {
            roomName: roomName,
            scores: room.scores,
        });
    });

    // listen for a debt update event from one of the clients
    // get room based on room name from the rooms map
    // if the score and debt has not been set in the room object, set them to zero
    // get the current score 
    // if the current score is greater than ero ,
    // THIS IS WHERE PLAYER HAS TO PAY BY SCORE TO SETTLE DEBT
    // decrement room object score for player role by 1 
    // WHY DO WE NEED THE CURRENT SCORE VALUE WHY CANT WE JUST USE -- ?
    // get coin color based on player role
    // send an event to all clients called debt paid,
    // with room name, role, new score tand debt through room map room object
    // coin color, coin id
    // broadcast a event to all clients except the one who sent the event,
    // called score update, with room name and scores object from the room map
    
    // if the current score is not greater than zero,
    // increment the debt in the room map for the player role
    // send an event to all clients in the room called debt update,
    // with the updates state with room name, creator, joiner,
    // username, debt, whose turn
    // some of these values look super redundant!

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

        if (currentScore > 0) {
            room.scores[playerRole] = currentScore - 1;

            const coinColor = playerRole === "creator" ? "white" : "black";

            io.to(roomName).emit("debtPaid", {
                roomName,
                playerRole,
                newScore: room.scores[playerRole],
                newDebt: room.debts[playerRole],
                coinColor,
                coinId: Date.now() + Math.random(),
            });

            io.to(roomName).emit("scoreUpdate", {
                roomName: roomName,
                scores: room.scores,
            });
        
        } else {
            room.debts[playerRole]++;

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

    // listen for an event for when striker is pocketed,
    // expect data room name, role of player whos pocketed the striker,
    // the expected score change, and respawn coin?
    // the score change is always negative one because its a striker pocket,
    // the respawn coin is a coin object containing id, color, x, y
    // this coin object is ususlal null but is being set to queen when queen needs to be respawned
    // this doesnt seem logical, every coin should be tracked and be available for respawn!
    // get room from map of rooms
    // should i be getting the room outside of these functions? maybe not 
    // set scores to zero if not defined
    // increment the score for the player role in the room object by the score change,
    // score change is usually negative one so we are basically decrementing it
    // send an event to all clients except sender called striker penalty,
    // which has the player role, new score and respawn coin data
    // this feels horrible! i need to figure out better ways to update game state

    socket.on("striker-pocketed", ({ roomName, playerRole, scoreChange, respawnCoin }) => {
        if (!rooms.has(roomName)) return;
        const room = rooms.get(roomName);

        if (!room.scores) { room.scores = { creator: 0, joiner: 0 }; }

        room.scores[playerRole] += scoreChange;

        io.to(roomName).emit("striker-penalty", {
            roomName,
            playerRole,
            newScore: room.scores[playerRole],
            respawnCoin,
        });
    });

    // listen for coin respawned even sent with the room id and coin
    // sends back a coin respawned event to clients that didnt send it
    // i assume coin is the coin object containing, id, color, x, y

    socket.on("coin-respawned", ({ roomId, coin }) => {
        socket.to(roomId).emit("coin-respawned", {
            coin,
        });
    });

    // listens for a pay debt event, expects data room name and role of player paying debt
    // get room from rooms map
    // set score and debts objects for creator and joiner in the room object, if not defined already
    // get current score and debt
    // check if player has a score and debt greater than zero
    // reduce score and debt by one each
    // get coin color to be paid as debt, based on role of player payihng debt
    // send a event called debt paid, with new score, debt, the coin color and coin id
    // coin id is being set randonly based on the timestamp, does this make any sense?
    // shouldnt i be accessing a coin from a list of pocketed coins?
    // if player does not have a score greater than zero, they cant pay debt,
    // so send an error event to client who initiated the connection

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

        if (currentScore > 0 && currentDebt > 0) {
            room.scores[playerRole] = currentScore - 1;
            room.debts[playerRole] = currentDebt - 1;

            const coinColor = playerRole === "creator" ? "white" : "black";

            io.to(roomName).emit("debtPaid", {
                roomName,
                playerRole,
                newScore: room.scores[playerRole],
                newDebt: room.debts[playerRole],
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
    // expect an event from client called queen reset
    // send event to client who is not the sender thats a queen reset,
    // with the room name and player role whose queen is being reset

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

    // listens for a cover turn update from a client, expecting the room name, player role,
    // and a bool indicating if it is the cover turn
    // then we send the same event to the all clients
    // this basically relays across the room that the player of specific role is in their cover turn
    // there has gotta be a sleeker way of doing this!?

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

    // listens for queen pocketed update,
    // expects room anem, player role who pocketed queen and bool indicating if queen was pocketed
    // emits the same event to all clients
    // note that there are cases when the bool is false, like when a player fails to cover queen

    socket.on("queenPocketedUpdate", ({ roomName, playerRole, hasPocketedQueen }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        io.to(roomName).emit("queenPocketedUpdate", {
            roomName,
            playerRole,
            hasPocketedQueen,
        });
    });

    // listen for a quieen covered event from a client
    // expects room name, player role who covered queen, and bool indicating if they did
    // send the same event to all clients in the room, with the same data
    
    socket.on("queenCoveredUpdate", ({ roomName, playerRole, hasCoveredQueen }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        io.to(roomName).emit("queenCoveredUpdate", {
            roomName,
            playerRole,
            hasCoveredQueen,
        });
    });

    // listen for a game reset event sent by one of the clients
    // expect room name and reason as data
    // get room from rooms map
    // set whose turn to creator
    // set debts to zero
    // send a game reset event to all clients in room
    // send a room update with the updated room object as data 
    // feels like a weird way to reset game!
    // i feel like server should receive a game state update from clients,
    // judge if it should be reset, and reset accordingly

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

    // listen for striker slider update
    // expect the room name, player role who is sliding,
    // the value of the slider, and x position of the slider
    // send an event to other client in room except sender
    // with the same data, this is used to sync striker slider position
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

    // listen for a striker flicked event and send it to other clients that are not the sender
    // flick is an object that contains start x, y of striker
    // and velocity x, y components of the flick after user drags and releases
    socket.on("strikerFlicked", ({ roomName, playerRole, flick }) => {
        socket.to(roomName).emit("strikerFlicked", { playerRole, flick });
    });

    // listen for a movement stopped event, expecting data room name, 
    // player role of player whose turn it was while movemnt stopped
    // and the striker's position when it did stop
    // relay this event and data to tother client who is not sender
    socket.on("movementStopped", ({ roomName, playerRole, strikerPosition }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        socket.to(roomName).emit("movementStopped", { 
            roomName, 
            playerRole,
            strikerPosition 
        });
    });

    // listen for another event called movement stop confirmed
    // expect data room name, player role, and striker position
    // this is sent by the inacitve player to confirm that the movement has indeed stopped
    // send this to the other client, theres gotta be a sleeker way to do this! maybe

    socket.on("movementStopConfirmed", ({ roomName, playerRole, strikerPosition }) => {
        if (!rooms.has(roomName)) {
            socket.emit("error", "Room does not exist");
            return;
        }

        socket.to(roomName).emit("movementStopConfirmed", { 
            roomName, 
            playerRole,
            strikerPosition 
        });
    });

    // handle turn switching with movement stop sync

    // socket.on("switchTurn", ({ roomName }) => {
    //     if (!rooms.has(roomName)) {
    //         socket.emit("error", "Room does not exist");
    //         return;
    //     }

    //     const room = rooms.get(roomName);
        
    //     // Toggle turn
    //     const prevTurn = room.whoseTurn;
    //     room.whoseTurn = prevTurn === "creator" ? "joiner" : "creator";

    //     // Broadcast turn switch to all clients
    //     io.to(roomName).emit("turnSwitched", {
    //         roomName,
    //         prevTurn,
    //         nextTurn: room.whoseTurn
    //     });

    //     // Update room state
    //     io.to(roomName).emit("roomUpdate", {
    //         roomName,
    //         creator: { username: room.creator.username },
    //         joiner: room.joiner ? { username: room.joiner.username } : null,
    //         whoseTurn: room.whoseTurn,
    //     });
    // });

    // handle turn continuation with movement stop sync

    // socket.on("continueTurn", ({ roomName, continueWith, continuedTurns }) => {
    //     if (!rooms.has(roomName)) {
    //         socket.emit("error", "Room does not exist");
    //         return;
    //     }

    //     io.to(roomName).emit("turnContinued", {
    //         roomName,
    //         continueWith,
    //         continuedTurns
    //     });
    // });
});

// start server

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
