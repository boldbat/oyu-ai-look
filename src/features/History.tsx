import { useState } from 'react';
import {
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Image,
  Info,
  Plus,
  Shirt,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { localDate } from '../lib/demo';
import type { Analysis } from '../lib/types';
import { Dialog } from '../components/Dialog';
import './features.css';

function displayDate(
  date: string,
  options: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' },
) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en', options);
}
const dimensionLabels = {
  color: 'Color harmony',
  hairstyle: 'Hairstyle',
  accessories: 'Accessories',
  styling: 'Overall styling',
};

export function History() {
  const { data, logWear, navigate } = useApp();
  const [tab, setTab] = useState<'analyses' | 'wear'>('analyses');
  const [range, setRange] = useState('30');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [date, setDate] = useState(localDate());
  const [month, setMonth] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [logging, setLogging] = useState(false);
  const [logDate, setLogDate] = useState(localDate());
  const [logSelection, setLogSelection] = useState<string[]>([]);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (Number(range) - 1));
  const analyses = data.analyses.filter(
    (a) => a.date <= localDate() && (range === 'all' || a.date >= localDate(cutoff)),
  );
  const scored = analyses.filter((a) => a.overall !== null);
  const average = scored.length
    ? Math.round(scored.reduce((total, a) => total + (a.overall ?? 0), 0) / scored.length)
    : null;
  const selectedLog = data.wearLogs.find((w) => w.date === date);
  const selectedPieces = [...data.garments, ...data.archivedGarments].filter((g) =>
    selectedLog?.garmentIds.includes(g.id),
  );
  const previousLog = data.wearLogs.find((w) => w.date === logDate);
  const loggablePieces = [
    ...data.garments,
    ...data.archivedGarments.filter((g) => previousLog?.garmentIds.includes(g.id)),
  ];
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const offset = (firstDay.getDay() + 6) % 7;
  const dayCount = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const calendar = Array.from({ length: Math.ceil((offset + dayCount) / 7) * 7 }, (_, i) => {
    const d = new Date(month.getFullYear(), month.getMonth(), i - offset + 1);
    return { key: localDate(d), day: d.getDate(), inMonth: d.getMonth() === month.getMonth() };
  });
  function startLog(day = date) {
    setLogDate(day);
    setLogSelection(data.wearLogs.find((w) => w.date === day)?.garmentIds ?? []);
    setLogging(true);
  }
  return (
    <div className="history-page feature-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR STYLE, OVER TIME</p>
          <h1 className="page-title">Every day tells a style story.</h1>
          <p className="muted">Revisit your looks. Notice what works. Make it yours.</p>
        </div>
        <button className="button" onClick={() => startLog(localDate())}>
          <Plus size={17} /> Log what you wore
        </button>
      </div>
      <div className="history-navigation">
        <div className="segmented">
          <button
            className={tab === 'analyses' ? 'active' : ''}
            aria-pressed={tab === 'analyses'}
            onClick={() => setTab('analyses')}
          >
            <Sparkles size={16} /> Style insights
          </button>
          <button
            className={tab === 'wear' ? 'active' : ''}
            aria-pressed={tab === 'wear'}
            onClick={() => setTab('wear')}
          >
            <CalendarDays size={16} /> Wear journal
          </button>
        </div>
        {tab === 'analyses' && (
          <label className="feature-select">
            <CalendarDays size={16} />
            <select
              aria-label="Analysis date range"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="all">All time</option>
            </select>
          </label>
        )}
      </div>
      {tab === 'analyses' ? (
        <>
          <div className="history-summary-grid">
            <div className="card history-stat">
              <span>Sample style average</span>
              <div>
                <strong>{average ?? '—'}</strong>
                <small>/ 100</small>
                <span className="stat-sparkle">
                  <Sparkles size={20} />
                </span>
              </div>
              <p>
                Based on {scored.length} illustrative{' '}
                {scored.length === 1 ? 'analysis' : 'analyses'}
              </p>
            </div>
            <div className="card history-stat">
              <span>Looks in this chapter</span>
              <div>
                <strong>{analyses.length}</strong>
                <span className="stat-sparkle">
                  <Image size={20} />
                </span>
              </div>
              <p>Every outfit has something to tell you</p>
            </div>
            <div className="card history-stat journal-stat">
              <span>Your wardrobe in motion</span>
              <div>
                <strong>{data.wearLogs.filter((w) => w.garmentIds.length > 0).length}</strong>
                <small>days recorded</small>
              </div>
              <button className="text-link" onClick={() => setTab('wear')}>
                Open your wear journal <ArrowUpRight size={15} />
              </button>
            </div>
          </div>
          <div className="sample-insights-note">
            <Info size={16} />
            <p>
              You’re exploring sample style insights. These scores are illustrative and aren’t an
              assessment of your photos.
            </p>
          </div>
          <div className="section-heading">
            <div>
              <h2>A look back.</h2>
              <p className="muted">Small discoveries. A more confident you.</p>
            </div>
            <span className="muted">{analyses.length} looks</span>
          </div>
          <div className="analysis-grid">
            {analyses.map((a) => (
              <button key={a.id} className="analysis-card card" onClick={() => setAnalysis(a)}>
                <div className="analysis-image">
                  <img loading="lazy" decoding="async" src={a.image} alt={a.title} />
                  <span className="analysis-score">
                    {a.overall ?? '—'}
                    <small>{a.overall !== null ? '/100' : 'Partial'}</small>
                  </span>
                  <span className="analysis-sample">
                    {a.sample ? 'Sample look' : 'Photo analysis'}
                  </span>
                </div>
                <div className="analysis-content">
                  <span>
                    {displayDate(a.date, { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  <h3>{a.title}</h3>
                  <span className="analysis-view">
                    Explore this look <ArrowUpRight size={16} />
                  </span>
                </div>
              </button>
            ))}
          </div>
          {analyses.length === 0 && (
            <div className="empty-state">
              <Clock3 size={30} />
              <h3>A fresh chapter.</h3>
              <p>No analyses in this date range. Try a longer view.</p>
            </div>
          )}
        </>
      ) : (
        <div className="wear-journal-layout">
          <section className="card wear-calendar">
            <div className="calendar-heading">
              <h2>{month.toLocaleDateString('en', { month: 'long', year: 'numeric' })}</h2>
              <div>
                <button
                  className="icon-button"
                  aria-label="Previous month"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Next month"
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
            <div className="calendar-weekdays">
              {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                <span key={i}>{d}</span>
              ))}
            </div>
            <div className="calendar-days">
              {calendar.map((d) => {
                const hasWear = data.wearLogs.some(
                  (w) => w.date === d.key && w.garmentIds.length > 0,
                );
                return (
                  <button
                    key={d.key}
                    className={`${!d.inMonth ? 'other-month' : ''} ${d.key === date ? 'selected' : ''} ${d.key === localDate() ? 'today' : ''}`}
                    onClick={() => setDate(d.key)}
                    aria-label={`${displayDate(d.key)}, ${hasWear ? 'outfit recorded' : 'no outfit recorded'}`}
                    aria-pressed={d.key === date}
                  >
                    <span>{d.day}</span>
                    {hasWear && <i />}
                  </button>
                );
              })}
            </div>
            <div className="calendar-legend">
              <span>
                <i /> Outfit recorded
              </span>
              <button
                className="text-link"
                onClick={() => {
                  setDate(localDate());
                  setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                }}
              >
                Back to today
              </button>
            </div>
            <div className="wear-note">
              <Info size={16} />
              <p>
                Only outfits you explicitly record appear in your wear journal. Your initial
                workspace includes three sample entries.
              </p>
            </div>
          </section>
          <section className="card journal-day">
            <div className="section-heading">
              <div>
                <p className="eyebrow">
                  {date === localDate()
                    ? 'TODAY'
                    : displayDate(date, { weekday: 'long' }).toUpperCase()}
                </p>
                <h2>{displayDate(date)}</h2>
              </div>
              <span className="badge">{selectedPieces.length} pieces</span>
            </div>
            {selectedPieces.length ? (
              <>
                <div className="journal-pieces">
                  {selectedPieces.map((g) => (
                    <div key={g.id}>
                      <img loading="lazy" decoding="async" src={g.image} alt={g.name} />
                      <div>
                        <strong>{g.name}</strong>
                        <span>{g.color}</span>
                      </div>
                      <Check size={16} />
                    </div>
                  ))}
                </div>
                <button className="button secondary" onClick={() => startLog()}>
                  Edit this day’s outfit
                </button>
                <p className="feature-footnote">
                  Recorded by you or included in your sample workspace.
                </p>
              </>
            ) : (
              <div className="journal-empty">
                <span>
                  <Shirt size={32} strokeWidth={1.3} />
                </span>
                <h3>
                  {date > localDate()
                    ? 'A little room for possibility.'
                    : 'What felt like you that day?'}
                </h3>
                <p>
                  {date > localDate()
                    ? 'Come back on this date to record what you actually wore.'
                    : 'Keep a memory of the pieces you wore. No photo needed.'}
                </p>
                <button
                  className="button secondary"
                  disabled={date > localDate()}
                  onClick={() => startLog()}
                >
                  <Plus size={16} /> Record an outfit
                </button>
              </div>
            )}
          </section>
        </div>
      )}
      {analysis && (
        <Dialog title={analysis.title} onClose={() => setAnalysis(null)} wide>
          <div className="analysis-detail">
            <img loading="lazy" decoding="async" src={analysis.image} alt={analysis.title} />
            <div>
              <span className="badge">
                {analysis.sample ? 'Illustrative sample' : 'Photo analysis'} ·{' '}
                {displayDate(analysis.date)}
              </span>
              <div className="analysis-detail-score">
                <strong>{analysis.overall ?? '—'}</strong>
                <span>{analysis.overall === null ? 'Partial analysis' : '/ 100 style score'}</span>
              </div>
              <p>{analysis.note}</p>
              <div className="dimension-list">
                {(Object.keys(dimensionLabels) as Array<keyof typeof dimensionLabels>).map(
                  (key) => (
                    <div key={key}>
                      <div>
                        <span>{dimensionLabels[key]}</span>
                        <strong>
                          {analysis.dimensions[key] === null
                            ? 'Not assessed'
                            : `${analysis.dimensions[key]} / 25`}
                        </strong>
                      </div>
                      <div className="dimension-track">
                        <span
                          style={{ width: `${((analysis.dimensions[key] ?? 0) / 25) * 100}%` }}
                        />
                      </div>
                    </div>
                  ),
                )}
              </div>
              <p className="feature-footnote">
                {analysis.sample
                  ? 'This example shows how a style assessment is presented. No AI assessment was performed on this photo in your workspace.'
                  : 'A photo alone cannot establish physical fit or comfort.'}
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  setAnalysis(null);
                  navigate('studio');
                }}
              >
                Create a look of your own <ArrowUpRight size={16} />
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {logging && (
        <Dialog title="A little record of what you wore." onClose={() => setLogging(false)} wide>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (logDate > localDate()) return;
              logWear(logDate, logSelection);
              setDate(logDate);
              const d = new Date(`${logDate}T12:00:00`);
              setMonth(new Date(d.getFullYear(), d.getMonth(), 1));
              setLogging(false);
              setTab('wear');
            }}
          >
            <p className="muted">
              Choose the actual pieces you wore. You can revisit and edit this day anytime.
            </p>
            <label className="field-label wear-date-input">
              Date
              <input
                type="date"
                className="field"
                value={logDate}
                max={localDate()}
                required
                onChange={(e) => {
                  setLogDate(e.target.value);
                  setLogSelection(
                    data.wearLogs.find((w) => w.date === e.target.value)?.garmentIds ?? [],
                  );
                }}
              />
            </label>
            <div className="log-piece-grid">
              {loggablePieces.map((g) => (
                <button
                  type="button"
                  key={g.id}
                  className={`log-piece ${logSelection.includes(g.id) ? 'selected' : ''}`}
                  aria-pressed={logSelection.includes(g.id)}
                  onClick={() =>
                    setLogSelection((current) =>
                      current.includes(g.id)
                        ? current.filter((id) => id !== g.id)
                        : [...current, g.id],
                    )
                  }
                >
                  <img loading="lazy" decoding="async" src={g.image} alt="" />
                  <strong>
                    {g.name}
                    {data.archivedGarments.some((item) => item.id === g.id) ? ' · Archived' : ''}
                  </strong>
                  <span className="log-piece-check">
                    {logSelection.includes(g.id) ? <Check size={13} /> : <Plus size={13} />}
                  </span>
                </button>
              ))}
            </div>
            {!loggablePieces.length && <p className="muted">Add a piece to your wardrobe first.</p>}
            <div className="dialog-actions">
              <span className="muted">{logSelection.length} pieces selected</span>
              <button type="button" className="button secondary" onClick={() => setLogging(false)}>
                Cancel
              </button>
              <button
                className="button"
                type="submit"
                disabled={
                  !logDate ||
                  logDate > localDate() ||
                  (!logSelection.length && !data.wearLogs.some((w) => w.date === logDate))
                }
              >
                <Check size={16} />
                {logSelection.length || !data.wearLogs.some((w) => w.date === logDate)
                  ? 'Save wear record'
                  : 'Clear this day'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
