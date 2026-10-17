import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import {
  Bookmark,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  Plus,
  RefreshCw,
  Shirt,
  Trash2,
} from 'lucide-react';
import { accountApi, apiErrorMessage, newOperationKey } from '../lib/api';
import type {
  ApiGarment,
  ApiSavedLook,
  OutfitItemReference,
  OutfitSlot,
  WearHistory,
} from '../lib/api';
import { isCalendarDate } from '../lib/workspace';
import './account-looks.css';

const slotLabels: Record<OutfitSlot, string> = {
  top: 'Top',
  bottom: 'Bottom',
  dress: 'Dress / deel',
  footwear: 'Footwear',
  mid: 'Middle layer',
  outer: 'Outerwear',
  accessory1: 'Accessory',
};
const optionalSlots: OutfitSlot[] = ['mid', 'outer', 'accessory1'];
const humanize = (value: string) => value.replaceAll('_', ' ');
const displayDate = (date: string) =>
  new Date(`${date.slice(0, 10)}T12:00:00`).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

function allowedSlots(garment: ApiGarment): OutfitSlot[] {
  switch (garment.category) {
    case 'top':
      return garment.layer_position === 'mid' ? ['top', 'mid'] : ['top'];
    case 'bottom':
      return ['bottom'];
    case 'dress':
      return ['dress'];
    case 'footwear':
      return ['footwear'];
    case 'underlayer':
      return ['mid'];
    case 'accessory':
      return ['accessory1'];
    case 'outerwear':
      return garment.layer_position === 'standalone' &&
        ['deel', 'winter_deel'].includes(garment.subcategory ?? '')
        ? ['dress']
        : ['outer'];
    default:
      return [];
  }
}

const confirmed = (garment: ApiGarment) => garment.status === 'active' && garment.user_confirmed;
const ready = (garment: ApiGarment) =>
  confirmed(garment) && garment.availability === 'available' && garment.is_clean;
type Pending = 'save' | 'delete' | 'wear' | null;
type MutationResult = { notice: string; apply: () => void };

export default function AccountLooks({ garments }: { garments: ApiGarment[] }) {
  const user = useSyncExternalStore(accountApi.subscribe, () => accountApi.currentUser);
  const owner = user?.id;
  const [view, setView] = useState<'looks' | 'wear'>('looks');
  const [looks, setLooks] = useState<ApiSavedLook[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [looksLoading, setLooksLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [looksError, setLooksError] = useState('');
  const [today, setToday] = useState('');
  const [dateError, setDateError] = useState('');
  const [month, setMonth] = useState('');
  const [history, setHistory] = useState<WearHistory | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [outfitType, setOutfitType] = useState<'separates' | 'dress'>('separates');
  const [selection, setSelection] = useState<Partial<Record<OutfitSlot, string>>>({});
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [wearDate, setWearDate] = useState('');
  const [wearIds, setWearIds] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lifecycle = useRef(new AbortController());
  const inFlight = useRef(false);
  const paging = useRef(false);
  const operationKeys = useRef(new Map<string, string>());

  useEffect(() => {
    const active = new AbortController();
    lifecycle.current = active;
    inFlight.current = false;
    paging.current = false;
    operationKeys.current.clear();
    setLooks([]);
    setCursor(null);
    setToday('');
    setMonth('');
    setHistory(null);
    setMoreLoading(false);
    setHistoryLoading(false);
    setLooksError('');
    setDateError('');
    setHistoryError('');
    setSelection({});
    setWearIds([]);
    setWearDate('');
    setCreating(false);
    setDeleteId(null);
    setPending(null);
    setError('');
    setNotice('');
    setName('');
    return () => active.abort();
  }, [owner]);

  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    const active = () => !controller.signal.aborted && accountApi.currentUser?.id === owner;
    setLooksLoading(true);
    setLooksError('');
    setDateError('');
    void accountApi
      .savedLooks(20, undefined, controller.signal)
      .then((response) => {
        if (active()) {
          setLooks(response.items);
          setCursor(response.next_cursor);
        }
      })
      .catch((cause) => {
        if (active()) setLooksError(apiErrorMessage(cause));
      })
      .finally(() => {
        if (active()) setLooksLoading(false);
      });
    void accountApi
      .homeSummary(controller.signal)
      .then((response) => {
        if (!active()) return;
        if (!isCalendarDate(response.period_end)) throw new Error('Invalid account date');
        setToday(response.period_end);
        setMonth((current) => current || response.period_end.slice(0, 7));
        setWearDate((current) => current || response.period_end);
      })
      .catch((cause) => {
        if (active()) setDateError(apiErrorMessage(cause));
      });
    return () => controller.abort();
  }, [owner, refresh]);

  useEffect(() => {
    if (!owner || !month || !today) return;
    const controller = new AbortController();
    const active = () => !controller.signal.aborted && accountApi.currentUser?.id === owner;
    const [year, number] = month.split('-').map(Number);
    const finalDay = `${month}-${new Date(Date.UTC(year, number, 0)).getUTCDate()}`;
    setHistoryLoading(true);
    setHistoryError('');
    setHistory(null);
    void accountApi
      .wearHistory(`${month}-01`, finalDay > today ? today : finalDay, controller.signal)
      .then((response) => {
        if (active()) setHistory(response);
      })
      .catch((cause) => {
        if (active()) setHistoryError(apiErrorMessage(cause));
      })
      .finally(() => {
        if (active()) setHistoryLoading(false);
      });
    return () => controller.abort();
  }, [owner, month, today, historyRefresh]);

  async function loadMore() {
    if (!cursor || paging.current || looksLoading || pending || !owner) return;
    const signal = lifecycle.current.signal;
    paging.current = true;
    setMoreLoading(true);
    setLooksError('');
    try {
      const response = await accountApi.savedLooks(20, cursor, signal);
      if (!signal.aborted && accountApi.currentUser?.id === owner) {
        setLooks((current) => [
          ...current,
          ...response.items.filter((item) => !current.some((existing) => existing.id === item.id)),
        ]);
        setCursor(response.next_cursor);
      }
    } catch (cause) {
      if (!signal.aborted && accountApi.currentUser?.id === owner)
        setLooksError(apiErrorMessage(cause));
    } finally {
      if (!signal.aborted && accountApi.currentUser?.id === owner) {
        paging.current = false;
        setMoreLoading(false);
      }
    }
  }

  async function mutate(
    kind: Exclude<Pending, null>,
    command: string,
    work: (signal: AbortSignal, key: string) => Promise<MutationResult>,
  ) {
    if (inFlight.current || !owner) return;
    const signal = lifecycle.current.signal;
    const active = () => !signal.aborted && accountApi.currentUser?.id === owner;
    const key = operationKeys.current.get(command) ?? newOperationKey();
    operationKeys.current.set(command, key);
    inFlight.current = true;
    setPending(kind);
    setError('');
    setNotice('');
    try {
      const result = await work(signal, key);
      if (active()) {
        operationKeys.current.delete(command);
        result.apply();
        setNotice(result.notice);
      }
    } catch (cause) {
      if (active()) setError(apiErrorMessage(cause));
    } finally {
      if (active()) {
        inFlight.current = false;
        setPending(null);
      }
    }
  }

  const requiredSlots: OutfitSlot[] =
    outfitType === 'dress' ? ['dress', 'footwear'] : ['top', 'bottom', 'footwear'];
  const slots = [...requiredSlots, ...optionalSlots];
  const available = garments.filter(ready);
  const wearable = garments.filter(confirmed);
  const selectedItems: OutfitItemReference[] = slots.flatMap((slot) =>
    selection[slot] ? [{ source: 'wardrobe', item_id: selection[slot]!, slot }] : [],
  );
  const complete =
    requiredSlots.every((slot) => selection[slot]) &&
    new Set(selectedItems.map((item) => item.item_id)).size === selectedItems.length &&
    selectedItems.every((item) =>
      available.some(
        (garment) => garment.id === item.item_id && allowedSlots(garment).includes(item.slot),
      ),
    );
  const recordedDay = history?.days.find((day) => day.date === wearDate);
  const canRecord =
    !!today &&
    isCalendarDate(wearDate) &&
    wearDate <= today &&
    wearIds.length > 0 &&
    wearIds.length <= 20 &&
    new Set(wearIds).size === wearIds.length &&
    wearIds.every((id) => wearable.some((garment) => garment.id === id));

  function save(event: FormEvent) {
    event.preventDefault();
    if (looksLoading || moreLoading) return;
    const cleanName = name.trim().replace(/\s+/g, ' ');
    if (
      !complete ||
      !cleanName ||
      Array.from(cleanName).length > 80 ||
      /[\u0000-\u001f\u007f-\u009f]/.test(cleanName)
    ) {
      setError('Name your look and choose a complete set of available wardrobe pieces.');
      return;
    }
    void mutate('save', JSON.stringify(['save', cleanName, selectedItems]), async (signal, key) => {
      const saved = await accountApi.saveLook(cleanName, selectedItems, {
        signal,
        idempotencyKey: key,
      });
      return {
        notice: 'Look saved to your account. No wear has been recorded.',
        apply: () => {
          setLooks((current) => [saved, ...current.filter((look) => look.id !== saved.id)]);
          setCreating(false);
          setName('');
          setSelection({});
        },
      };
    });
  }

  function record(event: FormEvent) {
    event.preventDefault();
    if (!canRecord) {
      setError('Choose a valid past or current date and up to 20 confirmed wardrobe pieces.');
      return;
    }
    const ids = [...wearIds].sort();
    void mutate('wear', JSON.stringify(['wear', wearDate, ids]), async (signal, key) => {
      const receipt = await accountApi.recordWear(wearDate, ids, { signal, idempotencyKey: key });
      return {
        notice: receipt.added_count
          ? `${receipt.added_count} ${receipt.added_count === 1 ? 'piece' : 'pieces'} added to ${displayDate(receipt.worn_date)}.`
          : 'These pieces were already recorded for this day.',
        apply: () => {
          setWearIds([]);
          setMonth(receipt.worn_date.slice(0, 7));
          setHistoryRefresh((value) => value + 1);
        },
      };
    });
  }

  function changeMonth(offset: number) {
    const date = new Date(`${month}-01T12:00:00`);
    date.setMonth(date.getMonth() + offset);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  if (!user)
    return (
      <p className="account-caption" role="status">
        Sign in to see your saved looks and wear journal.
      </p>
    );

  return (
    <section className="account-looks" aria-label="Saved looks and wear journal">
      <div className="account-looks-toolbar">
        <div className="account-looks-switch" aria-label="Collection view">
          <button type="button" aria-pressed={view === 'looks'} onClick={() => setView('looks')}>
            <Bookmark size={15} /> Saved looks
          </button>
          <button type="button" aria-pressed={view === 'wear'} onClick={() => setView('wear')}>
            <CalendarDays size={15} /> Wear journal
          </button>
        </div>
        <button
          className="account-text-button"
          type="button"
          disabled={!!pending || looksLoading || moreLoading || historyLoading}
          onClick={() => {
            setRefresh((value) => value + 1);
            setHistoryRefresh((value) => value + 1);
          }}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>
      {error && (
        <p className="account-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="account-success" role="status">
          {notice}
        </p>
      )}
      {view === 'looks' ? (
        <>
          <div className="account-section-heading">
            <div>
              <h4>Favorite combinations, kept close.</h4>
              <p className="account-caption">
                Saved in your account. Creating a look does not generate a photo or record wear.
              </p>
            </div>
            <button
              className="account-button account-primary"
              type="button"
              disabled={!!pending || looksLoading || moreLoading}
              onClick={() => {
                setCreating((value) => !value);
                setError('');
                setNotice('');
              }}
            >
              <Plus size={15} />
              {creating ? 'Close composer' : 'Create look'}
            </button>
          </div>
          {creating && (
            <form className="account-look-composer" onSubmit={save}>
              <label className="account-look-name">
                Look name
                <input
                  value={name}
                  maxLength={80}
                  required
                  disabled={!!pending}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="A familiar favorite"
                />
              </label>
              <fieldset disabled={!!pending} className="account-look-type">
                <legend>Start with</legend>
                {(['separates', 'dress'] as const).map((value) => (
                  <label key={value}>
                    <input
                      type="radio"
                      name="account-outfit-type"
                      value={value}
                      checked={outfitType === value}
                      onChange={() => {
                        setOutfitType(value);
                        setSelection((current) => ({
                          footwear: current.footwear,
                          mid: current.mid,
                          outer: current.outer,
                          accessory1: current.accessory1,
                        }));
                      }}
                    />
                    {value === 'separates' ? 'Top and bottom' : 'Dress or deel'}
                  </label>
                ))}
              </fieldset>
              <div className="account-look-slots">
                {slots.map((slot) => (
                  <label key={slot}>
                    {slotLabels[slot]}
                    <span>{requiredSlots.includes(slot) ? 'Required' : 'Optional'}</span>
                    <select
                      value={selection[slot] ?? ''}
                      disabled={!!pending}
                      onChange={(event) =>
                        setSelection((current) => ({ ...current, [slot]: event.target.value }))
                      }
                      required={requiredSlots.includes(slot)}
                    >
                      <option value="">
                        {requiredSlots.includes(slot) ? 'Choose a piece' : 'Leave empty'}
                      </option>
                      {available
                        .filter((garment) => allowedSlots(garment).includes(slot))
                        .map((garment) => (
                          <option
                            key={garment.id}
                            value={garment.id}
                            disabled={selectedItems.some(
                              (item) => item.item_id === garment.id && item.slot !== slot,
                            )}
                          >
                            {garment.name}
                            {garment.primary_color ? ` · ${humanize(garment.primary_color)}` : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              {!available.length && (
                <p className="account-caption">
                  Add and confirm wardrobe pieces first. Looks use clean, available clothing.
                </p>
              )}
              <p className="account-caption">
                Choose from the wardrobe pieces loaded in your account. Load more in My wardrobe if
                something is missing.
              </p>
              <div className="account-action-row">
                <span className="account-caption">
                  {complete
                    ? 'Your essentials are in place.'
                    : 'Complete your outfit with footwear and a dress, or a top and bottom.'}
                </span>
                <button
                  type="submit"
                  className="account-button account-primary"
                  disabled={!!pending || looksLoading || moreLoading || !complete || !name.trim()}
                >
                  {pending === 'save' ? (
                    <LoaderCircle size={16} className="account-spin" />
                  ) : (
                    <Bookmark size={16} />
                  )}{' '}
                  Save look
                </button>
              </div>
            </form>
          )}
          {looksLoading && (
            <p className="account-caption" role="status">
              Loading your saved looks…
            </p>
          )}
          {looksError && (
            <p className="account-error" role="alert">
              {looksError}
            </p>
          )}
          {!looksLoading && !looksError && !looks.length && (
            <div className="account-empty">
              <Bookmark size={28} />
              <h4>Something worth keeping starts here.</h4>
              <p>Create a complete look from your confirmed wardrobe.</p>
            </div>
          )}
          <div className="account-saved-grid">
            {looks.map((look) => (
              <article className="account-saved-look" key={look.id}>
                <div className="account-section-heading">
                  <div>
                    <span className={`account-status ${look.is_available ? 'ready' : ''}`}>
                      {look.is_available ? 'Available' : 'Some pieces unavailable'}
                    </span>
                    <h4>{look.name}</h4>
                    <p className="account-caption">Saved {displayDate(look.created_at)}</p>
                  </div>
                  <button
                    type="button"
                    className="account-text-button"
                    aria-label={`Delete ${look.name}`}
                    disabled={!!pending || moreLoading || looksLoading}
                    onClick={() => setDeleteId(look.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <ul className="account-look-items">
                  {look.items.map((item) => (
                    <li key={`${item.slot}:${item.source}:${item.item_id}`}>
                      <Shirt size={16} />
                      <div>
                        <strong>{item.name || 'Unavailable piece'}</strong>
                        <span>
                          {slotLabels[item.slot]} ·{' '}
                          {item.source === 'catalog' ? 'Oyu AI catalog' : 'Your wardrobe'}
                          {!item.is_available
                            ? ` · ${humanize(item.unavailable_reason ?? 'unavailable')}`
                            : ''}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                {deleteId === look.id && (
                  <div
                    className="account-look-delete"
                    role="group"
                    aria-label={`Confirm deleting ${look.name}`}
                  >
                    <p>Delete this saved combination? Your wardrobe and wear records will stay.</p>
                    <div className="account-action-row">
                      <button
                        type="button"
                        className="account-button account-subtle"
                        disabled={!!pending}
                        onClick={() => setDeleteId(null)}
                      >
                        Keep look
                      </button>
                      <button
                        type="button"
                        className="account-button account-danger"
                        disabled={!!pending}
                        onClick={() =>
                          void mutate('delete', `delete:${look.id}`, async (signal, key) => {
                            await accountApi.deleteLook(look.id, { signal, idempotencyKey: key });
                            return {
                              notice:
                                'Saved look deleted. Your wardrobe and wear records are unchanged.',
                              apply: () => {
                                setLooks((current) =>
                                  current.filter((item) => item.id !== look.id),
                                );
                                setDeleteId(null);
                              },
                            };
                          })
                        }
                      >
                        {pending === 'delete' ? 'Deleting…' : 'Delete look'}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
          {cursor && (
            <button
              className="account-button account-subtle"
              type="button"
              disabled={moreLoading || looksLoading || !!pending}
              onClick={() => void loadMore()}
            >
              {moreLoading ? 'Loading…' : 'Load more looks'}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="account-section-heading">
            <div>
              <h4>What you actually wore.</h4>
              <p className="account-caption">
                Add pieces to a day’s record. Existing records remain; this does not replace or
                remove them.
              </p>
            </div>
          </div>
          {dateError && (
            <div className="account-error" role="alert">
              <p>Could not load your account’s current date. {dateError}</p>
              <button
                type="button"
                className="account-text-button"
                disabled={looksLoading}
                onClick={() => setRefresh((value) => value + 1)}
              >
                Try again
              </button>
            </div>
          )}
          {!today && !dateError && (
            <p className="account-caption" role="status">
              Loading your account calendar…
            </p>
          )}
          <form className="account-wear-form" onSubmit={record}>
            <label className="account-look-name">
              Date worn
              <input
                type="date"
                value={wearDate}
                max={today || undefined}
                required
                disabled={!!pending || !today}
                onChange={(event) => {
                  setWearDate(event.target.value);
                  setWearIds([]);
                }}
              />
            </label>
            <p className="account-caption">
              Choose up to 20 pieces you wore. Clothing currently in the laundry can still be
              recorded for a past day.
            </p>
            {recordedDay && (
              <p className="account-recorded-note">
                <Check size={14} />
                {recordedDay.items.length} pieces already recorded on this date. Adding them again
                will not create duplicates.
              </p>
            )}
            <fieldset className="account-wear-choices" disabled={!!pending || !today}>
              <legend>Clothing you wore</legend>
              {wearable.map((garment) => (
                <label key={garment.id}>
                  <input
                    type="checkbox"
                    checked={wearIds.includes(garment.id)}
                    disabled={!wearIds.includes(garment.id) && wearIds.length >= 20}
                    onChange={(event) =>
                      setWearIds((current) =>
                        event.target.checked
                          ? [...current, garment.id]
                          : current.filter((id) => id !== garment.id),
                      )
                    }
                  />
                  <Shirt size={18} />
                  <span>
                    <strong>{garment.name}</strong>
                    <small>
                      {humanize(garment.category ?? 'clothing')}
                      {garment.primary_color ? ` · ${humanize(garment.primary_color)}` : ''}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            {!wearable.length && (
              <p className="account-caption">
                Confirmed, active garments from My wardrobe will appear here.
              </p>
            )}
            <div className="account-action-row">
              <span className="account-caption">{wearIds.length} pieces selected</span>
              <button
                className="account-button account-primary"
                type="submit"
                disabled={!!pending || !canRecord}
              >
                {pending === 'wear' ? (
                  <LoaderCircle size={16} className="account-spin" />
                ) : (
                  <Check size={16} />
                )}{' '}
                Add wear record
              </button>
            </div>
          </form>
          <div className="account-section-heading account-history-navigation">
            <h4>Your wear journal</h4>
            <div>
              <button
                type="button"
                className="account-text-button"
                disabled={!month || historyLoading}
                aria-label="Previous month"
                onClick={() => changeMonth(-1)}
              >
                <ChevronLeft size={17} />
              </button>
              <label>
                <span className="account-visually-hidden">Journal month</span>
                <input
                  type="month"
                  value={month}
                  max={today.slice(0, 7) || undefined}
                  disabled={!today || historyLoading}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (isCalendarDate(`${value}-01`) && value <= today.slice(0, 7))
                      setMonth(value);
                  }}
                />
              </label>
              <button
                type="button"
                className="account-text-button"
                disabled={!month || historyLoading || month >= today.slice(0, 7)}
                aria-label="Next month"
                onClick={() => changeMonth(1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
          {historyLoading && (
            <p className="account-caption" role="status">
              Loading recorded outfits…
            </p>
          )}
          {historyError && (
            <div className="account-error" role="alert">
              <p>{historyError}</p>
              <button
                type="button"
                className="account-text-button"
                onClick={() => setHistoryRefresh((value) => value + 1)}
              >
                Retry journal
              </button>
            </div>
          )}
          {!historyLoading && !historyError && history && !history.days.length && (
            <div className="account-empty">
              <CalendarDays size={27} />
              <h4>A month of possibilities.</h4>
              <p>No outfits recorded for this month yet.</p>
            </div>
          )}
          <div className="account-journal-days">
            {history?.days.map((day) => (
              <article key={day.date}>
                <div>
                  <CalendarDays size={16} />
                  <h5>{displayDate(day.date)}</h5>
                  <span>{day.items.length} pieces</span>
                </div>
                <ul>
                  {day.items.map((item) => (
                    <li key={item.id}>
                      <strong>{item.name || 'Wardrobe piece'}</strong>
                      <span>
                        {humanize(item.category)}
                        {item.archived ? ' · Archived' : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="account-text-button"
                  disabled={!!pending}
                  onClick={() => {
                    setWearDate(day.date);
                    setWearIds([]);
                    setNotice(
                      `Choose additional pieces for ${displayDate(day.date)} in the form above.`,
                    );
                  }}
                >
                  Add pieces to this day <Plus size={13} />
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
