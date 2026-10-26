import { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  CalendarBlank,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  Clock,
  Info,
  Plus,
  Scan,
} from '@phosphor-icons/react';
import { useApp } from '../lib/store';
import { localDate } from '../lib/demo';
import { colorLabel, formatDate, weekdayName, weekdayShort } from '../lib/i18n';
import type { Analysis } from '../lib/types';
import { Dialog } from '../components/Dialog';
import { StepEyebrow } from '../components/Journey';
import { localized, t } from '../lib/lang';
import './features.css';

const rangeLabels: Record<string, string> = localized({
  '7': ['Сүүлийн 7 хоног', 'Last 7 days'],
  '30': ['Сүүлийн 30 хоног', 'Last 30 days'],
  all: ['Бүх хугацаа', 'All time'],
});

const dimensionLabels = localized({
  color: ['Өнгөний зохицол', 'Color harmony'],
  hairstyle: ['Үс засалт', 'Hairstyle'],
  accessories: ['Аксессуар', 'Accessories'],
  styling: ['Ерөнхий хослуулалт', 'Overall styling'],
});
/** A piece count in the interface language, e.g. "5 pieces". */
const pieceCount = (n: number) => t(`${n} хувцас`, `${n} ${n === 1 ? 'piece' : 'pieces'}`);

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
  const loggedDays = data.wearLogs.filter((w) => w.garmentIds.length > 0).length;
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
          <StepEyebrow page="history" />
          <h1 className="page-title">
            {t('Юу өмсдөг, юу тохирдгоо хараарай', 'See what you wear and what suits you')}
          </h1>
          <p className="muted page-explainer">
            <strong>{t('Стилийн үнэлгээ', 'Style analysis')}</strong>
            {t(
              ' нь хослолын зургийг өнгө, үс засалт, аксессуар, хослуулалтаар нь үнэлж оноо өгнө. ',
              ' scores outfit photos on color, hairstyle, accessories and styling. ',
            )}
            <strong>{t('Өмссөн бүртгэл', 'Wear log')}</strong>
            {t(
              ' нь өдөр бүр юу өмссөнийг тань тэмдэглэж, дуртай болон мартагдсан хувцсаа олоход тусална.',
              ' keeps track of what you wear each day and helps you spot your favorites and forgotten pieces.',
            )}
          </p>
        </div>
        <button className="button" onClick={() => startLog(localDate())}>
          <Plus size={18} /> {t('Өмссөнөө тэмдэглэх', 'Log what you wore')}
        </button>
      </div>
      <div className="history-navigation">
        <div className="segmented">
          <button
            className={tab === 'analyses' ? 'active' : ''}
            aria-pressed={tab === 'analyses'}
            onClick={() => setTab('analyses')}
          >
            <Scan size={16} /> {t('Стилийн үнэлгээ', 'Style analysis')}
          </button>
          <button
            className={tab === 'wear' ? 'active' : ''}
            aria-pressed={tab === 'wear'}
            onClick={() => setTab('wear')}
          >
            <CalendarBlank size={16} /> {t('Өмссөн бүртгэл', 'Wear log')}
          </button>
        </div>
        {tab === 'analyses' && (
          <label className="feature-select">
            <CalendarBlank size={16} />
            <select
              aria-label={t('Үнэлгээний хугацаа', 'Analysis date range')}
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              {Object.entries(rangeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <CaretDown size={14} weight="regular" />
          </label>
        )}
      </div>
      {tab === 'analyses' ? (
        <>
          <div className="history-stats">
            <div className="history-stat">
              <span>{t('Жишээ стилийн дундаж', 'Sample style average')}</span>
              <div className="history-stat-value">
                <strong>{average ?? '—'}</strong>
                <small>/ 100</small>
              </div>
              <p>
                {t(
                  `${scored.length} жишээ үнэлгээнд үндэслэсэн`,
                  `Based on ${scored.length} sample ${scored.length === 1 ? 'analysis' : 'analyses'}`,
                )}
              </p>
            </div>
            <div className="history-stat">
              <span>{t('Энэ хугацааны хослол', 'Outfits in this period')}</span>
              <div className="history-stat-value">
                <strong>{analyses.length}</strong>
              </div>
              <p>{rangeLabels[range]}</p>
            </div>
            <div className="history-stat">
              <span>{t('Таны шүүгээний хэрэглээ', 'Your wardrobe in use')}</span>
              <div className="history-stat-value">
                <strong>{loggedDays}</strong>
                <small>
                  {t('өдөр тэмдэглэсэн', loggedDays === 1 ? 'day logged' : 'days logged')}
                </small>
              </div>
              <button className="text-link" onClick={() => setTab('wear')}>
                {t('Өмссөн бүртгэлээ нээх', 'Open your wear log')} <ArrowRight size={16} />
              </button>
            </div>
          </div>
          <div className="sample-insights-note">
            <Info size={16} />
            <p>
              {t(
                'Та жишээ стилийн үнэлгээ үзэж байна. Эдгээр оноо нь зөвхөн жишээ бөгөөд таны зургийн үнэлгээ биш.',
                'You’re viewing sample style analyses. These scores are illustrative, not an assessment of your photos.',
              )}
            </p>
          </div>
          <div className="section-heading analysis-heading">
            <h2>{t('Үнэлсэн хослолууд', 'Rated outfits')}</h2>
            <span className="meta">
              {t(
                `${analyses.length} хослол`,
                `${analyses.length} ${analyses.length === 1 ? 'outfit' : 'outfits'}`,
              )}
            </span>
          </div>
          <div className="analysis-grid">
            {analyses.map((a) => (
              <button key={a.id} className="analysis-card" onClick={() => setAnalysis(a)}>
                <div className="analysis-image">
                  <img loading="lazy" decoding="async" src={a.image} alt={a.title} />
                  <span className="analysis-score">
                    {a.overall ?? '—'}
                    <small>
                      {a.overall !== null ? ' / 100' : t(' · Хэсэгчилсэн', ' · Partial')}
                    </small>
                  </span>
                  <span className="analysis-sample">
                    {a.sample
                      ? t('Жишээ хослол', 'Sample look')
                      : t('Зургийн үнэлгээ', 'Photo analysis')}
                  </span>
                </div>
                <div className="analysis-content">
                  <span>{formatDate(a.date, 'weekday')}</span>
                  <h3>{a.title}</h3>
                  <span className="analysis-view">
                    {t('Энэ хослолыг үзэх', 'Explore this look')} <ArrowUpRight size={16} />
                  </span>
                </div>
              </button>
            ))}
          </div>
          {analyses.length === 0 && (
            <div className="empty-state">
              <Clock size={28} />
              <h3>{t('Үнэлгээ алга', 'No analyses')}</h3>
              <p>
                {t(
                  'Энэ хугацаанд үнэлгээ хийгдээгүй. Илүү урт хугацаа сонгоно уу.',
                  'No analyses in this date range. Try a longer view.',
                )}
              </p>
            </div>
          )}
        </>
      ) : (
        <div className="wear-journal-layout">
          <section
            className="wear-calendar"
            aria-label={t('Өмссөн бүртгэлийн хуанли', 'Wear log calendar')}
          >
            <div className="calendar-heading">
              <h2>{formatDate(month, 'month')}</h2>
              <div>
                <button
                  className="icon-button"
                  aria-label={t('Өмнөх сар', 'Previous month')}
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                >
                  <CaretLeft size={18} />
                </button>
                <button
                  className="icon-button"
                  aria-label={t('Дараагийн сар', 'Next month')}
                  onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                >
                  <CaretRight size={18} />
                </button>
              </div>
            </div>
            <div className="calendar-weekdays">
              {calendar.slice(0, 7).map((d) => (
                <span key={d.key}>{weekdayShort(d.key)}</span>
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
                    aria-label={`${formatDate(d.key)}, ${hasWear ? t('хослол тэмдэглэсэн', 'outfit logged') : t('хослол тэмдэглээгүй', 'no outfit logged')}`}
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
                <i /> {t('Хослол тэмдэглэсэн', 'Outfit logged')}
              </span>
              <button
                className="text-link"
                onClick={() => {
                  setDate(localDate());
                  setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
                }}
              >
                {t('Өнөөдөр рүү буцах', 'Back to today')}
              </button>
            </div>
            <div className="wear-note">
              <Info size={16} />
              <p>
                {t(
                  'Өмссөн бүртгэлд зөвхөн таны тэмдэглэсэн хослол харагдана. Жишээ орчинд хэдэн жишээ өдөр урьдчилан орсон байгаа.',
                  'Your wear log shows only the outfits you log. The sample workspace comes with a few sample days already filled in.',
                )}
              </p>
            </div>
          </section>
          <section className="card journal-day">
            <div className="section-heading">
              <div>
                <p className="overline">
                  {date === localDate() ? t('Өнөөдөр', 'Today') : weekdayName(date)}
                </p>
                <h2>{formatDate(date)}</h2>
              </div>
              <span className="badge">{pieceCount(selectedPieces.length)}</span>
            </div>
            {selectedPieces.length ? (
              <>
                <div className="journal-pieces">
                  {selectedPieces.map((g) => (
                    <div key={g.id}>
                      <img loading="lazy" decoding="async" src={g.image} alt={g.name} />
                      <div>
                        <strong>{g.name}</strong>
                        <span>{colorLabel(g.color)}</span>
                      </div>
                      <Check size={16} />
                    </div>
                  ))}
                </div>
                <button className="button secondary" onClick={() => startLog()}>
                  {t('Энэ өдрийн хослолыг засах', 'Edit this day’s outfit')}
                </button>
                <p className="feature-footnote">
                  {t(
                    'Таны тэмдэглэсэн эсвэл жишээ орчинд багтсан.',
                    'Logged by you or included in the sample workspace.',
                  )}
                </p>
              </>
            ) : (
              <div className="journal-empty">
                <h3>
                  {date > localDate()
                    ? t('Энэ өдөр хараахан ирээгүй', 'This day hasn’t come yet')
                    : t('Тэр өдөр танд юу зохисон бэ?', 'What felt like you that day?')}
                </h3>
                <p>
                  {date > localDate()
                    ? t(
                        'Энэ өдөр болохоор эргэн ирж, өмссөн хувцсаа тэмдэглээрэй.',
                        'Come back on this date to log what you actually wore.',
                      )
                    : t(
                        'Өмссөн хувцсаа дурсамж болгон тэмдэглээрэй. Зураг шаардлагагүй.',
                        'Keep a memory of the pieces you wore. No photo needed.',
                      )}
                </p>
                <button
                  className="button secondary"
                  disabled={date > localDate()}
                  onClick={() => startLog()}
                >
                  <Plus size={16} /> {t('Хослол тэмдэглэх', 'Log an outfit')}
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
                {analysis.sample
                  ? t('Жишээ үр дүн', 'Sample result')
                  : t('Зургийн үнэлгээ', 'Photo analysis')}{' '}
                · {formatDate(analysis.date)}
              </span>
              <div className="analysis-detail-score">
                <strong>{analysis.overall ?? '—'}</strong>
                <span>
                  {analysis.overall === null
                    ? t('Хэсэгчилсэн үнэлгээ', 'Partial analysis')
                    : t('/ 100 стилийн оноо', '/ 100 style score')}
                </span>
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
                            ? t('Үнэлээгүй', 'Not rated')
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
                  ? t(
                      'Энэ жишээ нь стилийн үнэлгээ хэрхэн харагдахыг үзүүлнэ. Таны орчинд энэ зурагт AI үнэлгээ хийгдээгүй.',
                      'This example shows how a style analysis is presented. No AI analysis was performed on this photo in your workspace.',
                    )
                  : t(
                      'Зөвхөн зургаар хувцасны таарц, тав тухыг тодорхойлох боломжгүй.',
                      'Fit and comfort can’t be judged from a photo alone.',
                    )}
              </p>
              <button
                className="button secondary"
                onClick={() => {
                  setAnalysis(null);
                  navigate('studio');
                }}
              >
                {t('Өөрийн хослолоо бүтээх', 'Create a look of your own')} <ArrowRight size={18} />
              </button>
            </div>
          </div>
        </Dialog>
      )}
      {logging && (
        <Dialog
          title={t('Өмссөн хувцасныхаа товч тэмдэглэл', 'A small record of what you wore')}
          onClose={() => setLogging(false)}
          wide
        >
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
              {t(
                'Бодитоор өмссөн хувцсаа сонгоно уу. Энэ өдрийг хүссэн үедээ засах боломжтой.',
                'Choose the pieces you actually wore. You can edit this day anytime.',
              )}
            </p>
            <label className="field-label wear-date-input">
              {t('Огноо', 'Date')}
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
                    {data.archivedGarments.some((item) => item.id === g.id)
                      ? t(' · Архивласан', ' · Archived')
                      : ''}
                  </strong>
                  <span className="log-piece-check">
                    {logSelection.includes(g.id) ? (
                      <Check size={14} weight="regular" />
                    ) : (
                      <Plus size={14} weight="regular" />
                    )}
                  </span>
                </button>
              ))}
            </div>
            {!loggablePieces.length && (
              <p className="muted">
                {t('Эхлээд шүүгээндээ хувцас нэмнэ үү.', 'Add pieces to your wardrobe first.')}
              </p>
            )}
            <div className="dialog-actions">
              <span className="muted">
                {t(
                  `${logSelection.length} хувцас сонгосон`,
                  `${pieceCount(logSelection.length)} selected`,
                )}
              </span>
              <button type="button" className="button secondary" onClick={() => setLogging(false)}>
                {t('Цуцлах', 'Cancel')}
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
                <Check size={18} />
                {logSelection.length || !data.wearLogs.some((w) => w.date === logDate)
                  ? t('Өмссөн бүртгэл хадгалах', 'Save to wear log')
                  : t('Энэ өдрийг цэвэрлэх', 'Clear this day')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
    </div>
  );
}
