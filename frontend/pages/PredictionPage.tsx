import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, Trophy, TrendingUp } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import backend from '~backend/client';
import type { PredictionInput, PredictionResult } from '~backend/tennis/types';

export function PredictionPage() {
  const [formData, setFormData] = useState<PredictionInput>({
    player1_name: '',
    player2_name: '',
    surface: 'hard',
    tournament_level: 'ATP 250',
    best_of: 3,
    indoor: false
  });
  const [prediction, setPrediction] = useState<PredictionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.player1_name.trim() || !formData.player2_name.trim()) {
      toast({
        title: "Error",
        description: "Please enter both player names",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const result = await backend.tennis.predictMatch(formData);
      setPrediction(result);
      toast({
        title: "Prediction Complete",
        description: `${result.predicted_winner} predicted to win with ${(result.win_probability * 100).toFixed(1)}% probability`
      });
    } catch (error) {
      console.error('Prediction error:', error);
      toast({
        title: "Prediction Failed",
        description: error instanceof Error ? error.message : "Failed to generate prediction",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (level: string) => {
    switch (level) {
      case 'high': return 'bg-green-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getConfidenceText = (level: string) => {
    switch (level) {
      case 'high': return 'High Confidence';
      case 'medium': return 'Medium Confidence';
      case 'low': return 'Low Confidence';
      default: return 'Unknown';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 mb-4">Tennis Match Predictor</h1>
        <p className="text-lg text-gray-600">
          Predict tennis match outcomes using advanced analytics and machine learning
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Trophy className="h-5 w-5" />
            <span>Match Prediction</span>
          </CardTitle>
          <CardDescription>
            Enter player names and match details to get AI-powered predictions
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="player1">Player 1</Label>
                <Input
                  id="player1"
                  placeholder="e.g., Novak Djokovic"
                  value={formData.player1_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, player1_name: e.target.value }))}
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="player2">Player 2</Label>
                <Input
                  id="player2"
                  placeholder="e.g., Rafael Nadal"
                  value={formData.player2_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, player2_name: e.target.value }))}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="surface">Surface</Label>
                <Select value={formData.surface} onValueChange={(value: any) => setFormData(prev => ({ ...prev, surface: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hard">Hard Court</SelectItem>
                    <SelectItem value="clay">Clay Court</SelectItem>
                    <SelectItem value="grass">Grass Court</SelectItem>
                    <SelectItem value="indoor">Indoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tournament">Tournament Level</Label>
                <Select value={formData.tournament_level} onValueChange={(value) => setFormData(prev => ({ ...prev, tournament_level: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Grand Slam">Grand Slam</SelectItem>
                    <SelectItem value="Masters 1000">Masters 1000</SelectItem>
                    <SelectItem value="ATP 500">ATP 500</SelectItem>
                    <SelectItem value="ATP 250">ATP 250</SelectItem>
                    <SelectItem value="WTA 1000">WTA 1000</SelectItem>
                    <SelectItem value="WTA 500">WTA 500</SelectItem>
                    <SelectItem value="WTA 250">WTA 250</SelectItem>
                    <SelectItem value="Challenger">Challenger</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bestof">Best of</Label>
                <Select value={formData.best_of?.toString()} onValueChange={(value) => setFormData(prev => ({ ...prev, best_of: parseInt(value) }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="3">Best of 3</SelectItem>
                    <SelectItem value="5">Best of 5</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generating Prediction...
                </>
              ) : (
                'Predict Match Outcome'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {prediction && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Prediction Result</span>
              <Badge className={getConfidenceColor(prediction.confidence_level)}>
                {getConfidenceText(prediction.confidence_level)}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-blue-600 mb-2">
                {prediction.predicted_winner}
              </div>
              <div className="text-lg text-gray-600">
                Predicted Winner ({(prediction.win_probability * 100).toFixed(1)}% probability)
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>{formData.player1_name}</span>
                  <span>{(prediction.player1_probability * 100).toFixed(1)}%</span>
                </div>
                <Progress value={prediction.player1_probability * 100} className="h-3" />
              </div>
              
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span>{formData.player2_name}</span>
                  <span>{(prediction.player2_probability * 100).toFixed(1)}%</span>
                </div>
                <Progress value={prediction.player2_probability * 100} className="h-3" />
              </div>
            </div>

            <div>
              <h4 className="font-semibold mb-3 flex items-center">
                <TrendingUp className="h-4 w-4 mr-2" />
                Key Factors
              </h4>
              <div className="space-y-2">
                {prediction.feature_importance.slice(0, 5).map((feature, index) => (
                  <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div>
                      <div className="font-medium text-sm">{feature.feature}</div>
                      <div className="text-xs text-gray-600">{feature.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {(feature.importance * 100).toFixed(1)}%
                      </div>
                      <div className="text-xs text-gray-500">importance</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="text-xs text-gray-500 text-center">
              Model Version: {prediction.model_version}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
