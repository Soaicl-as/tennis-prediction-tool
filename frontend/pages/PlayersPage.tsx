import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, User, MapPin, Calendar, Ruler, Zap } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import backend from '~backend/client';
import type { Player } from '~backend/tennis/types';

export function PlayersPage() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [fromCache, setFromCache] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadPlayers();
  }, []);

  useEffect(() => {
    const filtered = players.filter(player =>
      player.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (player.country && player.country.toLowerCase().includes(searchTerm.toLowerCase()))
    );
    setFilteredPlayers(filtered);
  }, [players, searchTerm]);

  const loadPlayers = async () => {
    try {
      const response = await backend.tennis.listPlayers();
      setPlayers(response.players);
      setFromCache(response.from_cache);
    } catch (error) {
      console.error('Failed to load players:', error);
      toast({
        title: "Error",
        description: "Failed to load players",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleDateString();
  };

  const calculateAge = (birthDate?: string) => {
    if (!birthDate) return 'Unknown';
    const today = new Date();
    const birth = new Date(birthDate);
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      return age - 1;
    }
    return age;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading players...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Tennis Players Database</h1>
        <p className="text-lg text-gray-600">
          Browse and search through our comprehensive player database with optimized performance
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Search className="h-5 w-5" />
              <span>Search Players</span>
            </div>
            {fromCache && (
              <Badge variant="outline">
                <Zap className="h-3 w-3 mr-1" />
                Cached
              </Badge>
            )}
          </CardTitle>
          <CardDescription>
            Search by player name or country
            {fromCache && " (loaded from cache for faster performance)"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Search players..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-md"
          />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredPlayers.map((player) => (
          <Card key={player.id} className="hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <User className="h-5 w-5" />
                <span className="truncate">{player.name}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {player.country && (
                <div className="flex items-center space-x-2 text-sm">
                  <MapPin className="h-4 w-4 text-gray-500" />
                  <span>{player.country}</span>
                </div>
              )}
              
              {player.birth_date && (
                <div className="flex items-center space-x-2 text-sm">
                  <Calendar className="h-4 w-4 text-gray-500" />
                  <span>Age {calculateAge(player.birth_date)} ({formatDate(player.birth_date)})</span>
                </div>
              )}
              
              {player.height_cm && (
                <div className="flex items-center space-x-2 text-sm">
                  <Ruler className="h-4 w-4 text-gray-500" />
                  <span>{player.height_cm} cm</span>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {player.dominant_hand && (
                  <Badge variant="secondary">
                    {player.dominant_hand === 'left' ? 'Left-handed' : 'Right-handed'}
                  </Badge>
                )}
                
                {player.two_handed_backhand && (
                  <Badge variant="outline">
                    Two-handed backhand
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredPlayers.length === 0 && !loading && (
        <div className="text-center py-12">
          <div className="text-lg text-gray-600 mb-2">No players found</div>
          <div className="text-sm text-gray-500">
            Try adjusting your search terms
          </div>
        </div>
      )}

      <div className="text-center text-sm text-gray-500 flex items-center justify-center space-x-2">
        <span>Showing {filteredPlayers.length} of {players.length} players</span>
        {fromCache && (
          <Badge variant="outline">
            <Zap className="h-3 w-3 mr-1" />
            Optimized with caching
          </Badge>
        )}
      </div>
    </div>
  );
}
