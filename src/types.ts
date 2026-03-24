export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isImposter: boolean;
  votedFor: string | null;
  votesReceived: number;
  isReadyToVote: boolean;
  hasMessagedThisRound: boolean;
}

export interface Message {
  sender: string;
  text: string;
  id: string;
}

export interface Room {
  id: string;
  players: Player[];
  status: "lobby" | "playing" | "voting" | "result";
  topic: string | null;
  timer: number;
  messages: Message[];
  winner: "players" | "imposter" | null;
  kickedPlayer: string | null;
  gameDuration: number;
  votingDuration: number;
  readyToVoteCount: number;
}
