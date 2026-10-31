import { useState } from 'react';
import {
  ArrowRight,
  BookmarkSimple,
  CaretLeft,
  CaretRight,
  Check,
  Plus,
  Scan,
  Shuffle,
  TShirt,
  VideoCamera,
} from '@phosphor-icons/react';
import { useApp } from '../lib/store';
import { finishingTouches, isCompleteLook, localDate, recommend } from '../lib/demo';
import { formatDate, weekdayName, weekdayShort } from '../lib/i18n';
import { lookReasons } from '../lib/style';
import { reviewLook } from '../lib/oyu';
import { OyuNote } from '../components/Oyu';
import { OyuOutfitCheck } from './OyuOutfitCheck';
import { idleGarments } from '../lib/workspace';
import { Dialog } from '../components/Dialog';
import { JourneyStrip } from '../components/Journey';
import { AudienceToggle } from '../components/AudienceToggle';
import type { AudienceFilter } from '../components/AudienceToggle';
import { categoryLabels, tryOnCategories } from '../lib/types';
import type { Category, Garment, StyleTag } from '../lib/types';
import { localized, t } from '../lib/lang';
import './home.css';

const lookNames = () => [
  t('Өдөр тутмын дэгжин', 'Everyday, elevated'),
  t('Хялбар ажлын өдөр', 'An easy workday'),
  t('Даруу гоолиг', 'Quietly polished'),
  t('Зөөлөн, энгийн', 'Soft and simple'),
  t('Амралтын өдөрт бэлэн', 'Weekend ready'),
  t('Чөлөөт ч цэмцгэр', 'Relaxed but put together'),
  t('Цэвэр шугам', 'Clean lines'),
  t('Жаахан зоримог', 'A little bolder'),
];
/** A piece count in the interface language, e.g. "5 pieces". */
const pieceCount = (n: number) => t(`${n} хувцас`, `${n} ${n === 1 ? 'piece' : 'pieces'}`);
const categories = Object.keys(categoryLabels) as Category[];
/** Curated edits on the Overview; each opens the wardrobe with matching filters. */
const edits = (): {
  title: string;
  text: string;
  audience?: AudienceFilter;
  style?: StyleTag;
  match: (g: Garment) => boolean;
}[] => [
  {
    title: 'Old money',
    text: t('Сүлжмэл цамц, костюм, сувд, лофер', 'Knitwear, tailoring, pearls, loafers'),
    style: 'Old money',
    match: (g) => g.style === 'Old money',
  },
  {
    title: 'Evening',
    text: t('Үдшийн даашинз, оосортой даашинз, өндөр өсгийт', 'Evening gowns, slip dresses, heels'),
    style: 'Evening',
    match: (g) => g.style === 'Evening',
  },
  {
    title: t('Эмэгтэй хувцас', 'Womenswear'),
    text: t('Даашинз, блуз, банзал гэх мэт', 'Dresses, blouses, skirts and more'),
    audience: 'women',
    match: (g) => g.audience === 'women',
  },
  {
    title: t('Эрэгтэй хувцас', 'Menswear'),
    text: t('Оксфорд цамц, пиджак, чинос гэх мэт', 'Oxford shirts, blazers, chinos and more'),
    audience: 'men',
    match: (g) => g.audience === 'men',
  },
];
const slotLabels: Partial<Record<Category, string>> = localized({
  bottom: ['Өмд, банзал', 'Bottoms'],
  footwear: ['Гутал', 'Shoes'],
  outerwear: ['Гадуур хувцас нэмэх', 'Add outerwear'],
  accessory: ['Аксессуар нэмэх', 'Add an accessory'],
});
const dimensionLabels = localized({
  color: ['Өнгөний зохицол', 'Color harmony'],
  hairstyle: ['Үс засалт', 'Hairstyle'],
  accessories: ['Аксессуар', 'Accessories'],
  styling: ['Хослуулалт', 'Styling'],
});
/** Up to `count` pieces, one per category first, so a preview shows variety. */
function varied(items: Garment[], count: number) {
  return [
    ...items.filter((g, i) => items.findIndex((o) => o.category === g.category) === i),
    ...items,
  ]
    .filter((g, i, all) => all.indexOf(g) === i)
    .slice(0, count);
}

export function Home() {
  const { data, navigate, openWith, logWear, saveLook } = useApp();
  const [variant, setVariant] = useState(0);
  const [lookFor, setLookFor] = useState<AudienceFilter>('all');
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(localDate());
  const [wearOpen, setWearOpen] = useState(false);
  const [wearIds, setWearIds] = useState<string[]>([]);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const look = recommend(data.garments, variant, lookFor);
  const extras = finishingTouches(look, data.garments, variant, lookFor);
  const outfit = [...look, ...extras];
  const names = lookNames();
  const lookName = names[variant % names.length];
  const reasons = lookReasons(outfit);
  const review = reviewLook(outfit, data.preferences);
  const palette = [...new Set(outfit.map((g) => g.colorHex))];
  const today = localDate();
  const complete = isCompleteLook(
    look.map((g) => g.id),
    data.garments,
  );
  const tryOnPiece = look.find((g) => tryOnCategories.includes(g.category));
  const hero =
    outfit.find((g) => g.category === 'dress') ?? outfit.find((g) => g.category === 'top');
  const slots = (
    hero?.category === 'dress'
      ? (['footwear', 'outerwear', 'accessory'] as Category[])
      : (['bottom', 'footwear', 'outerwear', 'accessory'] as Category[])
  ).map((category) => ({ category, piece: outfit.find((g) => g.category === category) }));
  const idle = idleGarments(data);
  const laundry = data.garments.filter((g) => g.availability === 'laundry').length;
  const scored = data.analyses.filter((a) => a.overall !== null);
  const average = scored.length
    ? Math.round(scored.reduce((s, a) => s + a.overall!, 0) / scored.length)
    : null;
  const dimensions = (Object.keys(dimensionLabels) as (keyof typeof dimensionLabels)[]).map(
    (key) => {
      const values = scored.flatMap((a) =>
        a.dimensions[key] === null ? [] : [a.dimensions[key]!],
      );
      return {
        key,
        value: values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null,
      };
    },
  );
  const now = new Date();
  const greeting =
    now.getHours() < 12
      ? t('Өглөөний мэнд', 'Good morning')
      : now.getHours() < 18
        ? t('Өдрийн мэнд', 'Good afternoon')
        : t('Оройн мэнд', 'Good evening');
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - ((now.getDay() + 6) % 7) + weekOffset * 7);
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
  const weekLabel =
    days[0].getMonth() === days[6].getMonth()
      ? t(
          `${formatDate(days[0])}–${days[6].getDate()}`,
          `${days[0].getDate()}–${formatDate(days[6])}`,
        )
      : `${formatDate(days[0])} – ${formatDate(days[6])}`;
  const record = data.wearLogs.find((w) => w.date === selectedDate);
  const loggedThisWeek = days.filter((d) =>
    data.wearLogs.some((w) => w.date === localDate(d)),
  ).length;
  const wearableHistory = [
    ...data.garments,
    ...data.archivedGarments.filter((g) => record?.garmentIds.includes(g.id)),
  ];
  const wornToday = data.wearLogs.some((w) => w.date === today);
  const findPiece = (id: string) =>
    data.garments.find((g) => g.id === id) ?? data.archivedGarments.find((g) => g.id === id);
  const dayCover = (date: string) => {
    const pieces = (data.wearLogs.find((w) => w.date === date)?.garmentIds ?? [])
      .map(findPiece)
      .filter((g): g is Garment => !!g);
    return (
      pieces.find((g) => g.category === 'dress') ??
      pieces.find((g) => g.category === 'top') ??
      pieces[0]
    );
  };
  const openWear = (date = selectedDate) => {
    setSelectedDate(date);
    setWearIds(data.wearLogs.find((w) => w.date === date)?.garmentIds ?? outfit.map((g) => g.id));
    setWearOpen(true);
  };
  return (
    <div className="home-page dash page-enter">
      <header className="page-heading dash-head">
        <div>
          <p className="overline">{formatDate(now, 'weekday')}</p>
          <h1>
            {greeting}, <em>{data.preferences.name}</em>
          </h1>
          <p>
            {t(
              'Танд байгаа хувцсанд тулгуурласан AI стилист',
              'An AI stylist built around the clothes you already own',
            )}
          </p>
        </div>
        <div className="dash-actions">
          <button className="button secondary" onClick={() => setAnalysisOpen(true)}>
            <Scan size={18} /> {t('Хослол үнэлүүлэх', 'Rate my outfit')}
          </button>
          <button className="button" onClick={() => navigate('live')}>
            <VideoCamera size={18} /> {t('Шууд өмсөж үзэх', 'Live try-on')}
          </button>
        </div>
      </header>
      <JourneyStrip
        onOpen={navigate}
        stats={{
          wardrobe: pieceCount(data.garments.length),
          studio: t(
            `${data.savedLooks.length} хадгалсан хослол`,
            `${data.savedLooks.length} saved ${data.savedLooks.length === 1 ? 'look' : 'looks'}`,
          ),
          live: t('Камераар, бодит цагт', 'On camera, in real time'),
          history: t(
            `${data.wearLogs.length} өдөр тэмдэглэсэн`,
            `${data.wearLogs.length} ${data.wearLogs.length === 1 ? 'day' : 'days'} logged`,
          ),
        }}
      />
      <section className="dash-hero" aria-labelledby="todays-look">
        <div className="dash-hero-copy">
          <div className="dash-hero-top">
            <p className="overline">{t('Өнөөдрийн хослол', 'Today’s look')}</p>
            <AudienceToggle
              label={t('Хэнд зориулсан хослол', 'Who the look is for')}
              value={lookFor}
              onChange={(value) => {
                setLookFor(value);
                setVariant(0);
              }}
            />
          </div>
          <h2 id="todays-look">
            {complete ? lookName : t('Анхны хослолоо бүтээгээрэй', 'Create your first look')}
          </h2>
          <p className="dash-hero-meta">
            {complete
              ? t(
                  `Таны шүүгээнээс ${outfit.length} хувцас · өнгөний зохицлоор сонгосон`,
                  `${pieceCount(outfit.length)} from your wardrobe · chosen for color harmony`,
                )
              : t(
                  'Өдөр бүр хослолын санаа авахын тулд цамц, өмд эсвэл банзал, гутал (эсвэл даашинз, гутал) нэмнэ үү.',
                  'Add a top, bottoms and shoes (or a dress and shoes) to get a fresh look idea every day.',
                )}
          </p>
          {complete && review && (
            <OyuNote
              className="dash-oyu"
              mood={review.mood}
              score={review.score}
              lines={[review.lines[0], ...reasons]}
            />
          )}
          {complete && (
            <div className="dash-palette" aria-label={t('Өнгөний палитр', 'Color palette')}>
              <span>{t('Палитр', 'Palette')}</span>
              <span className="dash-swatches">
                {palette.map((hex) => (
                  <i key={hex} style={{ background: hex }} />
                ))}
              </span>
            </div>
          )}
          <div className="dash-hero-actions">
            <button
              className="button"
              disabled={!complete}
              onClick={() => (complete ? openWear(today) : navigate('wardrobe'))}
            >
              {wornToday ? <Check size={18} /> : <Plus size={18} />}
              {wornToday
                ? t('Өнөөдрийн хослолыг шинэчлэх', 'Update today’s look')
                : t('Үүнийг өмсөж байна', 'I’m wearing this')}
            </button>
            {tryOnPiece && (
              <button
                className="button secondary"
                onClick={() => openWith({ page: 'live', garmentIds: [tryOnPiece.id] })}
              >
                <VideoCamera size={18} /> {t('Шууд өмсөж үзэх', 'Live try-on')}
              </button>
            )}
          </div>
          <div className="dash-hero-links">
            <button className="text-link" onClick={() => setVariant((v) => v + 1)}>
              <Shuffle size={16} /> {t('Өөр санаа харах', 'Show another idea')}
            </button>
            <button
              className="text-link"
              disabled={!complete}
              onClick={() => saveLook({ name: lookName, garmentIds: outfit.map((g) => g.id) })}
            >
              <BookmarkSimple size={16} /> {t('Дараа өмсөхөөр хадгалах', 'Save for later')}
            </button>
          </div>
          <p className="dash-footnote">
            {t(
              'Зөвхөн цэвэр, өмсөхөд бэлэн хувцсыг санал болгоно.',
              'Only clean, ready-to-wear pieces are suggested.',
            )}
          </p>
        </div>
        <div
          className={`dash-outfit ${hero?.category === 'dress' ? 'is-dress' : ''}`}
          aria-label={t('Санал болгосон хослол', 'Suggested look')}
        >
          {hero ? (
            <button
              className="dash-tile dash-tile-hero"
              onClick={() => openWith({ page: 'studio', garmentIds: outfit.map((g) => g.id) })}
            >
              <span className="dash-tile-media">
                <img src={hero.image} alt={hero.name} />
              </span>
              <span className="dash-tile-name">{hero.name}</span>
            </button>
          ) : (
            <div className="dash-tile dash-tile-hero is-empty">
              <span className="dash-tile-media">
                <TShirt size={40} />
              </span>
            </div>
          )}
          {slots.map(({ category, piece }) =>
            piece ? (
              <button
                key={category}
                className="dash-tile"
                onClick={() => openWith({ page: 'studio', garmentIds: outfit.map((g) => g.id) })}
              >
                <span className="dash-tile-media">
                  <img src={piece.image} alt={piece.name} />
                </span>
                <span className="dash-tile-name">{piece.name}</span>
              </button>
            ) : (
              <button
                key={category}
                className="dash-tile is-empty"
                onClick={() => openWith({ page: 'studio', garmentIds: outfit.map((g) => g.id) })}
              >
                <span className="dash-tile-media">
                  <Plus size={20} />
                </span>
                <span className="dash-tile-name">{slotLabels[category]}</span>
              </button>
            ),
          )}
        </div>
      </section>
      <div className="dash-band">
        <section className="dash-panel dash-score-panel" aria-labelledby="score-heading">
          <div className="dash-panel-head">
            <div>
              <h3 id="score-heading">{t('Стилийн оноо', 'Style score')}</h3>
              <p>
                {t(
                  `${scored.length} хослол үнэлсэн`,
                  `${scored.length} ${scored.length === 1 ? 'outfit' : 'outfits'} rated`,
                )}
              </p>
            </div>
            <span className="badge">{t('Жишээ', 'Sample')}</span>
          </div>
          <p className="dash-figure">
            <strong>{average ?? '—'}</strong>
            <span>/ 100</span>
          </p>
          <ul className="dash-bars">
            {dimensions.map(({ key, value }) => (
              <li key={key}>
                <span>{dimensionLabels[key]}</span>
                <i>
                  <b style={{ width: `${((value ?? 0) / 25) * 100}%` }} />
                </i>
              </li>
            ))}
          </ul>
          <button className="text-link dash-panel-link" onClick={() => navigate('history')}>
            {t('Дэлгэрэнгүй харах', 'See details')} <ArrowRight size={16} />
          </button>
        </section>
        <section className="dash-panel dash-week-panel" aria-labelledby="week-heading">
          <div className="dash-panel-head">
            <div>
              <h3 id="week-heading">{t('Энэ долоо хоног', 'This week')}</h3>
              <p>{weekLabel}</p>
            </div>
            <div className="dash-week-nav">
              <button
                className="icon-button"
                aria-label={t('Өмнөх долоо хоног', 'Previous week')}
                onClick={() => moveWeek(weekOffset - 1)}
              >
                <CaretLeft size={18} />
              </button>
              <button
                className="icon-button"
                aria-label={t('Дараагийн долоо хоног', 'Next week')}
                disabled={weekOffset >= 0}
                onClick={() => moveWeek(weekOffset + 1)}
              >
                <CaretRight size={18} />
              </button>
            </div>
          </div>
          <div className="dash-week">
            {days.map((d) => {
              const date = localDate(d);
              const cover = dayCover(date);
              return (
                <button
                  key={date}
                  className={`${selectedDate === date ? 'selected' : ''} ${date === today ? 'is-today' : ''} ${cover ? 'has-cover' : ''}`}
                  aria-label={`${formatDate(d, 'weekday')}${cover ? t(', хослол тэмдэглэсэн', ', outfit logged') : ''}`}
                  aria-pressed={selectedDate === date}
                  disabled={date > today}
                  onClick={() => setSelectedDate(date)}
                >
                  <span>{weekdayShort(d)}</span>
                  <i>{cover ? <img src={cover.image} alt="" /> : <b>{d.getDate()}</b>}</i>
                </button>
              );
            })}
          </div>
          <div className="dash-day">
            <span className="dash-day-label">
              {selectedDate === today ? t('Өнөөдөр', 'Today') : weekdayName(selectedDate)}
              <small>{formatDate(selectedDate)}</small>
            </span>
            {record ? (
              <span className="dash-day-pieces">
                {record.garmentIds
                  .map(findPiece)
                  .filter((g): g is Garment => !!g)
                  .slice(0, 5)
                  .map((g) => (
                    <span key={g.id} className="dash-thumb">
                      <img src={g.image} alt={g.name} title={g.name} />
                    </span>
                  ))}
              </span>
            ) : (
              <span className="dash-day-empty">
                {t('Одоохондоо тэмдэглээгүй', 'Nothing logged yet')}
              </span>
            )}
          </div>
          <div className="dash-panel-foot">
            <span>
              {t(`${loggedThisWeek}/7 өдөр тэмдэглэсэн`, `${loggedThisWeek}/7 days logged`)}
            </span>
            <button className="text-link" onClick={() => openWear()}>
              <Plus size={16} />{' '}
              {record
                ? t('Энэ өдрийг засах', 'Edit this day')
                : t('Өмссөнөө тэмдэглэх', 'Log what you wore')}
            </button>
          </div>
        </section>
        <section className="dash-panel dash-closet-panel" aria-labelledby="wardrobe-heading">
          <div className="dash-panel-head">
            <div>
              <h3 id="wardrobe-heading">{t('Таны шүүгээ', 'Your wardrobe')}</h3>
              <p>{t(`${categories.length} ангилалд`, `Across ${categories.length} categories`)}</p>
            </div>
            <button className="text-link" onClick={() => navigate('wardrobe')}>
              {t('Нээх', 'Open')} <ArrowRight size={16} />
            </button>
          </div>
          <p className="dash-figure">
            <strong>{data.garments.length}</strong>
            <span>{t('хувцас', data.garments.length === 1 ? 'piece' : 'pieces')}</span>
          </p>
          <ul className="dash-health">
            <li>
              {t('Өмсөхөд бэлэн', 'Ready to wear')}
              <b>{data.garments.length - laundry}</b>
            </li>
            <li>
              {t('Угаалгад байгаа', 'In the laundry')}
              <b>{laundry}</b>
            </li>
            <li>
              {t('30 хоног өмсөөгүй', 'Not worn in 30 days')}
              <b>{idle.length}</b>
            </li>
          </ul>
          {idle.length > 0 && (
            <button
              className="text-link dash-panel-link"
              onClick={() => openWith({ page: 'wardrobe', filter: 'idle' })}
            >
              {t('Мартагдсан хувцсаа дахин нээх', 'Rediscover forgotten pieces')}{' '}
              <ArrowRight size={16} />
            </button>
          )}
        </section>
      </div>
      <section className="dash-section" aria-labelledby="edits-heading">
        <div className="dash-section-head">
          <h2 id="edits-heading">{t('Сонгосон цуглуулга', 'Curated edits')}</h2>
        </div>
        <div className="dash-edits">
          {edits().map((edit) => {
            const items = data.garments.filter(edit.match);
            if (!items.length) return null;
            return (
              <button
                key={edit.title}
                className="dash-edit"
                onClick={() =>
                  openWith({ page: 'wardrobe', audience: edit.audience, style: edit.style })
                }
              >
                <span className="dash-edit-images" aria-hidden="true">
                  {varied(items, 3).map((g) => (
                    <img key={g.id} src={g.image} alt="" />
                  ))}
                </span>
                <span className="dash-edit-copy">
                  <strong>{edit.title}</strong>
                  <small>{edit.text}</small>
                  <em>
                    {pieceCount(items.length)} <ArrowRight size={16} />
                  </em>
                </span>
              </button>
            );
          })}
        </div>
      </section>
      <section className="dash-section" aria-labelledby="types-heading">
        <div className="dash-section-head">
          <h2 id="types-heading">{t('Төрлөөр үзэх', 'Browse by category')}</h2>
          <button className="text-link" onClick={() => navigate('wardrobe')}>
            {t('Миний шүүгээг нээх', 'Open my wardrobe')} <ArrowRight size={16} />
          </button>
        </div>
        <div className="dash-types">
          {categories.map((category) => {
            const items = data.garments.filter((g) => g.category === category);
            const cover = items.find((g) => g.favorite) ?? items[0];
            return (
              <button
                key={category}
                className="dash-type"
                onClick={() => openWith({ page: 'wardrobe', category })}
              >
                <span className="dash-type-image">
                  {cover ? <img src={cover.image} alt="" /> : <TShirt size={28} />}
                </span>
                <strong>{categoryLabels[category]}</strong>
                <small>{pieceCount(items.length)}</small>
              </button>
            );
          })}
        </div>
      </section>
      {wearOpen && (
        <Dialog title={t('Юу өмссөн бэ?', 'What did you wear?')} onClose={() => setWearOpen(false)}>
          <p className="muted">
            {t(
              'Өдрийнхөө товч тэмдэглэл. Бодитоор өмссөн хувцсаа сонгоно уу.',
              'A small record of your day. Choose the pieces you actually wore.',
            )}
          </p>
          <label className="field-label" htmlFor="wear-date">
            {t('Огноо', 'Date')}
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
                <span className="wear-thumb">
                  <img src={g.image} alt="" />
                </span>
                <span>
                  {g.name}
                  {data.archivedGarments.some((item) => item.id === g.id)
                    ? t(' · Архивласан', ' · Archived')
                    : ''}
                </span>
                {wearIds.includes(g.id) && <Check size={18} />}
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
            <Check size={18} /> {t('Өмссөн бүртгэл хадгалах', 'Save to wear log')}
          </button>
        </Dialog>
      )}
      {analysisOpen && <OyuOutfitCheck onClose={() => setAnalysisOpen(false)} />}
    </div>
  );
}
