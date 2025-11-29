import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, RotateCcw, Clock } from 'lucide-react';

const Stopwatch = ({ onRunningChange = () => {} }) => {
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [laps, setLaps] = useState([]);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isRunning) {
      intervalRef.current = setInterval(() => {
        setTime(prev => prev + 1);
      }, 1000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning]);

  useEffect(() => {
    onRunningChange(isRunning);

    return () => {
      onRunningChange(false);
    };
  }, [isRunning, onRunningChange]);

  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStart = () => {
    setIsRunning(true);
  };

  const handlePause = () => {
    setIsRunning(false);
  };

  const handleStop = () => {
    setIsRunning(false);
    setTime(0);
    setLaps([]);
  };

  const handleLap = () => {
    if (isRunning) {
      const lapTime = time;
      const lapNumber = laps.length + 1;
      const previousLapTime = laps.length > 0 ? laps[laps.length - 1].totalTime : 0;
      const splitTime = lapTime - previousLapTime;
      
      setLaps(prev => [...prev, {
        number: lapNumber,
        totalTime: lapTime,
        splitTime: splitTime
      }]);
    }
  };

  const handleReset = () => {
    setTime(0);
    setLaps([]);
  };

  return (
    <div className="flex-1 flex flex-col p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center">
          <Clock className="w-8 h-8 mr-3" />
          Chronomètre
        </h1>
        <p className="text-gray-600">Chronomètre classique pour mesurer le temps</p>
      </div>

      <div className="flex-1 flex">
        <div className="flex-1 flex flex-col items-center justify-center pr-8">
          <div className="relative w-80 h-80 mx-auto mb-8">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 320 320">
              <circle
                cx="160"
                cy="160"
                r="140"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                className="text-gray-200"
              />
              <circle
                cx="160"
                cy="160"
                r="140"
                stroke="currentColor"
                strokeWidth="8"
                fill="none"
                strokeDasharray={`${2 * Math.PI * 140}`}
                strokeDashoffset={`${2 * Math.PI * 140 * (1 - (time % 60) / 60)}`}
                className={`transition-all duration-300 ${
                  isRunning ? 'text-primary-500' : 'text-gray-400'
                }`}
                strokeLinecap="round"
              />
            </svg>
            
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className={`text-6xl font-mono font-bold ${isRunning ? 'text-primary-600 timer-active' : 'text-gray-900'}`}>
                  {formatTime(time)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center space-x-4">
            {!isRunning ? (
              <button
                onClick={handleStart}
                className="btn-primary flex items-center space-x-2 px-8 py-4 text-lg"
              >
                <Play className="w-6 h-6" />
                <span>Démarrer</span>
              </button>
            ) : (
              <button
                onClick={handlePause}
                className="btn-warning flex items-center space-x-2 px-8 py-4 text-lg"
              >
                <Pause className="w-6 h-6" />
                <span>Pause</span>
              </button>
            )}
            
            <button
              onClick={handleLap}
              disabled={!isRunning}
              className={`btn-secondary flex items-center space-x-2 px-6 py-4 text-lg ${
                !isRunning ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <RotateCcw className="w-5 h-5" />
              <span>Tour</span>
            </button>
            
            <button
              onClick={handleStop}
              className="btn-danger flex items-center space-x-2 px-8 py-4 text-lg"
            >
              <Square className="w-6 h-6" />
              <span>Stop</span>
            </button>
          </div>

          {!isRunning && time > 0 && (
            <button
              onClick={handleReset}
              className="btn-secondary flex items-center space-x-2 mt-4"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Remettre à zéro</span>
            </button>
          )}
        </div>

        <div className="w-80 bg-white rounded-xl border border-gray-200 flex flex-col">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">
              Tours ({laps.length})
            </h3>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {laps.length === 0 ? (
              <div className="p-8 text-center">
                <RotateCcw className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-500">Aucun tour enregistré</p>
                <p className="text-sm text-gray-400">Cliquez sur "Tour" pendant le chronomètre</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                {[...laps].reverse().map((lap) => (
                  <div
                    key={lap.number}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 bg-primary-100 text-primary-600 rounded-full flex items-center justify-center text-sm font-medium">
                        {lap.number}
                      </div>
                      <div>
                        <div className="font-mono text-sm text-gray-900">
                          {formatTime(lap.totalTime)}
                        </div>
                        <div className="text-xs text-gray-500">Total</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm text-primary-600">
                        +{formatTime(lap.splitTime)}
                      </div>
                      <div className="text-xs text-gray-500">Écart</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Stopwatch; 