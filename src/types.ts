export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isImposter: boolean;
  votedFor: string | null;
  votesReceived: number;
}

export interface Room {
  id: string;
  players: Player[];
  status: "lobby" | "playing" | "voting" | "result";
  topic: string | null;
  timer: number;
  messages: { sender: string; text: string; id: string }[];
  winner: "players" | "imposter" | null;
  kickedPlayer: string | null;
}
