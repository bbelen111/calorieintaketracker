import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useMemo } from 'react';
import { ModalShell } from '../common/ModalShell';
import { calculatePhaseMetrics } from '../../../utils/phases';

// Simple CSS-based line chart
const MiniLineChart = ({ data, color = 'blue', height = 80, showDots = false }) => {
  if (!data || data.length === 0) {
    return <div className="flex items-center justify-center h-20 text-slate-500 text-sm">No data</div>;
  }

  const values = data.map(d => d.value).filter(v => v != null);
  if (values.length === 0) {
    return <div className="flex items-center justify-center h-20 text-slate-500 text-sm">No data</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const points = data.map((d, i) => {
    if (d.value == null) return null;
    const x = (i / (data.length - 1)) * 100;
    const y = ((max - d.value) / range) * 100;
    return { x, y };
  }).filter(p => p != null);

  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  return (
    <div className="relative" style={{ height: `${height}px` }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
        {/* Grid lines */}
        <line x1="0" y1="25" x2="100" y2="25" stroke="currentColor" strokeWidth="0.2" className="text-slate-600" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" strokeWidth="0.2" className="text-slate-600" />
        <line x1="0" y1="75" x2="100" y2="75" stroke="currentColor" strokeWidth="0.2" className="text-slate-600" />
        
        {/* Line */}
        <path d={pathD} fill="none" stroke="currentColor" strokeWidth="2" className={`text-${color}-500`} vectorEffect="non-scaling-stroke" />
        
        {/* Dots */}
        {showDots && points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="2" fill="currentColor" className={`text-${color}-500`} />
        ))}
      </svg>
    </div>
  );
};

// Simple bar chart for macros
const MacroBarChart = ({ protein, carbs, fats }) => {
  const total = protein + carbs + fats || 1;
  const proteinPct = (protein / total) * 100;
  const carbsPct = (carbs / total) * 100;
  const fatsPct = (fats / total) * 100;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="w-16 text-sm text-slate-400">Protein</div>
        <div className="flex-1 h-6 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500" style={{ width: `${proteinPct}%` }}></div>
        </div>
        <div className="w-16 text-right text-sm text-white">{protein.toFixed(0)}g</div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-16 text-sm text-slate-400">Carbs</div>
        <div className="flex-1 h-6 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-green-500" style={{ width: `${carbsPct}%` }}></div>
        </div>
        <div className="w-16 text-right text-sm text-white">{carbs.toFixed(0)}g</div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-16 text-sm text-slate-400">Fats</div>
        <div className="flex-1 h-6 bg-slate-700 rounded-full overflow-hidden">
          <div className="h-full bg-yellow-500" style={{ width: `${fatsPct}%` }}></div>
        </div>
        <div className="w-16 text-right text-sm text-white">{fats.toFixed(0)}g</div>
      </div>
    </div>
  );
};

const PhaseInsightsModal = ({ isOpen, isClosing, phase, weightEntries, onClose, onExport }) => {
  const insights = useMemo(() => {
    if (!phase) return null;

    const metrics = calculatePhaseMetrics(phase, weightEntries);
    const logs = Object.entries(phase.dailyLogs || {})
      .map(([date, log]) => ({ date, ...log }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Weight trend data
    const phaseWeights = weightEntries
      .filter(entry => {
        if (entry.date < phase.startDate) return false;
        if (phase.endDate && entry.date > phase.endDate) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date));

    const weightTrendData = phaseWeights.map(entry => ({
      date: entry.date,
      value: entry.weight
    }));

    // Calorie trend data
    const calorieTrendData = logs
      .filter(log => log.calories != null)
      .map(log => ({
        date: log.date,
        value: log.calories
      }));

    // Calculate averages
    const totalProtein = logs.reduce((sum, log) => sum + (log.protein || 0), 0);
    const totalCarbs = logs.reduce((sum, log) => sum + (log.carbs || 0), 0);
    const totalFats = logs.reduce((sum, log) => sum + (log.fats || 0), 0);
    const macroCount = logs.filter(log => log.protein || log.carbs || log.fats).length;

    const avgProtein = macroCount > 0 ? totalProtein / macroCount : 0;
    const avgCarbs = macroCount > 0 ? totalCarbs / macroCount : 0;
    const avgFats = macroCount > 0 ? totalFats / macroCount : 0;

    // Weekly breakdown
    const weeklyData = [];
    let currentWeek = [];
    logs.forEach((log, i) => {
      currentWeek.push(log);
      if ((i + 1) % 7 === 0 || i === logs.length - 1) {
        const weekLogs = currentWeek.filter(l => l.calories != null);
        const weekCalories = weekLogs.reduce((sum, l) => sum + l.calories, 0);
        const weekSteps = currentWeek.filter(l => l.steps != null).reduce((sum, l) => sum + l.steps, 0);
        const weekAvgCalories = weekLogs.length > 0 ? weekCalories / weekLogs.length : 0;
        const weekAvgSteps = currentWeek.filter(l => l.steps != null).length > 0 
          ? weekSteps / currentWeek.filter(l => l.steps != null).length 
          : 0;

        weeklyData.push({
          weekNum: weeklyData.length + 1,
          avgCalories: weekAvgCalories,
          avgSteps: weekAvgSteps,
          compliance: currentWeek.filter(l => l.completed).length
        });
        currentWeek = [];
      }
    });

    return {
      metrics,
      weightTrendData,
      calorieTrendData,
      avgProtein,
      avgCarbs,
      avgFats,
      weeklyData,
      totalLogs: logs.length
    };
  }, [phase, weightEntries]);

  if (!insights) return null;

  const { metrics, weightTrendData, calorieTrendData, avgProtein, avgCarbs, avgFats, weeklyData, totalLogs } = insights;

  // Determine weight trend direction
  const weightTrendIcon = metrics.weightChange > 0.5 
    ? <TrendingUp className="w-5 h-5 text-red-400" />
    : metrics.weightChange < -0.5
    ? <TrendingDown className="w-5 h-5 text-green-400" />
    : <Minus className="w-5 h-5 text-slate-400" />;

  return (
    <ModalShell isOpen={isOpen} isClosing={isClosing} contentClassName="w-full md:max-w-4xl max-h-[90vh] overflow-y-auto">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h3 className="text-white font-bold text-2xl">{phase.name} Insights</h3>
            <p className="text-slate-400 text-sm mt-1">
              {totalLogs} day{totalLogs !== 1 ? 's' : ''} logged • {metrics.completionRate.toFixed(0)}% compliance
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-700"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">Avg Calories</div>
            <div className="text-white text-2xl font-bold">{metrics.avgCalories.toFixed(0)}</div>
            <div className="text-slate-500 text-xs mt-1">per day</div>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">Avg Steps</div>
            <div className="text-white text-2xl font-bold">{metrics.avgSteps.toFixed(0)}</div>
            <div className="text-slate-500 text-xs mt-1">per day</div>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
            <div className="text-slate-400 text-xs mb-1 flex items-center gap-1">
              Weight Change {weightTrendIcon}
            </div>
            <div className={`text-2xl font-bold ${
              metrics.weightChange > 0.5 ? 'text-red-400' : 
              metrics.weightChange < -0.5 ? 'text-green-400' : 
              'text-white'
            }`}>
              {metrics.weightChange > 0 ? '+' : ''}{metrics.weightChange.toFixed(1)} kg
            </div>
            <div className="text-slate-500 text-xs mt-1">{metrics.avgWeeklyRate.toFixed(2)} kg/week</div>
          </div>
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
            <div className="text-slate-400 text-xs mb-1">Compliance</div>
            <div className="text-white text-2xl font-bold">{metrics.completionRate.toFixed(0)}%</div>
            <div className="text-slate-500 text-xs mt-1">days completed</div>
          </div>
        </div>

        {/* Weight Trend Chart */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4">
          <h4 className="text-white font-semibold mb-3">Weight Trend</h4>
          {weightTrendData.length > 0 ? (
            <>
              <MiniLineChart data={weightTrendData} color="purple" height={120} showDots={true} />
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>{weightTrendData[0]?.date}</span>
                <span>{weightTrendData[weightTrendData.length - 1]?.date}</span>
              </div>
            </>
          ) : (
            <div className="h-20 flex items-center justify-center text-slate-500 text-sm">
              No weight entries logged
            </div>
          )}
        </div>

        {/* Calorie Trend Chart */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4">
          <h4 className="text-white font-semibold mb-3">Calorie Trend</h4>
          {calorieTrendData.length > 0 ? (
            <>
              <MiniLineChart data={calorieTrendData} color="blue" height={120} />
              <div className="flex justify-between text-xs text-slate-400 mt-2">
                <span>{calorieTrendData[0]?.date}</span>
                <span>{calorieTrendData[calorieTrendData.length - 1]?.date}</span>
              </div>
            </>
          ) : (
            <div className="h-20 flex items-center justify-center text-slate-500 text-sm">
              No calorie data logged
            </div>
          )}
        </div>

        {/* Macro Breakdown */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-4">
          <h4 className="text-white font-semibold mb-3">Average Macro Breakdown</h4>
          {avgProtein > 0 || avgCarbs > 0 || avgFats > 0 ? (
            <MacroBarChart protein={avgProtein} carbs={avgCarbs} fats={avgFats} />
          ) : (
            <div className="h-20 flex items-center justify-center text-slate-500 text-sm">
              No macro data logged
            </div>
          )}
        </div>

        {/* Weekly Breakdown */}
        {weeklyData.length > 0 && (
          <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 mb-6">
            <h4 className="text-white font-semibold mb-3">Weekly Breakdown</h4>
            <div className="space-y-2">
              {weeklyData.map((week) => (
                <div key={week.weekNum} className="flex items-center gap-3 text-sm">
                  <div className="w-16 text-slate-400">Week {week.weekNum}</div>
                  <div className="flex-1 grid grid-cols-3 gap-2">
                    <div className="bg-slate-900 px-3 py-1 rounded">
                      <span className="text-slate-500">Cal: </span>
                      <span className="text-white">{week.avgCalories.toFixed(0)}</span>
                    </div>
                    <div className="bg-slate-900 px-3 py-1 rounded">
                      <span className="text-slate-500">Steps: </span>
                      <span className="text-white">{week.avgSteps.toFixed(0)}</span>
                    </div>
                    <div className="bg-slate-900 px-3 py-1 rounded">
                      <span className="text-slate-500">Done: </span>
                      <span className="text-white">{week.compliance}/7</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={onExport}
            className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl font-medium transition-colors"
          >
            Export Phase Data
          </button>
          <button
            onClick={onClose}
            className="px-6 bg-slate-700 hover:bg-slate-600 text-white py-3 rounded-xl font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  );
};

export { PhaseInsightsModal };
