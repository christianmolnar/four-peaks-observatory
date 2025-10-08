'use client';

import React, { useState, useEffect } from 'react';

interface ObservationCriteriaConfig {
  cloudCover: {
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  ecmwfCloud: {
    excellent: { values: string[] };
    dubious: { values: string[] };
    poor: { values: string[] };
  };
  transparency: {
    excellent: { values: string[] };
    dubious: { values: string[] };
    poor: { values: string[] };
  };
  seeing: {
    excellent: { values: string[] };
    dubious: { values: string[] };
    poor: { values: string[] };
  };
  darkness: {
    enabled: boolean;
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  smoke: {
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  wind: {
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  humidity: {
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  temperature: {
    excellent: { min: number; max: number };
    dubious: { min: number; max: number };
    poor: { min: number; max: number };
  };
  heuristic: 'floor' | 'average' | 'weighted';
}

const defaultConfig: ObservationCriteriaConfig = {
  cloudCover: {
    excellent: { min: 0, max: 10 },
    dubious: { min: 20, max: 30 },
    poor: { min: 40, max: 100 }
  },
  ecmwfCloud: {
    excellent: { values: ['Clear Sky'] },
    dubious: { values: ['Cloud 25%'] },
    poor: { values: ['Cloud 50%', 'Cloud 75%', 'Overcast'] }
  },
  transparency: {
    excellent: { values: ['Transparent', 'Above average', 'Average'] },
    dubious: { values: ['Below Average'] },
    poor: { values: ['Poor'] }
  },
  seeing: {
    excellent: { values: ['Excellent 5/5', 'Good 4/5', 'Average 3/5'] },
    dubious: { values: ['Poor 2/5'] },
    poor: { values: ['Bad 1/5'] }
  },
  darkness: {
    enabled: false, // Disabled as requested
    excellent: { min: -4, max: 6.4 },
    dubious: { min: -6, max: -4.1 },
    poor: { min: -10, max: -6.1 }
  },
  smoke: {
    excellent: { min: 0, max: 20 },
    dubious: { min: 40, max: 100 },
    poor: { min: 200, max: 500 }
  },
  wind: {
    excellent: { min: 0, max: 11 },
    dubious: { min: 12, max: 16 },
    poor: { min: 17, max: 100 }
  },
  humidity: {
    // Set to be excellent across the whole scale as requested
    excellent: { min: 0, max: 100 },
    dubious: { min: 101, max: 101 }, // Impossible range
    poor: { min: 102, max: 102 } // Impossible range
  },
  temperature: {
    // Set to be excellent across the whole scale as requested
    excellent: { min: -50, max: 120 },
    dubious: { min: 121, max: 121 }, // Impossible range
    poor: { min: 122, max: 122 } // Impossible range
  },
  heuristic: 'floor' // Worst one wins
};

export default function ObservationCriteriaManager() {
  const [config, setConfig] = useState<ObservationCriteriaConfig>(defaultConfig);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/admin/observation-criteria');
      if (response.ok) {
        const data = await response.json();
        setConfig(data.config || defaultConfig);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      setMessage('Failed to load configuration');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/observation-criteria', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      });
      
      if (response.ok) {
        setMessage('Configuration saved successfully!');
      } else {
        setMessage('Failed to save configuration');
      }
    } catch (error) {
      console.error('Failed to save config:', error);
      setMessage('Failed to save configuration');
    } finally {
      setSaving(false);
    }
  };

  const resetToDefaults = () => {
    setConfig(defaultConfig);
    setMessage('Reset to Clear Sky Chart standards');
  };

  if (loading) {
    return <div className="p-6">Loading...</div>;
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Observation Criteria Configuration</h1>
        <p className="text-gray-600 mb-4">
          Configure the criteria used to evaluate observing conditions based on Clear Sky Chart parameters.
          Current settings are based on official Clear Sky Chart definitions.
        </p>
        {message && (
          <div className={`p-3 rounded mb-4 ${message.includes('success') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {message}
          </div>
        )}
      </div>

      <div className="grid gap-6">
        {/* Cloud Cover */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Cloud Cover (%)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Excellent (Clear to 10%)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={config.cloudCover.excellent.min}
                  onChange={(e) => setConfig({
                    ...config,
                    cloudCover: {
                      ...config.cloudCover,
                      excellent: { ...config.cloudCover.excellent, min: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  value={config.cloudCover.excellent.max}
                  onChange={(e) => setConfig({
                    ...config,
                    cloudCover: {
                      ...config.cloudCover,
                      excellent: { ...config.cloudCover.excellent, max: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dubious (20-30%)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={config.cloudCover.dubious.min}
                  onChange={(e) => setConfig({
                    ...config,
                    cloudCover: {
                      ...config.cloudCover,
                      dubious: { ...config.cloudCover.dubious, min: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  value={config.cloudCover.dubious.max}
                  onChange={(e) => setConfig({
                    ...config,
                    cloudCover: {
                      ...config.cloudCover,
                      dubious: { ...config.cloudCover.dubious, max: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>%</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Poor (40%+)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={config.cloudCover.poor.min}
                  onChange={(e) => setConfig({
                    ...config,
                    cloudCover: {
                      ...config.cloudCover,
                      poor: { ...config.cloudCover.poor, min: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  value={config.cloudCover.poor.max}
                  onChange={(e) => setConfig({
                    ...config,
                    cloudCover: {
                      ...config.cloudCover,
                      poor: { ...config.cloudCover.poor, max: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Smoke */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Smoke (μg/m³)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Excellent (0-20 μg/m³)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={config.smoke.excellent.min}
                  onChange={(e) => setConfig({
                    ...config,
                    smoke: {
                      ...config.smoke,
                      excellent: { ...config.smoke.excellent, min: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  value={config.smoke.excellent.max}
                  onChange={(e) => setConfig({
                    ...config,
                    smoke: {
                      ...config.smoke,
                      excellent: { ...config.smoke.excellent, max: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dubious (40-100 μg/m³)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={config.smoke.dubious.min}
                  onChange={(e) => setConfig({
                    ...config,
                    smoke: {
                      ...config.smoke,
                      dubious: { ...config.smoke.dubious, min: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  value={config.smoke.dubious.max}
                  onChange={(e) => setConfig({
                    ...config,
                    smoke: {
                      ...config.smoke,
                      dubious: { ...config.smoke.dubious, max: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Poor (200-500 μg/m³)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={config.smoke.poor.min}
                  onChange={(e) => setConfig({
                    ...config,
                    smoke: {
                      ...config.smoke,
                      poor: { ...config.smoke.poor, min: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  value={config.smoke.poor.max}
                  onChange={(e) => setConfig({
                    ...config,
                    smoke: {
                      ...config.smoke,
                      poor: { ...config.smoke.poor, max: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Wind */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Wind Speed (mph)</h2>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Excellent (0-11 mph)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={config.wind.excellent.min}
                  onChange={(e) => setConfig({
                    ...config,
                    wind: {
                      ...config.wind,
                      excellent: { ...config.wind.excellent, min: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  value={config.wind.excellent.max}
                  onChange={(e) => setConfig({
                    ...config,
                    wind: {
                      ...config.wind,
                      excellent: { ...config.wind.excellent, max: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>mph</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dubious (12-16 mph)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={config.wind.dubious.min}
                  onChange={(e) => setConfig({
                    ...config,
                    wind: {
                      ...config.wind,
                      dubious: { ...config.wind.dubious, min: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  value={config.wind.dubious.max}
                  onChange={(e) => setConfig({
                    ...config,
                    wind: {
                      ...config.wind,
                      dubious: { ...config.wind.dubious, max: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>mph</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Poor (17+ mph)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={config.wind.poor.min}
                  onChange={(e) => setConfig({
                    ...config,
                    wind: {
                      ...config.wind,
                      poor: { ...config.wind.poor, min: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  value={config.wind.poor.max}
                  onChange={(e) => setConfig({
                    ...config,
                    wind: {
                      ...config.wind,
                      poor: { ...config.wind.poor, max: parseInt(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>mph</span>
              </div>
            </div>
          </div>
        </div>

        {/* Darkness */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Darkness (Visual Limiting Magnitude)</h2>
          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={config.darkness.enabled}
                onChange={(e) => setConfig({
                  ...config,
                  darkness: { ...config.darkness, enabled: e.target.checked }
                })}
                className="mr-2"
              />
              Enable darkness criteria in evaluation
            </label>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Excellent (-4 to 6.4)</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={config.darkness.excellent.min}
                  onChange={(e) => setConfig({
                    ...config,
                    darkness: {
                      ...config.darkness,
                      excellent: { ...config.darkness.excellent, min: parseFloat(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  step="0.1"
                  value={config.darkness.excellent.max}
                  onChange={(e) => setConfig({
                    ...config,
                    darkness: {
                      ...config.darkness,
                      excellent: { ...config.darkness.excellent, max: parseFloat(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dubious</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={config.darkness.dubious.min}
                  onChange={(e) => setConfig({
                    ...config,
                    darkness: {
                      ...config.darkness,
                      dubious: { ...config.darkness.dubious, min: parseFloat(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  step="0.1"
                  value={config.darkness.dubious.max}
                  onChange={(e) => setConfig({
                    ...config,
                    darkness: {
                      ...config.darkness,
                      dubious: { ...config.darkness.dubious, max: parseFloat(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Poor</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.1"
                  value={config.darkness.poor.min}
                  onChange={(e) => setConfig({
                    ...config,
                    darkness: {
                      ...config.darkness,
                      poor: { ...config.darkness.poor, min: parseFloat(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
                <span>to</span>
                <input
                  type="number"
                  step="0.1"
                  value={config.darkness.poor.max}
                  onChange={(e) => setConfig({
                    ...config,
                    darkness: {
                      ...config.darkness,
                      poor: { ...config.darkness.poor, max: parseFloat(e.target.value) }
                    }
                  })}
                  className="border rounded px-2 py-1 w-20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Evaluation Heuristic */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-semibold mb-4">Evaluation Heuristic</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              How should multiple criteria be combined?
            </label>
            <select
              value={config.heuristic}
              onChange={(e) => setConfig({
                ...config,
                heuristic: e.target.value as 'floor' | 'average' | 'weighted'
              })}
              className="border rounded px-3 py-2"
            >
              <option value="floor">Floor (Worst One Wins) - Recommended</option>
              <option value="average">Average of All Criteria</option>
              <option value="weighted">Weighted Average</option>
            </select>
            <p className="text-sm text-gray-600 mt-2">
              "Floor" means the worst parameter determines the overall rating. This is most conservative and matches your request.
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-4 mt-6">
        <button
          onClick={saveConfig}
          disabled={saving}
          className="bg-blue-600 text-white px-6 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save Configuration'}
        </button>
        <button
          onClick={resetToDefaults}
          className="bg-gray-600 text-white px-6 py-2 rounded hover:bg-gray-700"
        >
          Reset to Clear Sky Chart Standards
        </button>
        <a
          href="/admin"
          className="bg-gray-400 text-white px-6 py-2 rounded hover:bg-gray-500"
        >
          Back to Admin
        </a>
      </div>

      {/* Help Section */}
      <div className="mt-8 bg-blue-50 p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-2">Clear Sky Chart Parameter Reference</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium">Transparency Levels:</h4>
            <ul className="list-disc list-inside ml-2">
              <li>Transparent = Best</li>
              <li>Above Average = Good</li>
              <li>Average = Acceptable</li>
              <li>Below Average = Problematic</li>
              <li>Poor = Bad for observation</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium">Seeing Scale:</h4>
            <ul className="list-disc list-inside ml-2">
              <li>Excellent 5/5 = Perfect for planets</li>
              <li>Good 4/5 = Very good detail</li>
              <li>Average 3/5 = Acceptable detail</li>
              <li>Poor 2/5 = Limited detail</li>
              <li>Bad 1/5 = No fine detail visible</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
