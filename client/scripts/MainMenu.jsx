import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import socket from './socket.js';

export default function MainMenu() {
    // state variables
    // navigate is used to navigate to the room
    // use effect checks for saved room, clears storage if none, and cleans up socket listeners on exit
    const [joinUsername, setJoinUsername] = useState('');
    const [joinRoomName, setJoinRoomName] = useState('');
    const [createUsername, setCreateUsername] = useState('');
    const [createRoomName, setCreateRoomName] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    useEffect(() => {
        const roomName = localStorage.getItem('roomName');
        if (!roomName) { localStorage.clear(); }
        return () => {
            socket.off('playerJoined');
            socket.off('error');
        };
    }, []);

    // handles the creation of a room
    // checks if the username and room name are entered
    // if socket is not connected, connects to the server
    // emits a createRoom event to the server as a creator
    // handle creator joined event, navigating to the room
    // listens for player joined event
    const handleCreateRoom = () => {
        if (!createUsername || !createRoomName) {
            setError('Please enter a username and room name');
            return;
        }
        if (!socket.connected) { socket.connect(); }
        const clientId = sessionStorage.getItem('clientId');
        if (!clientId) {
            setError('Refresh and retry');
            return;
        }
        socket.emit('createRoom', { roomName: createRoomName, username: createUsername, clientId });

        const handlePlayerJoined = (data) => {
            if (data.username === createUsername && data.roomName === createRoomName) {
                localStorage.setItem('username', createUsername);
                localStorage.setItem('roomName', createRoomName);
                localStorage.setItem('playerRole', 'creator');
                socket.off('playerJoined', handlePlayerJoined);
                navigate(`/${createRoomName}`);
            }
        };

        socket.on('playerJoined', handlePlayerJoined);
        socket.on('error', (msg) => {
            setError(msg);
            socket.off('playerJoined', handlePlayerJoined);
        });
    };

    // handles the joining of a room
    // checks if the username and room name are entered
    // if socket is not connected, connects to the server
    // emits a joinRoom event to the server as a joiner
    // handle joiner joined event, navigating to the room
    // listens for player joined event
    const handleJoinRoom = () => {
        if (!joinUsername || !joinRoomName) {
            setError('Please enter a username and room name');
            return;
        }
        if (!socket.connected) { socket.connect(); }
        const clientId = sessionStorage.getItem('clientId');
        if (!clientId) {
            setError('Refresh and retry');
            return;
        }
        socket.emit('joinRoom', { roomName: joinRoomName, username: joinUsername, clientId });
        
        const handlePlayerJoined = (data) => {
            if (data.username === joinUsername && data.roomName === joinRoomName) {
                localStorage.setItem('username', joinUsername);
                localStorage.setItem('roomName', joinRoomName);
                localStorage.setItem('playerRole', 'joiner');
                socket.off('playerJoined', handlePlayerJoined);
                navigate(`/${joinRoomName}`);
            }
        };

        socket.on('playerJoined', handlePlayerJoined);
        socket.on('error', (msg) => {
            setError(msg);
            socket.off('playerJoined', handlePlayerJoined);
        });
    };

    // menu form of creating and joining rooms
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