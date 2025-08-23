import { api } from "encore.dev/api";
import { tennisDB } from "./db";
import { cache } from "./cache";
import type { Player } from "./types";

interface ListPlayersResponse {
  players: Player[];
  from_cache: boolean;
}

// Retrieves all players in the database with caching for improved performance.
export const listPlayers = api<void, ListPlayersResponse>(
  { expose: true, method: "GET", path: "/tennis/players" },
  async () => {
    try {
      // Check cache first
      const cachedPlayers = await cache.get('all_players', {});
      if (cachedPlayers) {
        return {
          players: cachedPlayers,
          from_cache: true
        };
      }

      // Use optimized query with proper ordering
      const players = await tennisDB.queryAll<Player>`
        SELECT id, name, birth_date, height_cm, dominant_hand, two_handed_backhand, country
        FROM players
        ORDER BY name
      `;
      
      // Cache for 15 minutes
      await cache.set('all_players', {}, players, 900);

      return {
        players,
        from_cache: false
      };
    } catch (error) {
      throw new Error(`Failed to fetch players: ${error}`);
    }
  }
);
