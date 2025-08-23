import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Upload, FileText, CheckCircle, AlertCircle, Loader2, File, Users, Database } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import backend from '~backend/client';

interface UploadResult {
  success: boolean;
  processed_data: {
    players_added: number;
    matches_added: number;
    stats_added: number;
  };
  extracted_players: string[];
  message: string;
}

export function UploadPage() {
  const [csvData, setCsvData] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [player1Name, setPlayer1Name] = useState('');
  const [player2Name, setPlayer2Name] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    // Validate file content
    if (!csvData.trim()) {
      newErrors.csvData = 'Please select a file or enter CSV data';
    } else if (csvData.length > 10 * 1024 * 1024) { // 10MB limit
      newErrors.csvData = 'File size exceeds 10MB limit';
    } else {
      const lines = csvData.trim().split('\n');
      if (lines.length < 2) {
        newErrors.csvData = 'CSV must contain at least a header and one data row';
      }
    }

    // Validate player names if provided
    if (player1Name.trim() && player1Name.trim().length < 2) {
      newErrors.player1Name = 'Player 1 name must be at least 2 characters';
    }
    if (player1Name.trim() && player1Name.trim().length > 100) {
      newErrors.player1Name = 'Player 1 name must be less than 100 characters';
    }

    if (player2Name.trim() && player2Name.trim().length < 2) {
      newErrors.player2Name = 'Player 2 name must be at least 2 characters';
    }
    if (player2Name.trim() && player2Name.trim().length > 100) {
      newErrors.player2Name = 'Player 2 name must be less than 100 characters';
    }

    // Check if player names are different (if both provided)
    if (player1Name.trim() && player2Name.trim() && 
        player1Name.trim().toLowerCase() === player2Name.trim().toLowerCase()) {
      newErrors.player2Name = 'Player names must be different';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.includes('csv') && !file.name.endsWith('.csv')) {
      toast({
        title: "Invalid File Type",
        description: "Please select a CSV file",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (10MB limit)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File Too Large",
        description: "File size must be less than 10MB",
        variant: "destructive"
      });
      return;
    }

    setSelectedFile(file);
    
    // Read file content
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        if (content) {
          setCsvData(content);
          // Clear any previous errors
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.csvData;
            return newErrors;
          });
        }
      } catch (error) {
        toast({
          title: "File Read Error",
          description: "Failed to read the selected file",
          variant: "destructive"
        });
      }
    };
    
    reader.onerror = () => {
      toast({
        title: "File Read Error",
        description: "Failed to read the selected file",
        variant: "destructive"
      });
    };
    
    reader.readAsText(file);
  };

  const handleUpload = async () => {
    if (!validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the errors in the form",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setUploadResult(null);

    try {
      const result = await backend.tennis.uploadFile({
        file_content: csvData,
        file_name: selectedFile?.name || 'manual_input.csv',
        player1_name: player1Name.trim() || undefined,
        player2_name: player2Name.trim() || undefined
      });
      
      setUploadResult(result);
      toast({
        title: "Upload Successful",
        description: result.message
      });
    } catch (error) {
      console.error('Upload error:', error);
      
      let errorMessage = "Failed to upload data";
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const clearFile = () => {
    setSelectedFile(null);
    setCsvData('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    // Clear file-related errors
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.csvData;
      return newErrors;
    });
  };

  const getSampleData = () => {
    return `name,birth_date,height_cm,dominant_hand,two_handed_backhand,country,player1,player2,winner,match_date,tournament,tournament_level,surface,round,best_of,score,ranking,elo_rating,career_matches_played,career_matches_won,career_win_pct
Novak Djokovic,1987-05-22,188,right,true,Serbia,,,,,,,,,,,3,2150,1200,950,0.792
Rafael Nadal,1986-06-03,185,left,true,Spain,,,,,,,,,,,2,2180,1150,920,0.800
,,,,,Novak Djokovic,Rafael Nadal,Novak Djokovic,2023-06-11,French Open,Grand Slam,clay,Final,5,6-4 6-2 6-3,,,,,
,,,,,Carlos Alcaraz,Novak Djokovic,Carlos Alcaraz,2023-07-16,Wimbledon,Grand Slam,grass,Final,5,1-6 7-6 6-1 3-6 6-4,,,,,`;
  };

  const loadSampleData = () => {
    setCsvData(getSampleData());
    setSelectedFile(null);
    // Clear file-related errors
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.csvData;
      return newErrors;
    });
  };

  const getTotalProcessed = (processedData: UploadResult['processed_data']) => {
    return processedData.players_added + processedData.matches_added + processedData.stats_added;
  };

  const handleInputChange = (field: string, value: string) => {
    switch (field) {
      case 'player1Name':
        setPlayer1Name(value);
        break;
      case 'player2Name':
        setPlayer2Name(value);
        break;
      case 'csvData':
        setCsvData(value);
        break;
    }

    // Clear error for this field when user starts typing
    if (errors[field]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Upload Tennis Data</h1>
        <p className="text-lg text-gray-600">
          Upload comprehensive tennis data files and extract relevant information for specific players
        </p>
      </div>

      <Tabs defaultValue="file-upload" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="file-upload">File Upload</TabsTrigger>
          <TabsTrigger value="manual-input">Manual Input</TabsTrigger>
        </TabsList>

        <TabsContent value="file-upload" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <File className="h-5 w-5" />
                <span>Upload Tennis Data File</span>
              </CardTitle>
              <CardDescription>
                Upload a CSV file containing tennis data. The system will automatically detect and extract relevant information.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="file-input">Select CSV File *</Label>
                  <div className="flex items-center space-x-4">
                    <Input
                      ref={fileInputRef}
                      id="file-input"
                      type="file"
                      accept=".csv,text/csv"
                      onChange={handleFileSelect}
                      className="flex-1"
                    />
                    {selectedFile && (
                      <Button variant="outline" size="sm" onClick={clearFile}>
                        Clear
                      </Button>
                    )}
                  </div>
                  {selectedFile && (
                    <div className="flex items-center space-x-2 text-sm text-gray-600">
                      <FileText className="h-4 w-4" />
                      <span>{selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)</span>
                    </div>
                  )}
                  {errors.csvData && (
                    <p className="text-sm text-red-600">{errors.csvData}</p>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="player1">Player 1 (Optional)</Label>
                    <Input
                      id="player1"
                      placeholder="e.g., Novak Djokovic"
                      value={player1Name}
                      onChange={(e) => handleInputChange('player1Name', e.target.value)}
                      className={errors.player1Name ? 'border-red-500' : ''}
                    />
                    {errors.player1Name && (
                      <p className="text-sm text-red-600">{errors.player1Name}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="player2">Player 2 (Optional)</Label>
                    <Input
                      id="player2"
                      placeholder="e.g., Rafael Nadal"
                      value={player2Name}
                      onChange={(e) => handleInputChange('player2Name', e.target.value)}
                      className={errors.player2Name ? 'border-red-500' : ''}
                    />
                    {errors.player2Name && (
                      <p className="text-sm text-red-600">{errors.player2Name}</p>
                    )}
                  </div>
                </div>

                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Optional Player Filter:</strong> If you specify player names above, the system will only extract and process data related to those players. Leave empty to process all data in the file.
                  </AlertDescription>
                </Alert>
              </div>

              <Button onClick={handleUpload} disabled={loading || !csvData.trim()} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing File...
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Upload and Process Data
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manual-input" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>Manual CSV Input</span>
              </CardTitle>
              <CardDescription>
                Paste CSV data directly or use sample data to test the system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="csvData">CSV Data *</Label>
                  <Button variant="outline" size="sm" onClick={loadSampleData}>
                    <FileText className="h-4 w-4 mr-2" />
                    Load Sample
                  </Button>
                </div>
                <Textarea
                  id="csvData"
                  placeholder="Paste your CSV data here..."
                  value={csvData}
                  onChange={(e) => handleInputChange('csvData', e.target.value)}
                  rows={12}
                  className={`font-mono text-sm ${errors.csvData ? 'border-red-500' : ''}`}
                />
                {errors.csvData && (
                  <p className="text-sm text-red-600">{errors.csvData}</p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="player1-manual">Player 1 (Optional)</Label>
                  <Input
                    id="player1-manual"
                    placeholder="e.g., Novak Djokovic"
                    value={player1Name}
                    onChange={(e) => handleInputChange('player1Name', e.target.value)}
                    className={errors.player1Name ? 'border-red-500' : ''}
                  />
                  {errors.player1Name && (
                    <p className="text-sm text-red-600">{errors.player1Name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="player2-manual">Player 2 (Optional)</Label>
                  <Input
                    id="player2-manual"
                    placeholder="e.g., Rafael Nadal"
                    value={player2Name}
                    onChange={(e) => handleInputChange('player2Name', e.target.value)}
                    className={errors.player2Name ? 'border-red-500' : ''}
                  />
                  {errors.player2Name && (
                    <p className="text-sm text-red-600">{errors.player2Name}</p>
                  )}
                </div>
              </div>

              <Button onClick={handleUpload} disabled={loading || !csvData.trim()} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing Data...
                  </>
                ) : (
                  <>
                    <Database className="mr-2 h-4 w-4" />
                    Process Data
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {uploadResult && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {uploadResult.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-red-600" />
              )}
              <span>Upload Results</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert className={uploadResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <AlertDescription className={uploadResult.success ? "text-green-800" : "text-red-800"}>
                {uploadResult.message}
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{uploadResult.processed_data.players_added}</div>
                <div className="text-sm text-blue-800">Players Added</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{uploadResult.processed_data.matches_added}</div>
                <div className="text-sm text-green-800">Matches Added</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">{uploadResult.processed_data.stats_added}</div>
                <div className="text-sm text-purple-800">Stats Added</div>
              </div>
            </div>

            <div className="text-center">
              <div className="text-lg font-semibold">
                Total Records Processed: {getTotalProcessed(uploadResult.processed_data)}
              </div>
            </div>

            {uploadResult.extracted_players.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  Players Found in Data ({uploadResult.extracted_players.length})
                </h4>
                <div className="flex flex-wrap gap-2">
                  {uploadResult.extracted_players.slice(0, 20).map((player, index) => (
                    <Badge key={index} variant="secondary">
                      {player}
                    </Badge>
                  ))}
                  {uploadResult.extracted_players.length > 20 && (
                    <Badge variant="outline">
                      +{uploadResult.extracted_players.length - 20} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Supported Data Formats</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2 flex items-center">
                <Users className="h-4 w-4 mr-2" />
                Player Data
              </h4>
              <p className="text-sm text-gray-600 mb-2">Detected fields:</p>
              <code className="text-xs bg-gray-100 p-2 rounded block">
                name, birth_date, height_cm, dominant_hand, country
              </code>
            </div>

            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2 flex items-center">
                <FileText className="h-4 w-4 mr-2" />
                Match Data
              </h4>
              <p className="text-sm text-gray-600 mb-2">Detected fields:</p>
              <code className="text-xs bg-gray-100 p-2 rounded block">
                player1, player2, winner, match_date, tournament, surface
              </code>
            </div>

            <div className="p-4 border rounded-lg">
              <h4 className="font-semibold mb-2 flex items-center">
                <Database className="h-4 w-4 mr-2" />
                Statistics Data
              </h4>
              <p className="text-sm text-gray-600 mb-2">Detected fields:</p>
              <code className="text-xs bg-gray-100 p-2 rounded block">
                ranking, elo_rating, win_pct, matches_played
              </code>
            </div>
          </div>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>Smart Detection:</strong> The system automatically detects the type of data in your file and processes it accordingly. 
              You can mix different types of data in the same file - the system will extract what it can from each row.
              <br /><br />
              <strong>File Requirements:</strong> Maximum file size is 10MB. CSV files must have headers and at least one data row.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}
