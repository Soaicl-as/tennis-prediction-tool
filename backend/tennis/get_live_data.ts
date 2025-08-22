import { api } from "encore.dev/api";
import { Query } from "encore.dev/api";
import { tennisAPI } from "./api_client";

interface GetLiveDataParams {
  data_type: Query<'rankings' | 'matches' | 'tournaments'>;
  tour?: Query<'atp' | 'wta'>;
  days?: Query<number>;
}

interface LiveRanking {
  player_name: string;
  ranking: number;
  points: number;
  country: string;
  movement?: number;
}

interface LiveMatch {
  id: number;
  tournament_name: string;
  tournament_level: string;
  surface: string;
  round: string;
  date: string;
  player1_name: string;
  player2_name: string;
  winner_name?: string;
  score?: string;
  status: string;
  location?: string;
}

interface LiveTournament {
  id: number;
  name: string;
  level: string;
  surface: string;
  location: string;
  country: string;
  start_date: string;
  end_date: string;
  prize_money?: number;
}

interface GetLiveDataResponse {
  rankings?: LiveRanking[];
  matches?: LiveMatch[];
  tournaments?: LiveTournament[];
  last_updated: string;
}

// Retrieves live tennis data directly from external APIs without storing in database.
export const getLiveData = api<GetLiveDataParams, GetLiveDataResponse>(
  { expose: true, method: "GET", path: "/tennis/live" },
  async ({ data_type, tour = 'atp', days = 7 }) => {
    const response: GetLiveDataResponse = {
      last_updated: new Date().toISOString()
    };

    try {
      switch (data_type) {
        case 'rankings':
          const rankings = await tennisAPI.getRankings(tour);
          response.rankings = rankings.map(r => ({
            player_name: r.player_name,
            ranking: r.ranking,
            points: r.points,
            country: r.country,
            movement: r.movement
          }));
          break;

        case 'matches':
          const recentMatches = await tennisAPI.getRecentMatches(tour, days);
          const upcomingMatches = await tennisAPI.getUpcomingMatches(tour, days);
          const allMatches = [...recentMatches, ...upcomingMatches];
          
          response.matches = allMatches.map(m => ({
            id: m.id,
            tournament_name: m.tournament_name,
            tournament_level: m.tournament_level,
            surface: m.surface,
            round: m.round,
            date: m.date,
            player1_name: m.player1.name,
            player2_name: m.player2.name,
            winner_name: m.winner?.name,
            score: m.score,
            status: m.status,
            location: m.location
          }));
          break;

        case 'tournaments':
          const tournaments = await tennisAPI.getTournaments(tour, new Date().getFullYear(), 'upcoming');
          response.tournaments = tournaments.map(t => ({
            id: t.id,
            name: t.name,
            level: t.level,
            surface: t.surface,
            location: t.location,
            country: t.country,
            start_date: t.start_date,
            end_date: t.end_date,
            prize_money: t.prize_money
          }));
          break;
      }

      return response;
    } catch (error) {
      throw new Error(`Failed to fetch live ${data_type} data: ${error}`);
    }
  }
);
