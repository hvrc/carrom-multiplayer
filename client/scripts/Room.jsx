import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from './socket.js';
import GameManager from './GameManager.js';
import Board from './Board.jsx';

function GameInfoTable({ roomName, creator, joiner, gameManager }) {
    const creatorData = gameManager.getPlayerData('creator');
    const joinerData = gameManager.getPlayerData('joiner');
    const joinerWaiting = !joiner;

    const players = [
        {
            name: creator?.username || 'Waiting...',
            ...creatorData
        },
        {
            name: joiner?.username || 'Waiting for joiner...',
            ...joinerData
        }
    ];
    
    return (
        <div>
            <div>Room Name: {roomName}</div> <br/>
            <table border="1" cellPadding="6" style={{borderCollapse: 'collapse', minWidth: 400}}>
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>Role</th>
                        <th>Color</th>
                        <th>Score</th>
                        <th>Debt</th>
                        <th>Is Turn</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>{players[0].name}</td>
                        <td>{players[0].role}</td>
                        <td>{players[0].color}</td>
                        <td>{players[0].score}</td>
                        <td>{players[0].debt}</td>
                        <td>{players[0].isTurn ? 'Yes' : 'No'}</td>
                    </tr>
                    <tr>
                        <td>{joinerWaiting ? <span>Waiting for joiner...</span> : players[1].name}</td>
                        <td>{players[1].role}</td>
                        <td>{players[1].color}</td>
                        <td>{players[1].score}</td>
                        <td>{players[1].debt}</td>
                        <td>{players[1].isTurn ? 'Yes' : 'No'}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

export default function Room() {
    const { roomName } = useParams();
    const navigate = useNavigate();
    const [roomData, setRoomData] = useState(null);
    const gameManagerRef = useRef(null);

    // ?
    useEffect(() => {
        if (
            roomData?.creator && 
            roomData?.joiner && 
            (!gameManagerRef.current || gameManagerRef.current.roomName !== roomName)
        ) {
            gameManagerRef.current = new GameManager(roomName, roomData);
        }
    }, [roomData, roomName]);

    // ?
    useEffect(() => {
        if (!socket.connected) { socket.connect(); }
        const clientId = sessionStorage.getItem('clientId');
        const storedRoomName = localStorage.getItem('roomName');
        const username = localStorage.getItem('username');
        const playerRole = localStorage.getItem('playerRole');

        if (!clientId) {
            localStorage.clear();
            navigate('/');
            return;
        }

        // update GameManager when room data changes
        const handleRoomUpdate = (data) => {
            if (data.roomName === roomName && gameManagerRef.current) {
                // Update debts in GameManager if present
                if (data.debts) {
                    gameManagerRef.current.playerData[0].debt = data.debts.creator;
                    gameManagerRef.current.playerData[1].debt = data.debts.joiner;
                }
                // Update roomData to reflect new debts
                setRoomData(prev => ({
                    ...prev,
                    creator: {
                        ...prev.creator,
                        debt: data.debts ? data.debts.creator : prev.creator.debt
                    },
                    joiner: prev.joiner ? {
                        ...prev.joiner,
                        debt: data.debts ? data.debts.joiner : prev.joiner.debt
                    } : null
                }));
            }
        };
        
        if (storedRoomName === roomName && username && playerRole) {
            socket.emit('rejoinRoom', { roomName, username, clientId, playerRole });
        } else {
            socket.emit('checkRoomAccess', { roomName, clientId });
        }

        socket.on('accessGranted', () => {
            socket.emit('requestRoomData', { roomName });
        });

        // Ensure roomData is set on initial fetch
        socket.on('roomUpdate', (data) => {
            if (data.roomName === roomName) {
                setRoomData(data);
                // Always update GameManager/playerData for debt/score changes
                if (gameManagerRef.current) {
                    if (data.debts) {
                        gameManagerRef.current.playerData[0].debt = data.debts.creator;
                        gameManagerRef.current.playerData[1].debt = data.debts.joiner;
                    }
                    if (data.creator && typeof data.creator.score !== 'undefined') {
                        gameManagerRef.current.playerData[0].score = data.creator.score;
                    }
                    if (data.joiner && typeof data.joiner.score !== 'undefined') {
                        gameManagerRef.current.playerData[1].score = data.joiner.score;
                    }
                } else {
                    // If GameManager is not yet initialized, initialize it with the latest data
                    gameManagerRef.current = new GameManager(roomName, data);
                }
            }
        });

        socket.on('roomClosed', () => {
            localStorage.clear();
            navigate('/');
        });

        socket.on('error', (msg) => {
            localStorage.clear();
            navigate('/');
        });

        return () => {
            socket.off('accessGranted');
            socket.off('roomClosed');
            socket.off('error');
        };
    }, [roomName, navigate]);

    // listen for debt/score updates from server
    useEffect(() => {
        if (!socket || !roomName) return;
        const handleDebtScoreUpdate = (data) => {
            if (data.roomName === roomName && gameManagerRef.current) {
                // Update local GameManager state
                const gm = gameManagerRef.current;
                ['creator', 'joiner'].forEach(role => {
                    const p = gm.getPlayerData(role);
                    if (p) {
                        p.debt = data.debt[role];
                        p.score = data.score[role];
                    }
                });
                setRoomData(rd => ({ ...rd })); // force re-render
            }
        };
        socket.on('debtScoreUpdate', handleDebtScoreUpdate);
        return () => {
            socket.off('debtScoreUpdate', handleDebtScoreUpdate);
        };
    }, [roomName, socket]);

    // listen for score updates from server
    useEffect(() => {
        if (!socket || !roomName) return;
          const handleScoreUpdate = (data) => {
            if (!gameManagerRef.current || data.roomName !== roomName) return;
            
            const { scores } = data;
            // Update both players' scores
            gameManagerRef.current.updateScore('creator', scores.creator);
            gameManagerRef.current.updateScore('joiner', scores.joiner);
            
            // Update roomData to reflect the new scores
            setRoomData(prev => ({
                ...prev,
                creator: {
                    ...prev.creator,
                    score: scores.creator
                },
                joiner: {
                    ...prev.joiner,
                    score: scores.joiner
                }
            }));
        };

        socket.on('scoreUpdate', handleScoreUpdate);
        
        return () => {
            socket.off('scoreUpdate');
        };
    }, [roomName, socket]);

    // listen for debt payment events from server
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleDebtPaid = (data) => {
            if (data.roomName !== roomName || !gameManagerRef.current) return;
            
            // Update GameManager state
            gameManagerRef.current.updateScore(data.playerRole, data.newScore);
            gameManagerRef.current.updateDebt(data.playerRole, data.newDebt);
            
            // Update roomData to reflect the changes
            setRoomData(prev => ({
                ...prev,
                [data.playerRole]: {
                    ...prev[data.playerRole],
                    score: data.newScore,
                    debt: data.newDebt
                }
            }));
        };

        socket.on('debtPaid', handleDebtPaid);
        
        return () => {
            socket.off('debtPaid');
        };
    }, [roomName, socket]);

    // handle leave room event
    const handleLeaveRoom = () => {
        const clientId = sessionStorage.getItem('clientId');
        if (!clientId) {
            localStorage.clear();
            navigate('/');
            return;
        }
        socket.emit('leaveRoom', { roomName, clientId });
        localStorage.clear();
        navigate('/');
    };    // emit switchTurn event to server
    const handleSwitchTurn = () => {
        const newTurn = gameManagerRef.current.switchTurn();
        socket.emit('switchTurn', {
            roomName,
            newTurn,
            clientId: sessionStorage.getItem('clientId')
        });
    };

    if (!roomData) { return <div>Loading room...</div>; }

    // instantiate GameManager, if not already, after roomData is loaded
    if (!gameManagerRef.current) { gameManagerRef.current = new GameManager(roomName, roomData); }    const gameManager = gameManagerRef.current;
    const currentUsername = localStorage.getItem('username');
    const playerRole = localStorage.getItem('playerRole');
    const isMyTurn = roomData.whoseTurn === playerRole;return (
        <div>
            <Board 
                isMyTurn={isMyTurn} 
                socket={socket} 
                roomName={roomName} 
                playerRole={playerRole}
                gameManager={gameManager}
            />
            <div>Window owner: {currentUsername}</div>
            <GameInfoTable 
                roomName={roomName} 
                creator={roomData.creator} 
                joiner={roomData.joiner} 
                gameManager={gameManager} 
                roomData={roomData}
            /> <br />
            {isMyTurn && <button onClick={handleSwitchTurn}>Switch Turn</button>} <br/> <br/>
            <button onClick={handleLeaveRoom}>Leave Room</button> <br/> <br/>
        </div>
    );
}