import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  Heart,
  Plus,
  RefreshCw,
  Shirt,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { isCompleteLook, localDate, recommend } from '../lib/demo';
import { Dialog } from '../components/Dialog';
import { categoryLabels } from '../lib/types';
export function Home() {
  const { data, navigate, logWear, saveLook, updateGarment, notify, openAccount } = useApp();
  const [variant, setVariant] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [wearOpen, setWearOpen] = useState(false);
  const [wearIds, setWearIds] = useState<string[]>([]);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const look = recommend(data.garments, variant);
  const today = localDate();
  const complete = isCompleteLook(
    look.map((g) => g.id),
    data.garments,
  );
  const scored = data.analyses.filter((a) => a.overall !== null);
  const average = scored.length
    ? Math.round(scored.reduce((s, a) => s + a.overall!, 0) / scored.length)
    : null;
  const todayDate = new Date();
  const weekStart = new Date(todayDate);
  weekStart.setDate(todayDate.getDate() - ((todayDate.getDay() + 6) % 7) + weekOffset * 7);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });
  function moveWeek(offset: number) {
    setWeekOffset(offset);
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
    setSelectedDate(offset === 0 ? today : localDate(d));
  }
  const month = days[3].toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const record = data.wearLogs.find((w) => w.date === selectedDate);
  const wearableHistory = [
    ...data.garments,
    ...data.archivedGarments.filter((g) => record?.garmentIds.includes(g.id)),
  ];
  const wornToday = data.wearLogs.some((w) => w.date === today);
  const openWear = (date = selectedDate) => {
    setSelectedDate(date);
    setWearIds(data.wearLogs.find((w) => w.date === date)?.garmentIds ?? look.map((g) => g.id));
    setWearOpen(true);
  };
  return (
    <div className="home-page page-enter">
      <div className="home-heading">
        <div>
          <div className="eyebrow greeting-date">
            <span /> YOUR EVERYDAY, A LITTLE MORE CONSIDERED
          </div>
          <h1>
            Good to see you, {data.preferences.name}
            <span className="greeting-sparkle">✦</span>
          </h1>
          <p>Your wardrobe. Fresh possibilities. A style that feels like you.</p>
        </div>
        <button className="button" onClick={() => setAnalysisOpen(true)}>
          <Camera size={17} /> Analyze an outfit <Plus size={16} />
        </button>
      </div>
      <div className="dashboard-grid">
        <section className="card today-card">
          <div className="today-top">
            <div className="eyebrow">
              <Sparkles size={14} /> A LITTLE OUTFIT INSPIRATION
            </div>
            <span className="subtle-pill">From your wardrobe</span>
          </div>
          <div className="look-editorial">
            <div className="look-editorial-copy">
              <h2>
                Less overthinking.
                <br />
                More <span>you.</span>
              </h2>
              <p>
                A familiar favorite.
                <br />A fresh combination.
              </p>
              <div className="palette-dots">
                <i style={{ background: '#303648' }} />
                <i style={{ background: '#b5aa97' }} />
                <i style={{ background: '#f5f2e9' }} />
                <span>A little harmony</span>
              </div>
            </div>
            <div className="outfit-board" aria-label="Suggested outfit from your sample wardrobe">
              {look.map((g, i) => (
                <button
                  key={g.id}
                  className={`outfit-piece piece-${i}`}
                  onClick={() => navigate('wardrobe')}
                  aria-label={`View ${g.name}`}
                >
                  <img src={g.image} alt={g.name} />
                </button>
              ))}
              {!complete && (
                <div className="outfit-empty">
                  <Shirt size={32} />
                  <p>Add a top, bottoms and shoes to find your next combination.</p>
                </div>
              )}
              <span className="outfit-board-star">✧</span>
              <span className="outfit-caption">
                THE EVERYDAY EDIT — Nº {String(variant + 1).padStart(2, '0')}
              </span>
            </div>
          </div>
          <div className="today-bottom">
            <div>
              <h3>{variant % 2 === 0 ? 'Everyday, elevated' : 'A softer kind of day'}</h3>
              <p>
                {look.length} pieces <span>·</span> Easy layers, endless possibilities
              </p>
            </div>
            <div className="today-buttons">
              <button
                className="icon-button shuffle-button"
                title="Try another combination"
                aria-label="Try another combination"
                onClick={() => setVariant((v) => v + 1)}
              >
                <RefreshCw size={17} />
              </button>
              <button className="button small" disabled={!complete} onClick={() => openWear(today)}>
                {wornToday ? <Check size={15} /> : <Plus size={15} />}{' '}
                {wornToday ? 'Update today’s look' : 'I’m wearing this'}
              </button>
            </div>
          </div>
          <div className="today-footnote">
            <span>
              <span className="status-dot" /> Available pieces only
            </span>
            <button
              onClick={() => {
                if (!complete) return;
                saveLook({
                  name: variant % 2 === 0 ? 'Everyday, elevated' : 'A softer kind of day',
                  garmentIds: look.map((g) => g.id),
                });
              }}
              disabled={!complete}
            >
              <Heart size={13} /> Save for another day
            </button>
          </div>
        </section>
        <div className="dashboard-side">
          <section className="card score-card">
            <div className="section-heading">
              <div>
                <div className="eyebrow">YOUR STYLE, EVOLVING</div>
                <h2>Looking more like you.</h2>
              </div>
              <button
                className="circle-link"
                aria-label="View style history"
                onClick={() => navigate('history')}
              >
                <ArrowUpRight size={18} />
              </button>
            </div>
            <div className="score-content">
              <div
                className="score-ring"
                style={{ '--score': `${(average ?? 0) * 3.6}deg` } as React.CSSProperties}
              >
                <div>
                  <strong>{average ?? '—'}</strong>
                  <span>STYLE SCORE</span>
                </div>
              </div>
              <div className="score-summary">
                <span className="badge">Sample insights</span>
                <strong>A considered combination.</strong>
                <p>
                  Explore the details behind
                  <br />
                  your personal style.
                </p>
                <button className="text-link" onClick={() => navigate('history')}>
                  See your breakdown <ArrowRight size={14} />
                </button>
              </div>
            </div>
            <div className="score-stat-row">
              <div>
                <b>{data.analyses.length}</b>
                <span>Looks analyzed</span>
              </div>
              <div>
                <b>{data.wearLogs.length}</b>
                <span>Days recorded</span>
              </div>
              <div>
                <b>{data.savedLooks.length}</b>
                <span>Looks saved</span>
              </div>
            </div>
          </section>
          <section className="card calendar-card">
            <div className="calendar-header">
              <div>
                <div className="eyebrow">YOUR STYLE STORY</div>
                <h2>{month}</h2>
              </div>
              <div className="calendar-controls">
                {weekOffset < 0 && <button onClick={() => moveWeek(0)}>Today</button>}
                <button aria-label="Previous week" onClick={() => moveWeek(weekOffset - 1)}>
                  <ChevronLeft size={16} />
                </button>
                <button
                  aria-label="Next week"
                  disabled={weekOffset >= 0}
                  onClick={() => moveWeek(weekOffset + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
            <div className="week-strip">
              {days.map((d) => {
                const date = localDate(d);
                const recorded = data.wearLogs.some((w) => w.date === date);
                return (
                  <button
                    key={date}
                    className={`${selectedDate === date ? 'selected' : ''} ${date === today ? 'is-today' : ''}`}
                    aria-label={`${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${recorded ? ', outfit recorded' : ''}`}
                    aria-pressed={selectedDate === date}
                    disabled={date > today}
                    onClick={() => setSelectedDate(date)}
                  >
                    <span>{d.toLocaleDateString('en-US', { weekday: 'short' }).slice(0, 1)}</span>
                    <b>{d.getDate()}</b>
                    <i className={recorded ? 'recorded' : ''} />
                  </button>
                );
              })}
            </div>
            <div className="calendar-bottom">
              <span>
                <i />
                {record
                  ? `${record.garmentIds.length} pieces recorded`
                  : 'Every day is a fresh start'}
              </span>
              <button className="text-link" onClick={() => openWear()}>
                {record ? 'Edit look' : 'Log a look'} <Plus size={13} />
              </button>
            </div>
          </section>
        </div>
      </div>
      <section className="wardrobe-preview">
        <div className="section-heading">
          <div>
            <div className="eyebrow">GOOD THINGS YOU ALREADY OWN</div>
            <h2>
              A wardrobe full of possibilities
              <span className="count-pill">{data.garments.length}</span>
            </h2>
          </div>
          <button className="text-link" onClick={() => navigate('wardrobe')}>
            Open my wardrobe <ArrowRight size={16} />
          </button>
        </div>
        <div className="preview-grid">
          {data.garments.slice(0, 4).map((g) => (
            <article className="preview-garment" key={g.id}>
              <div className="preview-garment-image">
                <button
                  className="image-link"
                  onClick={() => navigate('wardrobe')}
                  aria-label={`View ${g.name}`}
                >
                  <img src={g.image} alt={g.name} />
                </button>
                <span className="preview-category">{categoryLabels[g.category]}</span>
                <button
                  className={`favorite-button ${g.favorite ? 'is-favorite' : ''}`}
                  aria-label={`${g.favorite ? 'Unfavorite' : 'Favorite'} ${g.name}`}
                  aria-pressed={g.favorite}
                  onClick={() => updateGarment(g.id, { favorite: !g.favorite })}
                >
                  <Heart size={16} fill={g.favorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="preview-garment-info">
                <h3>{g.name}</h3>
                <div>
                  <span className="color-dot" style={{ background: g.colorHex }} />
                  {g.color}
                  <span className="garment-status">
                    {g.availability === 'available' ? 'Ready to wear' : 'In the laundry'}
                  </span>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="intent-note">
        <span>✦</span>
        <p>
          The best wardrobe isn’t a bigger one. It’s the one that feels more like{' '}
          <strong>you.</strong>
        </p>
        <span>✦</span>
      </div>
      {wearOpen && (
        <Dialog title="What did you wear?" onClose={() => setWearOpen(false)}>
          <p className="muted">A small record of your day. Choose the pieces you actually wore.</p>
          <label className="field-label" htmlFor="wear-date">
            Date
          </label>
          <input
            id="wear-date"
            className="field"
            type="date"
            max={today}
            value={selectedDate}
            onChange={(e) => {
              setSelectedDate(e.target.value);
              setWearIds(data.wearLogs.find((w) => w.date === e.target.value)?.garmentIds ?? []);
            }}
          />
          <div className="wear-picker">
            {wearableHistory.map((g) => (
              <button
                key={g.id}
                className={wearIds.includes(g.id) ? 'selected' : ''}
                aria-pressed={wearIds.includes(g.id)}
                onClick={() =>
                  setWearIds((ids) =>
                    ids.includes(g.id) ? ids.filter((id) => id !== g.id) : [...ids, g.id],
                  )
                }
              >
                <img src={g.image} alt="" />
                <span>
                  {g.name}
                  {data.archivedGarments.some((item) => item.id === g.id) ? ' · Archived' : ''}
                </span>
                {wearIds.includes(g.id) && <Check size={17} />}
              </button>
            ))}
          </div>
          <button
            className="button full-width"
            disabled={!wearIds.length || !selectedDate || selectedDate > today}
            onClick={() => {
              logWear(selectedDate, wearIds);
              setWearOpen(false);
            }}
          >
            <Check size={16} /> Save wear record
          </button>
        </Dialog>
      )}
      {analysisOpen && (
        <Dialog title="A fresh perspective on your outfit" onClose={() => setAnalysisOpen(false)}>
          <div className="analysis-intro">
            <div className="feature-icon">
              <Camera size={26} />
            </div>
            <h3>A little insight goes a long way.</h3>
            <p className="muted">
              Get a breakdown of color harmony, hairstyle, accessories and styling coherence from
              your outfit photo.
            </p>
          </div>
          <div className="notice">
            <Sparkles size={18} />
            <p>
              Real photo analysis needs a connected Oyu AI account and your AI-processing consent.
              This sample workspace contains illustrative results only.
            </p>
          </div>
          <button
            className="button full-width"
            onClick={() => {
              setAnalysisOpen(false);
              openAccount();
            }}
          >
            Connect my account <ArrowUpRight size={16} />
          </button>
          <button
            className="button ghost full-width"
            onClick={() => {
              setAnalysisOpen(false);
              navigate('history');
              notify('These are illustrative sample analyses, not AI assessments of your photos.');
            }}
          >
            Explore sample analyses
          </button>
        </Dialog>
      )}
    </div>
  );
}
