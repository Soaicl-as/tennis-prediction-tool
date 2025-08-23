import { api, APIError } from "encore.dev/api";
import { Query } from "encore.dev/api";
import { tennisAPI } from "./api_client";
import { cache } from "./cache";

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
  from_cache: boolean;
}

// Retrieves live tennis data with caching for improved performance.
export const getLiveData = api<GetLiveDataParams, GetLiveDataResponse>(
  { expose: true, method: "GET", path: "/tennis/live" },
  async ({ data_type, tour = 'atp', days = 7 }) => {
    try {
      // Validate input parameters
      validateLiveDataInput(data_type, tour, days);

      const response: GetLiveDataResponse = {
        last_updated: new Date().toISOString(),
        from_cache: false
      };

      switch (data_type) {
        case 'rankings':
          const rankingsResult = await fetchLiveRankingsWithCache(tour);
          response.rankings = rankingsResult.data;
          response.from_cache = rankingsResult.fromCache;
          break;

        case 'matches':
          const matchesResult = await fetchLiveMatchesWithCache(tour, days);
          response.matches = matchesResult.data;
          response.from_cache = matchesResult.fromCache;
          break;

        case 'tournaments':
          const tournamentsResult = await fetchLiveTournamentsWithCache(tour);
          response.tournaments = tournamentsResult.data;
          response.from_cache = tournamentsResult.fromCache;
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

async function fetchLiveRankingsWithCache(tour: 'atp' | 'wta'): Promise<{ data: LiveRanking[]; fromCache: boolean }> {
  try {
    // Check cache first
    const cachedRankings = await cache.getRankings(tour);
    if (cachedRankings) {
      return { data: cachedRankings, fromCache: true };
    }

    // Fetch from API
    const rankings = await tennisAPI.getRankings(tour);
    
    const processedRankings = rankings
      .filter(r => r.player_name && r.ranking && r.points)
      .map(r => ({
        player_name: r.player_name,
        ranking: r.ranking,
        points: r.points,
        country: r.country || 'Unknown',
        movement: r.movement
      }))
      .sort((a, b) => a.ranking - b.ranking);

    // Cache for 1 hour
    await cache.setRankings(tour, processedRankings, 3600);

    return { data: processedRankings, fromCache: false };
  } catch (error) {
    throw new Error(`Failed to fetch live rankings: ${error}`);
  }
}

async function fetchLiveMatchesWithCache(tour: 'atp' | 'wta', days: number): Promise<{ data: LiveMatch[]; fromCache: boolean }> {
  try {
    // Check cache first
    const cachedMatches = await cache.getMatches(tour, days);
    if (cachedMatches) {
      return { data: cachedMatches, fromCache: true };
    }

    // Fetch from API
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
    
    const processedMatches = allMatches
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

    // Cache for 30 minutes
    await cache.setMatches(tour, days, processedMatches, 1800);

    return { data: processedMatches, fromCache: false };
  } catch (error) {
    throw new Error(`Failed to fetch live matches: ${error}`);
  }
}

async function fetchLiveTournamentsWithCache(tour: 'atp' | 'wta'): Promise<{ data: LiveTournament[]; fromCache: boolean }> {
  try {
    // Check cache first (using a generic key for tournaments)
    const cachedTournaments = await cache.get('tournaments', { tour });
    if (cachedTournaments) {
      return { data: cachedTournaments, fromCache: true };
    }

    // Fetch from API
    const tournaments = await tennisAPI.getTournaments(tour, new Date().getFullYear(), 'upcoming');
    
    const processedTournaments = tournaments
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

    // Cache for 2 hours
    await cache.set('tournaments', { tour }, processedTournaments, 7200);

    return { data: processedTournaments, fromCache: false };
  } catch (error) {
    throw new Error(`Failed to fetch live tournaments: ${error}`);
  }
}
