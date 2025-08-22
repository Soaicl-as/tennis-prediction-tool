import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, History, Trophy, Calendar, RefreshCw } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import backend from '~backend/client';

interface Prediction {
  id: number;
  player1_name: string;
  player2_name: string;
  surface: string;
  tournament_level: string;
  predicted_winner: string;
  win_probability: number;
  model_version: string;
  created_at: string;
}

export function HistoryPage() {
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    loadPredictions();
  }, []);

  const loadPredictions = async () => {
    setLoading(true);
    try {
      const response = await backend.tennis.getPredictions({ 
        limit: 100,
        player: searchTerm || undefined 
      });
      setPredictions(response.predictions);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to load predictions:', error);
      toast({
        title: "Error",
        description: "Failed to load prediction history",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadPredictions();
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getSurfaceColor = (surface: string) => {
    switch (surface) {
      case 'clay': return 'bg-orange-100 text-orange-800';
      case 'grass': return 'bg-green-100 text-green-800';
      case 'hard': return 'bg-blue-100 text-blue-800';
      case 'indoor': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getConfidenceColor = (probability: number) => {
    if (probability >= 0.8) return 'bg-green-100 text-green-800';
    if (probability >= 0.65) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading prediction history...</div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Prediction History</h1>
        <p className="text-lg text-gray-600">
          View all previous match predictions and their outcomes
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Search className="h-5 w-5" />
            <span>Search Predictions</span>
          </CardTitle>
          <CardDescription>
            Search by player name to filter predictions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex space-x-2">
            <Input
              placeholder="Search by player name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-md"
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            />
            <Button onClick={handleSearch} variant="outline">
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            <Button onClick={loadPredictions} variant="outline">
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {predictions.map((prediction) => (
          <Card key={prediction.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <Trophy className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="font-semibold text-lg">
                      {prediction.player1_name} vs {prediction.player2_name}
                    </div>
                    <div className="text-sm text-gray-600 flex items-center space-x-2">
                      <Calendar className="h-4 w-4" />
                      <span>{formatDate(prediction.created_at)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="font-semibold text-blue-600">
                    {prediction.predicted_winner}
                  </div>
                  <div className="text-sm text-gray-600">Predicted Winner</div>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <div className="text-sm text-gray-600">Surface</div>
                  <Badge className={getSurfaceColor(prediction.surface)}>
                    {prediction.surface.charAt(0).toUpperCase() + prediction.surface.slice(1)}
                  </Badge>
                </div>
                
                <div>
                  <div className="text-sm text-gray-600">Tournament</div>
                  <div className="font-medium">{prediction.tournament_level}</div>
                </div>
                
                <div>
                  <div className="text-sm text-gray-600">Confidence</div>
                  <Badge className={getConfidenceColor(prediction.win_probability)}>
                    {(prediction.win_probability * 100).toFixed(1)}%
                  </Badge>
                </div>
                
                <div>
                  <div className="text-sm text-gray-600">Model</div>
                  <div className="font-medium">{prediction.model_version}</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {predictions.length === 0 && (
        <div className="text-center py-12">
          <History className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <div className="text-lg text-gray-600 mb-2">No predictions found</div>
          <div className="text-sm text-gray-500">
            {searchTerm ? 'Try adjusting your search terms' : 'Make your first prediction to see it here'}
          </div>
        </div>
      )}

      <div className="text-center text-sm text-gray-500">
        Showing {predictions.length} of {total} predictions
      </div>
    </div>
  );
}
