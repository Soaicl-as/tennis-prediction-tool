import { api, APIError } from "encore.dev/api";
import { tennisDB } from "./db";
import { cache } from "./cache";
import type { Player, PlayerStats } from "./types";

interface GetPlayerParams {
  name: string;
}

interface GetPlayerResponse {
  player: Player;
  latest_stats?: PlayerStats;
  from_cache: boolean;
}

// Retrieves a player by name with their latest statistics using optimized caching.
export const getPlayer = api<GetPlayerParams, GetPlayerResponse>(
  { expose: true, method: "GET", path: "/tennis/players/:name" },
  async ({ name }) => {
    try {
      // Check cache first for player data
      const cacheKey = `player_with_stats:${name.toLowerCase()}`;
      const cachedData = await cache.get('player_data', { name: name.toLowerCase() });
      
      if (cachedData) {
        return {
          ...cachedData,
          from_cache: true
        };
      }

      // Use optimized query with index on LOWER(name)
      const player = await tennisDB.queryRow<Player>`
        SELECT id, name, birth_date, height_cm, dominant_hand, two_handed_backhand, country
        FROM players
        WHERE LOWER(name) = LOWER(${name})
      `;
      
      if (!player) {
        throw APIError.notFound(`Player "${name}" not found`);
      }

      // Get latest stats using optimized query
      const latestStats = await tennisDB.queryRow<PlayerStats>`
        SELECT *
        FROM player_stats
        WHERE player_id = ${player.id}
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const response = {
        player,
        latest_stats: latestStats || undefined,
        from_cache: false
      };

      // Cache the result for 10 minutes
      await cache.set('player_data', { name: name.toLowerCase() }, response, 600);

      return response;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw APIError.internal(`Failed to fetch player "${name}"`, error);
    }
  }
);
