import {
  ArrowRight,
  CalendarBlank,
  CoatHanger,
  Swatches,
  VideoCamera,
} from '@phosphor-icons/react';
import type { Page } from '../lib/types';
import { t } from '../lib/lang';

export interface JourneyStep {
  page: Page;
  label: string;
  title: string;
  text: string;
  icon: typeof CoatHanger;
}

/**
 * The four product steps, in the order a first-time viewer should meet them.
 * A function so the text follows the current language; call it while rendering.
 */
export const journeySteps = (): JourneyStep[] => [
  {
    page: 'wardrobe',
    label: t('Миний шүүгээ', 'My wardrobe'),
    title: t('Шүүгээгээ цахимжуулах', 'Digitize your wardrobe'),
    text: t(
      'Хувцас бүрийн зургийг нэмээрэй. Төрөл, өнгө, өмсөхөд бэлэн эсэхээр нь харна.',
      'Add a photo of each piece, then browse by category, color and what’s ready to wear.',
    ),
    icon: CoatHanger,
  },
  {
    page: 'studio',
    label: t('Хослолын студи', 'Look studio'),
    title: t('Хослол бүтээх', 'Build a look'),
    text: t(
      'Хувцсаа бүрэн хослол болгон хослуулж, санал авч, дуртайгаа хадгална.',
      'Pair your pieces into complete looks, get suggestions and save the ones you love.',
    ),
    icon: Swatches,
  },
  {
    page: 'live',
    label: t('Шууд өмсөж үзэх', 'Live try-on'),
    title: t('Шууд өмсөж үзэх', 'Live try-on'),
    text: t(
      'Камераа асаагаад хувцсыг өөр дээрээ AI-аар бодит цагт хараарай.',
      'Turn on your camera and see clothes on you in real time with AI.',
    ),
    icon: VideoCamera,
  },
  {
    page: 'history',
    label: t('Хувцаслалтын түүх', 'Style history'),
    title: t('Стилээ хянах', 'Track your style'),
    text: t(
      'Өмссөнөө тэмдэглэж, мартагдсан хувцсаа дахин олж, стилийн оноогоо харна.',
      'Log what you wear, rediscover forgotten pieces and see your style score.',
    ),
    icon: CalendarBlank,
  },
];

export function stepNumber(page: Page) {
  return journeySteps().findIndex((step) => step.page === page) + 1;
}

/** Quiet overline for a page that is one of the product steps, e.g. "Step 2 of 4 · Look studio". */
export function StepEyebrow({ page }: { page: Page }) {
  const steps = journeySteps();
  const step = steps.find((item) => item.page === page);
  if (!step) return null;
  const number = stepNumber(page);
  return (
    <p className="overline step-eyebrow">
      <span>{t(`Алхам ${number} / ${steps.length}`, `Step ${number} of ${steps.length}`)}</span>
      {step.label}
    </p>
  );
}

/** Quiet four-column index of the product steps, split by hairlines; each opens its page. */
export function JourneyStrip({
  stats,
  onOpen,
}: {
  stats: Partial<Record<Page, string>>;
  onOpen: (page: Page) => void;
}) {
  return (
    <nav className="stepper" aria-label={t('Oyu AI хэрхэн ажилладаг вэ', 'How Oyu AI works')}>
      <p className="overline stepper-label">{t('Хэрхэн ажилладаг вэ', 'How it works')}</p>
      <ol>
        {journeySteps().map(({ page, title }, index) => (
          <li key={page}>
            <button className="stepper-step" onClick={() => onOpen(page)}>
              <span className="stepper-index">{index + 1}</span>
              <span className="stepper-copy">
                <strong>{title}</strong>
                {stats[page] && <small>{stats[page]}</small>}
              </span>
              <ArrowRight size={16} className="stepper-arrow" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
