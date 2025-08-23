import { secret } from "encore.dev/config";

// Redis configuration
const redisURL = secret("RedisURL");

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

class CacheManager {
  private memoryCache = new Map<string, CacheEntry<any>>();
  private redisClient: any = null;
  private readonly maxMemoryCacheSize = 1000;
  private readonly defaultTTL = 300; // 5 minutes

  constructor() {
    this.initializeRedis();
  }

  private async initializeRedis() {
    try {
      const url = redisURL();
      if (url) {
        // In a real implementation, you would use a Redis client like ioredis
        // For now, we'll use memory cache as fallback
        console.log("Redis URL configured, but using memory cache for demo");
      }
    } catch (error) {
      console.warn("Redis not configured, using memory cache only");
    }
  }

  private generateKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
      .sort()
      .map(key => `${key}:${params[key]}`)
      .join('|');
    return `${prefix}:${sortedParams}`;
  }

  private isExpired(entry: CacheEntry<any>): boolean {
    return Date.now() - entry.timestamp > entry.ttl * 1000;
  }

  private cleanupMemoryCache() {
    if (this.memoryCache.size <= this.maxMemoryCacheSize) return;

    // Remove expired entries first
    for (const [key, entry] of this.memoryCache.entries()) {
      if (this.isExpired(entry)) {
        this.memoryCache.delete(key);
      }
    }

    // If still over limit, remove oldest entries
    if (this.memoryCache.size > this.maxMemoryCacheSize) {
      const entries = Array.from(this.memoryCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, this.memoryCache.size - this.maxMemoryCacheSize);
      toRemove.forEach(([key]) => this.memoryCache.delete(key));
    }
  }

  async get<T>(prefix: string, params: Record<string, any>): Promise<T | null> {
    const key = this.generateKey(prefix, params);
    
    try {
      // Try memory cache first
      const memoryEntry = this.memoryCache.get(key);
      if (memoryEntry && !this.isExpired(memoryEntry)) {
        return memoryEntry.data as T;
      }

      // Remove expired entry
      if (memoryEntry) {
        this.memoryCache.delete(key);
      }

      // In a real implementation, you would check Redis here
      return null;
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set<T>(prefix: string, params: Record<string, any>, data: T, ttl: number = this.defaultTTL): Promise<void> {
    const key = this.generateKey(prefix, params);
    
    try {
      // Store in memory cache
      this.memoryCache.set(key, {
        data,
        timestamp: Date.now(),
        ttl
      });

      this.cleanupMemoryCache();

      // In a real implementation, you would also store in Redis here
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
    }
  }

  async delete(prefix: string, params: Record<string, any>): Promise<void> {
    const key = this.generateKey(prefix, params);
    
    try {
      this.memoryCache.delete(key);
      // In a real implementation, you would also delete from Redis here
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
    }
  }

  async invalidatePattern(pattern: string): Promise<void> {
    try {
      // For memory cache, remove all keys that match the pattern
      for (const key of this.memoryCache.keys()) {
        if (key.includes(pattern)) {
          this.memoryCache.delete(key);
        }
      }
      // In a real implementation, you would use Redis SCAN with pattern matching
    } catch (error) {
      console.error(`Cache invalidate pattern error for ${pattern}:`, error);
    }
  }

  // Cache helper methods for specific data types
  async getPlayerStats(playerId: number): Promise<any | null> {
    return this.get('player_stats', { playerId });
  }

  async setPlayerStats(playerId: number, stats: any, ttl: number = 600): Promise<void> {
    await this.set('player_stats', { playerId }, stats, ttl);
  }

  async getHeadToHead(player1Id: number, player2Id: number): Promise<any | null> {
    // Normalize player order for consistent caching
    const [p1, p2] = player1Id < player2Id ? [player1Id, player2Id] : [player2Id, player1Id];
    return this.get('head_to_head', { player1Id: p1, player2Id: p2 });
  }

  async setHeadToHead(player1Id: number, player2Id: number, h2h: any, ttl: number = 1800): Promise<void> {
    // Normalize player order for consistent caching
    const [p1, p2] = player1Id < player2Id ? [player1Id, player2Id] : [player2Id, player1Id];
    await this.set('head_to_head', { player1Id: p1, player2Id: p2 }, h2h, ttl);
  }

  async getPrediction(player1Name: string, player2Name: string, surface: string, tournamentLevel?: string): Promise<any | null> {
    return this.get('prediction', { 
      player1Name: player1Name.toLowerCase(), 
      player2Name: player2Name.toLowerCase(), 
      surface, 
      tournamentLevel: tournamentLevel || 'default' 
    });
  }

  async setPrediction(player1Name: string, player2Name: string, surface: string, prediction: any, tournamentLevel?: string, ttl: number = 3600): Promise<void> {
    await this.set('prediction', { 
      player1Name: player1Name.toLowerCase(), 
      player2Name: player2Name.toLowerCase(), 
      surface, 
      tournamentLevel: tournamentLevel || 'default' 
    }, prediction, ttl);
  }

  async getRankings(tour: string): Promise<any | null> {
    return this.get('rankings', { tour });
  }

  async setRankings(tour: string, rankings: any, ttl: number = 3600): Promise<void> {
    await this.set('rankings', { tour }, rankings, ttl);
  }

  async getMatches(tour: string, days: number): Promise<any | null> {
    return this.get('matches', { tour, days });
  }

  async setMatches(tour: string, days: number, matches: any, ttl: number = 1800): Promise<void> {
    await this.set('matches', { tour, days }, matches, ttl);
  }

  // Invalidation helpers
  async invalidatePlayerData(playerId: number): Promise<void> {
    await this.invalidatePattern(`player_stats:playerId:${playerId}`);
    await this.invalidatePattern(`head_to_head:player1Id:${playerId}`);
    await this.invalidatePattern(`head_to_head:player2Id:${playerId}`);
  }

  async invalidateAllPredictions(): Promise<void> {
    await this.invalidatePattern('prediction:');
  }

  async invalidateMatchData(): Promise<void> {
    await this.invalidatePattern('matches:');
    await this.invalidatePattern('head_to_head:');
  }
}

export const cache = new CacheManager();
