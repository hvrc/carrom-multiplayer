import { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import socket from "./socket.js";
import Manager from "./Manager.js";
import Board from "./Board.jsx";

// information table

function GameInfoTable({ roomName, creator, joiner, manager }) {
    const creatorData = manager.getPlayerData("creator");
    const joinerData = manager.getPlayerData("joiner");
    const joinerWaiting = !joiner;

    const players = [
        {
            name: creator?.username || "Waiting...",
            ...creatorData,
        },
        {
            name: joiner?.username || "Waiting for joiner...",
            ...joinerData,
        },
    ];

    return (
        <div>
            <div>Room Name: {roomName}</div> <br />
            <table
                border="1"
                cellPadding="6"
                style={{ borderCollapse: "collapse", minWidth: 400 }}
            >
                <thead>
                    <tr>
                        <th>Player</th>
                        <th>Role</th>
                        <th>Color</th>
                        <th>Score</th>
                        <th>Debt</th>
                        <th>Is Turn</th>
                        <th>Is Cover Turn</th>
                        <th>Has Pocketed Queen</th>
                        <th>Has Covered Queen</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>{players[0].name}</td>
                        <td>{players[0].role}</td>
                        <td>{players[0].color}</td>
                        <td>{players[0].score}</td>
                        <td>{players[0].debt}</td>
                        <td>{players[0].isTurn ? "Yes" : "No"}</td>
                        <td>{players[0].isCoverTurn ? "Yes" : "No"}</td>
                        <td>{players[0].hasPocketedQueen ? "Yes" : "No"}</td>
                        <td>{players[0].hasCoveredQueen ? "Yes" : "No"}</td>
                    </tr>
                    <tr>
                        <td>
                            {joinerWaiting ? (
                                <span>Waiting for joiner...</span>
                            ) : (
                                players[1].name
                            )}
                        </td>
                        <td>{players[1].role}</td>
                        <td>{players[1].color}</td>
                        <td>{players[1].score}</td>
                        <td>{players[1].debt}</td>
                        <td>{players[1].isTurn ? "Yes" : "No"}</td>
                        <td>{players[1].isCoverTurn ? "Yes" : "No"}</td>
                        <td>{players[1].hasPocketedQueen ? "Yes" : "No"}</td>
                        <td>{players[1].hasCoveredQueen ? "Yes" : "No"}</td>
                    </tr>
                </tbody>
            </table>
        </div>
    );
}

export default function Room() {
    // i dont know why these room functions are here or how to categorize them
    // are they required for the game info table?

    const { roomName } = useParams();
    const navigate = useNavigate();
    const [roomData, setRoomData] = useState(null);

    // force table re render
    const [tableRefresh, setTableRefresh] = useState(0);
    const managerRef = useRef(null);

    // ?
    useEffect(() => {
        if (
            roomData?.creator &&
            roomData?.joiner &&
            (!managerRef.current || managerRef.current.roomName !== roomName)
        ) {
            managerRef.current = new Manager(roomName, roomData);
        }
    }, [roomData, roomName]);

    // ?
    useEffect(() => {
        if (!socket.connected) {
            socket.connect();
        }
        const clientId = sessionStorage.getItem("clientId");
        const storedRoomName = localStorage.getItem("roomName");
        const username = localStorage.getItem("username");
        const playerRole = localStorage.getItem("playerRole");

        if (!clientId) {
            localStorage.clear();
            navigate("/");
            return;
        }

        // update manager when room data changes
        // const handleRoomUpdate = (data) => {
        //     if (data.roomName === roomName && managerRef.current) {

        //         // update debts in manager if present
        //         if (data.debts) {
        //             managerRef.current.playerData[0].debt = data.debts.creator;
        //             managerRef.current.playerData[1].debt = data.debts.joiner;
        //         }

        //         // update roomData to reflect new debts
        //         setRoomData(prev => ({
        //             ...prev,
        //             creator: {
        //                 ...prev.creator,
        //                 debt: data.debts ? data.debts.creator : prev.creator.debt
        //             },
        //             joiner: prev.joiner ? {
        //                 ...prev.joiner,
        //                 debt: data.debts ? data.debts.joiner : prev.joiner.debt
        //             } : null
        //         }));
        //     }
        // };

        if (storedRoomName === roomName && username && playerRole) {
            socket.emit("rejoinRoom", {
                roomName,
                username,
                clientId,
                playerRole,
            });
        } else {
            socket.emit("checkRoomAccess", { roomName, clientId });
        }

        socket.on("accessGranted", () => {
            socket.emit("requestRoomData", { roomName });
        });

        // what is this room update function doing?

        // ensure roomData is set on initial fetch
        socket.on("roomUpdate", (data) => {
            if (data.roomName === roomName) {
                setRoomData(data);

                // always update manager/playerData for debt/score changes
                if (managerRef.current) {
                    if (data.debts) {
                        managerRef.current.playerData[0].debt =
                            data.debts.creator;
                        managerRef.current.playerData[1].debt =
                            data.debts.joiner;
                    }
                    if (
                        data.creator &&
                        typeof data.creator.score !== "undefined"
                    ) {
                        managerRef.current.playerData[0].score =
                            data.creator.score;
                    }
                    if (
                        data.joiner &&
                        typeof data.joiner.score !== "undefined"
                    ) {
                        managerRef.current.playerData[1].score =
                            data.joiner.score;
                    }
                } else {
                    // if manager is not yet initialized, initialize it with the latest data
                    managerRef.current = new Manager(roomName, data);
                }
            }
        });

        socket.on("roomClosed", () => {
            localStorage.clear();
            navigate("/");
        });

        socket.on("error", (msg) => {
            localStorage.clear();
            navigate("/");
        });

        return () => {
            socket.off("accessGranted");
            socket.off("roomClosed");
            socket.off("error");
        };
    }, [roomName, navigate]);

    // whats the difference between
    // handleDebtScoreUpdate, handleScoreUpdate,
    // handleDebtUpdate, handleDebtPaid?

    // listen for debt, score updates from server

    useEffect(() => {
        if (!socket || !roomName) return;
        const handleDebtScoreUpdate = (data) => {
            if (data.roomName === roomName && managerRef.current) {
                // update local manager state
                const gm = managerRef.current;
                ["creator", "joiner"].forEach((role) => {
                    const p = gm.getPlayerData(role);
                    if (p) {
                        p.debt = data.debt[role];
                        p.score = data.score[role];
                    }
                });

                // force re-render
                setRoomData((rd) => ({ ...rd }));
            }
        };
        socket.on("debtScoreUpdate", handleDebtScoreUpdate);
        return () => {
            socket.off("debtScoreUpdate", handleDebtScoreUpdate);
        };
    }, [roomName, socket]);

    // listen for score updates from server
    useEffect(() => {
        if (!socket || !roomName) return;
        const handleScoreUpdate = (data) => {
            if (!managerRef.current || data.roomName !== roomName) return;

            const { scores } = data;

            // update both players' scores
            managerRef.current.updateScore("creator", scores.creator);
            managerRef.current.updateScore("joiner", scores.joiner);

            // update roomData to reflect the new scores
            setRoomData((prev) => ({
                ...prev,
                creator: {
                    ...prev.creator,
                    score: scores.creator,
                },
                joiner: {
                    ...prev.joiner,
                    score: scores.joiner,
                },
            }));
        };

        socket.on("scoreUpdate", handleScoreUpdate);

        return () => {
            socket.off("scoreUpdate");
        };
    }, [roomName, socket]);

    // listen for debt updates from server
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleDebtUpdate = (data) => {
            if (data.roomName !== roomName || !managerRef.current) return;

            // console.log(`Debt update received: Player ${data.playerRole} debt is now ${data.debt}`);

            // Update manager state
            managerRef.current.updateDebt(data.playerRole, data.debt);

            // Update roomData to reflect the new debt
            setRoomData((prev) => ({
                ...prev,
                [data.playerRole]: {
                    ...prev[data.playerRole],
                    debt: data.debt,
                },
            }));
        };

        socket.on("debtUpdate", handleDebtUpdate);

        return () => {
            socket.off("debtUpdate");
        };
    }, [roomName, socket]);

    // listen for debt payment events from server
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleDebtPaid = (data) => {
            if (data.roomName !== roomName || !managerRef.current) return;

            // update manager state
            managerRef.current.updateScore(data.playerRole, data.newScore);
            managerRef.current.updateDebt(data.playerRole, data.newDebt);

            // update roomData to reflect the changes
            setRoomData((prev) => ({
                ...prev,
                [data.playerRole]: {
                    ...prev[data.playerRole],
                    score: data.newScore,
                    debt: data.newDebt,
                },
            }));
        };

        socket.on("debtPaid", handleDebtPaid);

        return () => {
            socket.off("debtPaid");
        };
    }, [roomName, socket]);

    // listen for game reset events from server
    useEffect(() => {
        if (!socket || !roomName) return;

        const handleGameReset = (data) => {
            if (data.roomName !== roomName || !managerRef.current) return;

            // reset manager state
            managerRef.current.resetGame();

            // force update roomData to trigger table re-render
            // ensure turn is reset to creator
            setRoomData((prev) => ({
                ...prev,
                creator: {
                    ...prev.creator,
                    score: 0,
                    debt: 0,
                },
                joiner: {
                    ...prev.joiner,
                    score: 0,
                    debt: 0,
                },
                whoseTurn: "creator",
            }));

            // force table refresh
            setTableRefresh((prev) => prev + 1);
        };

        socket.on("gameReset", handleGameReset);

        return () => {
            socket.off("gameReset");
        };
    }, [roomName, socket]);    // handle leave room event
    const handleLeaveRoom = () => {
        const clientId = sessionStorage.getItem("clientId");
        if (!clientId) {
            localStorage.clear();
            navigate("/");
            return;
        }
        socket.emit("leaveRoom", { roomName, clientId });
        localStorage.clear();
        navigate("/");
    };

    if (!roomData) {
        return <div>Loading room...</div>;
    }

    // instantiate manager, if not already, after roomData is loaded
    if (!managerRef.current) {
        managerRef.current = new Manager(roomName, roomData);
    }
    const manager = managerRef.current;
    const currentUsername = localStorage.getItem("username");
    const playerRole = localStorage.getItem("playerRole");
    const isMyTurn = roomData.whoseTurn === playerRole;    return (
        <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            justifyContent: 'center', 
            minHeight: '100vh',
            padding: '20px'
        }}>
            <Board
                isMyTurn={isMyTurn}
                socket={socket}
                roomName={roomName}
                playerRole={playerRole}
                manager={manager}
                onLeaveRoom={handleLeaveRoom}
            />
            {/* <GameInfoTable
                key={tableRefresh}
                roomName={roomName}
                creator={roomData.creator}
                joiner={roomData.joiner}
                manager={manager}
                roomData={roomData}
            /> */}
        </div>
    );
}
