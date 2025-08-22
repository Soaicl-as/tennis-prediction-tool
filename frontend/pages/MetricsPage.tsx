import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { BarChart3, TrendingUp, Target, Zap, Calendar } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import backend from '~backend/client';
import type { ModelMetrics } from '~backend/tennis/types';

interface MetricsResponse {
  metrics: ModelMetrics;
  last_updated: string;
}

export function MetricsPage() {
  const [metricsData, setMetricsData] = useState<MetricsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadMetrics();
  }, []);

  const loadMetrics = async () => {
    try {
      const response = await backend.tennis.getModelMetrics();
      setMetricsData(response);
    } catch (error) {
      console.error('Failed to load metrics:', error);
      toast({
        title: "Error",
        description: "Failed to load model metrics",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatPercentage = (value: number) => {
    return `${(value * 100).toFixed(1)}%`;
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 0.75) return 'text-green-600';
    if (accuracy >= 0.65) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getAccuracyBadge = (accuracy: number) => {
    if (accuracy >= 0.75) return 'bg-green-100 text-green-800';
    if (accuracy >= 0.65) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Loading model metrics...</div>
      </div>
    );
  }

  if (!metricsData) {
    return (
      <div className="text-center py-12">
        <div className="text-lg text-gray-600">No metrics data available</div>
      </div>
    );
  }

  const { metrics, last_updated } = metricsData;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Model Performance Metrics</h1>
        <p className="text-lg text-gray-600">
          Real-time analytics and performance statistics for our prediction models
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overall Accuracy</CardTitle>
            <Target className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getAccuracyColor(metrics.accuracy)}`}>
              {formatPercentage(metrics.accuracy)}
            </div>
            <Progress value={metrics.accuracy * 100} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ROC AUC Score</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {metrics.roc_auc.toFixed(3)}
            </div>
            <Progress value={metrics.roc_auc * 100} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Log Loss</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {metrics.log_loss.toFixed(3)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Lower is better
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calibration Error</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatPercentage(metrics.calibration_error)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              Lower is better
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Target className="h-5 w-5" />
            <span>Surface-Specific Accuracy</span>
          </CardTitle>
          <CardDescription>
            Model performance breakdown by court surface
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {Object.entries(metrics.surface_accuracy).map(([surface, accuracy]) => (
              <div key={surface} className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-medium capitalize">{surface} Court</span>
                  <Badge className={getAccuracyBadge(accuracy)}>
                    {formatPercentage(accuracy)}
                  </Badge>
                </div>
                <Progress value={accuracy * 100} className="h-2" />
                <div className="text-xs text-gray-500">
                  {accuracy >= 0.75 ? 'Excellent' : accuracy >= 0.65 ? 'Good' : 'Needs Improvement'}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <BarChart3 className="h-5 w-5" />
            <span>Model Performance Insights</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold">Strengths</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>High overall accuracy ({formatPercentage(metrics.accuracy)})</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Excellent ROC AUC score ({metrics.roc_auc.toFixed(3)})</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                  <span>Well-calibrated probability estimates</span>
                </li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold">Key Features</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Surface-specific Elo ratings</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Head-to-head historical data</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Recent form and momentum</span>
                </li>
                <li className="flex items-center space-x-2">
                  <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                  <span>Player physical attributes</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-sm text-gray-500 flex items-center justify-center space-x-2">
        <Calendar className="h-4 w-4" />
        <span>Last updated: {new Date(last_updated).toLocaleString()}</span>
      </div>
    </div>
  );
}
