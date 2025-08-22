import { api, APIError } from "encore.dev/api";
import { tennisDB } from "./db";
import type { Player, PlayerStats } from "./types";

interface GetPlayerParams {
  name: string;
}

interface GetPlayerResponse {
  player: Player;
  latest_stats?: PlayerStats;
}

// Retrieves a player by name with their latest statistics.
export const getPlayer = api<GetPlayerParams, GetPlayerResponse>(
  { expose: true, method: "GET", path: "/tennis/players/:name" },
  async ({ name }) => {
    const player = await tennisDB.queryRow<Player>`
      SELECT id, name, birth_date, height_cm, dominant_hand, two_handed_backhand, country
      FROM players
      WHERE LOWER(name) = LOWER(${name})
    `;
    
    if (!player) {
      throw APIError.notFound(`Player "${name}" not found`);
    }

    const latestStats = await tennisDB.queryRow<PlayerStats>`
      SELECT *
      FROM player_stats
      WHERE player_id = ${player.id}
      ORDER BY created_at DESC
      LIMIT 1
    `;

    return {
      player,
      latest_stats: latestStats || undefined
    };
  }
);
