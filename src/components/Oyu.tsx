import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ClockCounterClockwise,
  Shuffle,
  Swatches,
  VideoCamera,
  X,
} from '@phosphor-icons/react';
import { useApp } from '../lib/store';
import { finishingTouches, nameOf, recommend } from '../lib/demo';
import { lookReasons } from '../lib/style';
import { tryOnCategories } from '../lib/types';
import type { Garment, Page } from '../lib/types';
import { oyuPose, ratingLabels, reviewGarment, reviewLook, reviewWeek } from '../lib/oyu';
import type { OyuMood } from '../lib/oyu';
import { localized, t } from '../lib/lang';
import './oyu.css';

/** All three poses stay mounted and cross-fade, so a mood change never flashes an empty frame. */
export function OyuFigure({ mood, className = '' }: { mood: OyuMood; className?: string }) {
  return (
    <span className={`oyu-figure ${className}`} aria-hidden="true">
      {(Object.keys(oyuPose) as OyuMood[]).map((pose) => (
        <img
          key={pose}
          src={oyuPose[pose]}
          alt=""
          draggable={false}
          className={pose === mood ? 'is-on' : ''}
        />
      ))}
    </span>
  );
}
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/**
 * Oyu's score out of 10. `animate` counts up to it the moment she gives it, and glides to a
 * new value when the score changes (as an outfit is built).
 */
export function OyuScore({ score, animate = false }: { score: number; animate?: boolean }) {
  const counts = animate && !reducedMotion();
  const [shown, setShown] = useState(counts ? Math.max(5, score - 1.8) : score);
  const current = useRef(shown);
  current.current = shown;
  useEffect(() => {
    if (!counts) {
      setShown(score);
      return;
    }
    const from = current.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / 700);
      setShown(from + (score - from) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [score, counts]);
  return (
    <span className="oyu-score">
      <span className="sr-only">
        {t(`Oyu-гийн үнэлгээ: ${score.toFixed(1)}/10`, `Oyu’s rating: ${score.toFixed(1)}/10`)}
      </span>
      <span aria-hidden="true">{shown.toFixed(1)}</span>
      <small aria-hidden="true">/10</small>
    </span>
  );
}
/** Sub-scores as bars: a garment's rating by default, or any scores with their labels. */
export function OyuBars<K extends string>({
  rating,
  labels = ratingLabels as Record<K, string>,
}: {
  rating: Record<K, number>;
  labels?: Record<K, string>;
}) {
  return (
    <ul className="oyu-bars">
      {(Object.keys(labels) as K[]).map((key) => (
        <li key={key}>
          <span>{labels[key]}</span>
          <i style={{ '--value': `${rating[key] * 10}%` } as CSSProperties} />
          <b>{rating[key].toFixed(1)}</b>
        </li>
      ))}
    </ul>
  );
}
export function OyuThumbs({ pieces }: { pieces: Garment[] }) {
  return (
    <span className="oyu-thumbs">
      {pieces.map((g) => (
        <span key={g.id} className="oyu-thumb" title={g.name}>
          <img src={g.image} alt={g.name} loading="lazy" />
        </span>
      ))}
    </span>
  );
}
/** Oyu's inline comment, used on pages: avatar, optional score, a few lines. */
export function OyuNote({
  mood,
  score,
  lines,
  children,
  className = '',
  animate = false,
}: {
  mood: OyuMood;
  score?: number;
  lines: string[];
  children?: ReactNode;
  className?: string;
  /** Count the score up, and glide when it changes. */
  animate?: boolean;
}) {
  return (
    <div className={`oyu-note ${className}`}>
      <span className="oyu-note-avatar" aria-hidden="true">
        <OyuFigure mood={mood} />
      </span>
      <div className="oyu-note-body">
        <p className="oyu-note-head">
          <strong>Oyu</strong>
          {score !== undefined && <OyuScore score={score} animate={animate} />}
        </p>
        {lines.map((line) => (
          <p key={line}>{/[.!?…]$/.test(line) ? line : `${line}.`}</p>
        ))}
        {children}
      </div>
    </div>
  );
}

/** Text is kept as a function, so messages already in the thread follow a language switch. */
type Message =
  | { id: number; from: 'me'; text: () => string }
  | { id: number; from: 'oyu'; kind: 'text'; mood: OyuMood; text: () => string }
  | { id: number; from: 'oyu'; kind: 'outfit'; variant: number }
  | { id: number; from: 'oyu'; kind: 'pick-garment' }
  | { id: number; from: 'oyu'; kind: 'garment'; garmentId: string }
  | { id: number; from: 'oyu'; kind: 'pick-look' }
  | { id: number; from: 'oyu'; kind: 'look'; lookId: string }
  | { id: number; from: 'oyu'; kind: 'week' };
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
type Draft = WithoutId<Message>;

/** Pages Oyu has nudged about this visit, and whether the user asked her to stop. */
const NUDGED_KEY = 'oyu.nudged';
const QUIET_KEY = 'oyu.nudges.off';
function stored(key: string) {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}
function store(key: string, value: string) {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    /* not remembered in private mode */
  }
}
/** Oyu's nudge for a page: a one-line offer that opens her on that page's main question. */
function nudgeFor(page: Page, name: string) {
  switch (page) {
    case 'wardrobe':
      return t('Аль нэг хувцсыг тань үнэлж өгөх үү?', 'Want me to rate one of your pieces?');
    case 'studio':
      return t('Хослол бүтээвэл би шууд оноо өгнө.', 'Build a look and I’ll score it as you go.');
    case 'history':
      return t('Энэ долоо хоногийн хувцаслалтаа харах уу?', 'Want to look back at your week?');
    case 'settings':
      return t(
        'Стилээ сонговол илүү оновчтой зөвлөнө.',
        'Pick your styles and my advice gets sharper.',
      );
    default:
      return t(
        `Сайн уу, ${name}! Өнөөдөр юу өмсөхийг хамт сонгох уу?`,
        `Hi ${name}! Shall we pick what you’ll wear today?`,
      );
  }
}
/** How often Oyu waves while she waits, and for how long. */
const WAVE_EVERY = 12_000;
const WAVE_FOR = 1_600;
type Ask = 'outfit' | 'garment' | 'look' | 'week';
/** The question that fits each page comes first. */
const askOrder: Record<Page, Ask[]> = {
  home: ['outfit', 'garment', 'look', 'week'],
  wardrobe: ['garment', 'outfit', 'look', 'week'],
  studio: ['look', 'outfit', 'garment', 'week'],
  live: ['outfit', 'garment', 'look', 'week'],
  history: ['week', 'outfit', 'garment', 'look'],
  settings: ['outfit', 'garment', 'look', 'week'],
};
const askLabels = localized<Ask>({
  outfit: ['Өнөөдөр юу өмсөх вэ?', 'What should I wear today?'],
  garment: ['Хувцсаа үнэлүүлэх', 'Rate a piece'],
  look: ['Хослолоо үнэлүүлэх', 'Rate my look'],
  week: ['Долоо хоногийн тойм', 'My week'],
});

/** The floating companion on every page except live try-on, where Oyu sits on the stage. */
export function OyuCompanion({
  hidden = false,
  onCheckOutfit,
}: {
  hidden?: boolean;
  /** Opens the outfit check ("tap what you're wearing, Oyu rates it"). */
  onCheckOutfit: () => void;
}) {
  const { data, page, navigate, openWith } = useApp();
  const latest = useRef(data);
  latest.current = data;
  const [open, setOpen] = useState(false);
  /** The page whose nudge is showing, if any. */
  const [nudge, setNudge] = useState<Page | null>(null);
  const [waving, setWaving] = useState(true);
  /** The latest thing Oyu said, for screen readers (the thread itself is not a live region). */
  const [announcement, setAnnouncement] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const nextId = useRef(0);
  const variant = useRef(0);
  /** The page Oyu last greeted the user on; a new page gets a fitting hello. */
  const greeted = useRef<Page | null>(null);
  const thread = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const name = data.preferences.name || t('найз', 'friend');
  const garments = data.garments;

  // One nudge per page per visit, a moment after the page opens; never once dismissed.
  useEffect(() => {
    setNudge(null);
    const seen: string[] = JSON.parse(stored(NUDGED_KEY) ?? '[]');
    if (stored(QUIET_KEY) || seen.includes(page)) return;
    const show = setTimeout(() => {
      store(NUDGED_KEY, JSON.stringify([...seen, page]));
      setNudge(page);
    }, 2_200);
    return () => clearTimeout(show);
  }, [page]);
  useEffect(() => {
    if (!nudge) return;
    const hide = setTimeout(() => setNudge(null), 9_000);
    return () => clearTimeout(hide);
  }, [nudge]);
  // She arrives waving, then waves now and then while she waits.
  useEffect(() => {
    if (open) return;
    let stop: ReturnType<typeof setTimeout>;
    const first = setTimeout(() => setWaving(false), WAVE_FOR);
    const every = setInterval(() => {
      setWaving(true);
      stop = setTimeout(() => setWaving(false), WAVE_FOR);
    }, WAVE_EVERY);
    return () => {
      clearTimeout(first);
      clearTimeout(stop);
      clearInterval(every);
    };
  }, [open]);
  useEffect(() => {
    const list = thread.current;
    if (!list) return;
    list.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    const replies = list.querySelectorAll('.oyu-msg.is-oyu');
    const last = replies[replies.length - 1];
    if (!last) return;
    const parts = last.querySelectorAll(
      '.oyu-note-head .sr-only, .oyu-note-body > p:not(.oyu-note-head)',
    );
    setAnnouncement([...parts].map((part) => part.textContent).join(' '));
  }, [messages]);
  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLElement>('.oyu-chips button')?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setOpen(false);
      dock.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  /** The user closed a nudge: no more nudges this visit. */
  function quietNudges() {
    setNudge(null);
    store(QUIET_KEY, '1');
  }
  function push(...drafts: Draft[]) {
    setMessages((list) =>
      [...list, ...drafts.map((draft) => ({ ...draft, id: ++nextId.current }) as Message)].slice(
        -12,
      ),
    );
  }
  /** Oyu's hello for a page; the first one of the visit introduces her. */
  function greeting(at: Page, first: boolean): string {
    const { preferences, garments: pieces } = latest.current;
    const who = preferences.name || t('найз', 'friend');
    const hello = first
      ? t(`Сайн байна уу, ${who}! Би Oyu, таны стилист. `, `Hi ${who}! I’m Oyu, your stylist. `)
      : '';
    const count = pieces.length;
    switch (at) {
      case 'wardrobe':
        return t(
          `${hello}Шүүгээнд тань ${count} хувцас байна. Аль нэгийг нь үнэлүүлэх үү?`,
          `${hello}You have ${count} ${count === 1 ? 'piece' : 'pieces'} in your wardrobe. Want me to rate one?`,
        );
      case 'studio':
        return t(
          `${hello}Хослол бүтээж байна уу? Самбар дээр би оноо өгч байгаа шүү.`,
          `${hello}Putting a look together? I’m scoring it on the board as you go.`,
        );
      case 'history':
        return t(
          `${hello}Сүүлийн долоо хоногийн хувцаслалтаа хамт харах уу?`,
          `${hello}Shall we look back at your outfits from the past week?`,
        );
      case 'settings':
        return t(
          `${hello}Стилээ сонговол би илүү оновчтой зөвлөнө.`,
          `${hello}Choose your style and I can tailor my advice to you.`,
        );
      default:
        return t(
          `${hello}Өнөөдөр юу өмсөхийг хамт сонгох уу?`,
          `${hello}Shall we pick what you’ll wear today?`,
        );
    }
  }
  function toggle() {
    setNudge(null);
    if (!open && greeted.current !== page) {
      const at = page;
      const first = greeted.current === null;
      push({ from: 'oyu', kind: 'text', mood: 'hello', text: () => greeting(at, first) });
      greeted.current = page;
    }
    setOpen((value) => !value);
  }
  function go(action: () => void) {
    setOpen(false);
    action();
  }
  const askOutfit = () =>
    push(
      { from: 'me', text: () => askLabels.outfit },
      { from: 'oyu', kind: 'outfit', variant: variant.current++ },
    );
  const askGarment = () =>
    push({ from: 'me', text: () => askLabels.garment }, { from: 'oyu', kind: 'pick-garment' });
  const askWeek = () =>
    push({ from: 'me', text: () => askLabels.week }, { from: 'oyu', kind: 'week' });
  const asks: Record<Ask, () => void> = {
    outfit: () => askOutfit(),
    garment: () => askGarment(),
    look: () => askLook(),
    week: () => askWeek(),
  };
  const askLook = () =>
    push({ from: 'me', text: () => askLabels.look }, { from: 'oyu', kind: 'pick-look' });

  function render(message: Message) {
    if (message.from === 'me') return <p className="oyu-msg-me">{message.text()}</p>;
    switch (message.kind) {
      case 'text':
        return <OyuNote mood={message.mood} lines={[message.text()]} />;
      case 'outfit': {
        const look = recommend(garments, message.variant);
        const outfit = [...look, ...finishingTouches(look, garments, message.variant)];
        const review = reviewLook(outfit, data.preferences);
        const tryOn = outfit.find((g) => tryOnCategories.includes(g.category));
        if (!review)
          return (
            <OyuNote
              mood="think"
              lines={[
                t(
                  'Санал гаргахын тулд шүүгээндээ цамц, өмд, гутал нэмээрэй.',
                  'Add a top, bottoms, and shoes to your wardrobe and I’ll suggest a look.',
                ),
              ]}
            />
          );
        return (
          <OyuNote
            mood={review.mood}
            score={review.score}
            lines={[
              t('Өнөөдөр үүнийг өмсөөрэй!', 'Wear this today!'),
              ...lookReasons(outfit).slice(0, 1),
            ]}
          >
            <OyuThumbs pieces={outfit} />
            <div className="oyu-actions">
              {tryOn && (
                <button
                  className="button small"
                  onClick={() => go(() => openWith({ page: 'live', garmentIds: [tryOn.id] }))}
                >
                  <VideoCamera size={16} /> {t('Өмсөж үзэх', 'Try it on')}
                </button>
              )}
              <button
                className="button small secondary"
                onClick={() =>
                  go(() => openWith({ page: 'studio', garmentIds: outfit.map((g) => g.id) }))
                }
              >
                <Swatches size={16} /> {t('Студид нээх', 'Open in studio')}
              </button>
              <button
                className="text-link"
                onClick={() => push({ from: 'oyu', kind: 'outfit', variant: variant.current++ })}
              >
                <Shuffle size={16} /> {t('Өөр санал', 'Another idea')}
              </button>
            </div>
          </OyuNote>
        );
      }
      case 'pick-garment':
        return (
          <OyuNote
            mood="think"
            lines={[
              t('Аль хувцсыг үнэлэх вэ? Нэгийг сонгоорой.', 'Which piece should I rate? Pick one.'),
            ]}
          >
            <div className="oyu-picker">
              {garments.map((g) => (
                <button
                  key={g.id}
                  className="oyu-thumb"
                  title={g.name}
                  aria-label={t(`Үнэлүүлэх: ${g.name}`, `Rate ${g.name}`)}
                  onClick={() =>
                    push(
                      { from: 'me', text: () => nameOf(g) },
                      { from: 'oyu', kind: 'garment', garmentId: g.id },
                    )
                  }
                >
                  <img src={g.image} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          </OyuNote>
        );
      case 'garment': {
        const g = garments.find((item) => item.id === message.garmentId);
        if (!g)
          return (
            <OyuNote
              mood="think"
              lines={[
                t('Энэ хувцас шүүгээнд алга болжээ.', 'This piece is no longer in your wardrobe.'),
              ]}
            />
          );
        const review = reviewGarment(g, data);
        return (
          <OyuNote mood={review.mood} score={review.rating.overall} lines={review.lines}>
            <OyuBars rating={review.rating} />
            {review.pairs.length > 0 && (
              <>
                <p className="oyu-sub">{t('Үүнтэй хослуулаарай', 'Pair it with')}</p>
                <OyuThumbs pieces={review.pairs} />
              </>
            )}
            <div className="oyu-actions">
              {tryOnCategories.includes(g.category) && (
                <button
                  className="button small"
                  onClick={() => go(() => openWith({ page: 'live', garmentIds: [g.id] }))}
                >
                  <VideoCamera size={16} /> {t('Өмсөж үзэх', 'Try it on')}
                </button>
              )}
              <button
                className="button small secondary"
                onClick={() => go(() => openWith({ page: 'studio', garmentIds: [g.id] }))}
              >
                <Swatches size={16} /> {t('Хослуулах', 'Style it')}
              </button>
            </div>
          </OyuNote>
        );
      }
      case 'pick-look':
        return (
          <OyuNote
            mood="think"
            lines={[
              data.savedLooks.length
                ? t(
                    'Өмссөн хувцсаа сонгох уу, эсвэл хадгалсан хослолоо үнэлүүлэх үү?',
                    'Want to pick what you’re wearing, or have me rate a saved look?',
                  )
                : t(
                    'Өмссөн хувцсаа сонгоорой, би шууд үнэлнэ.',
                    'Pick what you’re wearing and I’ll rate it right away.',
                  ),
            ]}
          >
            <div className="oyu-actions">
              <button className="button small" onClick={() => go(onCheckOutfit)}>
                <Check size={16} /> {t('Хувцсаа сонгох', 'Choose your pieces')}
              </button>
            </div>
            <div className="oyu-looks">
              {data.savedLooks.map((look) => (
                <button
                  key={look.id}
                  onClick={() =>
                    push(
                      {
                        from: 'me',
                        text: () =>
                          latest.current.savedLooks.find((saved) => saved.id === look.id)?.name ??
                          look.name,
                      },
                      { from: 'oyu', kind: 'look', lookId: look.id },
                    )
                  }
                >
                  <strong>{look.name}</strong>
                  <OyuThumbs
                    pieces={garments.filter((g) => look.garmentIds.includes(g.id)).slice(0, 4)}
                  />
                </button>
              ))}
            </div>
          </OyuNote>
        );
      case 'week': {
        const week = reviewWeek(data);
        const back = week.forgotten;
        return (
          <OyuNote mood={week.mood} lines={week.lines}>
            {week.worn.length > 0 && <OyuThumbs pieces={week.worn} />}
            <div className="oyu-actions">
              {back && tryOnCategories.includes(back.category) ? (
                <button
                  className="button small"
                  onClick={() => go(() => openWith({ page: 'live', garmentIds: [back.id] }))}
                >
                  <VideoCamera size={16} /> {t('Өмсөж үзэх', 'Try it on')}
                </button>
              ) : (
                back && (
                  <button
                    className="button small"
                    onClick={() => go(() => openWith({ page: 'studio', garmentIds: [back.id] }))}
                  >
                    <Swatches size={16} /> {t('Хослуулах', 'Style it')}
                  </button>
                )
              )}
              <button className="text-link" onClick={() => go(() => navigate('history'))}>
                <ClockCounterClockwise size={16} /> {t('Түүх нээх', 'Open history')}
              </button>
            </div>
          </OyuNote>
        );
      }
      case 'look': {
        const look = data.savedLooks.find((item) => item.id === message.lookId);
        const pieces = look ? garments.filter((g) => look.garmentIds.includes(g.id)) : [];
        const review = reviewLook(pieces, data.preferences);
        if (!look || !review)
          return (
            <OyuNote
              mood="think"
              lines={[t('Энэ хослол олдсонгүй.', 'I couldn’t find this look.')]}
            />
          );
        return (
          <OyuNote mood={review.mood} score={review.score} lines={review.lines}>
            <OyuThumbs pieces={pieces} />
            <div className="oyu-actions">
              <button
                className="button small secondary"
                onClick={() => go(() => openWith({ page: 'studio', garmentIds: look.garmentIds }))}
              >
                <Swatches size={16} /> {t('Студид нээх', 'Open in studio')}
              </button>
            </div>
          </OyuNote>
        );
      }
    }
  }

  return (
    <div
      className={`oyu-companion ${open ? 'is-open' : ''} ${hidden ? 'is-hidden' : ''} ${nudge && !open ? 'has-nudge' : ''}`}
    >
      <p className="sr-only" role="status">
        {open ? announcement : ''}
      </p>
      {open && (
        <div ref={panel} className="oyu-panel" role="dialog" aria-labelledby="oyu-panel-title">
          <header className="oyu-panel-head">
            <span className="oyu-panel-avatar" aria-hidden="true">
              <OyuFigure mood="happy" />
            </span>
            <div>
              <h2 id="oyu-panel-title">Oyu</h2>
              <p>{t('Таны стилист найз', 'Your stylist friend')}</p>
            </div>
            <button
              className="icon-button"
              aria-label={t('Oyu-г хаах', 'Close Oyu')}
              onClick={() => {
                setOpen(false);
                dock.current?.focus();
              }}
            >
              <X size={18} />
            </button>
          </header>
          <div ref={thread} className="oyu-thread">
            <div className="oyu-intro">
              <img src="/assets/oyu/oyu-with-model.webp" alt="" />
              <p>
                {t(
                  'Хувцас санал болгоно, хувцас, хослолыг тань үнэлнэ, шууд өмсөж үзэх үед хажууд тань байна.',
                  'I suggest outfits, rate your pieces and looks, and keep you company during live try-on.',
                )}
              </p>
            </div>
            {messages.map((message) => (
              <div key={message.id} className={`oyu-msg is-${message.from}`}>
                {render(message)}
              </div>
            ))}
          </div>
          <div className="oyu-chips" role="group" aria-label={t('Oyu-гаас асуух', 'Ask Oyu')}>
            {askOrder[page].map((ask) => (
              <button key={ask} onClick={asks[ask]}>
                {askLabels[ask]}
              </button>
            ))}
            <button onClick={() => go(() => navigate('live'))}>
              {t('Шууд өмсөж үзэх', 'Live try-on')} <ArrowRight size={14} weight="regular" />
            </button>
          </div>
        </div>
      )}
      {nudge && !open && (
        <div className="oyu-teaser" role="status">
          <button
            className="oyu-teaser-text"
            onClick={() => {
              const ask = askOrder[nudge][0];
              toggle();
              asks[ask]();
            }}
          >
            {nudgeFor(nudge, name)}
          </button>
          <button
            className="oyu-teaser-close"
            aria-label={t('Хаах', 'Close')}
            onClick={quietNudges}
          >
            <X size={14} weight="regular" />
          </button>
        </div>
      )}
      <button
        ref={dock}
        className="oyu-dock"
        aria-expanded={open}
        aria-label={
          open
            ? t('Oyu-г хаах', 'Close Oyu')
            : t('Oyu стилисттэй ярилцах', 'Chat with Oyu, your stylist')
        }
        onClick={toggle}
      >
        <span className={`oyu-dock-body ${waving && !open ? 'is-waving' : ''}`}>
          <OyuFigure mood={open || !(waving || nudge) ? 'happy' : 'hello'} />
        </span>
        <span className="oyu-dock-name" aria-hidden="true">
          Oyu
        </span>
      </button>
    </div>
  );
}
