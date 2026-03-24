import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import path from "path";
import { createServer as createViteServer } from "vite";

interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isImposter: boolean;
  votedFor: string | null;
  votesReceived: number;
  isReadyToVote: boolean;
  hasMessagedThisRound: boolean;
}

interface Room {
  id: string;
  players: Player[];
  status: "lobby" | "playing" | "voting" | "result";
  topic: string | null;
  timer: number;
  messages: { sender: string; text: string; id: string }[];
  winner: "players" | "imposter" | null;
  kickedPlayer: string | null;
  gameDuration: number;
  votingDuration: number;
  readyToVoteCount: number;
}

const TOPICS = [
  "Pizza", "Space Exploration", "The Beach", "Video Games", "Coffee",
  "Hiking", "Movies", "Music", "Cooking", "Travel", "Photography",
  "Gardening", "Reading", "Bicycling", "Swimming", "Dancing",
  "Painting", "Yoga", "Camping", "Skiing", "Surfing", "Fishing"
];

function generateRoomId() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Avoid ambiguous characters like I, O, 0, 1
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  const rooms: Map<string, Room> = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("create-room", ({ name }) => {
      const roomId = generateRoomId();
      const player: Player = {
        id: socket.id,
        name: name.trim(),
        isHost: true,
        isImposter: false,
        votedFor: null,
        votesReceived: 0,
        isReadyToVote: false,
        hasMessagedThisRound: false,
      };
      const room: Room = {
        id: roomId,
        players: [player],
        status: "lobby",
        topic: null,
        timer: 0,
        messages: [],
        winner: null,
        kickedPlayer: null,
        gameDuration: 120,
        votingDuration: 60,
        readyToVoteCount: 0,
      };
      rooms.set(roomId, room);
      socket.join(roomId);
      socket.emit("room-joined", { roomId, player, room });
      console.log(`Room ${roomId} created by ${name.trim()} (Socket: ${socket.id})`);
    });

    socket.on("join-room", ({ roomId, name }) => {
      if (!roomId || !name) {
        socket.emit("error", "Room ID and Name are required");
        return;
      }

      const normalizedRoomId = roomId.trim().toUpperCase();
      const playerName = name.trim();
      
      console.log(`Join request from ${playerName} for room ${normalizedRoomId} (Socket: ${socket.id})`);
      const room = rooms.get(normalizedRoomId);
      
      if (!room) {
        console.log(`Room ${normalizedRoomId} not found. Available rooms: ${Array.from(rooms.keys()).join(", ")}`);
        socket.emit("error", "Room not found. Make sure you are using the correct ID and are on the same environment (Dev/Preview).");
        return;
      }

      // Check if player with this socket ID is already in the room
      const existingPlayerBySocket = room.players.find(p => p.id === socket.id);
      if (existingPlayerBySocket) {
        console.log(`Player ${playerName} with socket ${socket.id} already in room ${normalizedRoomId}.`);
        socket.emit("room-joined", { roomId: normalizedRoomId, player: existingPlayerBySocket, room });
        return;
      }

      // Check if name is already taken in the room
      const existingPlayerByName = room.players.find(p => p.name.toLowerCase() === playerName.toLowerCase());
      if (existingPlayerByName) {
        // Check if the existing player's socket is still active
        const existingSocket = io.sockets.sockets.get(existingPlayerByName.id);
        if (existingSocket && existingSocket.connected) {
          socket.emit("error", "This name is already taken in the room.");
          return;
        } else {
          // If the socket is not connected, allow taking over the slot (reconnect)
          console.log(`Player ${playerName} re-joining with new socket ${socket.id}. Updating player ID.`);
          existingPlayerByName.id = socket.id;
          socket.join(normalizedRoomId);
          socket.emit("room-joined", { roomId: normalizedRoomId, player: existingPlayerByName, room });
          io.to(normalizedRoomId).emit("player-joined", room.players);
          return;
        }
      }

      if (room.players.length >= 15) {
        socket.emit("error", "Room is full (max 15 players)");
        return;
      }
      if (room.status !== "lobby") {
        socket.emit("error", "Game already in progress");
        return;
      }

      const player: Player = {
        id: socket.id,
        name: playerName,
        isHost: false,
        isImposter: false,
        votedFor: null,
        votesReceived: 0,
        isReadyToVote: false,
        hasMessagedThisRound: false,
      };
      
      room.players.push(player);
      socket.join(normalizedRoomId);
      
      console.log(`Player ${playerName} joined room ${normalizedRoomId}. Total players: ${room.players.length}`);
      
      socket.emit("room-joined", { roomId: normalizedRoomId, player, room });
      io.to(normalizedRoomId).emit("player-joined", room.players);
    });

    socket.on("update-settings", ({ roomId, gameDuration, votingDuration }) => {
      const room = rooms.get(roomId);
      if (!room || room.status !== "lobby") return;

      const host = room.players.find(p => p.id === socket.id);
      if (!host || !host.isHost) return;

      room.gameDuration = gameDuration;
      room.votingDuration = votingDuration;
      io.to(roomId).emit("settings-updated", { gameDuration, votingDuration });
    });

    socket.on("ready-to-vote", (roomId) => {
      const room = rooms.get(roomId);
      if (!room || room.status !== "playing") return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player || player.isReadyToVote) return;

      player.isReadyToVote = true;
      room.readyToVoteCount = room.players.filter(p => p.isReadyToVote).length;

      io.to(roomId).emit("player-ready-to-vote", { playerId: player.id, readyToVoteCount: room.readyToVoteCount });

      if (room.readyToVoteCount > room.players.length / 2) {
        room.status = "voting";
        room.timer = room.votingDuration;
        io.to(roomId).emit("voting-started", room);
        startVotingTimer(roomId);
      }
    });

    socket.on("start-game", (roomId) => {
      const room = rooms.get(roomId);
      if (!room || room.status !== "lobby") return;

      const host = room.players.find(p => p.id === socket.id);
      if (!host || !host.isHost) return;

      // Reset players
      room.players.forEach(p => {
        p.isImposter = false;
        p.votedFor = null;
        p.votesReceived = 0;
        p.isReadyToVote = false;
        p.hasMessagedThisRound = false;
      });

      // Assign Imposter
      const imposterIndex = Math.floor(Math.random() * room.players.length);
      room.players[imposterIndex].isImposter = true;

      // Assign Topic
      room.topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
      room.status = "playing";
      room.timer = room.gameDuration;
      room.messages = [];
      room.winner = null;
      room.kickedPlayer = null;
      room.readyToVoteCount = 0;

      io.to(roomId).emit("game-started", room);

      // Start Timer
      const interval = setInterval(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom || currentRoom.status !== "playing") {
          clearInterval(interval);
          return;
        }

        currentRoom.timer--;
        io.to(roomId).emit("timer-update", currentRoom.timer);

        if (currentRoom.timer <= 0) {
          clearInterval(interval);
          currentRoom.status = "voting";
          currentRoom.timer = currentRoom.votingDuration;
          io.to(roomId).emit("voting-started", currentRoom);
          startVotingTimer(roomId);
        }
      }, 1000);
    });

    function startVotingTimer(roomId: string) {
      const interval = setInterval(() => {
        const currentRoom = rooms.get(roomId);
        if (!currentRoom || currentRoom.status !== "voting") {
          clearInterval(interval);
          return;
        }

        currentRoom.timer--;
        io.to(roomId).emit("timer-update", currentRoom.timer);

        if (currentRoom.timer <= 0) {
          clearInterval(interval);
          resolveVoting(roomId);
        }
      }, 1000);
    }

    socket.on("send-message", ({ roomId, text }) => {
      const room = rooms.get(roomId);
      if (!room) return;
      if (room.status !== "playing" && room.status !== "lobby") return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      // Only enforce one message per round during the "playing" phase
      if (room.status === "playing" && player.hasMessagedThisRound) return;

      if (room.status === "playing") {
        player.hasMessagedThisRound = true;
      }

      const message = {
        sender: player.name,
        text,
        id: Math.random().toString(36).substring(7),
      };
      room.messages.push(message);
      io.to(roomId).emit("new-message", message);

      if (room.status === "playing") {
        // Check if everyone has messaged
        const allMessaged = room.players.every(p => p.hasMessagedThisRound);
        if (allMessaged) {
          room.players.forEach(p => p.hasMessagedThisRound = false);
          io.to(roomId).emit("round-reset");
        }
      }
    });

    socket.on("vote", ({ roomId, targetId }) => {
      const room = rooms.get(roomId);
      if (!room || room.status !== "voting") return;

      const voter = room.players.find(p => p.id === socket.id);
      if (!voter || voter.votedFor) return;

      voter.votedFor = targetId;
      const target = room.players.find(p => p.id === targetId);
      if (target) target.votesReceived++;

      io.to(roomId).emit("player-voted", { voterId: voter.id, targetId });

      // Check if everyone voted
      const allVoted = room.players.every(p => p.votedFor !== null);
      if (allVoted) {
        resolveVoting(roomId);
      }
    });

    function resolveVoting(roomId: string) {
      const room = rooms.get(roomId);
      if (!room) return;

      // Find player with most votes
      let maxVotes = -1;
      let candidates: Player[] = [];

      room.players.forEach(p => {
        if (p.votesReceived > maxVotes) {
          maxVotes = p.votesReceived;
          candidates = [p];
        } else if (p.votesReceived === maxVotes) {
          candidates.push(p);
        }
      });

      // If tie, pick random from candidates
      const kicked = candidates[Math.floor(Math.random() * candidates.length)];
      room.kickedPlayer = kicked.name;
      room.status = "result";

      if (kicked.isImposter) {
        room.winner = "players";
      } else {
        room.winner = "imposter";
      }

      io.to(roomId).emit("game-ended", room);
    }

    socket.on("return-to-lobby", (roomId) => {
      const room = rooms.get(roomId);
      if (!room) return;
      
      const host = room.players.find(p => p.id === socket.id);
      if (!host || !host.isHost) return;

      room.status = "lobby";
      room.topic = null;
      room.timer = 0;
      room.messages = [];
      room.winner = null;
      room.kickedPlayer = null;
      room.players.forEach(p => {
        p.votedFor = null;
        p.votesReceived = 0;
        p.isImposter = false;
      });

      io.to(roomId).emit("returned-to-lobby", room);
    });

    socket.on("leave-room", (roomId) => {
      socket.leave(roomId);
      const room = rooms.get(roomId);
      if (room) {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const wasHost = room.players[playerIndex].isHost;
          room.players.splice(playerIndex, 1);
          if (room.players.length === 0) {
            rooms.delete(roomId);
          } else {
            if (wasHost) {
              room.players[0].isHost = true;
            }
            io.to(roomId).emit("player-left", room.players);
          }
        }
      }
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      rooms.forEach((room, roomId) => {
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex !== -1) {
          const wasHost = room.players[playerIndex].isHost;
          room.players.splice(playerIndex, 1);
          
          if (room.players.length === 0) {
            rooms.delete(roomId);
          } else {
            if (wasHost) {
              room.players[0].isHost = true;
            }
            io.to(roomId).emit("player-left", room.players);
          }
        }
      });
    });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = process.env.PORT || 3000;
  httpServer.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  });
}

startServer();
