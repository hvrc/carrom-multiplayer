import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

// express server that handles the http requests
// socket.io server that handles the socket connections
// port can be process.env.PORT
// rooms is a map that stores the rooms and their players
// lastHeartbeat track last heartbeat time per clientId
// heartbeatTimeout is the time in ms that a client has to send a heartbeat
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// rooms

const PORT = 3000;
const rooms = new Map();
const lastHeartbeat = new Map();
const heartbeatTimeout = 10 * 1000;

// initialize room structure
function createRoom(roomName, creator) {
    return {
        creator,
        joiner: null,
        clientIds: new Set([creator.clientId]),
        whoseTurn: 'creator',
        debts: {
            creator: 0,
            joiner: 0
        }
    };
}

// deletes empty rooms
function cleanupEmptyRooms() {
    for (const [roomName, room] of rooms.entries()) {
        const roomSockets = io.sockets.adapter.rooms.get(roomName);
        if (!roomSockets || roomSockets.size === 0) {
            rooms.delete(roomName);
        }
    }
}

// route to show list of active rooms
app.get('/', (req, res) => {
    let html = '';
    if (rooms.size === 0) {
        html += '<p>No rooms currently active.</p>';
    } else {
        html += '<ul>';
        for (const [roomName, room] of rooms.entries()) {
            html += `<li>${roomName} - Creator: ${room.creator?.username || 'N/A'}${room.joiner ? ', Joiner: ' + room.joiner.username : ''}</li>`;
        }
        html += '</ul>';
    }
    res.send(html);
});

// remove clients that haven't sent a heartbeat
setInterval(() => {
    const now = Date.now();
    lastHeartbeat.forEach((lastTime, clientId) => {
        if (now - lastTime > heartbeatTimeout) {
            rooms.forEach((room, roomName) => {
                if (room.creator && room.creator.clientId === clientId) {
                    if (room.joiner) {
                        room.creator = { username: room.joiner.username, clientId: room.joiner.clientId };
                        room.joiner = null;
                        room.clientIds.delete(clientId);
                        io.to(roomName).emit('roomUpdate', {
                            roomName,
                            creator: { username: room.creator.username },
                            joiner: null
                        });
                    } else {
                        rooms.delete(roomName);
                        io.to(roomName).emit('roomClosed', 'Creator has left the room');
                    }
                } else if (room.joiner && room.joiner.clientId === clientId) {
                    room.joiner = null;
                    room.clientIds.delete(clientId);
                    io.to(roomName).emit('roomUpdate', {
                        roomName,
                        creator: { username: room.creator.username },
                        joiner: null
                    });
                }
            });
            lastHeartbeat.delete(clientId);
        }
    });
}, 5000);

// listens for new client connections and handles their interactions
io.on('connection', (socket) => {

    // clientId ?
    const clientId = socket.handshake.query.clientId;

    // if clientId is not valid, emit error and disconnect
    if (!clientId || clientId === 'null' || clientId === 'undefined') {
        socket.emit('error', 'Invalid client ID');
        socket.disconnect();
        return;
    }

    // initialize heartbeat and track last heartbeat time
    lastHeartbeat.set(clientId, Date.now());
    socket.on('heartbeat', ({ clientId: incomingClientId }) => {
        if (incomingClientId === clientId) {
            lastHeartbeat.set(clientId, Date.now());
        }
    });

    // check if client can access the room
    // check if room is full
    // check if room does not exist
    // check if clientId is invalid
    // check if clientId is valid, join the room and emit access granted
    socket.on('checkRoomAccess', ({ roomName, clientId: incomingClientId }) => {
        if (!incomingClientId || incomingClientId === 'null' || incomingClientId === 'undefined') {
            socket.emit('error', 'Invalid client ID');
            return;
        }
        if (!rooms.has(roomName)) {
            socket.emit('error', 'Room does not exist');
            return;
        }
        const room = rooms.get(roomName);
        if (room.clientIds.size >= 2 && !room.clientIds.has(incomingClientId)) {
            socket.emit('error', 'Room is full');
            return;
        }
        socket.join(roomName);
        socket.emit('accessGranted');
    });

    // handle client rejoining after refresh
    // check if clientId is valid
    // check if room exists
    // check if clientId is the creator or joiner
    // if yes, join the room and emit access granted
    socket.on('rejoinRoom', ({ roomName, username, clientId: incomingClientId, playerRole }) => {
        if (!incomingClientId || incomingClientId === 'null' || incomingClientId === 'undefined') {
            socket.emit('error', 'Invalid client ID');
            return;
        }
        if (!rooms.has(roomName)) {
            socket.emit('error', 'Room does not exist');
            return;
        }
        const room = rooms.get(roomName);
        if (playerRole === 'creator' && room.creator && room.creator.clientId === incomingClientId) {
            socket.join(roomName);
            socket.emit('accessGranted');
        } else if (playerRole === 'joiner' && room.joiner && room.joiner.clientId === incomingClientId) {
            socket.join(roomName);
            socket.emit('accessGranted');
        } else {
            socket.emit('error', 'Invalid session or role');
        }
    });

    // check if clientId is valid
    // check if roomName is valid
    // check if room already exists
    // create room, join room, emit player joined, emit room update
    socket.on('createRoom', ({ roomName, username, clientId: incomingClientId }) => {
        if (!incomingClientId || incomingClientId === 'null' || incomingClientId === 'undefined') {
            socket.emit('error', 'Invalid client ID');
            return;
        }
        if (rooms.has(roomName)) {
            socket.emit('error', 'Room already exists');
            return;
        }
        rooms.set(roomName, {
            creator: { username, clientId: incomingClientId },
            joiner: null,
            clientIds: new Set([incomingClientId]),
            whoseTurn: 'creator'
        });

        socket.join(roomName);
        socket.emit('playerJoined', { username, roomName });
        socket.emit('roomUpdate', {
            roomName,
            creator: { username },
            joiner: null,
            whoseTurn: 'creator'
        });
    });

    // check if clientId is valid
    // check if room exists
    // check if room is full, two unique client ids
    // create a joiner object, have it join the room
    // emit player joined, emit room update
    socket.on('joinRoom', ({ roomName, username, clientId: incomingClientId }) => {
        if (!incomingClientId || incomingClientId === 'null' || incomingClientId === 'undefined') {
            socket.emit('error', 'Invalid client ID');
            return;
        }
        if (!rooms.has(roomName)) {
            socket.emit('error', 'Room does not exist');
            return;
        }
        const room = rooms.get(roomName);
        if (room.clientIds.has(incomingClientId)) {
            socket.emit('error', 'Client already in room');
            return;
        }
        if (room.clientIds.size >= 2) {
            socket.emit('error', 'Room is full');
            return;
        }
        if (room.joiner) {
            socket.emit('error', 'Room is full');
            return;
        }

        room.joiner = { username, clientId: incomingClientId };
        room.clientIds.add(incomingClientId);
        socket.join(roomName);
        socket.emit('playerJoined', { username, roomName });
        io.to(roomName).emit('roomUpdate', {
            roomName,
            creator: { username: room.creator.username },
            joiner: { username },
            whoseTurn: room.whoseTurn
        });
    });

    // asks for room data
    socket.on('requestRoomData', ({ roomName }) => {
        if (rooms.has(roomName)) {
            const room = rooms.get(roomName);

            socket.emit('roomUpdate', {
                roomName,
                creator: room.creator ? { username: room.creator.username } : null,
                joiner: room.joiner ? { username: room.joiner.username } : null,
                whoseTurn: room.whoseTurn
            });

        } else {
            socket.emit('error', 'Room does not exist');
        }
    });

    // handle switching turns

    socket.on('switchTurn', ({ roomName, clientId: incomingClientId }) => {
        if (!rooms.has(roomName)) {
            socket.emit('error', 'Room does not exist');
            return;
        }

        const room = rooms.get(roomName);

        if (room.clientIds.size < 2) {
            socket.emit('error', 'Waiting for another player');
            return;
        }

        // toggle turn
        room.whoseTurn = room.whoseTurn === 'creator' ? 'joiner' : 'creator';

        // broadcast updated room state
        io.to(roomName).emit('roomUpdate', {
            roomName,
            creator: { username: room.creator.username },
            joiner: room.joiner ? { username: room.joiner.username } : null,
            whoseTurn: room.whoseTurn
        });

        // Emit explicit turnSwitched event for striker reset
        io.to(roomName).emit('turnSwitched', {
            roomName,
            nextTurn: room.whoseTurn
        });
    });

    // handle continuing turn

    socket.on('continueTurn', ({ roomName, continuedTurns }) => {
        if (!rooms.has(roomName)) {
            socket.emit('error', 'Room does not exist');
            return;
        }

        const room = rooms.get(roomName);
        if (room.clientIds.size < 2) {
            socket.emit('error', 'Waiting for another player');
            return;
        }
        
        // keep the same turn but update the continued turns count
        // include remaining turns in room update
        io.to(roomName).emit('roomUpdate', {
            roomName,
            creator: { username: room.creator.username },
            joiner: room.joiner ? { username: room.joiner.username } : null,
            whoseTurn: room.whoseTurn,
            continuedTurns 
        });
        
        // emit turnContinued event for striker reset
        io.to(roomName).emit('turnContinued', {
            roomName,
            continueWith: room.whoseTurn,
            continuedTurns
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
    socket.on('leaveRoom', ({ roomName, clientId: incomingClientId }) => {
        if (!incomingClientId || incomingClientId === 'null' || incomingClientId === 'undefined') {
            socket.emit('error', 'Invalid client ID');
            return;
        }

        if (rooms.has(roomName)) {
            const room = rooms.get(roomName);
            if (room.creator && room.creator.clientId === incomingClientId) {
                if (room.joiner) {

                    // promote joiner to creator
                    room.creator = { username: room.joiner.username, clientId: room.joiner.clientId };
                    room.joiner = null;
                    room.clientIds.delete(incomingClientId);
                    room.whoseTurn = 'creator'
                    io.to(roomName).emit('roomUpdate', {
                        roomName,
                        creator: { username: room.creator.username },
                        joiner: null,
                        whoseTurn: room.whoseTurn
                    });

                } else {
                    rooms.delete(roomName);
                    io.to(roomName).emit('roomClosed', 'Creator has left the room');
                }

            } else if (room.joiner && room.joiner.clientId === incomingClientId) {
                room.joiner = null;
                room.clientIds.delete(incomingClientId);
                io.to(roomName).emit('roomUpdate', {
                    roomName,
                    creator: { username: room.creator.username },
                    joiner: null,
                    whoseTurn: room.whoseTurn
                    });
                }
                lastHeartbeat.delete(incomingClientId);
                cleanupEmptyRooms();
            }
        });

        // handle client disconnection, no immediate action, rely on heartbeat
        socket.on('disconnect', () => {
            cleanupEmptyRooms();
        });

        // coin and striker movement

        // handle striker movement sync
        socket.on('strikerMove', (data) => {
            socket.to(data.roomName).emit('strikerMove', data);
        });

        // handle striker animation sync
        socket.on('strikerAnimation', (data) => {
            socket.to(data.roomName).emit('strikerAnimation', data);
        });

        // handle coin movement sync
        socket.on('coinsMove', (data) => {
            socket.to(data.roomName).emit('coinsMove', data);
        });

        // handle coin pocketing sync
        socket.on('coinsPocketed', (data) => {
            socket.to(data.roomName).emit('coinsPocketed', data);
        });

        // scoring and debt
        
        // handle striker pocketing and debt increment
        socket.on('strikerPocketed', (data) => {
            const { roomName, playerRole, debt } = data;
            if (!rooms.has(roomName)) return;

            const room = rooms.get(roomName);
            if (!room.debts) {
                room.debts = { creator: 0, joiner: 0 };
            }

            // increment debt for the player who pocketed their striker
            room.debts[playerRole] = debt;

            // emit debt update to all players in the room
            io.to(roomName).emit('debtUpdate', {
                roomName,
                playerRole,
                debt
            });
        });

        // handle score updates when coins are pocketed
        socket.on('updateScore', (data) => {
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
            const playerColor = playerRole === 'creator' ? 'white' : 'black';
            if (coinColor === playerColor) {
                const currentDebt = room.debts[playerRole] || 0;
                const currentScore = room.scores[playerRole] || 0;
                console.log(`Player ${playerRole} pocketed their own ${coinColor} coin. Current debt: ${currentDebt}`);
                
                // if player has debt > 0 and pockets their own color coin
                if (currentDebt > 0) {
                    // decrement debt by 1
                    room.debts[playerRole] = currentDebt - 1;
                    
                    // DON'T change the score - it stays the same due to debt payment
                    // room.scores[playerRole] remains unchanged
                    
                    console.log(`Player ${playerRole} debt reduced from ${currentDebt} to ${room.debts[playerRole]} and coin will be returned to center`);
                    
                    // emit debt update immediately
                    io.to(roomName).emit('debtUpdate', {
                        roomName,
                        playerRole,
                        debt: room.debts[playerRole]
                    });
                    
                    // delay the coin addition until after animation completes (2 seconds)
                    setTimeout(() => {
                        io.to(roomName).emit('debtPaid', {
                            roomName,
                            playerRole,
                            newScore: room.scores[playerRole],
                            newDebt: room.debts[playerRole],
                            coinColor: playerColor,
                            coinId: Date.now() + Math.random()
                        });
                    }, 2000);
                } else {
                    // no debt, increment score normally
                    const scoreChange = increment !== undefined ? increment : 1;
                    room.scores[playerRole] = currentScore + scoreChange;
                }
                
                // emit score update to sync scores
                io.to(roomName).emit('scoreUpdate', {
                    roomName: roomName,
                    scores: room.scores
                });
                
                // emit room update to sync everything in UI
                io.to(roomName).emit('roomUpdate', {
                    roomName,
                    creator: { 
                        username: room.creator.username,
                        debt: room.debts.creator,
                        score: room.scores.creator
                    },
                    joiner: room.joiner ? { 
                        username: room.joiner.username,
                        debt: room.debts.joiner,
                        score: room.scores.joiner
                    } : null,
                    whoseTurn: room.whoseTurn,
                    debts: room.debts,
                    scores: room.scores
                });
                
                // early return to avoid double processing
                return;
            }
            
            // normal scoring logic for all other cases (opponent's coins, queen, etc.)
            const scoreChange = increment !== undefined ? increment : 1;
            room.scores[playerRole] = (room.scores[playerRole] || 0) + scoreChange;
            
            // emit score update to all players in the room
            io.to(roomName).emit('scoreUpdate', {
                roomName: roomName,
                scores: room.scores
            });
        });
        
        socket.on('updateDebt', ({ roomName, playerRole, debt }) => {
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
                const coinColor = playerRole === 'creator' ? 'white' : 'black';

                // broadcast debt payment to all players in room
                // keep existing debt
                // generate a unique ID for the new coin
                io.to(roomName).emit('debtPaid', {
                    roomName,
                    playerRole,
                    newScore: room.scores[playerRole],
                    newDebt: room.debts[playerRole], 
                    coinColor,
                    coinId: Date.now() + Math.random()
                });

                // also broadcast score update
                io.to(roomName).emit('scoreUpdate', {
                    roomName: roomName,
                    scores: room.scores
                });

            } else {

                // if can't pay debt, increment debt as before
                room.debts[playerRole]++;

                // broadcast updated room state including debts
                io.to(roomName).emit('roomUpdate', {
                    roomName,
                    creator: { 
                        username: room.creator.username,
                        debt: room.debts.creator 
                    },
                    joiner: room.joiner ? { 
                        username: room.joiner.username,
                        debt: room.debts.joiner 
                    } : null,
                    whoseTurn: room.whoseTurn,
                    debts: room.debts  
                });
            }
        });

        // handle striker pocketed event
        socket.on('striker-pocketed', ({ roomName, playerRole, scoreChange, respawnCoin }) => {
            if (!rooms.has(roomName)) return;
            const room = rooms.get(roomName);
            
            // update score
            if (!room.scores) {
                room.scores = { creator: 0, joiner: 0 };
            }

            room.scores[playerRole] += scoreChange;

            // broadcast score update and coin respawn in one event
            io.to(roomName).emit('striker-penalty', {
                roomName,
                playerRole,
                newScore: room.scores[playerRole],
                respawnCoin
            });
        });

        // handle coin respawn event
        // broadcast new coin position to other players
        socket.on('coin-respawned', ({ roomId, coin }) => {
            socket.to(roomId).emit('coin-respawned', {
                coin
            });
        });

        // handle debt payment, when player has both score > 0 and debt > 0
        socket.on('payDebt', ({ roomName, playerRole }) => {
            if (!rooms.has(roomName)) {
                socket.emit('error', 'Room does not exist');
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
                const coinColor = playerRole === 'creator' ? 'white' : 'black';

                // broadcast debt payment to all players in room
                // generate a unique ID for the new coin
                io.to(roomName).emit('debtPaid', {
                    roomName,
                    playerRole,
                    newScore: room.scores[playerRole],
                    newDebt: room.debts[playerRole],
                    coinColor,
                    coinId: Date.now() + Math.random()
                });
            } else {
                socket.emit('error', 'Cannot pay debt: insufficient score or no debt to pay');
            }
        });
        
        // handle queen reset event, when queen needs to be returned to center
        // broadcast queen reset to all players in the room
        socket.on('queenReset', ({ roomName, playerRole }) => {
            if (!rooms.has(roomName)) {
                socket.emit('error', 'Room does not exist');
                return;
            }
            
            io.to(roomName).emit('queenReset', {
                roomName,
                playerRole
            });
        });

        // handle cover turn state updates
        // broadcast cover turn state to all players in the room
        socket.on('coverTurnUpdate', ({ roomName, playerRole, isCoverTurn }) => {
            if (!rooms.has(roomName)) {
                socket.emit('error', 'Room does not exist');
                return;
            }

            io.to(roomName).emit('coverTurnUpdate', {
                roomName,
                playerRole,
                isCoverTurn
            });
        });

        // handle queen pocketed state updates
        // broadcast queen pocketed state to all players in the room
        socket.on('queenPocketedUpdate', ({ roomName, playerRole, hasPocketedQueen }) => {
            if (!rooms.has(roomName)) {
                socket.emit('error', 'Room does not exist');
                return;
            }

            io.to(roomName).emit('queenPocketedUpdate', {
                roomName,
                playerRole,
                hasPocketedQueen
            });
        });

        // handle queen covered state updates
        // broadcast queen covered state to all players in the room
        socket.on('queenCoveredUpdate', ({ roomName, playerRole, hasCoveredQueen }) => {
            if (!rooms.has(roomName)) {
                socket.emit('error', 'Room does not exist');
                return;
            }

            io.to(roomName).emit('queenCoveredUpdate', {
                roomName,
                playerRole,
                hasCoveredQueen
            });
        });

        // handle game reset events
        // reset room state to initial state
        // always reset to creator's turn
        // broadcast game reset to all players in the room
        // broadcast room update to sync turn state and ensure UI updates
        socket.on('gameReset', ({ roomName, reason }) => {
            if (!rooms.has(roomName)) {
                socket.emit('error', 'Room does not exist');
                return;
            }

            const room = rooms.get(roomName);
            room.whoseTurn = 'creator'; 
            room.debts = {
                creator: 0,
                joiner: 0
            };

            io.to(roomName).emit('gameReset', {
                roomName,
                reason
            });

            io.to(roomName).emit('roomUpdate', room);
        });
    });

// start server
httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});