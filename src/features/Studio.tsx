import { useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  Camera,
  Check,
  CheckCircle2,
  CircleHelp,
  Layers3,
  Plus,
  Shirt,
  Sparkles,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { categoryLabels } from '../lib/types';
import type { Category } from '../lib/types';
import { isCompleteLook } from '../lib/demo';
import { Dialog } from '../components/Dialog';
import './features.css';

export function Studio() {
  const { data, saveLook, deleteLook, navigate, notify } = useApp();
  const [tab, setTab] = useState<'compose' | 'saved'>('compose');
  const [selected, setSelected] = useState<string[]>([]);
  const [category, setCategory] = useState<Category>('top');
  const [name, setName] = useState('');
  const [saveDialog, setSaveDialog] = useState(false);
  const [modeDialog, setModeDialog] = useState<'Photo' | 'Live' | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | undefined>();
  const pieces = data.garments.filter((g) => selected.includes(g.id));
  const complete =
    isCompleteLook(selected, data.garments) && pieces.every((g) => g.availability === 'available');
  const selectedCategories = new Set(pieces.map((g) => g.category));
  const categoryItems = data.garments.filter((g) => g.category === category);
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
          <p className="eyebrow">A LITTLE EXPERIMENTATION. A LOT OF YOU.</p>
          <h1 className="page-title">Your personal styling space.</h1>
          <p className="muted">Bring your pieces together. Find a combination that feels right.</p>
        </div>
        <span className="badge studio-local-badge">
          <Layers3 size={14} /> Personal studio
        </span>
      </div>
      <div className="studio-navigation">
        <div className="segmented">
          <button
            className={tab === 'compose' ? 'active' : ''}
            aria-pressed={tab === 'compose'}
            onClick={() => setTab('compose')}
          >
            <Layers3 size={16} /> Create a look
          </button>
          <button
            className={tab === 'saved' ? 'active' : ''}
            aria-pressed={tab === 'saved'}
            onClick={() => setTab('saved')}
          >
            <Bookmark size={16} /> Saved looks{' '}
            <span className="tab-count">{data.savedLooks.length}</span>
          </button>
        </div>
        <div className="studio-modes">
          <button className="button ghost small" onClick={() => setModeDialog('Photo')}>
            <Camera size={16} /> Photo try-on <span className="coming-label">Connect</span>
          </button>
          <button className="button ghost small" onClick={() => navigate('live')}>
            <Video size={16} /> Live fitting room
          </button>
        </div>
      </div>
      {tab === 'compose' ? (
        <div className="composer-layout">
          <section className="card composer-board">
            <div className="composer-board-heading">
              <div>
                <p className="eyebrow">THE BIG PICTURE</p>
                <h2>{editId ? name : 'Your next great combination'}</h2>
              </div>
              <button className="text-link" onClick={startNew} disabled={selected.length === 0}>
                Start fresh
              </button>
            </div>
            <div className={`flatlay-board ${pieces.length === 0 ? 'is-empty' : ''}`}>
              {pieces.length ? (
                pieces.map((g) => (
                  <div key={g.id} className={`flatlay-piece flatlay-${g.category}`}>
                    <img loading="lazy" decoding="async" src={g.image} alt={g.name} />
                    <button
                      className="icon-button"
                      aria-label={`Remove ${g.name} from look`}
                      onClick={() => setSelected((current) => current.filter((id) => id !== g.id))}
                    >
                      <X size={14} />
                    </button>
                    <span>
                      {g.name}
                      {g.availability === 'laundry' ? ' · In the laundry' : ''}
                    </span>
                  </div>
                ))
              ) : (
                <div className="composer-empty">
                  <span>
                    <Shirt size={40} strokeWidth={1} />
                  </span>
                  <h3>Every great look starts with one piece.</h3>
                  <p>
                    Choose a favorite from your wardrobe
                    <br />
                    and see what comes together.
                  </p>
                  <span className="composer-direction">
                    Your wardrobe is right over here <span aria-hidden="true">↗</span>
                  </span>
                </div>
              )}
            </div>
            <div className="composer-checklist">
              <span
                className={
                  selectedCategories.has('dress') ||
                  (selectedCategories.has('top') && selectedCategories.has('bottom'))
                    ? 'is-complete'
                    : ''
                }
              >
                <CheckCircle2 size={15} /> Top + bottom, or a dress
              </span>
              <span className={selectedCategories.has('footwear') ? 'is-complete' : ''}>
                <CheckCircle2 size={15} /> Footwear
              </span>
              <span>Layers & accessories optional</span>
            </div>
            <div className="composer-board-footer">
              <p>
                {complete
                  ? 'Looking good. Make this one a keeper.'
                  : pieces.some((g) => g.availability === 'laundry')
                    ? 'Replace pieces in the laundry before saving.'
                    : 'Add the essentials to save a complete look.'}
              </p>
              <button className="button" disabled={!complete} onClick={() => setSaveDialog(true)}>
                <Bookmark size={16} /> Save this look
              </button>
            </div>
          </section>
          <aside className="card composer-wardrobe">
            <div className="composer-picker-title">
              <h2>From your wardrobe</h2>
              <button
                className="icon-button"
                aria-label="Go to wardrobe to add a piece"
                onClick={() => navigate('wardrobe')}
              >
                <Plus size={19} />
              </button>
            </div>
            <div className="composer-category-tabs">
              {(Object.keys(categoryLabels) as Category[]).map((c) => (
                <button
                  className={`chip ${category === c ? 'active' : ''}`}
                  key={c}
                  aria-pressed={category === c}
                  onClick={() => setCategory(c)}
                >
                  {categoryLabels[c]}
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
                        <Check size={13} />
                      </span>
                    )}
                  </div>
                  <strong>{g.name}</strong>
                  <span>{g.availability === 'laundry' ? 'In the laundry' : g.color}</span>
                </button>
              ))}
            </div>
            {categoryItems.length === 0 && (
              <div className="composer-category-empty">
                <Shirt size={28} />
                <p>No {categoryLabels[category].toLowerCase()} here yet.</p>
                <button className="text-link" onClick={() => navigate('wardrobe')}>
                  Add to your wardrobe <Plus size={14} />
                </button>
              </div>
            )}
            <div className="styling-note">
              <Sparkles size={18} />
              <div>
                <strong>A little styling thought</strong>
                <p>
                  Start with the piece you feel best in. Let the rest of your look follow its lead.
                </p>
              </div>
            </div>
          </aside>
        </div>
      ) : (
        <section className="saved-looks-section">
          <div className="section-heading">
            <div>
              <h2>Good looks, kept close.</h2>
              <p className="muted">Your favorite combinations, ready for another day.</p>
            </div>
            <button className="button secondary small" onClick={startNew}>
              <Plus size={16} /> New look
            </button>
          </div>
          <div className="saved-look-grid">
            {data.savedLooks.map((look) => {
              const items = data.garments.filter((g) => look.garmentIds.includes(g.id));
              const available =
                isCompleteLook(look.garmentIds, data.garments) &&
                items.every((g) => g.availability === 'available');
              return (
                <article className="card saved-look-card" key={look.id}>
                  <div className="saved-look-images">
                    {items.map((g) => (
                      <img loading="lazy" decoding="async" key={g.id} src={g.image} alt={g.name} />
                    ))}
                    <span className="saved-look-count">{items.length} pieces</span>
                  </div>
                  <div className="saved-look-content">
                    <span className={`look-availability ${available ? 'available' : ''}`}>
                      <span />
                      {available ? 'Ready when you are' : 'Needs a little attention'}
                    </span>
                    <h3>{look.name}</h3>
                    <p className="muted">
                      Saved{' '}
                      {new Date(`${look.createdAt}T12:00:00`).toLocaleDateString('en', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </p>
                    <div>
                      <button
                        className="button secondary small"
                        onClick={() => {
                          setSelected(look.garmentIds);
                          setName(look.name);
                          setEditId(look.id);
                          setTab('compose');
                        }}
                      >
                        Open in Studio <span aria-hidden="true">↗</span>
                      </button>
                      <button
                        className="icon-button"
                        aria-label={`Delete ${look.name}`}
                        onClick={() => setDeleteId(look.id)}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
          {!data.savedLooks.length && (
            <div className="empty-state">
              <Bookmark size={32} />
              <h3>Something worth saving starts here.</h3>
              <p>Build your first look from pieces in your wardrobe.</p>
              <button className="button" onClick={startNew}>
                Create a look
              </button>
            </div>
          )}
        </section>
      )}
      <div className="studio-disclaimer">
        <CircleHelp size={15} />
        <p>
          Composing a look does not record wear or generate a try-on. Record what you wore in{' '}
          <button className="text-link" onClick={() => navigate('history')}>
            History
          </button>
          .
        </p>
      </div>
      {saveDialog && (
        <Dialog title="Give this look a name" onClose={() => setSaveDialog(false)}>
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
              Something that makes it easy to find when the mood strikes again.
            </p>
            <label className="field-label">
              Look name
              <input
                className="field"
                autoFocus
                maxLength={80}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. A slow Sunday"
                required
              />
            </label>
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setSaveDialog(false)}
              >
                Keep creating
              </button>
              <button className="button" type="submit" disabled={!name.trim()}>
                <Bookmark size={16} />
                {editId ? 'Save changes' : 'Save look'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {modeDialog && (
        <Dialog
          title={
            modeDialog === 'Photo'
              ? 'Picture the possibilities.'
              : 'Your fitting room, wherever you are.'
          }
          onClose={() => setModeDialog(null)}
        >
          <div className="connection-notice">
            <span>{modeDialog === 'Photo' ? <Camera size={30} /> : <Video size={30} />}</span>
            <h3>{modeDialog} try-on needs a connected account.</h3>
            <p className="muted">
              This local workspace lets you compose and save real combinations.{' '}
              {modeDialog === 'Photo'
                ? 'Photo previews require a configured Oyu AI service, a body photo, and your processing consent.'
                : 'Live sessions require a configured Oyu AI service, supported camera access, and your explicit consent to start.'}
            </p>
            <p className="feature-footnote">
              No image is generated and no camera is started in this preview.
            </p>
            <button
              className="button"
              onClick={() => {
                setModeDialog(null);
                navigate('settings');
              }}
            >
              View connection settings
            </button>
            <button className="button ghost" onClick={() => setModeDialog(null)}>
              <ArrowLeft size={16} /> Back to my look
            </button>
          </div>
        </Dialog>
      )}
      {deleteId && (
        <Dialog title="Let this look go?" onClose={() => setDeleteId(null)}>
          <p className="muted">
            Your individual wardrobe pieces and wear records will stay right where they are.
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setDeleteId(null)}>
              Keep look
            </button>
            <button
              className="button danger-button"
              onClick={() => {
                deleteLook(deleteId);
                setDeleteId(null);
                notify('Look removed from your saved collection.');
              }}
            >
              Delete look
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
