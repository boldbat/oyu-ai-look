import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  ArrowRight,
  ArrowsDownUp,
  CaretDown,
  Check,
  Heart,
  ImageSquare,
  MagnifyingGlass,
  Plus,
  Swatches,
  Trash,
  UploadSimple,
  VideoCamera,
  WashingMachine,
} from '@phosphor-icons/react';
import { useApp } from '../lib/store';
import {
  audienceLabels,
  categoryLabels,
  fitsAudience,
  kindSuggestions,
  styleTags,
  tryOnCategories,
} from '../lib/types';
import type { Category, Garment, StyleTag } from '../lib/types';
import { AudienceToggle } from '../components/AudienceToggle';
import type { AudienceFilter } from '../components/AudienceToggle';
import { colorPalette as colors } from '../lib/style';
import { colorLabel, formatDate, kindKey, kindLabel } from '../lib/i18n';
import { idleGarments } from '../lib/workspace';
import { Dialog } from '../components/Dialog';
import { OyuBars, OyuNote, OyuThumbs } from '../components/Oyu';
import { reviewGarment } from '../lib/oyu';
import { StepEyebrow } from '../components/Journey';
import { t } from '../lib/lang';
import './features.css';

const categories = Object.keys(categoryLabels) as Category[];
const darkColors = [
  'Black',
  'Navy',
  'Brown',
  'Denim',
  'Red',
  'Camel',
  'Green',
  'Pattern',
  'Yellow',
];

export function Wardrobe() {
  const {
    data,
    search,
    setSearch,
    updateGarment,
    deleteGarment,
    restoreGarment,
    navigate,
    notify,
    intent,
    openWith,
  } = useApp();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [filter, setFilter] = useState('all');
  const [audience, setAudience] = useState<AudienceFilter>('all');
  const [style, setStyle] = useState<StyleTag | 'all'>('all');
  const [sort, setSort] = useState('newest');
  const [adding, setAdding] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (intent?.page !== 'wardrobe') return;
    setCategory(intent.category ?? 'all');
    setFilter(intent.filter ?? 'all');
    setAudience(intent.audience === 'women' || intent.audience === 'men' ? intent.audience : 'all');
    setStyle(intent.style ?? 'all');
  }, [intent]);
  const idle = new Set(idleGarments(data).map((g) => g.id));
  const laundry = data.garments.filter((g) => g.availability === 'laundry').length;
  const detail = [...data.garments, ...data.archivedGarments].find((g) => g.id === detailId);
  const detailWear = detail
    ? data.wearLogs.filter((w) => w.garmentIds.includes(detail.id)).map((w) => w.date)
    : [];
  const lastWorn = detailWear.sort().at(-1);
  const scoped = data.garments.filter(
    (g) => fitsAudience(g, audience) && (style === 'all' || (g.style ?? 'Everyday') === style),
  );
  const pieces = (filter === 'archived' ? data.archivedGarments : data.garments)
    .filter(
      (g) =>
        (category === 'all' || g.category === category) &&
        fitsAudience(g, audience) &&
        (style === 'all' || (g.style ?? 'Everyday') === style) &&
        (filter === 'all' ||
          filter === 'archived' ||
          (filter === 'favorites'
            ? g.favorite
            : filter === 'idle'
              ? idle.has(g.id)
              : g.availability === filter)) &&
        `${g.name} ${g.kind ?? ''} ${kindLabel(g.kind ?? '')} ${g.color} ${colorLabel(g.color)} ${categoryLabels[g.category]}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    )
    .sort((a, b) =>
      sort === 'name'
        ? a.name.localeCompare(b.name)
        : sort === 'oldest'
          ? a.addedAt.localeCompare(b.addedAt)
          : b.addedAt.localeCompare(a.addedAt),
    );
  const openDetail = (id: string) => {
    setDetailId(id);
    setConfirmDelete(false);
  };
  const archived = detail ? data.archivedGarments.some((g) => g.id === detail.id) : false;
  return (
    <div className="wardrobe-page feature-page">
      <div className="page-heading">
        <div>
          <StepEyebrow page="wardrobe" />
          <h1 className="page-title">
            {t('Таны бүх хувцас нэг дор', 'All your clothes in one place')}
          </h1>
          <p className="muted page-explainer">
            {t(
              'Хувцас бүрийнхээ зургийг нэмж, төрөл, өнгө, төлөвөөр нь үзээрэй. Угаалгад байгаа гэж тэмдэглэсэн хувцас дахин бэлэн болтол хослолын санаанд орохгүй.',
              'Add a photo of each piece, then browse by type, color and status. Pieces marked as in the laundry stay out of look ideas until they’re ready again.',
            )}
          </p>
        </div>
        <button className="button" onClick={() => setAdding(true)}>
          <Plus size={18} /> {t('Хувцас нэмэх', 'Add a piece')}
        </button>
      </div>
      <div className="wardrobe-summary">
        <div className="wardrobe-tally">
          <span>
            <strong>{data.garments.length}</strong>{' '}
            {t('хувцас', data.garments.length === 1 ? 'piece' : 'pieces')}
          </span>
          <span>
            <strong>{data.garments.length - laundry}</strong> {t('өмсөхөд бэлэн', 'ready to wear')}
          </span>
          <button
            className={`summary-filter ${filter === 'laundry' ? 'active' : ''}`}
            onClick={() => setFilter(filter === 'laundry' ? 'all' : 'laundry')}
            aria-pressed={filter === 'laundry'}
          >
            <strong>{laundry}</strong> {t('угаалгад', 'in the laundry')}
          </button>
          <button
            className={`summary-filter ${filter === 'idle' ? 'active' : ''}`}
            onClick={() => setFilter(filter === 'idle' ? 'all' : 'idle')}
            aria-pressed={filter === 'idle'}
          >
            <strong>{idle.size}</strong> {t('нь 30 хоног өмсөөгүй', 'not worn in 30 days')}
          </button>
        </div>
        <button className="text-link" onClick={() => navigate('studio')}>
          {t('Хослолын студид хослуулж үзэх', 'Style them in Look studio')} <ArrowRight size={16} />
        </button>
      </div>
      <section aria-label={t('Шүүгээний хувцас', 'Wardrobe pieces')}>
        <div className="wardrobe-filters">
          <div className="filter-row">
            <div className="category-chips chip-rail">
              <button
                className={`chip ${category === 'all' ? 'active' : ''}`}
                aria-pressed={category === 'all'}
                onClick={() => setCategory('all')}
              >
                {t('Бүх хувцас', 'All pieces')} <span>{scoped.length}</span>
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  className={`chip ${category === c ? 'active' : ''}`}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {categoryLabels[c]} <span>{scoped.filter((g) => g.category === c).length}</span>
                </button>
              ))}
            </div>
            <label className="feature-search">
              <MagnifyingGlass size={18} />
              <input
                aria-label={t('Шүүгээнээс хайх', 'Search wardrobe')}
                placeholder={t('Шүүгээнээсээ хайх…', 'Search your wardrobe…')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          <div className="filter-row">
            <div className="filter-group">
              <AudienceToggle value={audience} onChange={setAudience} />
              <div
                className="style-chips chip-rail"
                role="group"
                aria-label={t('Стилээр шүүх', 'Filter by style')}
              >
                {(['all', ...styleTags] as const).map((value) => (
                  <button
                    key={value}
                    className={`chip ${style === value ? 'active' : ''}`}
                    aria-pressed={style === value}
                    onClick={() => setStyle(value)}
                  >
                    {value === 'all' ? t('Бүх стиль', 'All styles') : value}
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-selects">
              <label className="feature-select">
                <select
                  aria-label={t('Шүүгээг төлөвөөр шүүх', 'Filter wardrobe by status')}
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="all">{t('Бүх төлөв', 'All statuses')}</option>
                  <option value="available">{t('Өмсөхөд бэлэн', 'Ready to wear')}</option>
                  <option value="laundry">{t('Угаалгад байгаа', 'In the laundry')}</option>
                  <option value="favorites">{t('Дуртай', 'Favorites')}</option>
                  <option value="idle">{t('30 хоног өмсөөгүй', 'Not worn in 30 days')}</option>
                  <option value="archived">{t('Архивласан хувцас', 'Archived pieces')}</option>
                </select>
                <CaretDown size={14} weight="regular" />
              </label>
              <label className="feature-select">
                <ArrowsDownUp size={15} weight="regular" />
                <select
                  aria-label={t('Шүүгээг эрэмбэлэх', 'Sort wardrobe')}
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="newest">{t('Шинэ нь эхэндээ', 'Newest first')}</option>
                  <option value="oldest">{t('Хуучин нь эхэндээ', 'Oldest first')}</option>
                  <option value="name">{t('Нэрээр А–Я', 'Name A–Z')}</option>
                </select>
                <CaretDown size={14} weight="regular" />
              </label>
            </div>
          </div>
        </div>
        <div className="garment-grid">
          {pieces.map((g) => (
            <article
              key={g.id}
              className={`garment-card ${g.availability === 'laundry' ? 'is-away' : ''}`}
            >
              <div className="garment-image-wrap">
                <button
                  className="garment-image-button"
                  aria-label={t(`Дэлгэрэнгүй харах: ${g.name}`, `View ${g.name}`)}
                  onClick={() => openDetail(g.id)}
                >
                  <img loading="lazy" decoding="async" src={g.image} alt={g.name} />
                </button>
                <button
                  className={`garment-favorite ${g.favorite ? 'is-favorite' : ''}`}
                  aria-label={
                    g.favorite
                      ? t(`Дуртайгаас хасах: ${g.name}`, `Remove ${g.name} from favorites`)
                      : t(`Дуртайд нэмэх: ${g.name}`, `Add ${g.name} to favorites`)
                  }
                  aria-pressed={g.favorite}
                  onClick={() => updateGarment(g.id, { favorite: !g.favorite })}
                >
                  <Heart size={18} weight={g.favorite ? 'fill' : 'light'} />
                </button>
                {g.availability === 'laundry' ? (
                  <span className="garment-flag">{t('Угаалгад', 'In the laundry')}</span>
                ) : (
                  idle.has(g.id) && (
                    <span className="garment-flag">{t('Удаан өмсөөгүй', 'Not worn lately')}</span>
                  )
                )}
              </div>
              <button className="garment-info" onClick={() => openDetail(g.id)}>
                <h3>{g.name}</h3>
                <span className="garment-meta">
                  <span>
                    {g.kind ? kindLabel(g.kind) : categoryLabels[g.category]}
                    {g.audience && g.audience !== 'unisex'
                      ? ` · ${audienceLabels[g.audience]}`
                      : ''}
                  </span>
                  <span className="garment-color">
                    <i style={{ background: g.colorHex }} />
                    {colorLabel(g.color)}
                  </span>
                </span>
              </button>
            </article>
          ))}
          <button className="add-garment-card" onClick={() => setAdding(true)}>
            <span className="add-garment-visual">
              <span className="add-garment-icon">
                <Plus size={20} />
              </span>
            </span>
            <strong>{t('Шинэ хувцас', 'New piece')}</strong>
            <span>
              {t('Зургаа оруулж шүүгээндээ нэмээрэй', 'Upload a photo to add it to your wardrobe')}
            </span>
          </button>
        </div>
        {pieces.length === 0 && (
          <div className="empty-state">
            <MagnifyingGlass size={28} />
            <h3>{t('Хувцас олдсонгүй', 'No pieces found')}</h3>
            <p>
              {t(
                'Өөр үгээр хайх эсвэл шүүлтүүрээ цэвэрлээд дахин үзээрэй.',
                'Try another search or clear your filters.',
              )}
            </p>
            <button
              className="button secondary small"
              onClick={() => {
                setSearch('');
                setCategory('all');
                setFilter('all');
                setAudience('all');
                setStyle('all');
              }}
            >
              {t('Шүүлтүүр арилгах', 'Clear filters')}
            </button>
          </div>
        )}
      </section>
      <p className="feature-footnote">
        {t(
          'Таны орчин жишээ хувцастай эхэлнэ. Таны нэмсэн зураг зөвхөн энэ хөтөчид хадгалагдана.',
          'Your workspace starts with sample pieces. Photos you add are stored only in this browser.',
        )}
      </p>
      {adding && <AddGarment onClose={() => setAdding(false)} />}
      {detail && (
        <Dialog title={t('Дэлгэрэнгүй', 'Details')} onClose={() => setDetailId(null)} wide>
          <div className="garment-detail">
            <div className="detail-image">
              <img loading="lazy" decoding="async" src={detail.image} alt={detail.name} />
            </div>
            <div className="detail-content">
              <p className="overline">
                {categoryLabels[detail.category]}
                {detail.kind ? ` · ${kindLabel(detail.kind)}` : ''}
              </p>
              <h2>{detail.name}</h2>
              <span className="garment-color">
                <i style={{ background: detail.colorHex }} />
                {colorLabel(detail.color)}
              </span>
              <div className="detail-stats">
                <div>
                  <strong>{detailWear.length}</strong>
                  <span>
                    {t('удаа өмссөн', detailWear.length === 1 ? 'time worn' : 'times worn')}
                  </span>
                </div>
                <div>
                  <strong>{lastWorn ? formatDate(lastWorn) : t('Одоогоор үгүй', 'Not yet')}</strong>
                  <span>{t('сүүлд өмссөн', 'last worn')}</span>
                </div>
                <div>
                  <strong>
                    {detail.availability === 'available'
                      ? t('Бэлэн', 'Ready')
                      : t('Угаалгад', 'In the laundry')}
                  </strong>
                  <span>{t('төлөв', 'status')}</span>
                </div>
              </div>
              {(() => {
                const review = reviewGarment(detail, data);
                return (
                  <OyuNote
                    className="detail-oyu"
                    mood={review.mood}
                    score={review.rating.overall}
                    lines={review.lines}
                  >
                    <OyuBars rating={review.rating} />
                    {review.pairs.length > 0 && (
                      <>
                        <p className="oyu-sub">{t('Үүнтэй хослуулаарай', 'Pair it with')}</p>
                        <OyuThumbs pieces={review.pairs} />
                      </>
                    )}
                  </OyuNote>
                );
              })()}
              {!archived && (
                <div className="detail-actions">
                  {tryOnCategories.includes(detail.category) && (
                    <button
                      className="button"
                      onClick={() => {
                        setDetailId(null);
                        openWith({ page: 'live', garmentIds: [detail.id] });
                      }}
                    >
                      <VideoCamera size={18} /> {t('Шууд өмсөж үзэх', 'Live try-on')}
                    </button>
                  )}
                  <button
                    className="button secondary"
                    disabled={detail.availability !== 'available'}
                    onClick={() => {
                      setDetailId(null);
                      openWith({ page: 'studio', garmentIds: [detail.id] });
                    }}
                  >
                    <Swatches size={18} /> {t('Хослолын студид хослуулах', 'Style in Look studio')}
                  </button>
                </div>
              )}
              <p className="detail-note">
                {t(
                  'Угаалгад байгаа хувцсыг бэлэн гэж тэмдэглэх хүртэл шинэ хослолын саналд оруулахгүй.',
                  'Pieces in the laundry are left out of new look suggestions until you mark them ready.',
                )}
              </p>
              {archived ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    restoreGarment(detail.id);
                    setDetailId(null);
                  }}
                >
                  {t('Шүүгээнд сэргээх', 'Restore to wardrobe')}
                </button>
              ) : (
                <>
                  <div className="detail-secondary">
                    <button
                      className="button secondary small"
                      onClick={() => {
                        updateGarment(detail.id, {
                          availability:
                            detail.availability === 'available' ? 'laundry' : 'available',
                        });
                        notify(
                          detail.availability === 'available'
                            ? t('Угаалгад хийлээ.', 'Moved to the laundry.')
                            : t('Цэвэрхэн, өмсөхөд бэлэн.', 'Fresh and ready to wear.'),
                        );
                      }}
                    >
                      <WashingMachine size={16} />
                      {detail.availability === 'available'
                        ? t('Угаалгад хийх', 'Move to laundry')
                        : t('Өмсөхөд бэлэн гэж тэмдэглэх', 'Mark ready to wear')}
                    </button>
                    <button
                      className={`button secondary small ${detail.favorite ? 'is-favorite' : ''}`}
                      onClick={() => updateGarment(detail.id, { favorite: !detail.favorite })}
                    >
                      <Heart size={16} weight={detail.favorite ? 'fill' : 'light'} />
                      {detail.favorite
                        ? t('Дуртайгаас хасах', 'Remove from favorites')
                        : t('Дуртайд нэмэх', 'Add to favorites')}
                    </button>
                  </div>
                  {confirmDelete ? (
                    <div className="delete-confirm">
                      <p>
                        {t(
                          'Энэ хувцсыг архивлах уу? Идэвхтэй шүүгээнээс хасагдах ч өмнөх өмссөн бүртгэл хэвээр үлдэнэ.',
                          'Archive this piece? It will leave your active wardrobe, but its past wear log stays intact.',
                        )}
                      </p>
                      <div>
                        <button
                          className="button small danger"
                          onClick={() => {
                            deleteGarment(detail.id);
                            setDetailId(null);
                          }}
                        >
                          {t('Архивлах', 'Archive')}
                        </button>
                        <button
                          className="button ghost small"
                          onClick={() => setConfirmDelete(false)}
                        >
                          {t('Үлдээх', 'Keep it')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      className="text-link delete-link"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash size={16} /> {t('Архивлах', 'Archive')}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function AddGarment({ onClose }: { onClose: () => void }) {
  const { addGarment } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [image, setImage] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState<Category | ''>('');
  const [kind, setKind] = useState('');
  const [fit, setFit] = useState<keyof typeof audienceLabels>('unisex');
  const [tag, setTag] = useState<StyleTag>('Everyday');
  const [color, setColor] = useState(colors[0]);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError(t('JPG, PNG эсвэл WebP зураг сонгоно уу.', 'Choose a JPG, PNG or WebP image.'));
      event.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError(
        t('2 МБ-аас бага хэмжээтэй зураг сонгоно уу.', 'Choose an image smaller than 2 MB.'),
      );
      event.target.value = '';
      return;
    }
    setReading(true);
    const reader = new FileReader();
    reader.onload = () => {
      setImage(String(reader.result));
      setReading(false);
    };
    reader.onerror = () => {
      setError(
        t(
          'Энэ зургийг нээж чадсангүй. Өөр зураг оролдоно уу.',
          'This image couldn’t be opened. Please try another.',
        ),
      );
      setReading(false);
    };
    reader.readAsDataURL(file);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!image || !category || !name.trim()) {
      setError(
        t(
          'Хувцсаа нэмэхийн тулд зураг, нэр, ангилал оруулна уу.',
          'Add a photo, a name and a category to add your piece.',
        ),
      );
      return;
    }
    const garment: Omit<Garment, 'id' | 'addedAt'> = {
      name: name.trim(),
      category,
      ...(kind.trim() ? { kind: kindKey(kind).slice(0, 60) } : {}),
      audience: fit,
      style: tag,
      color: color.name,
      colorHex: color.hex,
      image,
      favorite: false,
      availability: 'available',
    };
    addGarment(garment);
    onClose();
  }
  return (
    <Dialog title={t('Шинэ хувцас нэмэх', 'Add a new piece')} onClose={onClose} wide>
      <form onSubmit={submit} className="add-garment-form">
        <div className="upload-column">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={chooseFile}
            className="visually-hidden"
            aria-label={t('Хувцасны зураг оруулах', 'Upload a photo of your piece')}
          />
          <button
            type="button"
            className={`garment-upload ${image ? 'has-photo' : ''}`}
            onClick={() => input.current?.click()}
          >
            {image ? (
              <>
                <img
                  loading="lazy"
                  decoding="async"
                  src={image}
                  alt={t('Хувцасны зураг', 'Photo of your piece')}
                />
                <span>
                  <ImageSquare size={16} /> {t('Зураг солих', 'Change photo')}
                </span>
              </>
            ) : (
              <>
                <span className="upload-icon">
                  <UploadSimple size={20} />
                </span>
                <strong>
                  {reading
                    ? t('Зургийг нээж байна…', 'Opening your photo…')
                    : t('Хувцсандаа зураг оруулаарай', 'Give your piece a picture')}
                </strong>
                <span>
                  {t(
                    'Энгийн дэвсгэр дээрх тод зураг сонгоорой',
                    'Choose a clear photo on a simple background',
                  )}
                </span>
                <small>
                  {t('JPG, PNG эсвэл WebP · 2 МБ хүртэл', 'JPG, PNG or WebP · up to 2 MB')}
                </small>
              </>
            )}
          </button>
          <p className="feature-footnote">
            {t(
              'Зөвхөн энэ хөтөчид хадгалагдана. Мэдээллээ өөрөө оруулна; AI боловсруулалт ашиглахгүй.',
              'Stored only in this browser. You add the details yourself; no AI processing is used.',
            )}
          </p>
        </div>
        <div className="upload-details">
          <label className="field-label">
            {t('Хувцасны нэр', 'Piece name')}
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('Жишээ нь: Дуртай маалинган цамц', 'e.g. My favorite linen shirt')}
              maxLength={80}
              required
              autoFocus
            />
          </label>
          <label className="field-label">
            {t('Ангилал', 'Category')}
            <select
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              required
            >
              <option value="">{t('Ангилал сонгох', 'Choose a category')}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabels[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="field-label">
            {t('Төрөл', 'Type')} <span>{t('Заавал биш', 'Optional')}</span>
            <input
              className="field"
              list="garment-kinds"
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              placeholder={`${t('Жишээ нь:', 'e.g.')} ${kindLabel(category ? kindSuggestions[category][0] : 'Denim jacket')}`}
              maxLength={60}
            />
            <datalist id="garment-kinds">
              {(category ? kindSuggestions[category] : Object.values(kindSuggestions).flat()).map(
                (k) => (
                  <option key={k} value={kindLabel(k)} />
                ),
              )}
            </datalist>
          </label>
          <div className="field-pair">
            <label className="field-label">
              {t('Хэнд', 'For')}
              <select
                className="field"
                value={fit}
                onChange={(e) => setFit(e.target.value as keyof typeof audienceLabels)}
              >
                {(Object.keys(audienceLabels) as (keyof typeof audienceLabels)[]).map((a) => (
                  <option key={a} value={a}>
                    {audienceLabels[a]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              {t('Стиль', 'Style')}
              <select
                className="field"
                value={tag}
                onChange={(e) => setTag(e.target.value as StyleTag)}
              >
                {styleTags.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <fieldset className="color-fieldset">
            <legend className="field-label">
              {t('Үндсэн өнгө', 'Main color')} <span>{colorLabel(color.name)}</span>
            </legend>
            <div className="color-options">
              {colors.map((c) => (
                <button
                  type="button"
                  key={c.name}
                  className={`color-option ${c.name === color.name ? 'selected' : ''} ${darkColors.includes(c.name) ? 'on-dark' : ''}`}
                  title={colorLabel(c.name)}
                  aria-label={colorLabel(c.name)}
                  aria-pressed={c.name === color.name}
                  style={{ background: c.hex }}
                  onClick={() => setColor(c)}
                >
                  {c.name === color.name && <Check size={16} weight="regular" />}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="upload-confirmation">
            {t(
              'Мэдээллээ шалгаад шүүгээндээ нэмээрэй.',
              'Review your details, then add it to your wardrobe.',
            )}
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button" type="submit" disabled={reading}>
            <Plus size={18} /> {t('Баталгаажуулж нэмэх', 'Confirm and add')}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
