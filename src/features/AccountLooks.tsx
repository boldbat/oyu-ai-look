import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { FormEvent } from 'react';
import {
  ArrowsClockwise,
  BookmarkSimple,
  CalendarBlank,
  CaretLeft,
  CaretRight,
  Check,
  CircleNotch,
  Plus,
  TShirt,
  Trash,
  X,
} from '@phosphor-icons/react';
import { accountApi, apiErrorMessage, newOperationKey } from '../lib/api';
import type {
  ApiGarment,
  ApiSavedLook,
  OutfitItemReference,
  OutfitSlot,
  WearHistory,
} from '../lib/api';
import { colorLabel, colorLabels, formatDate } from '../lib/i18n';
import { localized, t } from '../lib/lang';
import { categoryLabels } from '../lib/types';
import { isCalendarDate } from '../lib/workspace';
import './account-looks.css';

const slotLabels = localized<OutfitSlot>({
  top: ['Цамц', 'Top'],
  bottom: ['Өмд, банзал', 'Bottom'],
  dress: ['Даашинз / дээл', 'Dress / deel'],
  footwear: ['Гутал', 'Shoes'],
  mid: ['Дунд давхарга', 'Middle layer'],
  outer: ['Гадуур хувцас', 'Outerwear'],
  accessory1: ['Аксессуар', 'Accessory'],
});
const optionalSlots: OutfitSlot[] = ['mid', 'outer', 'accessory1'];
const humanize = (value: string) => value.replaceAll('_', ' ');
/** A service key’s label in the current language; unknown values are shown as sent. */
const labelFor = (labels: Record<string, string>, value: string) => {
  const text = humanize(value);
  const match = Object.entries(labels).find(
    ([key]) => humanize(key).toLowerCase() === text.toLowerCase(),
  );
  return match?.[1] ?? text.charAt(0).toUpperCase() + text.slice(1);
};
const colorText = (value: string) =>
  labelFor(
    Object.fromEntries(Object.keys(colorLabels).map((key) => [key, colorLabel(key)])),
    value,
  );
const categoryText = (value: string) =>
  labelFor({ ...categoryLabels, underlayer: t('Дотуур давхарга', 'Underlayers') }, value);
const unavailableLabels: Record<string, string> = localized({
  archived: ['Архивласан', 'Archived'],
  laundry: ['Угаалгад байгаа', 'In the laundry'],
  not_clean: ['Угаалгад байгаа', 'In the laundry'],
  repair: ['Засварт байгаа', 'In repair'],
  lent_out: ['Зээлүүлсэн', 'Lent out'],
  stored: ['Хадгалалтад', 'In storage'],
  not_found: ['Олдсонгүй', 'Not found'],
  deleted: ['Устгасан', 'Deleted'],
});
const displayDate = (date: string) => formatDate(date.slice(0, 10), 'year');
/** Monday-first weekday initials for the wear log calendar. */
const weekdayLabels = () => [
  t('Да', 'Mo'),
  t('Мя', 'Tu'),
  t('Лх', 'We'),
  t('Пү', 'Th'),
  t('Ба', 'Fr'),
  t('Бя', 'Sa'),
  t('Ня', 'Su'),
];
type LookItem = ApiSavedLook['items'][number];

/** Garment photo for a saved look tile; falls back to an outline icon while loading or if missing. */
function LookItemImage({ item }: { item: LookItem }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    let objectUrl = '';
    void accountApi
      .fittingRoomItemImage(item.source, item.item_id, controller.signal)
      .then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => {
        /* Missing photos keep the outline icon. */
      });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [item.source, item.item_id]);
  return (
    <div className={`account-look-tile ${item.is_available ? '' : 'unavailable'}`}>
      {url ? <img src={url} alt="" onError={() => setUrl('')} /> : <TShirt size={22} />}
    </div>
  );
}

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
  const wearForm = useRef<HTMLFormElement>(null);
  const calendarDays = useMemo(() => {
    if (!month) return [];
    const [year, number] = month.split('-').map(Number);
    const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
    const offset = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
    return [
      ...Array.from({ length: offset }, () => ''),
      ...Array.from({ length }, (_, index) => `${month}-${String(index + 1).padStart(2, '0')}`),
    ];
  }, [month]);
  const wornCounts = new Map(history?.days.map((day) => [day.date, day.items.length]) ?? []);
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
      setError(
        t(
          'Хослолдоо нэр өгч, шүүгээнээсээ өмсөхөд бэлэн хувцсаар бүрэн хослол сонгоно уу.',
          'Name your look and choose a complete set of ready-to-wear pieces from your wardrobe.',
        ),
      );
      return;
    }
    void mutate('save', JSON.stringify(['save', cleanName, selectedItems]), async (signal, key) => {
      const saved = await accountApi.saveLook(cleanName, selectedItems, {
        signal,
        idempotencyKey: key,
      });
      return {
        notice: t(
          'Хослолыг бүртгэлд хадгаллаа. Өмссөн бүртгэл үүсээгүй.',
          'Look saved to your account. No wear has been recorded.',
        ),
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
      setError(
        t(
          'Өнөөдрийн эсвэл өмнөх огноо, баталгаажсан 20 хүртэл хувцас сонгоно уу.',
          'Choose today or a past date, and up to 20 confirmed pieces.',
        ),
      );
      return;
    }
    const ids = [...wearIds].sort();
    void mutate('wear', JSON.stringify(['wear', wearDate, ids]), async (signal, key) => {
      const receipt = await accountApi.recordWear(wearDate, ids, { signal, idempotencyKey: key });
      return {
        notice: receipt.added_count
          ? t(
              `${displayDate(receipt.worn_date)} өдөрт ${receipt.added_count} хувцас нэмлээ.`,
              `${receipt.added_count} ${receipt.added_count === 1 ? 'piece' : 'pieces'} added to ${displayDate(receipt.worn_date)}.`,
            )
          : t(
              'Эдгээр хувцас энэ өдөр аль хэдийн бүртгэгдсэн байна.',
              'These pieces were already recorded for this day.',
            ),
        apply: () => {
          setWearIds([]);
          setMonth(receipt.worn_date.slice(0, 7));
          setHistoryRefresh((value) => value + 1);
        },
      };
    });
  }

  function pickDay(date: string) {
    setWearDate(date);
    setWearIds([]);
    setNotice(
      t(
        `${displayDate(date)} өдөрт нэмэх хувцсаа дээрх маягтаас сонгоно уу.`,
        `Choose pieces to add to ${displayDate(date)} in the form above.`,
      ),
    );
    wearForm.current?.scrollIntoView({ block: 'nearest' });
  }

  function changeMonth(offset: number) {
    const date = new Date(`${month}-01T12:00:00`);
    date.setMonth(date.getMonth() + offset);
    setMonth(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
  }

  if (!user)
    return (
      <p className="account-caption" role="status">
        {t(
          'Хадгалсан хослол, өмссөн бүртгэлээ харахын тулд нэвтэрнэ үү.',
          'Sign in to see your saved looks and wear log.',
        )}
      </p>
    );

  return (
    <section
      className="account-looks"
      aria-label={t('Хадгалсан хослол ба өмссөн бүртгэл', 'Saved looks and wear log')}
    >
      <div className="account-looks-toolbar">
        <div className="segmented account-looks-switch" aria-label={t('Харагдац', 'View')}>
          <button
            type="button"
            className={view === 'looks' ? 'active' : ''}
            aria-pressed={view === 'looks'}
            onClick={() => setView('looks')}
          >
            <BookmarkSimple size={15} weight="regular" /> {t('Хадгалсан хослол', 'Saved looks')}
          </button>
          <button
            type="button"
            className={view === 'wear' ? 'active' : ''}
            aria-pressed={view === 'wear'}
            onClick={() => setView('wear')}
          >
            <CalendarBlank size={15} weight="regular" /> {t('Өмссөн бүртгэл', 'Wear log')}
          </button>
        </div>
        <button
          className="text-link account-link"
          type="button"
          disabled={!!pending || looksLoading || moreLoading || historyLoading}
          onClick={() => {
            setRefresh((value) => value + 1);
            setHistoryRefresh((value) => value + 1);
          }}
        >
          <ArrowsClockwise size={15} weight="regular" /> {t('Шинэчлэх', 'Refresh')}
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
              <h4>{t('Таны хадгалсан хослол', 'Your saved looks')}</h4>
              <p className="account-caption">
                {t(
                  'Бүртгэлд тань хадгалагдана. Хослол үүсгэхэд зураг гарахгүй, өмссөн бүртгэл ч үүсэхгүй.',
                  'Saved in your account. Creating a look doesn’t generate a photo or record wear.',
                )}
              </p>
            </div>
            <button
              className={creating ? 'button secondary small' : 'button small'}
              type="button"
              disabled={!!pending || looksLoading || moreLoading}
              onClick={() => {
                setCreating((value) => !value);
                setError('');
                setNotice('');
              }}
            >
              {creating ? <X size={15} weight="regular" /> : <Plus size={15} weight="regular" />}
              {creating ? t('Хаах', 'Close') : t('Хослол үүсгэх', 'Create look')}
            </button>
          </div>
          {creating && (
            <form className="account-panel account-look-composer" onSubmit={save}>
              <label className="account-look-name">
                {t('Хослолын нэр', 'Look name')}
                <input
                  className="field"
                  value={name}
                  maxLength={80}
                  required
                  disabled={!!pending}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t('Жишээ нь: Дуртай хослол', 'For example: Favorite look')}
                />
              </label>
              <fieldset disabled={!!pending} className="account-look-type">
                <legend>{t('Юунаас эхлэх вэ', 'Start with')}</legend>
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
                    {value === 'separates'
                      ? t('Цамц ба өмд/банзал', 'Top and bottom')
                      : t('Даашинз эсвэл дээл', 'Dress or deel')}
                  </label>
                ))}
              </fieldset>
              <div className="account-look-slots">
                {slots.map((slot) => (
                  <label key={slot}>
                    <span className="account-label">
                      {slotLabels[slot]}
                      <span>
                        {requiredSlots.includes(slot)
                          ? t('Заавал', 'Required')
                          : t('Заавал биш', 'Optional')}
                      </span>
                    </span>
                    <select
                      className="field account-select"
                      value={selection[slot] ?? ''}
                      disabled={!!pending}
                      onChange={(event) =>
                        setSelection((current) => ({ ...current, [slot]: event.target.value }))
                      }
                      required={requiredSlots.includes(slot)}
                    >
                      <option value="">
                        {requiredSlots.includes(slot)
                          ? t('Хувцас сонгох', 'Choose a piece')
                          : t('Хоосон үлдээх', 'Leave empty')}
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
                            {garment.primary_color ? ` · ${colorText(garment.primary_color)}` : ''}
                          </option>
                        ))}
                    </select>
                  </label>
                ))}
              </div>
              {!available.length && (
                <p className="account-caption">
                  {t(
                    'Эхлээд шүүгээндээ хувцас нэмж баталгаажуулна уу. Хослолд цэвэр, өмсөхөд бэлэн хувцас ашиглана.',
                    'Add and confirm wardrobe pieces first. Looks use clean, ready-to-wear clothing.',
                  )}
                </p>
              )}
              <p className="account-caption">
                {t(
                  'Бүртгэлд ачаалагдсан хувцаснаас сонгоно уу. Дутуу байвал Миний шүүгээ хэсгээс цааш нь ачаална уу.',
                  'Choose from the pieces loaded in your account. If something is missing, load more in My wardrobe.',
                )}
              </p>
              <div className="account-action-row">
                <span className="account-caption">
                  {complete
                    ? t('Үндсэн хувцас бүрдлээ.', 'Your essentials are in place.')
                    : t(
                        'Хослолдоо гутал ба даашинз, эсвэл цамц ба өмд/банзал сонгоно уу.',
                        'Complete your look with shoes and a dress, or a top and bottom.',
                      )}
                </span>
                <button
                  type="submit"
                  className="button"
                  disabled={!!pending || looksLoading || moreLoading || !complete || !name.trim()}
                >
                  {pending === 'save' ? (
                    <CircleNotch size={18} className="account-spin" />
                  ) : (
                    <BookmarkSimple size={18} />
                  )}{' '}
                  {t('Хослол хадгалах', 'Save look')}
                </button>
              </div>
            </form>
          )}
          {looksLoading && (
            <p className="account-caption" role="status">
              {t('Хадгалсан хослолыг ачааллаж байна…', 'Loading your saved looks…')}
            </p>
          )}
          {looksError && (
            <p className="account-error" role="alert">
              {looksError}
            </p>
          )}
          {!looksLoading && !looksError && !looks.length && (
            <div className="account-empty">
              <BookmarkSimple size={28} />
              <h4>{t('Хадгалсан хослол хараахан алга', 'No saved looks yet')}</h4>
              <p>
                {t(
                  'Баталгаажсан хувцаснаасаа бүрэн хослол үүсгээрэй.',
                  'Create a complete look from your confirmed wardrobe.',
                )}
              </p>
            </div>
          )}
          <div className="account-saved-grid">
            {looks.map((look) => (
              <article className="account-saved-look" key={look.id}>
                <div
                  className="account-look-media"
                  style={{
                    gridTemplateColumns: `repeat(${Math.min(Math.max(look.items.length, 1), 4)}, minmax(0, 1fr))`,
                  }}
                >
                  {look.items.slice(0, 4).map((item) => (
                    <LookItemImage
                      key={`${item.slot}:${item.source}:${item.item_id}`}
                      item={item}
                    />
                  ))}
                </div>
                <div className="account-look-head">
                  <div>
                    <h4>{look.name}</h4>
                    <p>
                      <span className={`account-status ${look.is_available ? 'ready' : 'muted'}`}>
                        {look.is_available
                          ? t('Өмсөхөд бэлэн', 'Ready to wear')
                          : t('Зарим хувцас боломжгүй', 'Some pieces unavailable')}
                      </span>
                      <span>
                        {t(
                          `Хадгалсан: ${displayDate(look.created_at)}`,
                          `Saved ${displayDate(look.created_at)}`,
                        )}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    className="icon-button account-look-delete-button"
                    aria-label={t(`Устгах: ${look.name}`, `Delete ${look.name}`)}
                    disabled={!!pending || moreLoading || looksLoading}
                    onClick={() => setDeleteId(look.id)}
                  >
                    <Trash size={18} />
                  </button>
                </div>
                <ul className="account-look-items">
                  {look.items.map((item) => (
                    <li key={`${item.slot}:${item.source}:${item.item_id}`}>
                      <strong>{item.name || t('Боломжгүй хувцас', 'Unavailable piece')}</strong>
                      <span>
                        {slotLabels[item.slot]} ·{' '}
                        {item.source === 'catalog'
                          ? t('Oyu AI каталог', 'Oyu AI catalog')
                          : t('Таны шүүгээ', 'Your wardrobe')}
                        {!item.is_available
                          ? ` · ${(item.unavailable_reason && unavailableLabels[item.unavailable_reason]) || t('Боломжгүй', 'Unavailable')}`
                          : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                {deleteId === look.id && (
                  <div
                    className="account-look-delete"
                    role="group"
                    aria-label={t(`Устгахыг батлах: ${look.name}`, `Confirm deleting ${look.name}`)}
                  >
                    <p>
                      {t(
                        'Энэ хадгалсан хослолыг устгах уу? Шүүгээ болон өмссөн бүртгэл тань хэвээр үлдэнэ.',
                        'Delete this saved look? Your wardrobe and wear log will stay.',
                      )}
                    </p>
                    <div className="account-action-row">
                      <button
                        type="button"
                        className="button secondary small"
                        disabled={!!pending}
                        onClick={() => setDeleteId(null)}
                      >
                        {t('Хослолыг үлдээх', 'Keep look')}
                      </button>
                      <button
                        type="button"
                        className="button danger small"
                        disabled={!!pending}
                        onClick={() =>
                          void mutate('delete', `delete:${look.id}`, async (signal, key) => {
                            await accountApi.deleteLook(look.id, { signal, idempotencyKey: key });
                            return {
                              notice: t(
                                'Хадгалсан хослолыг устгалаа. Шүүгээ болон өмссөн бүртгэл тань өөрчлөгдөөгүй.',
                                'Saved look deleted. Your wardrobe and wear log are unchanged.',
                              ),
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
                        {pending === 'delete'
                          ? t('Устгаж байна…', 'Deleting…')
                          : t('Хослол устгах', 'Delete look')}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
          {cursor && (
            <button
              className="button secondary account-more"
              type="button"
              disabled={moreLoading || looksLoading || !!pending}
              onClick={() => void loadMore()}
            >
              {moreLoading ? t('Ачааллаж байна…', 'Loading…') : t('Цааш нь ачаалах', 'Load more')}
            </button>
          )}
        </>
      ) : (
        <>
          <div className="account-section-heading">
            <div>
              <h4>{t('Өмссөнөө тэмдэглэх', 'Log what you wore')}</h4>
              <p className="account-caption">
                {t(
                  'Өдрийн бүртгэлд хувцас нэмнэ үү. Өмнөх бүртгэл хэвээр үлдэх бөгөөд солигдох, устгагдахгүй.',
                  'Add pieces to a day’s record. Existing records stay; they aren’t replaced or removed.',
                )}
              </p>
            </div>
          </div>
          {dateError && (
            <div className="account-error" role="alert">
              <p>
                {t(
                  'Бүртгэлийн өнөөдрийн огноог ачаалж чадсангүй.',
                  'Couldn’t load your account’s current date.',
                )}{' '}
                {dateError}
              </p>
              <button
                type="button"
                className="text-link account-link"
                disabled={looksLoading}
                onClick={() => setRefresh((value) => value + 1)}
              >
                {t('Дахин оролдох', 'Try again')}
              </button>
            </div>
          )}
          {!today && !dateError && (
            <p className="account-caption" role="status">
              {t('Бүртгэлийн хуанлийг ачааллаж байна…', 'Loading your account calendar…')}
            </p>
          )}
          <form className="account-panel account-wear-form" onSubmit={record} ref={wearForm}>
            <label className="account-look-name">
              {t('Өмссөн огноо', 'Date worn')}
              <input
                className="field"
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
              {t(
                'Өмссөн 20 хүртэл хувцсаа сонгоно уу. Одоо угаалгад байгаа хувцсыг өмнөх өдөрт бүртгэж болно.',
                'Choose up to 20 pieces you wore. Clothing that’s in the laundry now can still be recorded for a past day.',
              )}
            </p>
            {recordedDay && (
              <p className="account-recorded-note">
                <Check size={15} weight="regular" />
                {t(
                  `Энэ өдөр ${recordedDay.items.length} хувцас аль хэдийн бүртгэгдсэн. Дахин нэмэхэд давхардахгүй.`,
                  recordedDay.items.length === 1
                    ? '1 piece is already recorded on this date. Adding it again won’t create a duplicate.'
                    : `${recordedDay.items.length} pieces are already recorded on this date. Adding them again won’t create duplicates.`,
                )}
              </p>
            )}
            <fieldset className="account-wear-choices" disabled={!!pending || !today}>
              <legend>{t('Өмссөн хувцас', 'Clothing you wore')}</legend>
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
                  <TShirt size={18} />
                  <span>
                    <strong>{garment.name}</strong>
                    <small>
                      {garment.category ? categoryText(garment.category) : t('Хувцас', 'Clothing')}
                      {garment.primary_color ? ` · ${colorText(garment.primary_color)}` : ''}
                    </small>
                  </span>
                </label>
              ))}
            </fieldset>
            {!wearable.length && (
              <p className="account-caption">
                {t(
                  'Миний шүүгээ хэсгийн баталгаажсан, идэвхтэй хувцас энд харагдана.',
                  'Confirmed, active pieces from My wardrobe will appear here.',
                )}
              </p>
            )}
            <div className="account-action-row">
              <span className="account-caption account-count">
                {t(
                  `${wearIds.length} хувцас сонгосон`,
                  `${wearIds.length} ${wearIds.length === 1 ? 'piece' : 'pieces'} selected`,
                )}
              </span>
              <button className="button" type="submit" disabled={!!pending || !canRecord}>
                {pending === 'wear' ? (
                  <CircleNotch size={18} className="account-spin" />
                ) : (
                  <Check size={18} />
                )}{' '}
                {t('Өмссөнөө тэмдэглэх', 'Log what you wore')}
              </button>
            </div>
          </form>
          <div className="account-section-heading account-history-navigation">
            <h4>{t('Таны өмссөн бүртгэл', 'Your wear log')}</h4>
            <div>
              <button
                type="button"
                className="icon-button"
                disabled={!month || historyLoading}
                aria-label={t('Өмнөх сар', 'Previous month')}
                onClick={() => changeMonth(-1)}
              >
                <CaretLeft size={18} />
              </button>
              <label>
                <span className="account-visually-hidden">
                  {t('Бүртгэлийн сар', 'Wear log month')}
                </span>
                <input
                  className="field"
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
                className="icon-button"
                disabled={!month || historyLoading || month >= today.slice(0, 7)}
                aria-label={t('Дараах сар', 'Next month')}
                onClick={() => changeMonth(1)}
              >
                <CaretRight size={18} />
              </button>
            </div>
          </div>
          {month && today && (
            <div
              className="account-calendar"
              role="group"
              aria-label={formatDate(`${month}-01`, 'month')}
            >
              {weekdayLabels().map((label) => (
                <span key={label} className="account-calendar-weekday" aria-hidden="true">
                  {label}
                </span>
              ))}
              {calendarDays.map((date, index) =>
                date ? (
                  <button
                    key={date}
                    type="button"
                    className={[
                      date === today ? 'today' : '',
                      date === wearDate ? 'selected' : '',
                      wornCounts.has(date) ? 'worn' : '',
                    ].join(' ')}
                    aria-pressed={date === wearDate}
                    aria-label={t(
                      `${displayDate(date)}${wornCounts.has(date) ? ` · ${wornCounts.get(date)} хувцас` : ''}`,
                      `${displayDate(date)}${wornCounts.has(date) ? ` · ${wornCounts.get(date)} ${wornCounts.get(date) === 1 ? 'piece' : 'pieces'}` : ''}`,
                    )}
                    disabled={date > today || !!pending}
                    onClick={() => pickDay(date)}
                  >
                    <span>{Number(date.slice(8))}</span>
                  </button>
                ) : (
                  <span key={`blank-${index}`} aria-hidden="true" />
                ),
              )}
            </div>
          )}
          {historyLoading && (
            <p className="account-caption" role="status">
              {t('Бүртгэсэн хослолыг ачааллаж байна…', 'Loading recorded outfits…')}
            </p>
          )}
          {historyError && (
            <div className="account-error" role="alert">
              <p>{historyError}</p>
              <button
                type="button"
                className="text-link account-link"
                onClick={() => setHistoryRefresh((value) => value + 1)}
              >
                {t('Дахин ачаалах', 'Reload')}
              </button>
            </div>
          )}
          {!historyLoading && !historyError && history && !history.days.length && (
            <p className="account-caption account-history-empty">
              {t(
                'Энэ сард хараахан хослол бүртгээгүй байна.',
                'No outfits recorded for this month yet.',
              )}
            </p>
          )}
          <div className="account-journal-days">
            {history?.days.map((day) => (
              <article key={day.date}>
                <div>
                  <h5>{displayDate(day.date)}</h5>
                  <span>
                    {t(
                      `${day.items.length} хувцас`,
                      `${day.items.length} ${day.items.length === 1 ? 'piece' : 'pieces'}`,
                    )}
                  </span>
                </div>
                <ul>
                  {day.items.map((item) => (
                    <li key={item.id}>
                      <strong>{item.name || t('Шүүгээний хувцас', 'Wardrobe piece')}</strong>
                      <span>
                        {categoryText(item.category)}
                        {item.archived ? t(' · Архивласан', ' · Archived') : ''}
                      </span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className="text-link account-link"
                  disabled={!!pending}
                  onClick={() => pickDay(day.date)}
                >
                  <Plus size={15} weight="regular" />{' '}
                  {t('Энэ өдөрт хувцас нэмэх', 'Add pieces to this day')}
                </button>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
