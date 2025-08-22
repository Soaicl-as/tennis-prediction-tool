import { secret } from "encore.dev/config";

// Tennis API configuration
const tennisAPIKey = secret("TennisAPIKey");

export interface TennisAPIPlayer {
  id: number;
  name: string;
  country: string;
  birth_date?: string;
  height?: number;
  weight?: number;
  plays?: string;
  backhand?: string;
  ranking?: number;
  points?: number;
}

export interface TennisAPIMatch {
  id: number;
  tournament_name: string;
  tournament_level: string;
  surface: string;
  round: string;
  date: string;
  player1: TennisAPIPlayer;
  player2: TennisAPIPlayer;
  winner?: TennisAPIPlayer;
  score?: string;
  status: string;
  best_of: number;
  location?: string;
  indoor?: boolean;
}

export interface TennisAPITournament {
  id: number;
  name: string;
  level: string;
  surface: string;
  location: string;
  country: string;
  start_date: string;
  end_date: string;
  prize_money?: number;
  indoor?: boolean;
}

export interface TennisAPIRanking {
  player_id: number;
  player_name: string;
  ranking: number;
  points: number;
  country: string;
  movement?: number;
  ranking_date: string;
}

class TennisAPIClient {
  private baseURL = 'https://api.tennisdata.com/v1';
  private apiKey: string;

  constructor() {
    this.apiKey = tennisAPIKey();
  }

  private async makeRequest<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${this.baseURL}${endpoint}`);
    
    // Add API key to params
    const searchParams = new URLSearchParams({
      api_key: this.apiKey,
      ...params
    });
    
    url.search = searchParams.toString();

    const response = await fetch(url.toString(), {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'TennisPredictor/1.0'
      }
    });

    if (!response.ok) {
      throw new Error(`Tennis API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  async getPlayers(tour: 'atp' | 'wta' = 'atp', limit: number = 100): Promise<TennisAPIPlayer[]> {
    const response = await this.makeRequest<{ players: TennisAPIPlayer[] }>('/players', {
      tour,
      limit: limit.toString()
    });
    return response.players;
  }

  async getPlayerById(playerId: number): Promise<TennisAPIPlayer> {
    const response = await this.makeRequest<{ player: TennisAPIPlayer }>(`/players/${playerId}`);
    return response.player;
  }

  async getRankings(tour: 'atp' | 'wta' = 'atp', date?: string): Promise<TennisAPIRanking[]> {
    const params: Record<string, string> = { tour };
    if (date) params.date = date;
    
    const response = await this.makeRequest<{ rankings: TennisAPIRanking[] }>('/rankings', params);
    return response.rankings;
  }

  async getRecentMatches(
    tour: 'atp' | 'wta' = 'atp', 
    days: number = 7,
    playerId?: number
  ): Promise<TennisAPIMatch[]> {
    const params: Record<string, string> = { 
      tour,
      days: days.toString()
    };
    if (playerId) params.player_id = playerId.toString();
    
    const response = await this.makeRequest<{ matches: TennisAPIMatch[] }>('/matches/recent', params);
    return response.matches;
  }

  async getUpcomingMatches(
    tour: 'atp' | 'wta' = 'atp',
    days: number = 14
  ): Promise<TennisAPIMatch[]> {
    const response = await this.makeRequest<{ matches: TennisAPIMatch[] }>('/matches/upcoming', {
      tour,
      days: days.toString()
    });
    return response.matches;
  }

  async getTournaments(
    tour: 'atp' | 'wta' = 'atp',
    year?: number,
    status: 'upcoming' | 'ongoing' | 'completed' = 'upcoming'
  ): Promise<TennisAPITournament[]> {
    const params: Record<string, string> = { tour, status };
    if (year) params.year = year.toString();
    
    const response = await this.makeRequest<{ tournaments: TennisAPITournament[] }>('/tournaments', params);
    return response.tournaments;
  }

  async getMatchesByTournament(tournamentId: number): Promise<TennisAPIMatch[]> {
    const response = await this.makeRequest<{ matches: TennisAPIMatch[] }>(`/tournaments/${tournamentId}/matches`);
    return response.matches;
  }

  async getPlayerStats(playerId: number, year?: number): Promise<any> {
    const params: Record<string, string> = {};
    if (year) params.year = year.toString();
    
    const response = await this.makeRequest<{ stats: any }>(`/players/${playerId}/stats`, params);
    return response.stats;
  }

  async getHeadToHead(player1Id: number, player2Id: number): Promise<any> {
    const response = await this.makeRequest<{ h2h: any }>('/head-to-head', {
      player1_id: player1Id.toString(),
      player2_id: player2Id.toString()
    });
    return response.h2h;
  }
}

export const tennisAPI = new TennisAPIClient();
