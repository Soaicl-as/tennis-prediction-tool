import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import backend from '~backend/client';

export function UploadPage() {
  const [csvData, setCsvData] = useState('');
  const [dataType, setDataType] = useState<'players' | 'matches' | 'stats'>('players');
  const [loading, setLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    records_processed: number;
    message: string;
  } | null>(null);
  const { toast } = useToast();

  const handleUpload = async () => {
    if (!csvData.trim()) {
      toast({
        title: "Error",
        description: "Please enter CSV data",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setUploadResult(null);

    try {
      const result = await backend.tennis.uploadData({
        csv_data: csvData,
        data_type: dataType
      });
      
      setUploadResult(result);
      toast({
        title: "Upload Successful",
        description: result.message
      });
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Upload Failed",
        description: error instanceof Error ? error.message : "Failed to upload data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const getSampleData = (type: 'players' | 'matches' | 'stats') => {
    switch (type) {
      case 'players':
        return `name,birth_date,height_cm,dominant_hand,two_handed_backhand,country
Novak Djokovic,1987-05-22,188,right,true,Serbia
Rafael Nadal,1986-06-03,185,left,true,Spain
Roger Federer,1981-08-08,185,right,false,Switzerland`;
      
      case 'matches':
        return `player1,player2,winner,match_date,tournament,tournament_level,surface,round,best_of,score
Novak Djokovic,Rafael Nadal,Novak Djokovic,2023-06-11,French Open,Grand Slam,clay,Final,5,6-4 6-2 6-3
Carlos Alcaraz,Novak Djokovic,Carlos Alcaraz,2023-07-16,Wimbledon,Grand Slam,grass,Final,5,1-6 7-6 6-1 3-6 6-4`;
      
      case 'stats':
        return `player,ranking,elo_rating,elo_clay,elo_hard,elo_grass,career_matches_played,career_matches_won,career_win_pct,clay_win_pct,hard_win_pct,grass_win_pct,aces_per_match,first_serve_pct,recent_form_5,years_on_tour
Novak Djokovic,3,2150,2100,2180,2120,1200,950,0.792,0.750,0.820,0.780,8.5,0.68,4,18
Rafael Nadal,2,2180,2250,2150,2100,1150,920,0.800,0.920,0.750,0.680,6.2,0.70,5,20`;
    }
  };

  const loadSampleData = () => {
    setCsvData(getSampleData(dataType));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Upload Tennis Data</h1>
        <p className="text-lg text-gray-600">
          Import CSV data to expand the tennis database with players, matches, and statistics
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Upload className="h-5 w-5" />
            <span>CSV Data Upload</span>
          </CardTitle>
          <CardDescription>
            Upload structured tennis data in CSV format to enhance prediction accuracy
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="dataType">Data Type</Label>
            <Select value={dataType} onValueChange={(value: any) => setDataType(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="players">Players</SelectItem>
                <SelectItem value="matches">Matches</SelectItem>
                <SelectItem value="stats">Player Statistics</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="csvData">CSV Data</Label>
              <Button variant="outline" size="sm" onClick={loadSampleData}>
                <FileText className="h-4 w-4 mr-2" />
                Load Sample
              </Button>
            </div>
            <Textarea
              id="csvData"
              placeholder="Paste your CSV data here..."
              value={csvData}
              onChange={(e) => setCsvData(e.target.value)}
              rows={12}
              className="font-mono text-sm"
            />
          </div>

          <Button onClick={handleUpload} disabled={loading} className="w-full">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload Data
              </>
            )}
          </Button>

          {uploadResult && (
            <Alert className={uploadResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              {uploadResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <AlertCircle className="h-4 w-4 text-red-600" />
              )}
              <AlertDescription className={uploadResult.success ? "text-green-800" : "text-red-800"}>
                {uploadResult.message}
                {uploadResult.success && (
                  <div className="mt-1 text-sm">
                    Processed {uploadResult.records_processed} records successfully.
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CSV Format Guidelines</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-semibold mb-2">Players CSV Format</h4>
            <p className="text-sm text-gray-600 mb-2">Required columns:</p>
            <code className="text-xs bg-gray-100 p-2 rounded block">
              name, birth_date, height_cm, dominant_hand, two_handed_backhand, country
            </code>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Matches CSV Format</h4>
            <p className="text-sm text-gray-600 mb-2">Required columns:</p>
            <code className="text-xs bg-gray-100 p-2 rounded block">
              player1, player2, winner, match_date, tournament, tournament_level, surface, round, best_of, score
            </code>
          </div>

          <div>
            <h4 className="font-semibold mb-2">Player Statistics CSV Format</h4>
            <p className="text-sm text-gray-600 mb-2">Required columns:</p>
            <code className="text-xs bg-gray-100 p-2 rounded block">
              player, ranking, elo_rating, elo_clay, elo_hard, elo_grass, career_matches_played, career_matches_won, career_win_pct, clay_win_pct, hard_win_pct, grass_win_pct, aces_per_match, first_serve_pct, recent_form_5, years_on_tour
            </code>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Note:</strong> Make sure your CSV data includes headers as the first row. 
              Players must exist in the database before uploading matches or statistics for them.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
