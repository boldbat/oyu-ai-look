import { useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  ArrowDownUp,
  Check,
  CheckCircle2,
  Heart,
  ImagePlus,
  Plus,
  Search,
  Shirt,
  Trash2,
  Upload,
  WashingMachine,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { categoryLabels } from '../lib/types';
import type { Category, Garment } from '../lib/types';
import { Dialog } from '../components/Dialog';
import './features.css';

const categories = Object.keys(categoryLabels) as Category[];
const colors = [
  { name: 'Cream', hex: '#d7cbb5' },
  { name: 'White', hex: '#f4f2ed' },
  { name: 'Black', hex: '#30302e' },
  { name: 'Navy', hex: '#303648' },
  { name: 'Stone', hex: '#b3aa99' },
  { name: 'Brown', hex: '#815d48' },
  { name: 'Green', hex: '#79806d' },
  { name: 'Pink', hex: '#c58c9c' },
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
  } = useApp();
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState('newest');
  const [adding, setAdding] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const detail = [...data.garments, ...data.archivedGarments].find((g) => g.id === detailId);
  const pieces = (filter === 'archived' ? data.archivedGarments : data.garments)
    .filter(
      (g) =>
        (category === 'all' || g.category === category) &&
        (filter === 'all' ||
          filter === 'archived' ||
          (filter === 'favorites' ? g.favorite : g.availability === filter)) &&
        `${g.name} ${g.color} ${categoryLabels[g.category]}`
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
  return (
    <div className="wardrobe-page feature-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">YOUR CLOSET, REIMAGINED</p>
          <h1 className="page-title">A wardrobe full of possibilities.</h1>
          <p className="muted">The pieces you love. New ways to wear them.</p>
        </div>
        <button className="button" onClick={() => setAdding(true)}>
          <Plus size={18} /> Add a piece
        </button>
      </div>
      <div className="wardrobe-summary">
        <div>
          <Shirt size={18} />
          <strong>{data.garments.length}</strong> pieces in your wardrobe
        </div>
        <span className="summary-divider" />
        <div>
          <CheckCircle2 size={17} />
          <strong>{data.garments.filter((g) => g.availability === 'available').length}</strong>{' '}
          ready to wear
        </div>
        <button className="text-link" onClick={() => navigate('studio')}>
          Make a little magic in Studio <span aria-hidden="true">↗</span>
        </button>
      </div>
      <section aria-label="Wardrobe pieces">
        <div className="wardrobe-toolbar">
          <div className="category-chips">
            <button
              className={`chip ${category === 'all' ? 'active' : ''}`}
              aria-pressed={category === 'all'}
              onClick={() => setCategory('all')}
            >
              All pieces <span>{data.garments.length}</span>
            </button>
            {categories
              .filter((c) => data.garments.some((g) => g.category === c))
              .map((c) => (
                <button
                  key={c}
                  className={`chip ${category === c ? 'active' : ''}`}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {categoryLabels[c]}
                </button>
              ))}
          </div>
          <label className="feature-select">
            <ArrowDownUp size={15} />
            <select
              aria-label="Sort wardrobe"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
        <div className="wardrobe-filter-row">
          <label className="feature-search">
            <Search size={17} />
            <input
              aria-label="Search wardrobe"
              placeholder="Find something in your wardrobe…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="feature-select">
            <select
              aria-label="Filter wardrobe availability"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All availability</option>
              <option value="available">Ready to wear</option>
              <option value="laundry">In the laundry</option>
              <option value="favorites">Favorites</option>
              <option value="archived">Archived pieces</option>
            </select>
          </label>
        </div>
        <div className="garment-grid">
          {pieces.map((g) => (
            <article key={g.id} className="garment-card">
              <div className="garment-image-wrap">
                <button
                  className="garment-image-button"
                  aria-label={`View ${g.name}`}
                  onClick={() => {
                    setDetailId(g.id);
                    setConfirmDelete(false);
                  }}
                >
                  <img loading="lazy" decoding="async" src={g.image} alt={g.name} />
                </button>
                <button
                  className={`garment-favorite icon-button ${g.favorite ? 'is-favorite' : ''}`}
                  aria-label={`${g.favorite ? 'Remove' : 'Add'} ${g.name} ${g.favorite ? 'from' : 'to'} favorites`}
                  aria-pressed={g.favorite}
                  onClick={() => updateGarment(g.id, { favorite: !g.favorite })}
                >
                  <Heart size={17} fill={g.favorite ? 'currentColor' : 'none'} />
                </button>
                {g.availability === 'laundry' && (
                  <span className="garment-laundry">
                    <WashingMachine size={12} /> In the laundry
                  </span>
                )}
              </div>
              <button
                className="garment-info"
                onClick={() => {
                  setDetailId(g.id);
                  setConfirmDelete(false);
                }}
              >
                <span className="garment-category">{categoryLabels[g.category]}</span>
                <h3>{g.name}</h3>
                <span className="garment-color">
                  <i style={{ background: g.colorHex }} />
                  {g.color}
                </span>
              </button>
            </article>
          ))}
          <button className="add-garment-card" onClick={() => setAdding(true)}>
            <span className="add-garment-icon">
              <Plus size={25} />
            </span>
            <strong>A new piece. A new possibility.</strong>
            <span>Add something from your closet</span>
          </button>
        </div>
        {pieces.length === 0 && (
          <div className="empty-state">
            <Search size={28} />
            <h3>No pieces found</h3>
            <p>Try another search or give your filters a fresh start.</p>
            <button
              className="button secondary small"
              onClick={() => {
                setSearch('');
                setCategory('all');
                setFilter('all');
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>
      <p className="feature-footnote">
        Your workspace starts with sample pieces. Photos you add stay in this browser.
      </p>
      {adding && <AddGarment onClose={() => setAdding(false)} />}
      {detail && (
        <Dialog title="A closer look" onClose={() => setDetailId(null)} wide>
          <div className="garment-detail">
            <div className="detail-image">
              <img loading="lazy" decoding="async" src={detail.image} alt={detail.name} />
            </div>
            <div className="detail-content">
              <p className="eyebrow">{categoryLabels[detail.category]}</p>
              <h2>{detail.name}</h2>
              <span className="garment-color">
                <i style={{ background: detail.colorHex }} />
                {detail.color}
              </span>
              <div className="detail-stats">
                <div>
                  <strong>
                    {data.wearLogs.filter((w) => w.garmentIds.includes(detail.id)).length}
                  </strong>
                  <span>times recorded</span>
                </div>
                <div>
                  <strong>{detail.availability === 'available' ? 'Ready' : 'Laundry'}</strong>
                  <span>availability</span>
                </div>
              </div>
              <p className="muted">
                A little care goes a long way. Pieces in the laundry are left out of new outfit
                suggestions.
              </p>
              {data.archivedGarments.some((g) => g.id === detail.id) ? (
                <button
                  className="button secondary"
                  onClick={() => {
                    restoreGarment(detail.id);
                    setDetailId(null);
                  }}
                >
                  Restore to wardrobe
                </button>
              ) : (
                <>
                  <button
                    className="button secondary"
                    onClick={() => {
                      updateGarment(detail.id, {
                        availability: detail.availability === 'available' ? 'laundry' : 'available',
                      });
                      notify(
                        detail.availability === 'available'
                          ? 'Moved to the laundry.'
                          : 'Fresh and ready to wear.',
                      );
                    }}
                  >
                    <WashingMachine size={17} />
                    {detail.availability === 'available' ? 'Move to laundry' : 'Mark ready to wear'}
                  </button>
                  <button
                    className="button ghost"
                    onClick={() => updateGarment(detail.id, { favorite: !detail.favorite })}
                  >
                    <Heart size={17} fill={detail.favorite ? 'currentColor' : 'none'} />
                    {detail.favorite ? 'Remove from favorites' : 'Add to favorites'}
                  </button>
                  {confirmDelete ? (
                    <div className="delete-confirm">
                      <p>
                        Archive this piece? It will leave your active wardrobe, while past wear
                        records stay intact.
                      </p>
                      <button
                        className="button small danger-button"
                        onClick={() => {
                          deleteGarment(detail.id);
                          setDetailId(null);
                        }}
                      >
                        Archive piece
                      </button>
                      <button
                        className="button ghost small"
                        onClick={() => setConfirmDelete(false)}
                      >
                        Keep it
                      </button>
                    </div>
                  ) : (
                    <button
                      className="text-link delete-link"
                      onClick={() => setConfirmDelete(true)}
                    >
                      <Trash2 size={14} /> Archive piece
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
  const [color, setColor] = useState(colors[0]);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError('');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Choose a JPG, PNG, or WebP image.');
      event.target.value = '';
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Choose an image smaller than 2 MB for your local wardrobe.');
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
      setError('This image could not be opened. Please try another.');
      setReading(false);
    };
    reader.readAsDataURL(file);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!image || !category || !name.trim()) {
      setError('Add a photo, a name, and a category to finish your piece.');
      return;
    }
    const garment: Omit<Garment, 'id' | 'addedAt'> = {
      name: name.trim(),
      category,
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
    <Dialog title="Meet your next favorite piece" onClose={onClose} wide>
      <form onSubmit={submit} className="add-garment-form">
        <div className="upload-column">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
            onChange={chooseFile}
            className="visually-hidden"
            aria-label="Upload garment photo"
          />
          <button
            type="button"
            className={`garment-upload ${image ? 'has-photo' : ''}`}
            onClick={() => input.current?.click()}
          >
            {image ? (
              <>
                <img loading="lazy" decoding="async" src={image} alt="Your garment preview" />
                <span>
                  <ImagePlus size={16} /> Change photo
                </span>
              </>
            ) : (
              <>
                <span className="upload-icon">
                  <Upload size={26} />
                </span>
                <strong>{reading ? 'Opening your photo…' : 'Give your piece a picture'}</strong>
                <span>Choose a clear photo on a simple background</span>
                <small>JPG, PNG or WebP · up to 2 MB</small>
              </>
            )}
          </button>
          <p className="feature-footnote">
            Stored locally in this browser. Add the details yourself; no AI processing is used.
          </p>
        </div>
        <div className="upload-details">
          <label className="field-label">
            Piece name
            <input
              className="field"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. My favorite linen shirt"
              maxLength={80}
              required
              autoFocus
            />
          </label>
          <label className="field-label">
            Category
            <select
              className="field"
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              required
            >
              <option value="">Choose a category</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabels[c]}
                </option>
              ))}
            </select>
          </label>
          <fieldset className="color-fieldset">
            <legend className="field-label">
              Main color <span>{color.name}</span>
            </legend>
            <div className="color-options">
              {colors.map((c) => (
                <button
                  type="button"
                  key={c.name}
                  className={`color-option ${c.name === color.name ? 'selected' : ''}`}
                  title={c.name}
                  aria-label={c.name}
                  aria-pressed={c.name === color.name}
                  style={{ background: c.hex }}
                  onClick={() => setColor(c)}
                >
                  {c.name === color.name && (
                    <Check
                      size={16}
                      style={{
                        color: ['Black', 'Navy', 'Brown'].includes(c.name) ? 'white' : '#242126',
                      }}
                    />
                  )}
                </button>
              ))}
            </div>
          </fieldset>
          <p className="upload-confirmation">
            <CheckCircle2 size={17} /> Review your details, then make it part of your wardrobe.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button" type="submit" disabled={reading}>
            <Plus size={17} /> Confirm & add piece
          </button>
        </div>
      </form>
    </Dialog>
  );
}
