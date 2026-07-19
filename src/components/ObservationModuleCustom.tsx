'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ObservationRecommendation } from '@/types/observation';
import { observatoryConfig } from '@/config/observatory';

interface ObservationModuleCustomProps {
  className?: string;
  customClearSkyUrl?: string;
  title?: string;
}

interface ApiResponse {
  success: boolean;
  recommendation: ObservationRecommendation;
  timestamp: string;
  location: string;
  observingWindow: {
    start: string;
    end: string;
    totalHours: number;
  };
  sunTimes: {
    sunset: string;
    sunrise: string;
  };
  analysisData?: {
    conditions: Array<{
      time: string;
      quality: "excellent" | "good" | "dubious" | "poor";
      reason: string;
      cloudCover: number;
      transparency: number;
      seeing: number;
    }>;
    chartData: any;
  };
  error?: string;
}

export default function ObservationModuleCustom({ 
  className = '', 
  customClearSkyUrl,
  title = "'Let's Get Out There Tonight!' Forecast"
}: ObservationModuleCustomProps) {
  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Factor weights configuration state
  const [factorWeights, setFactorWeights] = useState({
    cloudCover: 0,
    transparency: 0,
    seeing: 0
  });

  // Save factor weights to localStorage with debouncing for performance
  useEffect(() => {
    // Only auto-save if we're not in the middle of editing
    const timeoutId = setTimeout(() => {
      localStorage.setItem('factorWeights', JSON.stringify(factorWeights));
    }, 1000); // Increased debounce to 1 second to reduce writes
    
    return () => clearTimeout(timeoutId);
  }, [factorWeights]);

  // Load factor weights from localStorage on mount
  useEffect(() => {
    console.log('[FactorWeights] Component mounted, checking localStorage...');
    const saved = localStorage.getItem('factorWeights');
    console.log('[FactorWeights] Raw localStorage value:', saved);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        console.log('[FactorWeights] Loaded from localStorage:', parsed);
        console.log('[FactorWeights] seeing value:', parsed.seeing);
        
        // Validate that weights total 100
        const total = parsed.cloudCover + parsed.transparency + parsed.seeing;
        if (total === 100) {
          setFactorWeights(parsed);
          console.log('[FactorWeights] State updated to:', parsed);
        } else {
          console.log(`[FactorWeights] Invalid total (${total}), using valid defaults`);
          const validDefaults = { cloudCover: 40, transparency: 30, seeing: 30 };
          setFactorWeights(validDefaults);
          localStorage.setItem('factorWeights', JSON.stringify(validDefaults));
        }
      } catch (error) {
        console.error('Failed to load saved factor weights:', error);
        const validDefaults = { cloudCover: 40, transparency: 30, seeing: 30 };
        setFactorWeights(validDefaults);
        localStorage.setItem('factorWeights', JSON.stringify(validDefaults));
      }
    } else {
      console.log('[FactorWeights] No saved weights found, using valid defaults');
      const validDefaults = { cloudCover: 40, transparency: 30, seeing: 30 };
      setFactorWeights(validDefaults);
      localStorage.setItem('factorWeights', JSON.stringify(validDefaults));
    }
  }, []);

  useEffect(() => {
    console.log('[Data Fetch] useEffect triggered');
    console.log('[Data Fetch] Current factorWeights:', factorWeights);
    console.log('[Data Fetch] customClearSkyUrl:', customClearSkyUrl);
    
    // Only fetch if we have valid factor weights AND they total 100% (complete configuration)
    const hasValidWeights = factorWeights.cloudCover > 0 || factorWeights.transparency > 0 || factorWeights.seeing > 0;
    const totalWeight = factorWeights.cloudCover + factorWeights.transparency + factorWeights.seeing;
    const isCompleteConfiguration = totalWeight === 100;
    
    console.log('[Data Fetch] hasValidWeights:', hasValidWeights);
    console.log('[Data Fetch] totalWeight:', totalWeight);
    console.log('[Data Fetch] isCompleteConfiguration:', isCompleteConfiguration);
    
    if (hasValidWeights && isCompleteConfiguration) {
      fetchRecommendation();
    } else {
      console.log('[Data Fetch] Skipping fetch - waiting for complete factor weights configuration');
    }
}, [customClearSkyUrl, factorWeights]);

  const fetchRecommendation = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Build query parameters including factor weights
      const params = new URLSearchParams();
      if (customClearSkyUrl) {
        params.append('customClearSkyUrl', customClearSkyUrl);
      }
      
      // Add factor weights as query parameters
      console.log('[API Call] Current factorWeights state:', factorWeights);
      Object.entries(factorWeights).forEach(([key, value]) => {
        console.log(`[API Call] Adding parameter: factorWeight_${key} = ${value}`);
        params.append(`factorWeight_${key}`, value.toString());
      });
      
      const apiUrl = `/api/observation-evaluate?${params.toString()}`;
      console.log('[API Call] Full URL:', apiUrl);
      
      const response = await fetch(apiUrl);
      const responseData = await response.json();
      
      if (responseData.success) {
        setData(responseData);
      } else {
        setError(responseData.error || 'Failed to get recommendation');
      }
    } catch (err) {
      setError('Failed to fetch observation conditions');
      if (process.env.NODE_ENV === 'development') {
        console.error('Error fetching recommendation:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [factorWeights, customClearSkyUrl]); // Add dependencies

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'excellent': return '#10b981'; // emerald-500
      case 'good': return '#3b82f6'; // blue-500
      case 'dubious': return '#f59e0b'; // amber-500
      case 'poor': return '#ef4444'; // red-500
      default: return '#6b7280'; // gray-500
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'excellent': return "Yes, it's an excellent night!";
      case 'good': return "Yes, it's a good night!";
      case 'dubious': return "Dubious - check conditions";
      case 'poor': return "Not a good night";
      default: return "Checking conditions...";
    }
  };

  // Helper function to calculate weighted score - memoized for performance
  const calculateWeightedScore = useCallback((condition: any) => {
    // Debug: log the entire condition object
    console.log(`[WeightedScore] Full condition object:`, condition);
    
    // cloudCover is already on 1-5 scale from parser (5=excellent, 1=poor)
    const cloudScore = condition.cloudCover;
    const transparencyScore = Math.round(condition.transparency);
    const seeingScore = condition.seeing;
    
    // Debug logging for NaN issue
    console.log(`[WeightedScore] Scores: cloud=${cloudScore}, trans=${transparencyScore}, seeing=${seeingScore}`);
    console.log(`[WeightedScore] Weights: cloud=${factorWeights.cloudCover}, trans=${factorWeights.transparency}, seeing=${factorWeights.seeing}`);
    
    // Check for undefined values
    if (cloudScore === undefined || transparencyScore === undefined || seeingScore === undefined) {
      console.error(`[WeightedScore] Undefined scores detected!`);
      return 0;
    }
    
    // Only use the 3 factors actually available from Clear Sky Chart data
    const totalWeight = factorWeights.cloudCover + factorWeights.transparency + factorWeights.seeing;
    
    console.log(`[WeightedScore] TotalWeight: ${totalWeight}`);
    
    // If weights are not configured (0,0,0) or don't add to 100, return a basic average
    if (totalWeight === 0) {
      console.log(`[WeightedScore] Weights not configured, returning simple average`);
      return Math.round(((cloudScore + transparencyScore + seeingScore) / 3) * 100) / 100;
    }
    
    if (totalWeight !== 100) {
      console.log(`[WeightedScore] Invalid total weight (${totalWeight}), returning simple average`);
      return Math.round(((cloudScore + transparencyScore + seeingScore) / 3) * 100) / 100;
    }
    
    const weightedSum = (
      (cloudScore * factorWeights.cloudCover) +
      (transparencyScore * factorWeights.transparency) +
      (seeingScore * factorWeights.seeing)
    );
    
    console.log(`[WeightedScore] WeightedSum: ${weightedSum}`);
    
    const finalScore = Math.round((weightedSum / totalWeight) * 100) / 100; // Round to 2 decimals
    
    console.log(`[WeightedScore] FinalScore: ${finalScore}`);
    
    return finalScore;
  }, [factorWeights]); // Only recalculate when weights change

  // Helper function to filter conditions to observing window - memoized for performance
  const getObservingWindowConditions = useMemo(() => {
    if (!data?.analysisData?.conditions || !data?.observingWindow) {
      return [];
    }
    
    const startTime = data.observingWindow.start;
    const endTime = data.observingWindow.end;
    
    // Parse start and end times
    const [startHour] = startTime.split(':').map(Number);
    const [endHour] = endTime.split(':').map(Number);
    
    return data.analysisData.conditions.filter(condition => {
      const [conditionHour] = condition.time.split(':').map(Number);
      
      // Handle case where observing window spans midnight
      if (endHour < startHour) {
        // Spans midnight: include hours >= startHour OR hours <= endHour
        return conditionHour >= startHour || conditionHour <= endHour;
      } else {
        // Same day: include hours between start and end
        return conditionHour >= startHour && conditionHour <= endHour;
      }
    });
  }, [data?.analysisData?.conditions, data?.observingWindow]); // Only recalculate when data changes  // FactorWeightConfiguration component
  const FactorWeightConfiguration = () => {
    // Temporary state for editing individual fields
    const [tempValues, setTempValues] = useState<{[key: string]: string}>({});
    
    const totalWeight = Object.values(factorWeights).reduce((sum, weight) => sum + weight, 0);
    const isUnset = totalWeight === 0;  // User hasn't configured weights yet
    const isValid = totalWeight === 100;  // Weights are properly configured
    const isEditingMode = Object.keys(tempValues).length > 0;  // User is actively editing
    
    // Allow saving while editing, but warn if not valid
    const canSave = isValid || isEditingMode;
    
    const updateWeight = (factor: keyof typeof factorWeights, value: number) => {
      setFactorWeights(prev => ({
        ...prev,
        [factor]: value
      }));
    };

    const handleInputChange = (factor: keyof typeof factorWeights, value: string) => {
      setTempValues(prev => ({
        ...prev,
        [factor]: value
      }));
    };

    const handleInputCommit = (factor: keyof typeof factorWeights) => {
      const value = tempValues[factor];
      if (value !== undefined) {
        const numValue = parseInt(value) || 0;
        updateWeight(factor, Math.max(0, Math.min(100, numValue))); // Clamp between 0-100
        // Clear temp value
        setTempValues(prev => {
          const newTemp = { ...prev };
          delete newTemp[factor];
          return newTemp;
        });
      }
    };

    const handleKeyDown = (e: React.KeyboardEvent, factor: keyof typeof factorWeights) => {
      if (e.key === 'Enter' || e.key === 'Tab') {
        handleInputCommit(factor);
      }
    };

    const saveConfiguration = () => {
      // Force commit any pending temp values
      Object.keys(tempValues).forEach(factor => {
        handleInputCommit(factor as keyof typeof factorWeights);
      });
      
      // Save to localStorage (this already happens automatically via useEffect)
      localStorage.setItem('factorWeights', JSON.stringify(factorWeights));
      
      // Trigger recalculation with new weights
      fetchRecommendation();
      
      // Show confirmation without alert (which can cause page refresh)
      console.log('Factor weights saved successfully!');
    };

    const resetToDefaults = () => {
      const defaults = {
        cloudCover: 0,
        transparency: 0,
        seeing: 0
      };
      setFactorWeights(defaults);
      setTempValues({});
    };

    return (
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        padding: '20px',
        marginTop: '16px',
        fontSize: '1rem'
      }}>
        <h3 style={{
          fontSize: '1.2rem',
          fontWeight: '300',
          marginBottom: '20px',
          color: 'rgba(255, 255, 255, 0.9)',
          textAlign: 'center'
        }}>
          Factor Weight Configuration
        </h3>
        
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gap: '12px',
          marginBottom: '16px',
          fontSize: '0.9rem',
          color: 'rgba(255, 255, 255, 0.7)',
          fontWeight: '500'
        }}>
          <div>Factor Name</div>
          <div style={{ textAlign: 'center' }}>Weight %</div>
          <div style={{ textAlign: 'center' }}>Input</div>
        </div>
        
        {Object.entries(factorWeights).map(([factor, weight]) => (
          <div key={factor} style={{
            display: 'grid',
            gridTemplateColumns: '2fr 1fr 1fr',
            gap: '12px',
            marginBottom: '10px',
            alignItems: 'center'
          }}>
            <div style={{ 
              color: 'rgba(255, 255, 255, 0.8)', 
              textTransform: 'capitalize',
              fontSize: '1rem'
            }}>
              {factor.replace(/([A-Z])/g, ' $1').trim()}
            </div>
            <div style={{ 
              textAlign: 'center',
              color: (!isValid && !isEditingMode) ? '#ef4444' : 'rgba(255, 255, 255, 0.9)',
              fontWeight: '500',
              fontSize: '1rem'
            }}>
              {weight}%
            </div>
            <div style={{ textAlign: 'center' }}>
              <input
                type="number"
                value={tempValues[factor] !== undefined ? tempValues[factor] : weight}
                onChange={(e) => handleInputChange(factor as keyof typeof factorWeights, e.target.value)}
                onBlur={() => handleInputCommit(factor as keyof typeof factorWeights)}
                onKeyDown={(e) => handleKeyDown(e, factor as keyof typeof factorWeights)}
                min="0"
                max="100"
                placeholder={weight.toString()}
                style={{
                  width: '60px',
                  padding: '6px 8px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  border: (!isValid && !isEditingMode) ? '1px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '4px',
                  color: '#ffffff',
                  fontSize: '1rem',
                  textAlign: 'center',
                  /* Remove number input arrows */
                  MozAppearance: 'textfield',
                  WebkitAppearance: 'none',
                  appearance: 'none'
                }}
              />
              <style jsx>{`
                input[type=number]::-webkit-outer-spin-button,
                input[type=number]::-webkit-inner-spin-button {
                  -webkit-appearance: none;
                  margin: 0;
                }
                input[type=number] {
                  -moz-appearance: textfield;
                }
              `}</style>
            </div>
          </div>
        ))}
        
        <div style={{
          borderTop: '1px solid rgba(255, 255, 255, 0.2)',
          paddingTop: '12px',
          marginTop: '12px',
          display: 'grid',
          gridTemplateColumns: '2fr 1fr 1fr',
          gap: '12px',
          alignItems: 'center',
          fontWeight: '600'
        }}>
          <div style={{ color: 'rgba(255, 255, 255, 0.9)', fontSize: '1rem' }}>TOTAL:</div>
          <div style={{ 
            textAlign: 'center',
            color: isUnset ? '#f59e0b' : isValid ? '#10b981' : '#ef4444',
            fontSize: '1.1rem'
          }}>
            {totalWeight}%
          </div>
          <div style={{ 
            textAlign: 'center',
            fontSize: '0.9rem',
            color: isUnset ? '#f59e0b' : isValid ? '#10b981' : isEditingMode ? '#3b82f6' : '#ef4444'
          }}>
            {isUnset ? '⚠ Not Set' : isValid ? '✓ Valid' : isEditingMode ? '✎ Editing...' : '✗ Must = 100%'}
          </div>
        </div>

        {/* Configuration Status Message */}
        {isUnset && (
          <div style={{
            marginTop: '16px',
            padding: '12px',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            borderRadius: '6px',
            color: '#f59e0b',
            fontSize: '0.9rem',
            textAlign: 'center'
          }}>
            <div style={{ fontWeight: '500', marginBottom: '8px' }}>
              ⚠️ Factor weights not configured
            </div>
            <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontSize: '0.85rem' }}>
              Please set weights for each factor. They must add up to exactly 100%.
              <br />
              Example: Cloud Cover 40%, Transparency 30%, Seeing 30%
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '12px',
          marginTop: '16px',
          flexWrap: 'wrap'
        }}>
          <button
            onClick={saveConfiguration}
            disabled={!canSave}
            style={{
              padding: '8px 16px',
              backgroundColor: canSave ? '#10b981' : 'rgba(255, 255, 255, 0.1)',
              border: canSave ? '1px solid #10b981' : '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              color: canSave ? '#ffffff' : 'rgba(255, 255, 255, 0.5)',
              cursor: canSave ? 'pointer' : 'not-allowed',
              fontSize: '0.9rem',
              fontWeight: '500',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => {
              if (canSave) {
                e.currentTarget.style.backgroundColor = '#059669';
              }
            }}
            onMouseOut={(e) => {
              if (canSave) {
                e.currentTarget.style.backgroundColor = '#10b981';
              }
            }}
          >
            💾 Save Configuration
          </button>
          
          <button
            onClick={resetToDefaults}
            style={{
              padding: '8px 16px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderRadius: '6px',
              color: 'rgba(255, 255, 255, 0.7)',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
              e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
            }}
          >
            🔄 Reset to Defaults
          </button>
        </div>

        <div style={{
          marginTop: '12px',
          fontSize: '0.8rem',
          color: 'rgba(255, 255, 255, 0.6)',
          textAlign: 'center'
        }}>
          💡 Tip: Enter values for each factor (total must equal 100%). Press Enter/Tab or click away to apply changes. Use "Save Configuration" to update the forecast.
        </div>
      </div>
    );
  };

  // Memoize display conditions calculation for performance
  const { displayConditions, maxColumns } = useMemo(() => {
    const allConditions = data?.analysisData?.conditions || [];
    const observingConditions = getObservingWindowConditions;
    
    if (observingConditions.length === 0 || allConditions.length === 0) {
      return { displayConditions: [], maxColumns: 0 };
    }
    
    // Find the start and end indices in the full conditions array
    const firstObservingTime = observingConditions[0].time;
    const lastObservingTime = observingConditions[observingConditions.length - 1].time;
    
    const firstIndex = allConditions.findIndex(c => c.time === firstObservingTime);
    const lastIndex = allConditions.findIndex(c => c.time === lastObservingTime);
    
    // Extend by ±1 hour, but stay within bounds
    const startIndex = Math.max(0, firstIndex - 1);
    const endIndex = Math.min(allConditions.length - 1, lastIndex + 1);
    
    const conditions = allConditions.slice(startIndex, endIndex + 1);
    return { displayConditions: conditions, maxColumns: conditions.length };
  }, [data?.analysisData?.conditions, getObservingWindowConditions]);

  if (loading) {
    return (
      <div className={className} style={{
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '12px',
        padding: '24px',
        marginTop: '16px',
        color: '#ffffff',
        fontFamily: 'var(--font-primary)',
        fontWeight: '200'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '300',
          textAlign: 'center',
          marginBottom: '16px',
          letterSpacing: '0.05em'
        }}>
          {title} {customClearSkyUrl ? `for ${data?.location || 'Custom Location'}` : `for ${observatoryConfig.name}`}
        </h2>
        <div style={{
          textAlign: 'center',
          padding: '20px',
          color: 'rgba(255, 255, 255, 0.7)'
        }}>
          <div style={{
            display: 'inline-block',
            width: '20px',
            height: '20px',
            border: '2px solid rgba(255, 255, 255, 0.3)',
            borderTop: '2px solid #ffffff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}></div>
          <style jsx>{`
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          `}</style>
          <p style={{ marginTop: '12px', fontSize: '0.9rem' }}>
            Checking sky conditions...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={className} style={{
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(239, 68, 68, 0.3)',
        borderRadius: '12px',
        padding: '24px',
        marginTop: '16px',
        color: '#ffffff',
        fontFamily: 'var(--font-primary)',
        fontWeight: '200'
      }}>
        <h2 style={{
          fontSize: '1.5rem',
          fontWeight: '300',
          textAlign: 'center',
          marginBottom: '16px',
          letterSpacing: '0.05em'
        }}>
          {title} {customClearSkyUrl ? `for ${data?.location || 'Custom Location'}` : `for ${observatoryConfig.name}`}
        </h2>
        <div style={{
          textAlign: 'center',
          padding: '20px',
          color: '#ef4444'
        }}>
          <p style={{ marginBottom: '12px' }}>Unable to get forecast</p>
          <p style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.6)' }}>
            {error}
          </p>
          <button
            onClick={fetchRecommendation}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              backgroundColor: 'rgba(255, 255, 255, 0.1)',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: '6px',
              color: '#ffffff',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '200',
              transition: 'all 0.3s ease'
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.1)';
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (!data || !data.recommendation) {
    return null;
  }

  const recommendation = data.recommendation;

  return (
    <div className={className} style={{
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      backdropFilter: 'blur(10px)',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '12px',
      padding: '24px',
      marginTop: '16px',
      color: '#ffffff',
      fontFamily: 'var(--font-primary)',
      fontWeight: '200'
    }}>
      <h2 style={{
        fontSize: '1.5rem',
        fontWeight: '300',
        textAlign: 'center',
        marginBottom: '20px',
        letterSpacing: '0.05em'
      }}>
        {title} {customClearSkyUrl ? `for ${data?.location || 'Custom Location'}` : `for ${observatoryConfig.name}`}
      </h2>

      {/* Main Recommendation */}
      <div style={{
        textAlign: 'center',
        marginBottom: '20px',
        padding: '16px',
        backgroundColor: 'rgba(255, 255, 255, 0.05)',
        borderRadius: '8px',
        border: `2px solid ${getStatusColor(recommendation.overall)}`
      }}>
        <div style={{
          fontSize: '1.25rem',
          fontWeight: '300',
          color: getStatusColor(recommendation.overall),
          marginBottom: '8px'
        }}>
          {getStatusText(recommendation.overall)}
        </div>
        <p style={{
          fontSize: '0.95rem',
          color: 'rgba(255, 255, 255, 0.8)',
          lineHeight: '1.5',
          margin: '0'
        }}>
          {recommendation.summary}
        </p>
      </div>

      {/* Observing Window Info */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px',
        marginBottom: '16px',
        fontSize: '0.85rem'
      }}>
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          padding: '8px 12px',
          borderRadius: '6px',
          textAlign: 'center'
        }}>
          <div style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '2px' }}>Good Observing Time</div>
          <div style={{ color: '#ffffff', fontWeight: '300' }}>
            {data.observingWindow.start} - {data.observingWindow.end}
          </div>
          <div style={{ color: 'rgba(255, 255, 255, 0.6)', fontSize: '0.75rem' }}>
            ({data.observingWindow.totalHours} hours)
          </div>
        </div>
        
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          padding: '8px 12px',
          borderRadius: '6px',
          textAlign: 'center'
        }}>
          <div style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '2px' }}>Location</div>
          <div style={{ color: '#ffffff', fontWeight: '300' }}>
            {data.location}
          </div>
        </div>
        
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          padding: '8px 12px',
          borderRadius: '6px',
          textAlign: 'center'
        }}>
          <div style={{ color: 'rgba(255, 255, 255, 0.7)', marginBottom: '2px' }}>Sun Times</div>
          <div style={{ color: '#ffffff', fontWeight: '300', fontSize: '0.8rem' }}>
            ↓ {data.sunTimes.sunset} | ↑ {data.sunTimes.sunrise}
          </div>
        </div>
      </div>

      {/* Time Windows */}
      {recommendation.timeWindows && recommendation.timeWindows.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <h3 style={{
            fontSize: '1rem',
            fontWeight: '300',
            marginBottom: '12px',
            color: 'rgba(255, 255, 255, 0.9)'
          }}>
            Tonight:
          </h3>
          {recommendation.timeWindows.map((window, index) => (
            <div key={index} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '8px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              borderRadius: '6px',
              marginBottom: '8px',
              fontSize: '0.9rem'
            }}>
              <span style={{ color: 'rgba(255, 255, 255, 0.9)' }}>
                {window.start} - {window.end}
              </span>
              <span style={{ 
                color: getStatusColor(window.quality),
                fontWeight: '300'
              }}>
                {window.quality.charAt(0).toUpperCase() + window.quality.slice(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Detailed Conditions */}
      <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          padding: '16px',
          fontSize: '0.9rem'
        }}>
          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Cloud Cover:</strong>
            <span style={{ marginLeft: '8px', color: 'rgba(255, 255, 255, 0.7)' }}>
              {recommendation.details.cloudCover}
            </span>
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Transparency:</strong>
            <span style={{ marginLeft: '8px', color: 'rgba(255, 255, 255, 0.7)' }}>
              {recommendation.details.transparency}
            </span>
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Seeing:</strong>
            <span style={{ marginLeft: '8px', color: 'rgba(255, 255, 255, 0.7)' }}>
              {recommendation.details.seeing}
            </span>
          </div>
          
          <div style={{ marginBottom: '12px' }}>
            <strong style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Moon Impact:</strong>
            <span style={{ marginLeft: '8px', color: 'rgba(255, 255, 255, 0.7)' }}>
              {recommendation.details.moonImpact}
            </span>
          </div>

          {recommendation.details.weatherWarnings.length > 0 && (
            <div style={{ marginTop: '16px' }}>
              <strong style={{ color: '#f59e0b' }}>Weather Warnings:</strong>
              <ul style={{ 
                margin: '8px 0 0 0', 
                paddingLeft: '20px',
                color: 'rgba(255, 255, 255, 0.7)'
              }}>
                {recommendation.details.weatherWarnings.map((warning, index) => (
                  <li key={index} style={{ marginBottom: '4px' }}>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

      {/* Factor Weight Configuration */}
      <FactorWeightConfiguration />

      {/* Clear Sky Chart Image Display */}
      {customClearSkyUrl && (
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          padding: '16px',
          marginTop: '16px',
          textAlign: 'center'
        }}>
          <h3 style={{
            fontSize: '1rem',
            fontWeight: '300',
            marginBottom: '16px',
            color: 'rgba(255, 255, 255, 0.9)'
          }}>
            Clear Sky Chart Image
          </h3>
          {(() => {
            // Convert HTML URL to GIF URL for display
            let imageUrl = customClearSkyUrl;
            
            // If it's an HTML URL, convert to GIF
            const htmlMatch = customClearSkyUrl.match(/\/c\/([^\/]+)\.html/);
            if (htmlMatch) {
              const fullId = htmlMatch[1]; // e.g., "FourPksObWAkey"
              const chartId = fullId.replace(/key$/, ''); // Remove "key" suffix to get base ID
              imageUrl = `https://www.cleardarksky.com/c/${chartId}csk.gif`;
            }
            
            return (
              <div style={{
                display: 'inline-block',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                borderRadius: '4px',
                overflow: 'hidden'
              }}>
                <img 
                  src={imageUrl}
                  alt="Clear Sky Chart"
                  style={{
                    maxWidth: '100%',
                    height: 'auto',
                    display: 'block'
                  }}
                  onError={(e) => {
                    console.error('Failed to load Clear Sky Chart image:', imageUrl);
                    e.currentTarget.style.display = 'none';
                  }}
                />
              </div>
            );
          })()}
          <div style={{
            marginTop: '8px',
            fontSize: '0.75rem',
            color: 'rgba(255, 255, 255, 0.6)'
          }}>
            This is the actual Clear Sky Chart being analyzed. White/light colors indicate poor conditions.
          </div>
        </div>
      )}

      {/* Detailed Hourly Scores */}
      {data.analysisData?.conditions && data.analysisData.conditions.length > 0 && (
        <div style={{
          backgroundColor: 'rgba(255, 255, 255, 0.05)',
          borderRadius: '8px',
          padding: '16px',
          marginTop: '16px',
          fontSize: '0.85rem'
        }}>
          <h3 style={{
            fontSize: '1rem',
            fontWeight: '300',
            marginBottom: '16px',
            color: 'rgba(255, 255, 255, 0.9)',
            textAlign: 'center'
          }}>
            Detailed Hourly Analysis (1-5 scale, 5=best)
          </h3>
          
          {(() => {
            if (displayConditions.length === 0) {
              return null;
            }
            
            return (
              <>
                {/* Header row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `100px repeat(${maxColumns}, 1fr)`,
                  gap: '4px',
                  marginBottom: '8px',
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.6)'
                }}>
                  <div></div>
                  {displayConditions.map((condition, i) => (
                    <div key={i} style={{ textAlign: 'center' }}>
                      {condition.time}
                    </div>
                  ))}
                </div>
                
                {/* Cloud Cover row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `100px repeat(${maxColumns}, 1fr)`,
                  gap: '4px',
                  marginBottom: '4px',
                  alignItems: 'center'
                }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontWeight: '300' }}>
                    Cloud Cover:
                  </div>
                  {displayConditions.map((condition, i) => {
                    // cloudCover is already on 1-5 scale from parser (5=excellent, 1=poor)
                    const score = condition.cloudCover;
                    const color = score >= 4 ? '#10b981' : score >= 3 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={i} style={{
                        textAlign: 'center',
                        padding: '4px 2px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '4px',
                        color: color,
                        fontWeight: '500',
                        fontSize: '0.8rem'
                      }}>
                        {score}
                      </div>
                    );
                  })}
                </div>
                
                {/* Transparency row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `100px repeat(${maxColumns}, 1fr)`,
                  gap: '4px',
                  marginBottom: '4px',
                  alignItems: 'center'
                }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontWeight: '300' }}>
                    Transparency:
                  </div>
                  {displayConditions.map((condition, i) => {
                    // Convert transparency (0-5 scale) to display
                    const score = Math.round(condition.transparency);
                    const color = score >= 4 ? '#10b981' : score >= 3 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={i} style={{
                        textAlign: 'center',
                        padding: '4px 2px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '4px',
                        color: color,
                        fontWeight: '500',
                        fontSize: '0.8rem'
                      }}>
                        {score}
                      </div>
                    );
                  })}
                </div>
                
                {/* Seeing row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `100px repeat(${maxColumns}, 1fr)`,
                  gap: '4px',
                  marginBottom: '4px',
                  alignItems: 'center'
                }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.8)', fontWeight: '300' }}>
                    Seeing:
                  </div>
                  {displayConditions.map((condition, i) => {
                    const score = condition.seeing;
                    const color = score >= 4 ? '#10b981' : score >= 3 ? '#f59e0b' : '#ef4444';
                    return (
                      <div key={i} style={{
                        textAlign: 'center',
                        padding: '4px 2px',
                        backgroundColor: 'rgba(255, 255, 255, 0.1)',
                        borderRadius: '4px',
                        color: color,
                        fontWeight: '500',
                        fontSize: '0.8rem'
                      }}>
                        {score}
                      </div>
                    );
                  })}
                </div>
                
                {/* Weighted Score row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `100px repeat(${maxColumns}, 1fr)`,
                  gap: '4px',
                  marginTop: '8px',
                  alignItems: 'center',
                  borderTop: '1px solid rgba(255, 255, 255, 0.2)',
                  paddingTop: '8px'
                }}>
                  <div style={{ color: 'rgba(255, 255, 255, 0.9)', fontWeight: '400' }}>
                    Weighted Score:
                  </div>
                  {displayConditions.map((condition, i) => {
                    const weightedScore = calculateWeightedScore(condition);
                    const color = weightedScore >= 4 ? '#10b981' : weightedScore >= 3 ? '#f59e0b' : '#ef4444';
                    
                    return (
                      <div key={i} style={{
                        textAlign: 'center',
                        padding: '6px 2px',
                        backgroundColor: 'rgba(255, 255, 255, 0.15)',
                        borderRadius: '4px',
                        color: color,
                        fontWeight: '600',
                        fontSize: '0.8rem',
                        border: `1px solid ${color}40`
                      }}>
                        {weightedScore.toFixed(1)}
                      </div>
                    );
                  })}
                </div>
                
                <div style={{
                  marginTop: '12px',
                  fontSize: '0.75rem',
                  color: 'rgba(255, 255, 255, 0.6)',
                  textAlign: 'center'
                }}>
                  Weighted Score = Cloud Cover ({factorWeights.cloudCover}%) + Transparency ({factorWeights.transparency}%) + Seeing ({factorWeights.seeing}%) + other factors
                  <br />
                  Showing observing window: {data.observingWindow.start} - {data.observingWindow.end} ({getObservingWindowConditions.length} hours total)
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        gap: '12px',
        marginTop: '16px',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={fetchRecommendation}
          style={{
            padding: '6px 12px',
            backgroundColor: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.3)',
            borderRadius: '6px',
            color: 'rgba(255, 255, 255, 0.7)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: '200',
            transition: 'all 0.3s ease'
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.5)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.9)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            e.currentTarget.style.color = 'rgba(255, 255, 255, 0.7)';
          }}
        >
          Refresh Forecast
        </button>
      </div>
    </div>
  );
}
