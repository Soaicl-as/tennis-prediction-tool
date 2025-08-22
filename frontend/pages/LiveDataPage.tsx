import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, TrendingUp, TrendingDown, Calendar, MapPin, Trophy, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import backend from '~backend/client';

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

export function LiveDataPage() {
  const [rankings, setRankings] = useState<LiveRanking[]>([]);
  const [matches, setMatches] = useState<LiveMatch[]>([]);
  const [tournaments, setTournaments] = useState<LiveTournament[]>([]);
  const [tour, setTour] = useState<'atp' | 'wta'>('atp');
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const { toast } = useToast();

  useEffect(() => {
    loadRankings();
    loadMatches();
    loadTournaments();
  }, [tour]);

  const loadRankings = async () => {
    setLoading(prev => ({ ...prev, rankings: true }));
    try {
      const response = await backend.tennis.getLiveData({
        data_type: 'rankings',
        tour
      });
      setRankings(response.rankings || []);
      setLastUpdated(response.last_updated);
    } catch (error) {
      console.error('Failed to load rankings:', error);
      toast({
        title: "Error",
        description: "Failed to load live rankings",
        variant: "destructive"
      });
    } finally {
      setLoading(prev => ({ ...prev, rankings: false }));
    }
  };

  const loadMatches = async () => {
    setLoading(prev => ({ ...prev, matches: true }));
    try {
      const response = await backend.tennis.getLiveData({
        data_type: 'matches',
        tour,
        days: 14
      });
      setMatches(response.matches || []);
      setLastUpdated(response.last_updated);
    } catch (error) {
      console.error('Failed to load matches:', error);
      toast({
        title: "Error",
        description: "Failed to load live matches",
        variant: "destructive"
      });
    } finally {
      setLoading(prev => ({ ...prev, matches: false }));
    }
  };

  const loadTournaments = async () => {
    setLoading(prev => ({ ...prev, tournaments: true }));
    try {
      const response = await backend.tennis.getLiveData({
        data_type: 'tournaments',
        tour
      });
      setTournaments(response.tournaments || []);
      setLastUpdated(response.last_updated);
    } catch (error) {
      console.error('Failed to load tournaments:', error);
      toast({
        title: "Error",
        description: "Failed to load live tournaments",
        variant: "destructive"
      });
    } finally {
      setLoading(prev => ({ ...prev, tournaments: false }));
    }
  };

  const refreshAll = async () => {
    await Promise.all([loadRankings(), loadMatches(), loadTournaments()]);
    toast({
      title: "Data Refreshed",
      description: "All live data has been updated"
    });
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getSurfaceColor = (surface: string) => {
    switch (surface.toLowerCase()) {
      case 'clay': return 'bg-orange-100 text-orange-800';
      case 'grass': return 'bg-green-100 text-green-800';
      case 'hard': return 'bg-blue-100 text-blue-800';
      case 'indoor': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'live': return 'bg-red-100 text-red-800';
      case 'upcoming': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Live Tennis Data</h1>
          <p className="text-lg text-gray-600">
            Real-time rankings, matches, and tournament information
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <Select value={tour} onValueChange={(value: 'atp' | 'wta') => setTour(value)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="atp">ATP</SelectItem>
              <SelectItem value="wta">WTA</SelectItem>
            </SelectContent>
          </Select>
          
          <Button onClick={refreshAll} variant="outline">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh All
          </Button>
        </div>
      </div>

      <Tabs defaultValue="rankings" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="matches">Recent Matches</TabsTrigger>
          <TabsTrigger value="tournaments">Tournaments</TabsTrigger>
        </TabsList>

        <TabsContent value="rankings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Current {tour.toUpperCase()} Rankings</span>
                <Button 
                  onClick={loadRankings} 
                  variant="outline" 
                  size="sm"
                  disabled={loading.rankings}
                >
                  {loading.rankings ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </CardTitle>
              <CardDescription>
                Live player rankings from official {tour.toUpperCase()} sources
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {rankings.slice(0, 50).map((ranking) => (
                  <div key={ranking.player_name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="text-lg font-bold text-blue-600 w-8">
                        #{ranking.ranking}
                      </div>
                      <div>
                        <div className="font-medium">{ranking.player_name}</div>
                        <div className="text-sm text-gray-600">{ranking.country}</div>
                      </div>
                    </div>
                    
                    <div className="flex items-center space-x-4">
                      <div className="text-right">
                        <div className="font-medium">{ranking.points.toLocaleString()}</div>
                        <div className="text-xs text-gray-500">points</div>
                      </div>
                      
                      {ranking.movement !== undefined && ranking.movement !== 0 && (
                        <div className="flex items-center">
                          {ranking.movement > 0 ? (
                            <TrendingUp className="h-4 w-4 text-green-600" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600" />
                          )}
                          <span className={`text-sm ml-1 ${ranking.movement > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {Math.abs(ranking.movement)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="matches" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Recent & Upcoming Matches</span>
                <Button 
                  onClick={loadMatches} 
                  variant="outline" 
                  size="sm"
                  disabled={loading.matches}
                >
                  {loading.matches ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </CardTitle>
              <CardDescription>
                Live match results and upcoming fixtures
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {matches.map((match) => (
                  <Card key={match.id} className="border-l-4 border-l-blue-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-semibold text-lg">
                            {match.player1_name} vs {match.player2_name}
                          </div>
                          <div className="text-sm text-gray-600 flex items-center space-x-2">
                            <Calendar className="h-4 w-4" />
                            <span>{formatDate(match.date)}</span>
                            {match.location && (
                              <>
                                <MapPin className="h-4 w-4" />
                                <span>{match.location}</span>
                              </>
                            )}
                          </div>
                        </div>
                        
                        <div className="text-right">
                          <Badge className={getStatusColor(match.status)}>
                            {match.status.charAt(0).toUpperCase() + match.status.slice(1)}
                          </Badge>
                          {match.winner_name && (
                            <div className="text-sm font-medium text-green-600 mt-1">
                              Winner: {match.winner_name}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <span className="text-gray-600">Tournament:</span>
                          <div className="font-medium">{match.tournament_name}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Level:</span>
                          <div className="font-medium">{match.tournament_level}</div>
                        </div>
                        <div>
                          <span className="text-gray-600">Surface:</span>
                          <Badge className={getSurfaceColor(match.surface)}>
                            {match.surface.charAt(0).toUpperCase() + match.surface.slice(1)}
                          </Badge>
                        </div>
                        <div>
                          <span className="text-gray-600">Round:</span>
                          <div className="font-medium">{match.round}</div>
                        </div>
                      </div>
                      
                      {match.score && (
                        <div className="mt-3 p-2 bg-gray-100 rounded text-center font-mono">
                          {match.score}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tournaments" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Upcoming Tournaments</span>
                <Button 
                  onClick={loadTournaments} 
                  variant="outline" 
                  size="sm"
                  disabled={loading.tournaments}
                >
                  {loading.tournaments ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                </Button>
              </CardTitle>
              <CardDescription>
                Upcoming tournament schedule and information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {tournaments.map((tournament) => (
                  <Card key={tournament.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-semibold text-lg flex items-center space-x-2">
                            <Trophy className="h-5 w-5 text-yellow-600" />
                            <span>{tournament.name}</span>
                          </div>
                          <div className="text-sm text-gray-600 flex items-center space-x-2 mt-1">
                            <MapPin className="h-4 w-4" />
                            <span>{tournament.location}, {tournament.country}</span>
                          </div>
                        </div>
                        
                        <Badge className={getSurfaceColor(tournament.surface)}>
                          {tournament.surface.charAt(0).toUpperCase() + tournament.surface.slice(1)}
                        </Badge>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Level:</span>
                          <span className="font-medium">{tournament.level}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Dates:</span>
                          <span className="font-medium">
                            {formatDate(tournament.start_date)} - {formatDate(tournament.end_date)}
                          </span>
                        </div>
                        {tournament.prize_money && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Prize Money:</span>
                            <span className="font-medium">
                              ${tournament.prize_money.toLocaleString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {lastUpdated && (
        <div className="text-center text-sm text-gray-500">
          Last updated: {new Date(lastUpdated).toLocaleString()}
        </div>
      )}
    </div>
  );
}
