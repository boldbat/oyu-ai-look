import { useRef, useState } from 'react';
import { Check, Plus, VideoCamera, X } from '@phosphor-icons/react';
import { Dialog } from '../components/Dialog';
import { OyuBars, OyuNote, OyuScore } from '../components/Oyu';
import { useApp } from '../lib/store';
import { localDate } from '../lib/demo';
import { lookAddition, lookLabels, reviewLook } from '../lib/oyu';
import { categoryLabels, tryOnCategories } from '../lib/types';
import type { Category, Garment } from '../lib/types';
import { t } from '../lib/lang';

/** Outfit order on the board: base, layer, shoes, then accessories. */
const order: Category[] = ['top', 'bottom', 'dress', 'outerwear', 'footwear', 'accessory'];
/** One of each, except accessories; a dress takes the place of a top and bottom. */
function clashes(piece: Garment, other: Garment) {
  if (piece.category === 'accessory') return false;
  if (piece.category === other.category) return true;
  const base = (g: Garment) => g.category === 'top' || g.category === 'bottom';
  return (piece.category === 'dress' && base(other)) || (other.category === 'dress' && base(piece));
}

/**
 * "Rate my outfit": the user taps what they are wearing and Oyu rates it as it comes together,
 * with one piece to add. It can be logged as today's outfit or tried on live.
 */
export function OyuOutfitCheck({ onClose }: { onClose: () => void }) {
  const { data, logWear, openWith, navigate, notify, openAccount } = useApp();
  const today = localDate();
  const [ids, setIds] = useState<string[]>(
    () =>
      data.wearLogs
        .find((log) => log.date === today)
        ?.garmentIds.filter((id) => data.garments.some((g) => g.id === id)) ?? [],
  );
  const [category, setCategory] = useState<Category>('top');
  const pieces = order.flatMap((c) =>
    data.garments.filter((g) => g.category === c && ids.includes(g.id)),
  );
  const review = reviewLook(pieces, data.preferences);
  const addition = lookAddition(pieces, data);
  const tryOn = pieces.find((g) => tryOnCategories.includes(g.category));
  const shelf = data.garments.filter((g) => g.category === category);
  const reviewSection = useRef<HTMLElement>(null);

  function choose(piece: Garment) {
    setIds((list) =>
      list.includes(piece.id)
        ? list.filter((id) => id !== piece.id)
        : [
            ...list.filter((id) => {
              const other = data.garments.find((g) => g.id === id);
              return other && !clashes(piece, other);
            }),
            piece.id,
          ],
    );
  }
  return (
    <Dialog title={t('Oyu хослолыг тань үнэлнэ', 'Oyu rates your look')} onClose={onClose} wide>
      <div className="outfit-check">
        <section
          className="outfit-check-pick"
          aria-label={t('Хувцсаа сонгох', 'Choose your pieces')}
        >
          <p className="muted">
            {t(
              'Өнөөдөр өмссөн, эсвэл өмсөх гэж буй хувцсаа сонгоорой.',
              'Choose what you’re wearing today, or what you’re about to put on.',
            )}
          </p>
          <div
            className="outfit-check-tabs"
            role="group"
            aria-label={t('Хувцасны төрөл', 'Piece type')}
          >
            {order.map((c) => (
              <button
                key={c}
                className={`chip ${category === c ? 'active' : ''}`}
                aria-pressed={category === c}
                onClick={() => setCategory(c)}
              >
                {categoryLabels[c]}
                {pieces.some((g) => g.category === c) && (
                  <Check size={13} weight="bold" aria-label={t('сонгосон', 'selected')} />
                )}
              </button>
            ))}
          </div>
          <div className="outfit-check-grid">
            {shelf.map((g) => (
              <button
                key={g.id}
                className={`outfit-check-item ${ids.includes(g.id) ? 'selected' : ''}`}
                aria-pressed={ids.includes(g.id)}
                onClick={() => choose(g)}
              >
                <span className="wear-thumb">
                  <img src={g.image} alt="" loading="lazy" />
                </span>
                <span>
                  {g.name}
                  {g.availability === 'laundry' && <small>{t('Угаалгад', 'In the laundry')}</small>}
                </span>
                {ids.includes(g.id) && <Check size={16} />}
              </button>
            ))}
          </div>
          {review && (
            // On phones the review sits below the picker; this keeps the score in view.
            <button
              className="outfit-check-peek"
              aria-label={t(
                `Oyu-гийн үнэлгээ ${review.score.toFixed(1)}/10. Дэлгэрэнгүйг харах`,
                `Oyu’s rating ${review.score.toFixed(1)}/10. See details`,
              )}
              onClick={() =>
                reviewSection.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }
            >
              <span className="outfit-check-peek-pieces" aria-hidden="true">
                {pieces.slice(0, 4).map((g) => (
                  <span key={g.id} className="wear-thumb">
                    <img src={g.image} alt="" />
                  </span>
                ))}
              </span>
              <span aria-hidden="true">{t('Oyu-гийн үнэлгээ', 'Oyu’s rating')}</span>
              <span aria-hidden="true">
                <OyuScore score={review.score} animate />
              </span>
            </button>
          )}
        </section>
        <section
          ref={reviewSection}
          className="outfit-check-review"
          aria-label={t('Oyu-гийн үнэлгээ', 'Oyu’s rating')}
        >
          {pieces.length > 0 ? (
            <ul className="outfit-check-look" aria-label={t('Таны хослол', 'Your look')}>
              {pieces.map((g) => (
                <li key={g.id}>
                  <span className="wear-thumb">
                    <img src={g.image} alt="" />
                  </span>
                  <button
                    aria-label={t(`Хасах: ${g.name}`, `Remove ${g.name}`)}
                    onClick={() => choose(g)}
                  >
                    <X size={12} weight="bold" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {review ? (
            <OyuNote mood={review.mood} score={review.score} lines={review.lines} animate>
              <OyuBars rating={review.rating} labels={lookLabels} />
              {addition && (
                <button className="outfit-check-add" onClick={() => choose(addition)}>
                  <span className="oyu-thumb">
                    <img src={addition.image} alt="" />
                  </span>
                  <span>
                    <small>{t('Oyu-гийн санал', 'Oyu suggests')}</small>
                    {addition.name}
                  </span>
                  <Plus size={16} />
                </button>
              )}
            </OyuNote>
          ) : (
            <OyuNote
              mood="hello"
              lines={[
                t(
                  'Хувцсаа сонгоход би шууд үнэлнэ. Цамц, өмд, гутлаас эхлээрэй.',
                  'Pick your pieces and I’ll rate them as you go. Start with a top, bottoms, and shoes.',
                ),
              ]}
            />
          )}
          <div className="outfit-check-actions">
            <button
              className="button"
              disabled={!pieces.length}
              onClick={() => {
                logWear(
                  today,
                  pieces.map((g) => g.id),
                );
                onClose();
              }}
            >
              <Check size={18} /> {t('Өнөөдөр өмссөнөөр тэмдэглэх', 'Log as today’s outfit')}
            </button>
            {tryOn && (
              <button
                className="button secondary"
                onClick={() => {
                  onClose();
                  openWith({ page: 'live', garmentIds: [tryOn.id] });
                }}
              >
                <VideoCamera size={18} /> {t('Шууд өмсөж үзэх', 'Live try-on')}
              </button>
            )}
          </div>
          <p className="outfit-check-photo">
            {t('Зургаар AI үнэлгээ авах бол', 'For an AI rating from a photo,')}{' '}
            <button
              className="text-link"
              onClick={() => {
                onClose();
                openAccount();
              }}
            >
              {t('бүртгэлээ холбоорой', 'connect your account')}
            </button>{' '}
            {t('эсвэл', 'or')}{' '}
            <button
              className="text-link"
              onClick={() => {
                onClose();
                navigate('history');
                notify(
                  t(
                    'Эдгээр нь жишээ үнэлгээ бөгөөд таны зургийг AI-аар үнэлсэн үр дүн биш.',
                    'These are sample ratings, not an AI rating of your photo.',
                  ),
                );
              }}
            >
              {t('жишээ үзээрэй', 'see an example')}
            </button>
            .
          </p>
        </section>
      </div>
    </Dialog>
  );
}
