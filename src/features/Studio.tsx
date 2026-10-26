import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BookmarkSimple,
  Check,
  CheckCircle,
  Info,
  Plus,
  Shuffle,
  Stack,
  TShirt,
  Trash,
  VideoCamera,
  X,
} from '@phosphor-icons/react';
import { useApp } from '../lib/store';
import { categoryLabels, fitsAudience, tryOnCategories } from '../lib/types';
import { AudienceToggle } from '../components/AudienceToggle';
import type { AudienceFilter } from '../components/AudienceToggle';
import type { Category } from '../lib/types';
import { finishingTouches, isCompleteLook, recommend } from '../lib/demo';
import { reviewLook } from '../lib/oyu';
import { OyuNote } from '../components/Oyu';
import { colorLabel, formatDate, kindLabel } from '../lib/i18n';
import { Dialog } from '../components/Dialog';
import { StepEyebrow } from '../components/Journey';
import { t } from '../lib/lang';
import './features.css';

const boardOrder: Category[] = ['outerwear', 'top', 'dress', 'bottom', 'footwear', 'accessory'];
/** A piece count in the interface language, e.g. "5 pieces". */
const pieceCount = (n: number) => t(`${n} хувцас`, `${n} ${n === 1 ? 'piece' : 'pieces'}`);

export function Studio() {
  const { data, saveLook, deleteLook, navigate, notify, intent, openWith } = useApp();
  const [tab, setTab] = useState<'compose' | 'saved'>('compose');
  const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState<Category>('top');
  const [name, setName] = useState('');
  const [saveDialog, setSaveDialog] = useState(false);
  const [suggestion, setSuggestion] = useState(0);
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | undefined>();
  // Lay pieces out the way they're worn: layer, top, bottoms, shoes, then accessories.
  const pieces = data.garments
    .filter((g) => selected.includes(g.id))
    .sort((a, b) => boardOrder.indexOf(a.category) - boardOrder.indexOf(b.category));
  const complete =
    isCompleteLook(selected, data.garments) && pieces.every((g) => g.availability === 'available');
  const selectedCategories = new Set(pieces.map((g) => g.category));
  const shelf = data.garments.filter((g) => fitsAudience(g, audience));
  const categoryItems = shelf.filter((g) => g.category === category);
  const tryOnPiece = pieces.find((g) => tryOnCategories.includes(g.category));
  const review = reviewLook(pieces, data.preferences);
  const hasBase =
    selectedCategories.has('dress') ||
    (selectedCategories.has('top') && selectedCategories.has('bottom'));
  const hasShoes = selectedCategories.has('footwear');
  useEffect(() => {
    if (intent?.page !== 'studio' || !intent.garmentIds) return;
    const ids = intent.garmentIds.filter(
      (id) => data.garments.find((g) => g.id === id)?.availability === 'available',
    );
    setSelected(ids);
    setName('');
    setEditId(undefined);
    setTab('compose');
    const first = data.garments.find((g) => g.id === ids[0]);
    if (first) setCategory(first.category);
    // Only a new hand-off should reset the board, not later wardrobe edits.
  }, [intent]);
  function suggest() {
    const look = recommend(data.garments, suggestion, audience);
    const ids = [...look, ...finishingTouches(look, data.garments, suggestion, audience)].map(
      (g) => g.id,
    );
    setSuggestion((value) => value + 1);
    if (!isCompleteLook(ids, data.garments)) {
      notify(
        t(
          'Санал авахын тулд цамц, өмд банзал, гутал (эсвэл даашинз, гутал) нэмнэ үү.',
          'Add a top, bottoms and shoes (or a dress and shoes) to get a suggestion.',
        ),
      );
      return;
    }
    setSelected(ids);
    setName('');
    setEditId(undefined);
    setTab('compose');
  }
  function choose(id: string) {
    const item = data.garments.find((g) => g.id === id);
    if (!item || item.availability !== 'available') return;
    setSelected((current) =>
      current.includes(id)
        ? current.filter((i) => i !== id)
        : [
            ...current.filter((i) => {
              const c = data.garments.find((g) => g.id === i)?.category;
              return (
                c !== item.category &&
                !(item.category === 'dress' && (c === 'top' || c === 'bottom')) &&
                !((item.category === 'top' || item.category === 'bottom') && c === 'dress')
              );
            }),
            id,
          ],
    );
  }
  function startNew() {
    setSelected([]);
    setName('');
    setEditId(undefined);
    setTab('compose');
  }
  return (
    <div className="studio-page feature-page">
      <div className="page-heading">
        <div>
          <StepEyebrow page="studio" />
          <h1 className="page-title">
            {t('Өөрийн хувцаснаас хослол бүтээх', 'Create looks from your own clothes')}
          </h1>
          <p className="muted page-explainer">
            {t(
              'Баруун талын самбараас хувцас сонгоно уу. Цамц ба өмд банзал (эсвэл даашинз) дээр гутал нэмбэл бүтэн хослол болно; гадуур хувцас, аксессуар заавал биш. Дараа өмсөхөөр хадгалах эсвэл шууд өмсөж үзээрэй.',
              'Choose pieces from the panel on the right. A top and bottoms (or a dress) plus shoes make a complete look; outerwear and accessories are optional. Save it for later or try it on live.',
            )}
          </p>
        </div>
        <button className="button" onClick={suggest}>
          <Shuffle size={18} /> {t('Хослол санал болгох', 'Suggest a look')}
        </button>
      </div>
      <div className="studio-navigation">
        <div className="segmented">
          <button
            className={tab === 'compose' ? 'active' : ''}
            aria-pressed={tab === 'compose'}
            onClick={() => setTab('compose')}
          >
            <Stack size={16} /> {t('Хослол үүсгэх', 'Create a look')}
          </button>
          <button
            className={tab === 'saved' ? 'active' : ''}
            aria-pressed={tab === 'saved'}
            onClick={() => setTab('saved')}
          >
            <BookmarkSimple size={16} /> {t('Хадгалсан хослол', 'Saved looks')}
            <span className="tab-count">{data.savedLooks.length}</span>
          </button>
        </div>
        <div className="studio-modes">
          <button
            className="button secondary small"
            onClick={() =>
              tryOnPiece
                ? openWith({ page: 'live', garmentIds: [tryOnPiece.id] })
                : navigate('live')
            }
          >
            <VideoCamera size={18} />
            {tryOnPiece
              ? t('Энэ хослолыг шууд өмсөж үзэх', 'Try this look on live')
              : t('Шууд өмсөж үзэх өрөө', 'Open Live try-on')}
          </button>
        </div>
      </div>
      {tab === 'compose' ? (
        <div className="composer-layout">
          <section className="composer-board" aria-label={t('Хослолын самбар', 'Look board')}>
            <div className="composer-board-heading">
              <div>
                <p className="overline">{t('Бүтэн дүр төрх', 'The full look')}</p>
                <h2>{editId ? name : t('Таны дараагийн хослол', 'Your next look')}</h2>
              </div>
              <button className="text-link" onClick={startNew} disabled={selected.length === 0}>
                {t('Шинээр эхлэх', 'Start fresh')}
              </button>
            </div>
            <div className={`flatlay-board ${pieces.length === 0 ? 'is-empty' : ''}`}>
              {pieces.length ? (
                pieces.map((g) => (
                  <div key={g.id} className={`flatlay-piece flatlay-${g.category}`}>
                    <img loading="lazy" decoding="async" src={g.image} alt={g.name} />
                    <button
                      className="icon-button"
                      aria-label={t(`Хослолоос хасах: ${g.name}`, `Remove ${g.name} from the look`)}
                      onClick={() => setSelected((current) => current.filter((id) => id !== g.id))}
                    >
                      <X size={14} weight="regular" />
                    </button>
                    <span>
                      {g.name}
                      {g.availability === 'laundry' ? t(' · Угаалгад', ' · In the laundry') : ''}
                    </span>
                  </div>
                ))
              ) : (
                <div className="composer-empty">
                  <h3>{t('Хослол нэг хувцаснаас эхэлнэ', 'Every look starts with one piece')}</h3>
                  <p>
                    {t(
                      'Шүүгээнээсээ дуртай хувцсаа сонгоход энд байрлана. Дараа нь бусдыг нь нэмж хослуулаарай.',
                      'Choose a favorite from your wardrobe and it will appear here. Then add the rest to complete the look.',
                    )}
                  </p>
                </div>
              )}
            </div>
            <div className="composer-checklist">
              <span className={hasBase ? 'is-complete' : ''}>
                <CheckCircle size={16} weight={hasBase ? 'fill' : 'light'} />{' '}
                {t('Цамц + өмд банзал, эсвэл даашинз', 'Top + bottoms, or a dress')}
              </span>
              <span className={hasShoes ? 'is-complete' : ''}>
                <CheckCircle size={16} weight={hasShoes ? 'fill' : 'light'} /> {t('Гутал', 'Shoes')}
              </span>
              <span>
                {t('Гадуур хувцас, аксессуар заавал биш', 'Outerwear and accessories are optional')}
              </span>
            </div>
            {review && (
              <OyuNote
                className="composer-oyu"
                animate
                mood={review.mood}
                score={review.score}
                lines={review.lines}
              />
            )}
            <div className="composer-board-footer">
              <p>
                {complete
                  ? t(
                      `${pieces.length} хувцас · хадгалахад бэлэн`,
                      `${pieceCount(pieces.length)} · ready to save`,
                    )
                  : pieces.some((g) => g.availability === 'laundry')
                    ? t(
                        'Хадгалахаас өмнө угаалгад байгаа хувцсыг солино уу.',
                        'Replace pieces in the laundry before saving.',
                      )
                    : t(
                        'Бүтэн хослол хадгалахын тулд үндсэн хувцсаа нэмнэ үү.',
                        'Add the essentials to save a complete look.',
                      )}
              </p>
              <button className="button" disabled={!complete} onClick={() => setSaveDialog(true)}>
                <BookmarkSimple size={18} /> {t('Хослол хадгалах', 'Save look')}
              </button>
            </div>
          </section>
          <aside className="card composer-wardrobe">
            <div className="composer-picker-title">
              <h2>{t('Таны шүүгээнээс', 'From your wardrobe')}</h2>
              <button
                className="icon-button"
                aria-label={t(
                  'Хувцас нэмэхээр шүүгээ рүү очих',
                  'Go to your wardrobe to add a piece',
                )}
                onClick={() => navigate('wardrobe')}
              >
                <Plus size={20} />
              </button>
            </div>
            <AudienceToggle value={audience} onChange={setAudience} />
            <div className="composer-category-tabs">
              {(Object.keys(categoryLabels) as Category[]).map((c) => (
                <button
                  className={`chip ${category === c ? 'active' : ''}`}
                  key={c}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {categoryLabels[c]}
                  <span className="tab-count">{shelf.filter((g) => g.category === c).length}</span>
                </button>
              ))}
            </div>
            <div className="composer-picker-grid">
              {categoryItems.map((g) => (
                <button
                  key={g.id}
                  className={`composer-picker-item ${selected.includes(g.id) ? 'selected' : ''}`}
                  onClick={() => choose(g.id)}
                  disabled={g.availability === 'laundry'}
                  aria-pressed={selected.includes(g.id)}
                >
                  <div>
                    <img loading="lazy" decoding="async" src={g.image} alt="" />
                    {selected.includes(g.id) && (
                      <span className="piece-selected">
                        <Check size={14} weight="regular" />
                      </span>
                    )}
                  </div>
                  <strong>{g.name}</strong>
                  <span>
                    {g.availability === 'laundry'
                      ? t('Угаалгад', 'In the laundry')
                      : g.kind
                        ? kindLabel(g.kind)
                        : colorLabel(g.color)}
                  </span>
                </button>
              ))}
            </div>
            {categoryItems.length === 0 && (
              <div className="composer-category-empty">
                <TShirt size={28} />
                <p>
                  {t(
                    `${categoryLabels[category]} одоогоор алга.`,
                    `No ${categoryLabels[category].toLowerCase()} yet.`,
                  )}
                </p>
                <button className="text-link" onClick={() => navigate('wardrobe')}>
                  {t('Шүүгээндээ нэмэх', 'Add to your wardrobe')} <Plus size={16} />
                </button>
              </div>
            )}
            <div className="styling-note">
              <strong>{t('Хослуулах жижиг зөвлөгөө', 'A small styling tip')}</strong>
              <p>
                {t(
                  'Өөрт хамгийн таатай санагддаг хувцаснаасаа эхлээрэй. Бусад нь түүнийг дагаад бүрдэнэ.',
                  'Start with the piece you feel best in. Let the rest of your look follow its lead.',
                )}
              </p>
            </div>
          </aside>
        </div>
      ) : (
        <section className="saved-looks-section">
          <div className="section-heading">
            <div>
              <h2>{t('Хадгалсан хослолууд', 'Saved looks')}</h2>
              <p className="muted">
                {t(
                  'Дуртай хослолууд тань өөр өдөр өмсөхөд бэлэн.',
                  'Your favorite looks, ready for another day.',
                )}
              </p>
            </div>
            <button className="button secondary small" onClick={startNew}>
              <Plus size={16} /> {t('Шинэ хослол', 'New look')}
            </button>
          </div>
          <div className="saved-look-grid">
            {data.savedLooks.map((look) => {
              const items = data.garments.filter((g) => look.garmentIds.includes(g.id));
              const available =
                isCompleteLook(look.garmentIds, data.garments) &&
                items.every((g) => g.availability === 'available');
              return (
                <article className="saved-look-card" key={look.id}>
                  <div className="saved-look-images">
                    {items.map((g) => (
                      <img loading="lazy" decoding="async" key={g.id} src={g.image} alt={g.name} />
                    ))}
                  </div>
                  <div className="saved-look-content">
                    <h3>{look.name}</h3>
                    <p>
                      {t(
                        `${items.length} хувцас · Хадгалсан ${formatDate(look.createdAt)}`,
                        `${pieceCount(items.length)} · Saved ${formatDate(look.createdAt)}`,
                      )}
                    </p>
                    <span className={`look-availability ${available ? 'available' : ''}`}>
                      <span />
                      {available
                        ? t('Өмсөхөд бэлэн', 'Ready to wear')
                        : t('Анхаарал хэрэгтэй', 'Needs attention')}
                    </span>
                    <div className="saved-look-actions">
                      <button
                        className="text-link"
                        onClick={() => {
                          setSelected(look.garmentIds);
                          setName(look.name);
                          setEditId(look.id);
                          setTab('compose');
                        }}
                      >
                        {t('Студид нээх', 'Open in Look studio')} <ArrowUpRight size={16} />
                      </button>
                      <button
                        className="icon-button"
                        aria-label={t(`Устгах: ${look.name}`, `Delete ${look.name}`)}
                        onClick={() => setDeleteId(look.id)}
                      >
                        <Trash size={18} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {!data.savedLooks.length && (
            <div className="empty-state">
              <BookmarkSimple size={32} />
              <h3>{t('Хадгалсан хослол алга', 'No saved looks yet')}</h3>
              <p>
                {t(
                  'Шүүгээнийхээ хувцаснаас анхны хослолоо бүтээгээрэй.',
                  'Build your first look from pieces in your wardrobe.',
                )}
              </p>
              <button className="button" onClick={startNew}>
                {t('Хослол үүсгэх', 'Create a look')}
              </button>
            </div>
          )}
        </section>
      )}
      <div className="studio-disclaimer">
        <Info size={16} />
        <p>
          {t(
            'Хослол бүтээхэд өмссөн бүртгэл хөтлөгдөхгүй, өмсөж үзэх дүрс ч үүсгэхгүй. Өмссөнөө',
            'Creating a look doesn’t log wear or generate a try-on image. Log what you wore in',
          )}{' '}
          <button className="text-link" onClick={() => navigate('history')}>
            {t('Хувцаслалтын түүх', 'Style history')}
          </button>
          {t(' хэсэгт тэмдэглээрэй.', '.')}
        </p>
      </div>
      {saveDialog && (
        <Dialog
          title={t('Хослолдоо нэр өгөх', 'Give this look a name')}
          onClose={() => setSaveDialog(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim() || !complete) return;
              saveLook({ id: editId, name: name.trim(), garmentIds: selected });
              setSaveDialog(false);
              setTab('saved');
              setEditId(undefined);
            }}
          >
            <p className="muted">
              {t(
                'Дахин өмсөх хүсэл төрөхөд амархан олохоор нэр өгөөрэй.',
                'Pick a name that’s easy to find when the mood strikes again.',
              )}
            </p>
            <label className="field-label">
              {t('Хослолын нэр', 'Look name')}
              <input
                className="field"
                autoFocus
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t('Жишээ нь: Тайван ням гараг', 'e.g. Slow Sunday')}
                required
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setSaveDialog(false)}
              >
                {t('Үргэлжлүүлэх', 'Keep editing')}
              </button>
              <button className="button" type="submit" disabled={!name.trim()}>
                <BookmarkSimple size={18} />
                {editId
                  ? t('Өөрчлөлт хадгалах', 'Save changes')
                  : t('Хослол хадгалах', 'Save look')}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {deleteId && (
        <Dialog
          title={t('Энэ хослолыг устгах уу?', 'Delete this look?')}
          onClose={() => setDeleteId(null)}
        >
          <p className="muted">
            {t(
              'Шүүгээн дэх хувцас болон өмссөн бүртгэл тань хэвээр үлдэнэ.',
              'Your wardrobe pieces and wear log will stay right where they are.',
            )}
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setDeleteId(null)}>
              {t('Үлдээх', 'Keep look')}
            </button>
            <button
              className="button danger"
              onClick={() => {
                deleteLook(deleteId);
                setDeleteId(null);
                notify(
                  t(
                    'Хослолыг хадгалсан жагсаалтаас устгалаа.',
                    'Look removed from your saved looks.',
                  ),
                );
              }}
            >
              {t('Устгах', 'Delete')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
