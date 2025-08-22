import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Trophy, Users, History, BarChart3, Upload } from 'lucide-react';

export function Navigation() {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Predict Match', icon: Trophy },
    { path: '/players', label: 'Players', icon: Users },
    { path: '/history', label: 'Prediction History', icon: History },
    { path: '/metrics', label: 'Model Metrics', icon: BarChart3 },
    { path: '/upload', label: 'Upload Data', icon: Upload },
  ];

  return (
    <nav className="bg-white shadow-lg border-b">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center space-x-2">
            <Trophy className="h-8 w-8 text-blue-600" />
            <h1 className="text-xl font-bold text-gray-900">Tennis Predictor</h1>
          </div>
          
          <div className="flex space-x-1">
            {navItems.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  location.pathname === path
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
