import React, { useState, useEffect, useRef, FormEvent } from "react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "motion/react";
import { Users, Send, User, Crown, Timer, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/src/lib/utils";
import { Player, Room } from "./types";

const socket: Socket = io();

export default function App() {
  const [name, setName] = useState("");
  const [roomIdInput, setRoomIdInput] = useState("");
  const [room, setRoom] = useState<Room | null>(null);
  const [currentPlayer, setCurrentPlayer] = useState<Player | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [joined, setJoined] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [showPlayers, setShowPlayers] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    console.log("Room state updated:", room);
  }, [room]);

  useEffect(() => {
    console.log("Joined state updated:", joined);
  }, [joined]);

  useEffect(() => {
    socket.on("connect", () => {
      console.log("Socket connected:", socket.id);
    });

    socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    socket.on("room-joined", ({ roomId, player, room }) => {
      console.log("Room joined event received:", { roomId, player, room });
      setRoom(room);
      setCurrentPlayer(player);
      setJoined(true);
      setIsJoining(false);
      setIsCreating(false);
      setError(null);
    });

    socket.on("player-joined", (players) => {
      setRoom((prev) => prev ? { ...prev, players } : null);
    });

    socket.on("player-left", (players) => {
      setRoom((prev) => prev ? { ...prev, players } : null);
    });

    socket.on("game-started", (updatedRoom) => {
      setRoom(updatedRoom);
      // Update current player state to reflect imposter status
      const me = updatedRoom.players.find((p: Player) => p.id === socket.id);
      if (me) setCurrentPlayer(me);
    });

    socket.on("timer-update", (timer) => {
      setRoom((prev) => prev ? { ...prev, timer } : null);
    });

    socket.on("new-message", (message) => {
      setRoom((prev) => prev ? { ...prev, messages: [...prev.messages, message] } : null);
    });

    socket.on("voting-started", (updatedRoom) => {
      setRoom(updatedRoom);
    });

    socket.on("player-voted", ({ voterId, targetId }) => {
      setRoom((prev) => {
        if (!prev) return null;
        const newPlayers = prev.players.map(p => {
          if (p.id === voterId) return { ...p, votedFor: targetId };
          if (p.id === targetId) return { ...p, votesReceived: p.votesReceived + 1 };
          return p;
        });
        return { ...prev, players: newPlayers };
      });
    });

    socket.on("game-ended", (updatedRoom) => {
      setRoom(updatedRoom);
    });

    socket.on("returned-to-lobby", (updatedRoom) => {
      setRoom(updatedRoom);
      const me = updatedRoom.players.find((p: Player) => p.id === socket.id);
      if (me) setCurrentPlayer(me);
    });

    socket.on("error", (msg) => {
      setError(msg);
      setIsJoining(false);
      setIsCreating(false);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("connect_error");
      socket.off("room-joined");
      socket.off("player-joined");
      socket.off("player-left");
      socket.off("game-started");
      socket.off("timer-update");
      socket.off("new-message");
      socket.off("voting-started");
      socket.off("player-voted");
      socket.off("game-ended");
      socket.off("returned-to-lobby");
      socket.off("error");
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [room?.messages]);

  const createRoom = () => {
    if (!name) return setError("Please enter your name");
    if (isCreating) return;
    setIsCreating(true);
    socket.emit("create-room", { name });
  };

  const joinRoom = () => {
    if (!name) return setError("Please enter your name");
    if (!roomIdInput) return setError("Please enter a room ID");
    if (isJoining) return;
    setIsJoining(true);
    console.log(`Attempting to join room ${roomIdInput} with name ${name}. Socket ID: ${socket.id}`);
    socket.emit("join-room", { roomId: roomIdInput, name });
  };

  const startGame = () => {
    if (room) socket.emit("start-game", room.id);
  };

  const sendMessage = (e: FormEvent) => {
    e.preventDefault();
    if (messageInput.trim() && room) {
      socket.emit("send-message", { roomId: room.id, text: messageInput });
      setMessageInput("");
    }
  };

  const handleVote = (targetId: string) => {
    if (room && currentPlayer && !currentPlayer.votedFor && targetId !== currentPlayer.id) {
      socket.emit("vote", { roomId: room.id, targetId });
      setCurrentPlayer(prev => prev ? { ...prev, votedFor: targetId } : null);
    }
  };

  const returnToLobby = () => {
    if (room) socket.emit("return-to-lobby", room.id);
  };

  const leaveRoom = () => {
    socket.emit("leave-room", room?.id);
    setJoined(false);
    setRoom(null);
    setCurrentPlayer(null);
    setError(null);
  };

  if (!joined) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col items-center justify-center p-4 font-sans">
        <motion.div 
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-center mb-12"
        >
          <div className="relative inline-block">
            <h1 className="text-5xl md:text-8xl font-black tracking-tighter text-red-600 italic uppercase transform -skew-x-12">
              IMPOSTER
            </h1>
            <div className="absolute -bottom-2 right-0 bg-white text-black px-2 py-0.5 text-xs font-bold uppercase tracking-widest">
              Social Deduction
            </div>
          </div>
        </motion.div>

        <div className="w-full max-w-md space-y-6 bg-[#141414] p-8 rounded-2xl border border-white/10 shadow-2xl">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-white/50">Your Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter name..."
              className="w-full bg-black border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-red-600 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={createRoom}
              disabled={isCreating}
              className="bg-white text-black font-bold py-3 rounded-lg hover:bg-white/90 transition-colors uppercase text-sm tracking-widest disabled:opacity-50"
            >
              {isCreating ? "Creating..." : "Create Room"}
            </button>
            <div className="relative">
              <input
                type="text"
                value={roomIdInput}
                onChange={(e) => setRoomIdInput(e.target.value)}
                placeholder="Room ID"
                className="w-full bg-black border border-white/20 rounded-lg px-4 py-3 focus:outline-none focus:border-red-600 transition-colors text-sm"
              />
            </div>
          </div>
          
          <button
            onClick={joinRoom}
            disabled={isJoining}
            className="w-full bg-red-600 text-white font-bold py-3 rounded-lg hover:bg-red-700 transition-colors uppercase text-sm tracking-widest disabled:opacity-50"
          >
            {isJoining ? "Joining..." : "Join Room"}
          </button>

          {error && (
            <motion.p 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red-500 text-center text-sm font-medium"
            >
              {error}
            </motion.p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white flex flex-col font-sans">
      {/* Header */}
      <header className="p-3 md:p-4 border-b border-white/10 flex items-center justify-between bg-[#141414] sticky top-0 z-50">
        <div className="flex items-center gap-2 md:gap-3">
          <h2 className="text-xl md:text-2xl font-black italic text-red-600 transform -skew-x-12">IMPOSTER</h2>
          <div className="bg-white/10 px-2 md:px-3 py-0.5 md:py-1 rounded-full text-[10px] md:text-xs font-mono tracking-widest">
            {room?.id}
          </div>
        </div>
        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setShowPlayers(!showPlayers)}
            className="md:hidden bg-white/5 p-2 rounded-lg border border-white/10"
          >
            <Users size={18} />
          </button>
          <div className="hidden md:flex items-center gap-2 text-white/60 text-sm">
            <Users size={16} />
            <span>{room?.players.length}/15</span>
          </div>
          <button 
            onClick={leaveRoom}
            className="bg-white/10 hover:bg-red-600/20 hover:text-red-500 px-2 md:px-3 py-1 rounded-lg text-[10px] md:text-xs font-bold transition-all uppercase tracking-widest border border-white/10 hover:border-red-600/50"
          >
            Leave
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden flex flex-col md:flex-row relative">
        {/* Left Sidebar: Players */}
        <div className={cn(
          "absolute md:relative z-40 w-full md:w-64 bg-[#0f0f0f] border-r border-white/10 p-4 overflow-y-auto transition-transform duration-300 h-full",
          showPlayers ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Players</h3>
            <button onClick={() => setShowPlayers(false)} className="md:hidden text-white/40">
              <XCircle size={18} />
            </button>
          </div>
          <div className="space-y-2">
            {room?.players.map((p) => (
              <div 
                key={p.id}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-all",
                  p.id === currentPlayer?.id ? "bg-white/10 border-white/20" : "bg-black/40 border-transparent",
                  room.status === "voting" && p.votedFor && "border-green-500/50"
                )}
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                    p.id === currentPlayer?.id ? "bg-red-600" : "bg-white/10"
                  )}>
                    {p.name[0].toUpperCase()}
                  </div>
                  <span className="text-sm font-medium truncate max-w-[120px]">{p.name}</span>
                </div>
                {p.isHost && <Crown size={14} className="text-yellow-500" />}
              </div>
            ))}
          </div>
        </div>

        {/* Overlay for mobile sidebar */}
        {showPlayers && (
          <div 
            className="absolute inset-0 bg-black/60 z-30 md:hidden"
            onClick={() => setShowPlayers(false)}
          />
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col relative">
          <AnimatePresence mode="wait">
            {room?.status === "lobby" && (
              <motion.div 
                key="lobby"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="w-24 h-24 bg-red-600/20 rounded-full flex items-center justify-center mb-6">
                  <Users size={48} className="text-red-600" />
                </div>
                <h2 className="text-2xl md:text-4xl font-bold mb-2">Waiting for Players</h2>
                <p className="text-sm md:text-base text-white/50 mb-8">Need at least 3 players to start the fun.</p>
                
                {currentPlayer?.isHost ? (
                  <button
                    onClick={startGame}
                    disabled={room.players.length < 3}
                    className="bg-red-600 text-white px-8 md:px-12 py-3 md:py-4 rounded-xl font-bold text-base md:text-lg hover:bg-red-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest"
                  >
                    Start Game
                  </button>
                ) : (
                  <div className="bg-white/5 px-6 py-3 rounded-lg border border-white/10 text-sm italic">
                    Waiting for host to start...
                  </div>
                )}
              </motion.div>
            )}

            {room?.status === "playing" && (
              <motion.div 
                key="playing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col"
              >
                {/* Topic Banner */}
                <div className="bg-red-600 p-4 md:p-6 flex items-center justify-between shadow-xl z-10">
                  <div className="flex-1">
                    <span className="text-[10px] md:text-xs font-bold uppercase tracking-widest opacity-70">Your Secret Topic</span>
                    <h2 className="text-xl md:text-3xl font-black uppercase leading-tight">
                      {currentPlayer?.isImposter ? "You are the IMPOSTER" : room.topic}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2 md:gap-3 bg-black/20 px-3 md:px-4 py-1.5 md:py-2 rounded-lg ml-4">
                    <Timer size={18} className="md:w-5 md:h-5" />
                    <span className="text-xl md:text-2xl font-mono font-bold">
                      {Math.floor(room.timer / 60)}:{(room.timer % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>

                {/* Chat Area */}
                <div className="flex-1 flex flex-col bg-black">
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {room.messages.map((msg) => (
                      <div 
                        key={msg.id}
                        className={cn(
                          "flex flex-col max-w-[80%]",
                          msg.sender === currentPlayer?.name ? "ml-auto items-end" : "items-start"
                        )}
                      >
                        <span className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">
                          {msg.sender}
                        </span>
                        <div className={cn(
                          "px-4 py-2 rounded-2xl text-sm",
                          msg.sender === currentPlayer?.name ? "bg-red-600 text-white rounded-tr-none" : "bg-white/10 text-white rounded-tl-none"
                        )}>
                          {msg.text}
                        </div>
                      </div>
                    ))}
                    <div ref={chatEndRef} />
                  </div>

                  <form onSubmit={sendMessage} className="p-4 bg-[#141414] border-t border-white/10 flex gap-2">
                    <input
                      type="text"
                      value={messageInput}
                      onChange={(e) => setMessageInput(e.target.value)}
                      placeholder="Discuss the topic..."
                      className="flex-1 bg-black border border-white/20 rounded-xl px-4 py-3 focus:outline-none focus:border-red-600 transition-colors"
                    />
                    <button 
                      type="submit"
                      className="bg-red-600 p-3 rounded-xl hover:bg-red-700 transition-colors"
                    >
                      <Send size={20} />
                    </button>
                  </form>
                </div>
              </motion.div>
            )}

            {room?.status === "voting" && (
              <motion.div 
                key="voting"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center p-8"
              >
                <div className="text-center mb-6 md:mb-12">
                  <AlertTriangle size={32} className="text-yellow-500 mx-auto mb-3 md:size-[48px] md:mb-4" />
                  <h2 className="text-2xl md:text-4xl font-black uppercase mb-2 italic transform -skew-x-12">Time to Vote</h2>
                  <p className="text-xs md:text-base text-white/50">Who is the imposter? Choose wisely.</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 w-full max-w-4xl">
                  {room.players.map((p) => (
                    <button
                      key={p.id}
                      disabled={currentPlayer?.votedFor !== null || p.id === currentPlayer?.id}
                      onClick={() => handleVote(p.id)}
                      className={cn(
                        "relative p-4 md:p-6 rounded-2xl border-2 transition-all flex flex-col items-center gap-2 md:gap-3 group",
                        currentPlayer?.votedFor === p.id 
                          ? "bg-red-600/20 border-red-600" 
                          : "bg-[#141414] border-white/10 hover:border-white/30",
                        p.id === currentPlayer?.id && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-white/10 rounded-full flex items-center justify-center text-lg md:text-xl font-bold">
                        {p.name[0].toUpperCase()}
                      </div>
                      <span className="font-bold truncate w-full text-center text-sm md:text-base">{p.name}</span>
                      
                      {room.players.filter(player => player.votedFor === p.id).length > 0 && (
                        <div className="absolute -top-2 -right-2 bg-red-600 text-white w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shadow-lg">
                          {room.players.filter(player => player.votedFor === p.id).length}
                        </div>
                      )}
                    </button>
                  ))}
                </div>
                
                {currentPlayer?.votedFor && (
                  <p className="mt-8 text-white/50 animate-pulse">Waiting for others to vote...</p>
                )}
              </motion.div>
            )}

            {room?.status === "result" && (
              <motion.div 
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex-1 flex flex-col items-center justify-center p-8 text-center"
              >
                <div className="mb-6 md:mb-8">
                  {room.winner === "players" ? (
                    <div className="flex flex-col items-center">
                      <CheckCircle2 size={60} className="text-green-500 mb-4 md:size-[80px]" />
                      <h2 className="text-4xl md:text-6xl font-black text-green-500 italic uppercase transform -skew-x-12 mb-2">VICTORY</h2>
                      <p className="text-base md:text-xl text-white/70">The Imposter <span className="text-white font-bold">{room.kickedPlayer}</span> was caught!</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center">
                      <XCircle size={60} className="text-red-600 mb-4 md:size-[80px]" />
                      <h2 className="text-4xl md:text-6xl font-black text-red-600 italic uppercase transform -skew-x-12 mb-2">DEFEAT</h2>
                      <p className="text-base md:text-xl text-white/70"><span className="text-white font-bold">{room.kickedPlayer}</span> was innocent. The Imposter won!</p>
                    </div>
                  )}
                </div>

                <div className="bg-[#141414] p-4 md:p-6 rounded-2xl border border-white/10 mb-8 md:mb-12 max-w-md w-full">
                  <h3 className="text-[10px] md:text-xs font-bold uppercase tracking-widest text-white/40 mb-2">The Secret Topic was</h3>
                  <p className="text-xl md:text-3xl font-bold text-white uppercase">{room.topic}</p>
                </div>

                {currentPlayer?.isHost && (
                  <button
                    onClick={returnToLobby}
                    className="bg-white text-black px-8 md:px-12 py-3 md:py-4 rounded-xl font-bold text-base md:text-lg hover:bg-white/90 transition-all uppercase tracking-widest"
                  >
                    Back to Lobby
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
