import { io } from 'socket.io-client';

// generate or reuse a unique client id for each browser session
const generateClientId = () => {
    let clientId = sessionStorage.getItem('clientId');
    if (!clientId) {
        clientId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
        });
        sessionStorage.setItem('clientId', clientId);
    }
    return clientId;
};

// socket.io client...
const socket = io('http://localhost:3000', {
    autoConnect: false,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    query: { clientId: generateClientId() }
});

// start heartbeat
let heartbeatInterval;
const startHeartbeat = () => {
    const clientId = sessionStorage.getItem('clientId');
    if (clientId && !heartbeatInterval) {
        heartbeatInterval = setInterval(() => {
            socket.emit('heartbeat', { clientId });
            console.log('Sent heartbeat for clientId:', clientId);
        }, 5000); // Every 5 seconds
    }
};

// stop heartbeat on disconnect
const stopHeartbeat = () => {
    if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
        heartbeatInterval = null;
        console.log('Stopped heartbeat');
    }
};

// connect to the server
socket.on('connect', () => {
    console.log('Socket connected with clientId:', sessionStorage.getItem('clientId'));
    startHeartbeat();
});
socket.on('connect_error', (error) => {
    console.error('Connect error:', error);
    stopHeartbeat();
});

// reconnect to the server if the connection is lost
socket.on('reconnect', (attempt) => {
    const username = localStorage.getItem('username');
    const roomName = localStorage.getItem('roomName');
    const playerRole = localStorage.getItem('playerRole');
    const clientId = sessionStorage.getItem('clientId');
    if (username && roomName && clientId) {
        if (playerRole === 'creator') {
            socket.emit('createRoom', { roomName, username, clientId });
        } else if (playerRole === 'joiner') {
            socket.emit('joinRoom', { roomName, username, clientId });
        }
    }
    startHeartbeat();
});

socket.on('reconnect_error', (error) => {
    console.error('Reconnect error:', error);
    stopHeartbeat();
});

// disconnect from the server
socket.on('disconnect', (reason) => {
    console.log('Socket disconnected:', reason);
    stopHeartbeat();
});

export default socket;