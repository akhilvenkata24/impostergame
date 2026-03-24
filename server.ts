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
}

const TOPICS = [
  "Pizza", "Space Exploration", "The Beach", "Video Games", "Coffee",
  "Hiking", "Movies", "Music", "Cooking", "Travel", "Photography",
  "Gardening", "Reading", "Bicycling", "Swimming", "Dancing",
  "Painting", "Yoga", "Camping", "Skiing", "Surfing", "Fishing"
];

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
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      const player: Player = {
        id: socket.id,
        name,
        isHost: true,
        isImposter: false,
        votedFor: null,
        votesReceived: 0,
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
      };
      rooms.set(roomId, room);
      socket.join(roomId);
      socket.emit("room-joined", { roomId, player, room });
      console.log(`Room ${roomId} created by ${name}`);
    });

    socket.on("join-room", ({ roomId, name }) => {
      console.log(`Join request from ${name} for room ${roomId}`);
      const normalizedRoomId = roomId.toUpperCase();
      const room = rooms.get(normalizedRoomId);
      
      if (!room) {
        console.log(`Room ${normalizedRoomId} not found`);
        socket.emit("error", "Room not found");
        return;
      }

      // Check if player with this socket ID is already in the room
      const existingPlayer = room.players.find(p => p.id === socket.id);
      if (existingPlayer) {
        console.log(`Player ${name} with socket ${socket.id} already in room ${normalizedRoomId}. Re-sending room data.`);
        socket.emit("room-joined", { roomId: normalizedRoomId, player: existingPlayer, room });
        return;
      }

      // Check if name is already taken in the room
      const existingPlayerByName = room.players.find(p => p.name.toLowerCase() === name.toLowerCase());
      if (existingPlayerByName) {
        // If the name exists, we allow the new socket to "take over" this player slot.
        // This handles cases where a user refreshes or reconnects with a new socket ID.
        console.log(`Player ${name} re-joining with new socket ${socket.id}. Updating player ID.`);
        existingPlayerByName.id = socket.id;
        socket.join(normalizedRoomId);
        socket.emit("room-joined", { roomId: normalizedRoomId, player: existingPlayerByName, room });
        io.to(normalizedRoomId).emit("player-joined", room.players);
        return;
      }

      if (room.players.length >= 15) {
        socket.emit("error", "Room is full");
        return;
      }
      if (room.status !== "lobby") {
        socket.emit("error", "Game already in progress");
        return;
      }

      const player: Player = {
        id: socket.id,
        name,
        isHost: false,
        isImposter: false,
        votedFor: null,
        votesReceived: 0,
      };
      
      room.players.push(player);
      socket.join(normalizedRoomId);
      
      console.log(`Player ${name} joined room ${normalizedRoomId}. Total players: ${room.players.length}`);
      
      socket.emit("room-joined", { roomId: normalizedRoomId, player, room });
      io.to(normalizedRoomId).emit("player-joined", room.players);
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
      });

      // Assign Imposter
      const imposterIndex = Math.floor(Math.random() * room.players.length);
      room.players[imposterIndex].isImposter = true;

      // Assign Topic
      room.topic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
      room.status = "playing";
      room.timer = 120; // 2 minutes
      room.messages = [];
      room.winner = null;
      room.kickedPlayer = null;

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
          io.to(roomId).emit("voting-started", currentRoom);
        }
      }, 1000);
    });

    socket.on("send-message", ({ roomId, text }) => {
      const room = rooms.get(roomId);
      if (!room || room.status !== "playing") return;

      const player = room.players.find(p => p.id === socket.id);
      if (!player) return;

      const message = {
        sender: player.name,
        text,
        id: Math.random().toString(36).substring(7),
      };
      room.messages.push(message);
      io.to(roomId).emit("new-message", message);
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

  const PORT = 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
