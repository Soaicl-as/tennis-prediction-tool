import { api, APIError } from "encore.dev/api";
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
    try {
      // Validate input parameters
      validateLiveDataInput(data_type, tour, days);

      const response: GetLiveDataResponse = {
        last_updated: new Date().toISOString()
      };

      switch (data_type) {
        case 'rankings':
          response.rankings = await fetchLiveRankings(tour);
          break;

        case 'matches':
          response.matches = await fetchLiveMatches(tour, days);
          break;

        case 'tournaments':
          response.tournaments = await fetchLiveTournaments(tour);
          break;

        default:
          throw APIError.invalidArgument(`Invalid data type: ${data_type}`);
      }

      return response;
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }
      throw APIError.internal(`Failed to fetch live ${data_type} data`, error);
    }
  }
);

function validateLiveDataInput(dataType: string, tour: string, days: number): void {
  if (!['rankings', 'matches', 'tournaments'].includes(dataType)) {
    throw APIError.invalidArgument("Data type must be 'rankings', 'matches', or 'tournaments'");
  }

  if (!['atp', 'wta'].includes(tour)) {
    throw APIError.invalidArgument("Tour must be 'atp' or 'wta'");
  }

  if (typeof days !== 'number' || days < 1 || days > 365) {
    throw APIError.invalidArgument("Days must be a number between 1 and 365");
  }
}

async function fetchLiveRankings(tour: 'atp' | 'wta'): Promise<LiveRanking[]> {
  try {
    const rankings = await tennisAPI.getRankings(tour);
    
    return rankings
      .filter(r => r.player_name && r.ranking && r.points)
      .map(r => ({
        player_name: r.player_name,
        ranking: r.ranking,
        points: r.points,
        country: r.country || 'Unknown',
        movement: r.movement
      }))
      .sort((a, b) => a.ranking - b.ranking);
  } catch (error) {
    throw new Error(`Failed to fetch live rankings: ${error}`);
  }
}

async function fetchLiveMatches(tour: 'atp' | 'wta', days: number): Promise<LiveMatch[]> {
  try {
    const [recentMatches, upcomingMatches] = await Promise.all([
      tennisAPI.getRecentMatches(tour, days).catch(error => {
        console.warn(`Failed to fetch recent matches: ${error}`);
        return [];
      }),
      tennisAPI.getUpcomingMatches(tour, days).catch(error => {
        console.warn(`Failed to fetch upcoming matches: ${error}`);
        return [];
      })
    ]);

    const allMatches = [...recentMatches, ...upcomingMatches];
    
    return allMatches
      .filter(m => 
        m.player1 && m.player1.name && 
        m.player2 && m.player2.name && 
        m.tournament_name &&
        m.player1.name !== m.player2.name
      )
      .map(m => ({
        id: m.id,
        tournament_name: m.tournament_name,
        tournament_level: m.tournament_level || 'Unknown',
        surface: m.surface || 'hard',
        round: m.round || 'Unknown',
        date: m.date,
        player1_name: m.player1.name,
        player2_name: m.player2.name,
        winner_name: m.winner?.name,
        score: m.score,
        status: m.status || 'unknown',
        location: m.location
      }))
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  } catch (error) {
    throw new Error(`Failed to fetch live matches: ${error}`);
  }
}

async function fetchLiveTournaments(tour: 'atp' | 'wta'): Promise<LiveTournament[]> {
  try {
    const tournaments = await tennisAPI.getTournaments(tour, new Date().getFullYear(), 'upcoming');
    
    return tournaments
      .filter(t => t.name && t.location && t.start_date && t.end_date)
      .map(t => ({
        id: t.id,
        name: t.name,
        level: t.level || 'Unknown',
        surface: t.surface || 'hard',
        location: t.location,
        country: t.country || 'Unknown',
        start_date: t.start_date,
        end_date: t.end_date,
        prize_money: t.prize_money
      }))
      .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime());
  } catch (error) {
    throw new Error(`Failed to fetch live tournaments: ${error}`);
  }
}
