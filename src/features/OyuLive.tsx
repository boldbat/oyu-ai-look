import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Heart, X } from '@phosphor-icons/react';
import { OyuBars, OyuFigure, OyuScore } from '../components/Oyu';
import { useApp } from '../lib/store';
import {
  appliedLine,
  inBoth,
  lingerLine,
  liveLines,
  nextToTry,
  rateGarment,
  ratingLine,
  visionLine,
} from '../lib/oyu';
import type { OyuLine, Said, TopPick } from '../lib/oyu';
import { PoseTracker, preloadPose, watchPose } from '../lib/oyu-vision';
import type { Need, PoseEvent } from '../lib/oyu-vision';
import type { Garment } from '../lib/types';
import { lang, t } from '../lib/lang';
import { hush, speak } from '../lib/oyu-voice';

type Stage = 'off' | 'opening' | 'preview' | 'connecting' | 'live';
type Timer = ReturnType<typeof setTimeout>;
/** A short "thinking" beat once the new piece lands, so the reaction reads as hers. */
const REACT_DELAY = 900;
/** After a reaction: a word about the piece, then the next piece to try. */
const LINGER = [11_000, 26_000];
/** Mean luma (0–255) under which the camera picture is too dark for a clean try-on. */
const DIM_LUMA = 55;
/** How long Oyu must have been quiet before she mentions something she noticed. */
const QUIET_FOR: Record<PoseEvent, number> = {
  absent: 2_500,
  'step-back': 2_500,
  returned: 1_500,
  framed: 1_500,
  spin: 1_500,
  back: 4_000,
  'hand-raised': 4_000,
  'arms-up': 4_000,
  'hand-on-hip': 4_000,
};

/** How much of the body a piece needs in frame: a garment id, or an upload key "uuid:region". */
function needFor(key: string | undefined, garments: Garment[]): Need {
  if (!key) return 'torso';
  const garment = garments.find((g) => g.id === key);
  if (garment)
    return garment.category === 'bottom' || garment.category === 'dress' ? 'legs' : 'torso';
  return /:(lower|outfit)$/.test(key) ? 'legs' : 'torso';
}
/**
 * Oyu's words appear as she says them, quickly (at most about a second). The full text keeps
 * its space from the start, so the bubble never grows while she talks.
 */
function Typed({ text }: { text: string }) {
  const [shown, setShown] = useState(() => (reducedMotion() ? text.length : 0));
  const first = useRef(text);
  useEffect(() => {
    // A language switch mid-sentence shows the new text whole rather than typing it again.
    if (text !== first.current || shown >= text.length) {
      setShown(text.length);
      return;
    }
    const step = Math.max(1, Math.ceil(text.length / 45));
    const timer = setTimeout(() => setShown((value) => value + step), 22);
    return () => clearTimeout(timer);
  }, [text, shown]);
  return (
    <>
      {text.slice(0, shown)}
      <span className="oyu-typed-rest" aria-hidden="true">
        {text.slice(shown)}
      </span>
    </>
  );
}
const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
/** How long Oyu "talks" (her talking bob) for a line. */
const talkTime = (text: string) => Math.min(2_400, Math.max(900, text.length * 26));

function newSession() {
  return {
    /** Oyu's score for each piece worn, in order. */
    scores: [] as number[],
    tried: new Map<string, number>(),
    said: new Set() as Said,
    /** The user has turned around in the current piece. */
    turned: false,
    /** Pieces already suggested for the current piece, so each suggestion is new. */
    suggested: new Set<string>(),
    told: { preview: false, dim: false, compare: false, absent: false, framing: false },
  };
}

/**
 * Oyu on the live try-on stage. She guides the first steps, reacts to each piece the moment it
 * lands, rates the user on request and suggests what to try next. With awareness on she also
 * sees the user (on this device only): framing, turning around, poses. Everything is local, so
 * she never slows the live session down.
 */
export function OyuLive({
  stage,
  applied,
  selectedKey,
  changing,
  compare,
  video,
  options,
  raised,
  hidden,
  vision,
  voice,
  onTry,
  onIdle,
}: {
  stage: Stage;
  /** The piece on screen: a wardrobe id, or an upload key that matches no garment. */
  applied: { key: string; name: string } | null;
  /** The piece chosen to try next (before the session starts). */
  selectedKey: string | undefined;
  changing: boolean;
  compare: boolean;
  /** The user's own camera picture (not the AI video). */
  video: RefObject<HTMLVideoElement | null>;
  /** Pieces Oyu may suggest (the try-on shelf). */
  options: Garment[];
  /** Whether the quick-switch strip is showing, so Oyu sits above it. */
  raised: boolean;
  /** Hidden by the user: Oyu stays silent but keeps the session in mind. */
  hidden: boolean;
  /** On-device body awareness is allowed. */
  vision: boolean;
  /** Oyu reads her lines aloud. */
  voice: boolean;
  onTry: (id: string) => void;
  /** The session just ended: her best pieces for the idle stage's summary, or null. */
  onIdle: (summary: { picks: TopPick[]; count: number } | null) => void;
}) {
  const { data } = useApp();
  /** The line on screen, written in both languages so a language switch re-renders it. */
  const [spoken, setSpoken] = useState<{ id: number; mn: OyuLine; en: OyuLine } | null>(null);
  const line = spoken ? { ...spoken[lang()], id: spoken.id } : null;
  const [talking, setTalking] = useState(false);
  const [open, setOpen] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [beat, setBeat] = useState(0);
  /** The user is pointing at or tabbed into the bubble: it stays, and nothing replaces it. */
  const [holding, setHolding] = useState(false);
  /** What a screen reader hears: only the text of each new line. */
  const [announcement, setAnnouncement] = useState('');
  const figure = useRef<HTMLButtonElement>(null);
  const latest = useRef({ prefs: data.preferences, options, garments: data.garments, stage });
  latest.current = { prefs: data.preferences, options, garments: data.garments, stage };
  const counter = useRef(0);
  const lastSaid = useRef(0);
  /** When the pose model last saw the user; Oyu only says "I'm watching" when it is recent. */
  const seenAt = useRef(0);
  const busy = useRef(false);
  busy.current = changing || thinking;
  const timers = useRef<Timer[]>([]);
  const previous = useRef<Stage | null>(null);
  const session = useRef(newSession());
  const tracker = useRef(new PoseTracker());
  const silent = useRef(hidden);
  silent.current = hidden;
  const speaking = useRef(voice);
  speaking.current = voice;
  tracker.current.need = needFor(applied?.key ?? selectedKey, data.garments);
  const wearing =
    stage === 'live' && applied ? (data.garments.find((g) => g.id === applied.key) ?? null) : null;

  const shown = useRef({ open: false, interactive: false, holding: false });
  shown.current = {
    open,
    interactive: !!line && (!!line.suggest || !!line.rating),
    holding,
  };
  /** Oyu says a line now; returns it in the current language. */
  function say(make: () => OyuLine) {
    const pair = inBoth(make, session.current.said);
    const next = pair[lang()];
    lastSaid.current = Date.now();
    setSpoken({ id: ++counter.current, ...pair });
    setOpen(!silent.current);
    // A new bubble starts unheld; pointing at it again holds it.
    setHolding(false);
    if (!silent.current) {
      setAnnouncement(
        `${next.text}${next.score !== undefined ? ` ${next.score.toFixed(1)}/10` : ''}`,
      );
      setTalking(true);
      if (speaking.current) speak(next.text, lang());
    }
    if (next.mood === 'happy') setBeat((value) => value + 1);
    return next;
  }
  /**
   * For lines Oyu offers on her own: they wait while the user is reading a score card or
   * deciding on a suggestion, rather than replace it.
   */
  function offer(make: () => OyuLine) {
    const { open: isOpen, interactive, holding: held } = shown.current;
    if (held || (isOpen && interactive && Date.now() - lastSaid.current < 9_000)) return false;
    say(make);
    return true;
  }
  /** Back to Oyu herself after a bubble button, so keyboard focus is never lost. */
  const refocus = () => requestAnimationFrame(() => figure.current?.focus({ preventScroll: true }));
  function quiet() {
    for (const timer of timers.current) clearTimeout(timer);
    timers.current = [];
  }
  /** The next piece to suggest: not tried, and not already suggested for this piece. */
  const suggestion = (current: Garment | null) => {
    const { tried, suggested } = session.current;
    const next = nextToTry(
      current,
      latest.current.options,
      [...tried.keys(), ...suggested],
      latest.current.prefs,
    );
    if (next) suggested.add(next.id);
    return next;
  };
  const seeing = () => Date.now() - seenAt.current < 3_000;
  /** Something the pose model noticed; Oyu mentions it if the moment is right. */
  function notice(event: PoseEvent, attempt = 0) {
    const current = latest.current.stage;
    if (current !== 'preview' && current !== 'live') return;
    // A confirmation ("I can see you", "there you are") is said once, so if the moment is
    // wrong it waits for a quiet one, as long as it is still true.
    const later = () => {
      if ((event !== 'framed' && event !== 'returned') || attempt >= 4) return;
      timers.current.push(
        setTimeout(() => {
          if (tracker.current.still(event)) notice(event, attempt + 1);
        }, 1_000),
      );
    };
    if (busy.current || Date.now() - lastSaid.current < QUIET_FOR[event]) return later();
    if (current === 'preview' && (event === 'spin' || event === 'back')) return;
    const { told } = session.current;
    // "There you are" only answers "I can't see you"; mid-session, "that's it" only answers
    // her own request to step back.
    if (event === 'returned' && !told.absent) return;
    if (event === 'framed' && current === 'live' && !told.framing) return;
    const need = tracker.current.need;
    const { said } = session.current;
    if (!offer(() => visionLine(event, { stage: current, need, said }))) return later();
    if (event === 'spin' || event === 'back') session.current.turned = true;
    told.absent = event === 'absent';
    told.framing = event === 'step-back';
  }

  // Nothing Oyu was waiting to say outlives the stage, and she stops talking when it goes.
  useEffect(
    () => () => {
      quiet();
      hush();
    },
    [],
  );
  // Her talking bob lasts about as long as the line takes to say.
  useEffect(() => {
    if (!talking || !line) return;
    const timer = setTimeout(() => setTalking(false), talkTime(line.text));
    return () => clearTimeout(timer);
  }, [talking, line?.id]);
  // Turning the voice off, or a language switch, stops the sentence she is saying.
  const language = lang();
  useEffect(() => {
    if (!voice) hush();
  }, [voice]);
  useEffect(() => hush, [language]);
  // Each line stays up long enough to read, longer when it offers a button.
  useEffect(() => {
    if (!line || !open || holding) return;
    const hold =
      Math.min(11_000, Math.max(5_500, line.text.length * 70)) +
      (line.suggest || line.rating ? 4_000 : 0);
    const timer = setTimeout(() => setOpen(false), hold);
    return () => clearTimeout(timer);
  }, [line?.id, open, holding]);
  // Guide each step of the session; when it ends, sum it up for the idle stage.
  useEffect(() => {
    // Act on real changes only (development mode runs effects twice).
    if (previous.current === stage) return;
    previous.current = stage;
    if (stage === 'off') {
      const picks = [...session.current.tried]
        .map(([id, score]) => ({
          garment: latest.current.garments.find((g) => g.id === id),
          score,
        }))
        .filter((pick): pick is { garment: Garment; score: number } => !!pick.garment)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);
      onIdle(picks.length ? { picks, count: session.current.tried.size } : null);
      setOpen(false);
      session.current = newSession();
      tracker.current = new PoseTracker();
    } else if (stage === 'preview' && !session.current.told.preview) {
      // Once per camera session: flipping the camera passes through preview again.
      session.current.told.preview = true;
      say(liveLines.preview);
    } else if (stage === 'connecting') say(liveLines.connecting);
    // The first piece's reaction takes over from "getting ready".
    else if (stage === 'live') setOpen(false);
  }, [stage]);
  // React to each piece once it is on screen, then follow up while the user keeps it on.
  useEffect(() => {
    if (stage !== 'live' || !applied) return;
    const key = applied.key;
    session.current.turned = false;
    session.current.suggested.clear();
    setThinking(true);
    setOpen(false);
    timers.current.push(
      setTimeout(() => {
        setThinking(false);
        const garment = latest.current.garments.find((g) => g.id === key);
        if (!garment) {
          say(liveLines.upload);
          return;
        }
        const prefs = latest.current.prefs;
        const { scores, said, tried } = session.current;
        const next = suggestion(garment);
        const reaction = say(() => appliedLine(garment, prefs, next, { scores, said }));
        scores.push(reaction.score!);
        tried.set(garment.id, reaction.score!);
        LINGER.forEach((delay, step) =>
          timers.current.push(
            setTimeout(() => {
              const later = suggestion(garment);
              const context = { vision: seeing(), turned: session.current.turned, said };
              offer(() => lingerLine(garment, prefs, later, step, context));
            }, delay),
          ),
        );
      }, REACT_DELAY),
    );
    return () => {
      quiet();
      setThinking(false);
    };
  }, [stage, applied?.key]);
  // Stay quiet while a new piece is being put on.
  useEffect(() => {
    if (!changing) return;
    quiet();
    setThinking(false);
    setOpen(false);
  }, [changing]);
  useEffect(() => {
    if (!compare || session.current.told.compare || stage !== 'live') return;
    session.current.told.compare = true;
    offer(liveLines.compare);
  }, [compare, stage]);
  // A dark picture is the most common cause of a weak try-on: say so once per session.
  useEffect(() => {
    if (stage !== 'preview' && stage !== 'live') return;
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 18;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    let darkSamples = 0;
    const timer = setInterval(() => {
      const source = video.current;
      if (!context || !source || source.readyState < 2 || session.current.told.dim) return;
      try {
        context.drawImage(source, 0, 0, canvas.width, canvas.height);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let sum = 0;
        for (let i = 0; i < pixels.length; i += 4)
          sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        darkSamples = sum / (pixels.length / 4) < DIM_LUMA ? darkSamples + 1 : 0;
      } catch {
        return;
      }
      // Wait for a gap so the tip never cuts off a reaction.
      if (darkSamples >= 2 && !busy.current && Date.now() - lastSaid.current > 5_000)
        session.current.told.dim = offer(liveLines.dim);
    }, 1_500);
    return () => clearInterval(timer);
  }, [stage]);
  // Load the pose model once the page has settled, so Oyu can see by the time the camera opens.
  useEffect(() => {
    if (!vision || hidden) return;
    const timer = setTimeout(preloadPose, 1_500);
    return () => clearTimeout(timer);
  }, [vision, hidden]);
  // Seeing the user: framing, turning around and poses, on this device only.
  const watching = vision && !hidden && (stage === 'preview' || stage === 'live');
  useEffect(() => {
    const element = video.current;
    if (!watching || !element) return;
    return watchPose(element, (frame, at) => {
      if (frame?.present) seenAt.current = Date.now();
      for (const event of tracker.current.push(frame, at)) notice(event);
    });
  }, [watching]);
  // Coming back from hidden starts quiet rather than replaying an old line.
  useEffect(() => {
    if (hidden) setOpen(false);
  }, [hidden]);

  if (hidden || stage === 'off') return null;
  const mood = thinking ? 'think' : (line?.mood ?? 'hello');
  // "Rate me" fits Oyu's warm words about the piece, not tips like "I can't see you".
  const rateable = !!line && !line.rating && !line.suggest && line.mood === 'happy';
  const score = wearing ? rateGarment(wearing, data.preferences).overall : null;
  return (
    <div className={`oyu-live ${raised ? 'is-raised' : ''}`}>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {thinking ? (
        <div className="oyu-bubble is-thinking" aria-hidden="true">
          <span className="oyu-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </div>
      ) : (
        line &&
        open && (
          <div
            key={line.id}
            className="oyu-bubble"
            onMouseEnter={() => setHolding(true)}
            onMouseLeave={() => setHolding(false)}
            onFocus={() => setHolding(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setHolding(false);
            }}
          >
            <p className="oyu-bubble-head">
              <strong>Oyu</strong>
              {line.score !== undefined && <OyuScore score={line.score} animate />}
              <button
                className="oyu-bubble-close"
                aria-label={t('Oyu-гийн бичлэгийг хаах', 'Close Oyu’s message')}
                onClick={() => {
                  setOpen(false);
                  setHolding(false);
                  hush();
                  refocus();
                }}
              >
                <X size={14} weight="regular" />
              </button>
            </p>
            <p>
              <Typed key={line.id} text={line.text} />
            </p>
            {line.rating && <OyuBars rating={line.rating} />}
            {(line.suggest || (wearing && rateable)) && (
              <div className="oyu-bubble-actions">
                {line.suggest && (
                  <button
                    className="oyu-try"
                    onClick={() => {
                      setOpen(false);
                      setHolding(false);
                      onTry(line.suggest!.id);
                      refocus();
                    }}
                  >
                    <span className="oyu-thumb">
                      <img src={line.suggest.image} alt="" />
                    </span>
                    {t('Өмсөөд үзэх', 'Try it on')}
                  </button>
                )}
                {wearing && rateable && (
                  <button
                    className="oyu-rate"
                    onClick={() => {
                      const prefs = latest.current.prefs;
                      say(() => ratingLine(wearing, prefs));
                      refocus();
                    }}
                  >
                    {t('Намайг үнэлээч', 'Rate me')}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      )}
      <button
        ref={figure}
        className="oyu-live-figure"
        aria-label={
          open
            ? t('Oyu-гийн бичлэгийг хаах', 'Close Oyu’s message')
            : t('Oyu-гийн бичлэгийг харах', 'Show Oyu’s message')
        }
        aria-expanded={open}
        onClick={() => {
          if (open) setOpen(false);
          else if (wearing) {
            const prefs = latest.current.prefs;
            say(() => ratingLine(wearing, prefs));
          } else if (line) setOpen(true);
        }}
      >
        <span className="oyu-live-glow" aria-hidden="true" />
        <span
          className={`oyu-live-body ${talking && open ? 'is-talking' : ''} ${mood === 'think' ? 'is-thinking' : ''}`}
          data-beat={beat ? beat % 2 : undefined}
        >
          <OyuFigure mood={mood} />
        </span>
        {/* Little hearts for a piece she loves. */}
        {open && line?.score !== undefined && line.score >= 9 && !line.rating && (
          <span key={line.id} className="oyu-hearts" aria-hidden="true">
            <Heart weight="fill" />
            <Heart weight="fill" />
            <Heart weight="fill" />
          </span>
        )}
        {score !== null && !open && !thinking && (
          <span className="oyu-live-badge">{score.toFixed(1)}</span>
        )}
      </button>
    </div>
  );
}
