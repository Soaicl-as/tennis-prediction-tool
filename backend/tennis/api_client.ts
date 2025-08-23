import { secret } from "encore.dev/config";
import { APIError } from "encore.dev/api";

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
    try {
      this.apiKey = tennisAPIKey();
      if (!this.apiKey) {
        throw new Error("Tennis API key is not configured");
      }
    } catch (error) {
      throw new Error(`Failed to initialize Tennis API client: ${error}`);
    }
  }

  private async makeRequest<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    if (!endpoint) {
      throw new Error("API endpoint is required");
    }

    try {
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
        },
        timeout: 30000 // 30 second timeout
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        
        switch (response.status) {
          case 401:
            throw new Error("Invalid API key or unauthorized access");
          case 403:
            throw new Error("Access forbidden - check API permissions");
          case 404:
            throw new Error(`API endpoint not found: ${endpoint}`);
          case 429:
            throw new Error("API rate limit exceeded - please try again later");
          case 500:
            throw new Error("Tennis API server error - please try again later");
          case 503:
            throw new Error("Tennis API service unavailable - please try again later");
          default:
            throw new Error(`Tennis API error (${response.status}): ${errorText}`);
        }
      }

      const data = await response.json();
      
      if (!data) {
        throw new Error("Empty response from Tennis API");
      }

      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Network error while accessing Tennis API: ${error}`);
    }
  }

  async getPlayers(tour: 'atp' | 'wta' = 'atp', limit: number = 100): Promise<TennisAPIPlayer[]> {
    if (!['atp', 'wta'].includes(tour)) {
      throw new Error("Tour must be 'atp' or 'wta'");
    }
    
    if (limit < 1 || limit > 1000) {
      throw new Error("Limit must be between 1 and 1000");
    }

    try {
      const response = await this.makeRequest<{ players: TennisAPIPlayer[] }>('/players', {
        tour,
        limit: limit.toString()
      });

      if (!response.players || !Array.isArray(response.players)) {
        throw new Error("Invalid players data format from API");
      }

      return response.players;
    } catch (error) {
      throw new Error(`Failed to fetch players: ${error}`);
    }
  }

  async getPlayerById(playerId: number): Promise<TennisAPIPlayer> {
    if (!playerId || playerId < 1) {
      throw new Error("Valid player ID is required");
    }

    try {
      const response = await this.makeRequest<{ player: TennisAPIPlayer }>(`/players/${playerId}`);
      
      if (!response.player) {
        throw new Error(`Player with ID ${playerId} not found`);
      }

      return response.player;
    } catch (error) {
      throw new Error(`Failed to fetch player ${playerId}: ${error}`);
    }
  }

  async getRankings(tour: 'atp' | 'wta' = 'atp', date?: string): Promise<TennisAPIRanking[]> {
    if (!['atp', 'wta'].includes(tour)) {
      throw new Error("Tour must be 'atp' or 'wta'");
    }

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error("Date must be in YYYY-MM-DD format");
    }

    const params: Record<string, string> = { tour };
    if (date) params.date = date;
    
    try {
      const response = await this.makeRequest<{ rankings: TennisAPIRanking[] }>('/rankings', params);
      
      if (!response.rankings || !Array.isArray(response.rankings)) {
        throw new Error("Invalid rankings data format from API");
      }

      return response.rankings;
    } catch (error) {
      throw new Error(`Failed to fetch rankings: ${error}`);
    }
  }

  async getRecentMatches(
    tour: 'atp' | 'wta' = 'atp', 
    days: number = 7,
    playerId?: number
  ): Promise<TennisAPIMatch[]> {
    if (!['atp', 'wta'].includes(tour)) {
      throw new Error("Tour must be 'atp' or 'wta'");
    }

    if (days < 1 || days > 365) {
      throw new Error("Days must be between 1 and 365");
    }

    if (playerId && playerId < 1) {
      throw new Error("Player ID must be a positive number");
    }

    const params: Record<string, string> = { 
      tour,
      days: days.toString()
    };
    if (playerId) params.player_id = playerId.toString();
    
    try {
      const response = await this.makeRequest<{ matches: TennisAPIMatch[] }>('/matches/recent', params);
      
      if (!response.matches || !Array.isArray(response.matches)) {
        throw new Error("Invalid matches data format from API");
      }

      return response.matches;
    } catch (error) {
      throw new Error(`Failed to fetch recent matches: ${error}`);
    }
  }

  async getUpcomingMatches(
    tour: 'atp' | 'wta' = 'atp',
    days: number = 14
  ): Promise<TennisAPIMatch[]> {
    if (!['atp', 'wta'].includes(tour)) {
      throw new Error("Tour must be 'atp' or 'wta'");
    }

    if (days < 1 || days > 365) {
      throw new Error("Days must be between 1 and 365");
    }

    try {
      const response = await this.makeRequest<{ matches: TennisAPIMatch[] }>('/matches/upcoming', {
        tour,
        days: days.toString()
      });
      
      if (!response.matches || !Array.isArray(response.matches)) {
        throw new Error("Invalid upcoming matches data format from API");
      }

      return response.matches;
    } catch (error) {
      throw new Error(`Failed to fetch upcoming matches: ${error}`);
    }
  }

  async getTournaments(
    tour: 'atp' | 'wta' = 'atp',
    year?: number,
    status: 'upcoming' | 'ongoing' | 'completed' = 'upcoming'
  ): Promise<TennisAPITournament[]> {
    if (!['atp', 'wta'].includes(tour)) {
      throw new Error("Tour must be 'atp' or 'wta'");
    }

    if (year && (year < 1990 || year > new Date().getFullYear() + 1)) {
      throw new Error("Year must be between 1990 and next year");
    }

    if (!['upcoming', 'ongoing', 'completed'].includes(status)) {
      throw new Error("Status must be 'upcoming', 'ongoing', or 'completed'");
    }

    const params: Record<string, string> = { tour, status };
    if (year) params.year = year.toString();
    
    try {
      const response = await this.makeRequest<{ tournaments: TennisAPITournament[] }>('/tournaments', params);
      
      if (!response.tournaments || !Array.isArray(response.tournaments)) {
        throw new Error("Invalid tournaments data format from API");
      }

      return response.tournaments;
    } catch (error) {
      throw new Error(`Failed to fetch tournaments: ${error}`);
    }
  }

  async getMatchesByTournament(tournamentId: number): Promise<TennisAPIMatch[]> {
    if (!tournamentId || tournamentId < 1) {
      throw new Error("Valid tournament ID is required");
    }

    try {
      const response = await this.makeRequest<{ matches: TennisAPIMatch[] }>(`/tournaments/${tournamentId}/matches`);
      
      if (!response.matches || !Array.isArray(response.matches)) {
        throw new Error("Invalid tournament matches data format from API");
      }

      return response.matches;
    } catch (error) {
      throw new Error(`Failed to fetch matches for tournament ${tournamentId}: ${error}`);
    }
  }

  async getPlayerStats(playerId: number, year?: number): Promise<any> {
    if (!playerId || playerId < 1) {
      throw new Error("Valid player ID is required");
    }

    if (year && (year < 1990 || year > new Date().getFullYear())) {
      throw new Error("Year must be between 1990 and current year");
    }

    const params: Record<string, string> = {};
    if (year) params.year = year.toString();
    
    try {
      const response = await this.makeRequest<{ stats: any }>(`/players/${playerId}/stats`, params);
      
      if (!response.stats) {
        throw new Error(`No stats found for player ${playerId}`);
      }

      return response.stats;
    } catch (error) {
      throw new Error(`Failed to fetch stats for player ${playerId}: ${error}`);
    }
  }

  async getHeadToHead(player1Id: number, player2Id: number): Promise<any> {
    if (!player1Id || player1Id < 1) {
      throw new Error("Valid player 1 ID is required");
    }

    if (!player2Id || player2Id < 1) {
      throw new Error("Valid player 2 ID is required");
    }

    if (player1Id === player2Id) {
      throw new Error("Player IDs must be different");
    }

    try {
      const response = await this.makeRequest<{ h2h: any }>('/head-to-head', {
        player1_id: player1Id.toString(),
        player2_id: player2Id.toString()
      });
      
      if (!response.h2h) {
        throw new Error(`No head-to-head data found for players ${player1Id} and ${player2Id}`);
      }

      return response.h2h;
    } catch (error) {
      throw new Error(`Failed to fetch head-to-head data: ${error}`);
    }
  }
}

export const tennisAPI = new TennisAPIClient();
