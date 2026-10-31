import type { Audience } from '../lib/types';
import { t } from '../lib/lang';

export type AudienceFilter = Exclude<Audience, 'unisex'> | 'all';
/** A function so the labels follow the current language; call it while rendering. */
const options = (): { value: AudienceFilter; label: string }[] => [
  { value: 'all', label: t('Бүгд', 'All') },
  { value: 'women', label: t('Эмэгтэй', 'Women') },
  { value: 'men', label: t('Эрэгтэй', 'Men') },
];

/** Compact Women / Men switch. Unisex pieces show under both. */
export function AudienceToggle({
  value,
  onChange,
  label = t('Хэнд зориулсан хувцас харуулах', 'Show pieces for'),
}: {
  value: AudienceFilter;
  onChange: (value: AudienceFilter) => void;
  label?: string;
}) {
  return (
    <div className="audience-toggle" role="group" aria-label={label}>
      {options().map((option) => (
        <button
          key={option.value}
          type="button"
          className={value === option.value ? 'active' : ''}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
