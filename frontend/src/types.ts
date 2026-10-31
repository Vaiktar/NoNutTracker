export type Choice = "si" | "no" | "dimenticato";

export type Entry = {
  username: string;
  choice: Choice | null;
  motivation: string | null;
  imageUrl: string | null;
};

export type Day = {
  date: string;
  locked: boolean;
  entries: Entry[];
};

export type Standing = {
  username: string;
  points: number;
  rank: number;
};

export type Board = {
  month: string;
  today: string;
  me: string;
  leaderboard: Standing[];
  days: Day[];
};

export type Session = {
  token: string;
  username: string;
};
