import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { RefreshCw, Database, CheckCircle, AlertCircle, Loader2, Clock } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import backend from '~backend/client';

interface SyncResult {
  success: boolean;
  synced_data: {
    players?: number;
    rankings?: number;
    matches?: number;
    tournaments?: number;
  };
  errors?: string[];
  message: string;
}

export function SyncPage() {
  const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>(['rankings', 'matches']);
  const [tour, setTour] = useState<'atp' | 'wta' | 'both'>('both');
  const [daysBack, setDaysBack] = useState<number>(7);
  const [forceUpdate, setForceUpdate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const dataTypeOptions = [
    { id: 'players', label: 'Players', description: 'Player profiles and basic information' },
    { id: 'rankings', label: 'Rankings', description: 'Current ATP/WTA rankings' },
    { id: 'matches', label: 'Matches', description: 'Recent match results' },
    { id: 'tournaments', label: 'Tournaments', description: 'Tournament schedules and information' }
  ];

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (selectedDataTypes.length === 0) {
      newErrors.dataTypes = 'Please select at least one data type to sync';
    }

    if (!['atp', 'wta', 'both'].includes(tour)) {
      newErrors.tour = 'Please select a valid tour';
    }

    if (daysBack < 1 || daysBack > 365) {
      newErrors.daysBack = 'Days back must be between 1 and 365';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleDataTypeChange = (dataType: string, checked: boolean) => {
    if (checked) {
      setSelectedDataTypes(prev => [...prev, dataType]);
    } else {
      setSelectedDataTypes(prev => prev.filter(type => type !== dataType));
    }

    // Clear error when user makes a selection
    if (errors.dataTypes) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors.dataTypes;
        return newErrors;
      });
    }
  };

  const handleSync = async () => {
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setSyncResult(null);
    setProgress(0);

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setProgress(prev => Math.min(prev + 10, 90));
    }, 500);

    try {
      const result = await backend.tennis.syncData({
        data_types: selectedDataTypes as ('players' | 'rankings' | 'matches' | 'tournaments')[],
        tour,
        days_back: daysBack,
        force_update: forceUpdate
      });
      
      clearInterval(progressInterval);
      setProgress(100);
      setSyncResult(result);
      
      toast({
        title: result.success ? "Sync Successful" : "Sync Completed with Errors",
        description: result.message,
        variant: result.success ? "default" : "destructive"
      });
    } catch (error) {
      clearInterval(progressInterval);
      setProgress(0);
      console.error('Sync error:', error);
      
      let errorMessage = "Failed to sync data";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Sync Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getTotalSynced = (syncedData: SyncResult['synced_data']) => {
    return Object.values(syncedData).reduce((sum, count) => sum + (count || 0), 0);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Data Synchronization</h1>
        <p className="text-lg text-gray-600">
          Sync tennis data from external APIs to keep your database current
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <RefreshCw className="h-5 w-5" />
            <span>Sync Configuration</span>
          </CardTitle>
          <CardDescription>
            Configure which data to sync from tennis APIs
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <div>
              <Label className="text-base font-medium">Data Types to Sync</Label>
              {errors.dataTypes && (
                <p className="text-sm text-red-600 mt-1">{errors.dataTypes}</p>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {dataTypeOptions.map((option) => (
                <div key={option.id} className="flex items-start space-x-3 p-3 border rounded-lg">
                  <Checkbox
                    id={option.id}
                    checked={selectedDataTypes.includes(option.id)}
                    onCheckedChange={(checked) => handleDataTypeChange(option.id, checked as boolean)}
                  />
                  <div className="flex-1">
                    <Label htmlFor={option.id} className="font-medium cursor-pointer">
                      {option.label}
                    </Label>
                    <p className="text-sm text-gray-600 mt-1">{option.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="tour">Tour</Label>
              <Select value={tour} onValueChange={(value: 'atp' | 'wta' | 'both') => setTour(value)}>
                <SelectTrigger className={errors.tour ? 'border-red-500' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">Both ATP & WTA</SelectItem>
                  <SelectItem value="atp">ATP Only</SelectItem>
                  <SelectItem value="wta">WTA Only</SelectItem>
                </SelectContent>
              </Select>
              {errors.tour && (
                <p className="text-sm text-red-600">{errors.tour}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="daysBack">Days Back (for matches)</Label>
              <Select value={daysBack.toString()} onValueChange={(value) => setDaysBack(parseInt(value))}>
                <SelectTrigger className={errors.daysBack ? 'border-red-500' : ''}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="14">14 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                </SelectContent>
              </Select>
              {errors.daysBack && (
                <p className="text-sm text-red-600">{errors.daysBack}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Options</Label>
              <div className="flex items-center space-x-2 pt-2">
                <Checkbox
                  id="forceUpdate"
                  checked={forceUpdate}
                  onCheckedChange={(checked) => setForceUpdate(checked as boolean)}
                />
                <Label htmlFor="forceUpdate" className="text-sm cursor-pointer">
                  Force update existing records
                </Label>
              </div>
            </div>
          </div>

          {loading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Syncing data...</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <Button onClick={handleSync} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Syncing Data...
              </>
            ) : (
              <>
                <Database className="mr-2 h-4 w-4" />
                Start Sync
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {syncResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {syncResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-yellow-600" />
              )}
              <span>Sync Results</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className={syncResult.success ? "border-green-200 bg-green-50" : "border-yellow-200 bg-yellow-50"}>
              <AlertDescription className={syncResult.success ? "text-green-800" : "text-yellow-800"}>
                {syncResult.message}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(syncResult.synced_data).map(([dataType, count]) => (
                <div key={dataType} className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{count || 0}</div>
                  <div className="text-sm text-gray-600 capitalize">{dataType}</div>
                </div>
              ))}
            </div>

            <div className="text-center">
              <div className="text-lg font-semibold">
                Total Records Synced: {getTotalSynced(syncResult.synced_data)}
              </div>
            </div>

            {syncResult.errors && syncResult.errors.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold text-red-600">Errors:</h4>
                <div className="space-y-1">
                  {syncResult.errors.map((error, index) => (
                    <div key={index} className="text-sm text-red-600 bg-red-50 p-2 rounded">
                      {error}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Clock className="h-5 w-5" />
            <span>Automatic Sync</span>
          </CardTitle>
          <CardDescription>
            Data is automatically synchronized every 6 hours
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-blue-50 rounded-lg">
                <div className="font-medium text-blue-800">Rankings</div>
                <div className="text-blue-600">Updated every 6 hours</div>
              </div>
              <div className="p-3 bg-green-50 rounded-lg">
                <div className="font-medium text-green-800">Recent Matches</div>
                <div className="text-green-600">Last 3 days synced automatically</div>
              </div>
              <div className="p-3 bg-purple-50 rounded-lg">
                <div className="font-medium text-purple-800">Player Stats</div>
                <div className="text-purple-600">Calculated from match history</div>
              </div>
            </div>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Note:</strong> Manual sync allows you to fetch more historical data or force updates. 
                The automatic sync ensures your database stays current with minimal intervention.
              </AlertDescription>
            </Alert>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
