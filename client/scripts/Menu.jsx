import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import socket from "./socket.js";

export default function Menu() {
    // socket.io handling room creation and joining

    // state variables
    // navigate is used to navigate to the room
    // use effect checks for saved room, clears storage if none, and cleans up socket listeners on exit

    // array destructuring
    // use state ("") returns two things,
    // the current value, which starts as an empty string
    // a function to change that value    // Shared state for both join and create operations
    const [username, setUsername] = useState("");
    const [roomName, setRoomName] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    // use effect is a react hook
    // it runs when a component first loads or when it is about to be removed,
    // or when values in the square brackets change, its called the dependency array
    // since its empty, it runs only once when the component mounts

    // gets room name from what user inputs into the field, which is stored in locaal storage
    // if room name is null, the local storage is cleared
    // socket off means stop listeing for this message,
    // in this case we are asking the browser/client to stop listening to playerJoined events

    useEffect(() => {
        const roomName = localStorage.getItem("roomName");
        if (!roomName) { localStorage.clear();}
        return () => {
            // Clean up listeners when component unmounts
            socket.off("playerJoined");
            socket.off("error");
        };
    }, []);

    // handles the creation of a room
    // if either username or room name are false, sets an error asking user to enter both
    // username and room name are both strings, set when user types in the shared input fields
    // if socket is not connected, connects to the server
    // gets client id from the session storage
    // if there is no client id found, sets an error asking user to refresh page and retry
    // emits a createRoom event to the server, with room name, username and client id
    const handleCreateRoom = () => {
        if (!username || !roomName) {
            setError("Please enter a username and room name");
            return;
        }

        if (!socket.connected) {
            socket.connect();
        }

        const clientId = sessionStorage.getItem("clientId");

        if (!clientId) {
            setError("Refresh and retry");
            return;
        }

        // Clear any existing error
        setError("");

        // Clean up any existing listeners
        socket.off("playerJoined");
        socket.off("error");

        // Set up event listeners for this specific operation
        const handlePlayerJoined = (data) => {
            console.log("Creator received playerJoined event:", data);
            if (data.username === username && data.roomName === roomName) {
                localStorage.setItem("username", username);
                localStorage.setItem("roomName", roomName);
                localStorage.setItem("playerRole", "creator");
                
                // Clean up listeners
                socket.off("playerJoined", handlePlayerJoined);
                socket.off("error", handleError);
                
                console.log("Creator navigating to room:", roomName);
                navigate(`/${roomName}`);
            }
        };

        const handleError = (msg) => {
            console.log("Create room error:", msg);
            setError(msg);
            socket.off("playerJoined", handlePlayerJoined);
            socket.off("error", handleError);
        };

        socket.on("playerJoined", handlePlayerJoined);
        socket.on("error", handleError);

        console.log("Emitting createRoom event:", { roomName, username, clientId });
        socket.emit("createRoom", {
            roomName: roomName,
            username: username,
            clientId,
        });
    };

    // handles the joining of a room
    // if either username or room name are false, sets an error asking user to enter both
    // username and room name are both strings, set when user types in the shared input fields
    // if socket is not connected, connects to the server
    // gets client id from the session storage
    // if there is no client id found, sets an error asking user to refresh page and retry
    // emits a joinRoom event to the server, with room name, username and client id
    const handleJoinRoom = () => {
        if (!username || !roomName) {
            setError("Please enter a username and room name");
            return;
        }

        if (!socket.connected) {
            socket.connect();
        }

        const clientId = sessionStorage.getItem("clientId");

        if (!clientId) {
            setError("Refresh and retry");
            return;
        }

        // Clear any existing error
        setError("");

        // Clean up any existing listeners
        socket.off("playerJoined");
        socket.off("error");

        // Set up event listeners for this specific operation
        const handlePlayerJoined = (data) => {
            console.log("Joiner received playerJoined event:", data);
            if (data.username === username && data.roomName === roomName) {
                localStorage.setItem("username", username);
                localStorage.setItem("roomName", roomName);
                localStorage.setItem("playerRole", "joiner");
                
                // Clean up listeners
                socket.off("playerJoined", handlePlayerJoined);
                socket.off("error", handleError);
                
                console.log("Joiner navigating to room:", roomName);
                navigate(`/${roomName}`);
            }
        };

        const handleError = (msg) => {
            console.log("Join room error:", msg);
            setError(msg);
            socket.off("playerJoined", handlePlayerJoined);
            socket.off("error", handleError);
        };

        socket.on("playerJoined", handlePlayerJoined);
        socket.on("error", handleError);

        console.log("Emitting joinRoom event:", { roomName, username, clientId });
        socket.emit("joinRoom", {
            roomName: roomName,
            username: username,
            clientId,
        });    };
    
    // menu form with shared inputs for creating and joining rooms
    // displays error message on top
    // returns a div with shared input fields for username and room name
    // and two separate buttons for joining or creating a room
    // setUsername, setRoomName come from the shared state declarations at the top
      return (
        <div style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: '100vh'
        }}>            <div style={{textAlign: 'center'}}>
                <h1>CARROM</h1>
                
                <div>
                    <input
                        type="text"
                        placeholder="USERNAME"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        style={{
                            borderRadius: '0',
                            textAlign: 'center',
                            width: '350px',
                            height: '40px',
                            fontSize: '16px'
                        }}
                    />
                    <br /><br />
                    
                    <input
                        type="text"
                        placeholder="ROOM NAME"
                        value={roomName}
                        onChange={(e) => setRoomName(e.target.value)}
                        style={{
                            borderRadius: '0',
                            textAlign: 'center',
                            width: '350px',
                            height: '40px',
                            fontSize: '16px'
                        }}
                    />
                    <br /><br />
                      <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                        <button 
                            onClick={handleJoinRoom}
                            style={{
                                borderRadius: '0',
                                textAlign: 'center',
                                width: '170px',
                                height: '40px',
                                fontSize: '16px',
                                backgroundColor: 'white'
                            }}
                        >
                            JOIN ROOM
                        </button>
                        <button 
                            onClick={handleCreateRoom}
                            style={{
                                borderRadius: '0',
                                textAlign: 'center',
                                width: '170px',
                                height: '40px',
                                fontSize: '16px',
                                backgroundColor: 'white'
                            }}
                        >
                            CREATE ROOM                        </button>
                        
                    </div>
                    
                    <div style={{ height: '30px', marginTop: '20px' }}>
                        {error && <p style={{color: 'red', margin: '0'}}>{error}</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}
