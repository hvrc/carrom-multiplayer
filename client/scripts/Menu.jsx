import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import socket from "./socket.js";

export default function Menu() {
    // socket.io handling room creation and joining

    // state variables
    // navigate is used to navigate to the room
    // use effect checks for saved room, clears storage if none, and cleans up socket listeners on exit

    // what are these square brackets and empty use states?

    const [joinUsername, setJoinUsername] = useState("");
    const [joinRoomName, setJoinRoomName] = useState("");
    const [createUsername, setCreateUsername] = useState("");
    const [createRoomName, setCreateRoomName] = useState("");
    const [error, setError] = useState("");
    const navigate = useNavigate();

    // what is a use effect?

    // gets room name from what user inputs into the field, which is stored in locaal storage
    // if room name is null, the local storage is cleared? what happens then?
    // what does socket off mean?
    useEffect(() => {
        const roomName = localStorage.getItem("roomName");
        if (!roomName) { localStorage.clear();}
        return () => {
            socket.off("playerJoined");
            socket.off("error");
        };
    }, []);

    // handles the creation of a room
    // if either create username or create room name are false, sets an error asking user to enter both
    // create username and create room name are both strings, set when user types in the input fields to join a room
    // if socket is not connected, connects to the server
    // gets client id from the session storage
    // if there is no client id found, sets an error asking user to refresh page and retry
    // emits a createRoom event to the server, with room name, username and client id
    const handleCreateRoom = () => {
        if (!createUsername || !createRoomName) {
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

        socket.emit("createRoom", {
            roomName: createRoomName,
            username: createUsername,
            clientId,
        });
        
        // what are these const blocks?

        // what is that data parameter?  where does it come from?
        // listens for player joined event
        // if username in the data equals the username set while trying to create a room
        // and room name in data equals the room name set ...
        // sets the create room username, room name and player role,

        // what is the socket off doing here?

        // navigate to the url with the name of the room
        const handlePlayerJoined = (data) => {
            if (data.username === createUsername && data.roomName === createRoomName) {
                localStorage.setItem("username", createUsername);
                localStorage.setItem("roomName", createRoomName);
                localStorage.setItem("playerRole", "creator");
                socket.off("playerJoined", handlePlayerJoined);
                navigate(`/${createRoomName}`);
            }
        };

        // what is a socket on versus a socket off?
        // error handling for socket off, what is it actually doing?

        socket.on("playerJoined", handlePlayerJoined);
        socket.on("error", (msg) => {
            setError(msg);
            socket.off("playerJoined", handlePlayerJoined);
        });
    };

    // handles the joining of a room
    // if either join username or join room name are false, sets an error asking user to enter both
    // join username and join room name are both strings, set when user types in the input fields to join a room
    // if socket is not connected, connects to the server
    // gets client id from the session storage
    // if there is no client id found, sets an error asking user to refresh page and retry
    // emits a joinRoom event to the server, with room name, username and client id
    const handleJoinRoom = () => {
        if (!joinUsername || !joinRoomName) {
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

        socket.emit("joinRoom", {
            roomName: joinRoomName,
            username: joinUsername,
            clientId,
        });
        
        // listens for player joined event
        // if username in the data equals the username set while trying to create a room
        // and room name in data equals the room name set ...
        // sets the join room username, room name and player role,
        // navigate to the url with the name of the room
        const handlePlayerJoined = (data) => {
            if (data.username === joinUsername && data.roomName === joinRoomName) {
                localStorage.setItem("username", joinUsername);
                localStorage.setItem("roomName", joinRoomName);
                localStorage.setItem("playerRole", "joiner");
                socket.off("playerJoined", handlePlayerJoined);
                navigate(`/${joinRoomName}`);
            }
        };
        
        // ?

        socket.on("playerJoined", handlePlayerJoined);
        socket.on("error", (msg) => {
            setError(msg);
            socket.off("playerJoined", handlePlayerJoined);
        });
    };

    // menu form of creating and joining rooms
    // returns a div with two sections, one for joining a room and one for creating a room

    // where do setJoinUsername, setJoinRoomName, setCreateUsername, setCreateRoomName come from?
    return (
        <div>
            {error && <p>{error}</p>}
            <div>
                <p>Join Room</p>
                <input
                    type="text"
                    placeholder="Username"
                    value={joinUsername}
                    onChange={(e) => setJoinUsername(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="Room Name"
                    value={joinRoomName}
                    onChange={(e) => setJoinRoomName(e.target.value)}
                />
                <button onClick={handleJoinRoom}>Join</button>
            </div>
            <div>
                <p>Create Room</p>
                <input
                    type="text"
                    placeholder="Username"
                    value={createUsername}
                    onChange={(e) => setCreateUsername(e.target.value)}
                />
                <input
                    type="text"
                    placeholder="New Room Name"
                    value={createRoomName}
                    onChange={(e) => setCreateRoomName(e.target.value)}
                />
                <button onClick={handleCreateRoom}>Create</button>
            </div>
        </div>
    );
}
