import { api } from "encore.dev/api";
import { tennisDB } from "./db";
import type { Player } from "./types";

interface ListPlayersResponse {
  players: Player[];
}

// Retrieves all players in the database.
export const listPlayers = api<void, ListPlayersResponse>(
  { expose: true, method: "GET", path: "/tennis/players" },
  async () => {
    const players = await tennisDB.queryAll<Player>`
      SELECT id, name, birth_date, height_cm, dominant_hand, two_handed_backhand, country
      FROM players
      ORDER BY name
    `;
    
    return { players };
  }
);
