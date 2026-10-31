import { useEffect, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowRight,
  Check,
  DownloadSimple,
  Globe,
  Laptop,
  Moon,
  PersonSimpleWalk,
  Play,
  ShieldCheck,
  SpeakerHigh,
  Sun,
  Trash,
  VideoCamera,
} from '@phosphor-icons/react';
import { useApp } from '../lib/store';
import { Dialog } from '../components/Dialog';
import { CloudPreferences } from './CloudPreferences';
import { Switch } from '../components/Switch';
import { oyuPose } from '../lib/oyu';
import { setOyuSettings, useOyuSettings } from '../lib/oyu-settings';
import { speak, useHumanVoices, useVoices, voiceQuality } from '../lib/oyu-voice';
import { t } from '../lib/lang';
import './settings.css';
export function Settings() {
  const { data, updatePreferences, resetWorkspace, notify, openAccount } = useApp();
  const [name, setName] = useState(data.preferences.name);
  const [resetOpen, setResetOpen] = useState(false);
  const oyu = useOyuSettings();
  const humanVoices = useHumanVoices();
  const browserVoices = useVoices(data.preferences.language);
  const voiceReady = !!humanVoices || browserVoices.length > 0;
  /** The voice in use: the user's choice while it is still offered, else the best one. */
  const chosenVoice = humanVoices
    ? (humanVoices.find((v) => v.id === oyu.voiceId) ?? humanVoices[0]).id
    : (browserVoices.find((v) => v.name === oyu.voiceName) ?? browserVoices[0])?.name;
  const hearVoice = () =>
    speak(
      t(
        'Сайн байна уу! Би Oyu, таны стилист. Энэ хар хөх пиджак танд үнэхээр зохиж байна!',
        'Hi! I’m Oyu, your stylist. That navy blazer really suits you!',
      ),
      data.preferences.language,
    );
  useEffect(() => setName(data.preferences.name), [data.preferences.name]);
  const exportData = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          { ...data, exportedAt: new Date().toISOString(), workspace: 'local-sample' },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'oyu-ai-my-workspace.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify(t('Таны орчныг татаж авлаа.', 'Your workspace has been downloaded.'));
  };
  return (
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <h1>{t('Тохиргоо', 'Settings')}</h1>
          <p>
            {t(
              'Профайл, стиль, харагдах байдал болон өгөгдлөө эндээс удирдана.',
              'Manage your profile, style, appearance and data here.',
            )}
          </p>
        </div>
      </div>
      <div className="settings-grid">
        <div className="settings-main">
          <section className="settings-section" aria-labelledby="settings-profile">
            <header>
              <h2 id="settings-profile">{t('Профайл', 'Profile')}</h2>
              <p>
                {t(
                  'Жишээ орчинд харагдах нэр болон таны стиль.',
                  'The name shown in your sample workspace, and your style.',
                )}
              </p>
            </header>
            <div className="settings-body">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim()) {
                    updatePreferences({ name: name.trim() });
                    notify(t('Профайл хадгалагдлаа.', 'Profile saved.'));
                  }
                }}
              >
                <label className="field-label" htmlFor="display-name">
                  {t('Таныг юу гэж дуудах вэ?', 'What should we call you?')}
                </label>
                <div className="inline-form">
                  <span className="large-avatar" aria-hidden="true">
                    {data.preferences.name.slice(0, 1)}
                  </span>
                  <input
                    id="display-name"
                    className="field"
                    value={name}
                    maxLength={40}
                    required
                    onChange={(e) => setName(e.target.value)}
                  />
                  <button className="button secondary" type="submit">
                    {t('Хадгалах', 'Save')}
                  </button>
                </div>
              </form>
              <p className="field-label" id="settings-styles">
                {t('Таны стиль', 'Your style')}{' '}
                <span>{t('3 хүртэл сонгоно', 'Choose up to 3')}</span>
              </p>
              <div className="style-choices" role="group" aria-labelledby="settings-styles">
                {[
                  'Minimal',
                  'Classic',
                  'Casual',
                  'Business',
                  'Street',
                  'Romantic',
                  'Sporty',
                  'Formal',
                ].map((style) => (
                  <button
                    key={style}
                    aria-pressed={data.preferences.styles.includes(style)}
                    className={`chip ${data.preferences.styles.includes(style) ? 'active' : ''}`}
                    onClick={() => {
                      const active = data.preferences.styles.includes(style);
                      if (!active && data.preferences.styles.length >= 3) {
                        notify(
                          t(
                            'Танд хамгийн ойр гурав хүртэлх стиль сонгоно уу.',
                            'Pick up to three styles that feel most like you.',
                          ),
                        );
                        return;
                      }
                      updatePreferences({
                        styles: active
                          ? data.preferences.styles.filter((s) => s !== style)
                          : [...data.preferences.styles, style],
                      });
                    }}
                  >
                    {data.preferences.styles.includes(style) && (
                      <Check size={14} weight="regular" />
                    )}
                    {style}
                  </button>
                ))}
              </div>
            </div>
          </section>
          <section className="settings-section" aria-labelledby="settings-appearance">
            <header>
              <h2 id="settings-appearance">{t('Харагдах байдал', 'Appearance')}</h2>
              <p>
                {t(
                  'Өдрийн гэрэл эсвэл оройн бараан өнгө.',
                  'Bright for daytime, dark for the evening.',
                )}
              </p>
            </header>
            <div className="settings-body">
              <div className="theme-options">
                {(
                  [
                    { id: 'light', name: t('Цайвар', 'Light'), icon: Sun },
                    { id: 'dark', name: t('Бараан', 'Dark'), icon: Moon },
                    { id: 'system', name: t('Системийн', 'System'), icon: Laptop },
                  ] as const
                ).map(({ id, name: label, icon: Icon }) => (
                  <button
                    key={id}
                    aria-pressed={data.preferences.theme === id}
                    className={`theme-option theme-${id} ${data.preferences.theme === id ? 'selected' : ''}`}
                    onClick={() => updatePreferences({ theme: id })}
                  >
                    <div className="theme-preview" aria-hidden="true">
                      <span />
                      <div>
                        <i />
                        <i />
                        <i />
                      </div>
                    </div>
                    <span>
                      <Icon size={16} />
                      {label}
                      {data.preferences.theme === id && <Check size={15} weight="regular" />}
                    </span>
                  </button>
                ))}
              </div>
              <div className="setting-line">
                <Globe size={20} className="setting-icon" />
                <div>
                  <h3 id="settings-language">{t('Хэл', 'Language')}</h3>
                  <p>{t('Вэб орчны хэлийг сонгоно.', 'Choose the interface language.')}</p>
                </div>
                {/* A span, not a div: `.setting-line > div` is the stretching text column. */}
                <span className="segmented" role="group" aria-labelledby="settings-language">
                  {/* Each language names itself, so these two labels are never translated. */}
                  {(
                    [
                      ['mn', 'Монгол'],
                      ['en', 'English'],
                    ] as const
                  ).map(([language, label]) => (
                    <button
                      key={language}
                      type="button"
                      lang={language}
                      className={data.preferences.language === language ? 'active' : ''}
                      aria-pressed={data.preferences.language === language}
                      onClick={() => updatePreferences({ language })}
                    >
                      {label}
                    </button>
                  ))}
                </span>
              </div>
            </div>
          </section>
          <section className="settings-section" aria-labelledby="settings-oyu">
            <header>
              <h2 id="settings-oyu">{t('Oyu стилист', 'Oyu stylist')}</h2>
              <p>
                {t(
                  'Таны хувийн стилист найз. Энэ төхөөрөмж дээр тохируулна.',
                  'Your personal style companion. These settings apply to this device.',
                )}
              </p>
            </header>
            <div className="settings-body">
              <div className="setting-line">
                <img className="setting-oyu" src={oyuPose.happy} alt="" />
                <div>
                  <h3>{t('Бүх хуудсанд Oyu', 'Oyu on every page')}</h3>
                  <p>
                    {t(
                      'Хувцас санал болгож, хувцас, хослолыг тань үнэлнэ.',
                      'Suggests pieces and rates your clothes and outfits.',
                    )}
                  </p>
                </div>
                <Switch
                  label={t('Бүх хуудсанд Oyu', 'Oyu on every page')}
                  checked={oyu.companion}
                  onChange={(companion) => setOyuSettings({ companion })}
                />
              </div>
              <div className="setting-line">
                <VideoCamera size={20} className="setting-icon" />
                <div>
                  <h3>{t('Шууд өмсөж үзэхэд Oyu', 'Oyu in live try-on')}</h3>
                  <p>
                    {t(
                      'Хувцас бүрт сэтгэгдлээ хэлж, оноо өгч, дараагийнхыг санал болгоно.',
                      'Shares a thought on each piece, gives it a score and suggests what to try next.',
                    )}
                  </p>
                </div>
                <Switch
                  label={t('Шууд өмсөж үзэхэд Oyu', 'Oyu in live try-on')}
                  checked={oyu.live}
                  onChange={(live) => setOyuSettings({ live })}
                />
              </div>
              <div className="setting-line">
                <PersonSimpleWalk size={20} className="setting-icon" />
                <div>
                  <h3>{t('Oyu таныг харах', 'Let Oyu see you')}</h3>
                  <p>
                    {t(
                      'Бүтэн харагдаж байгаа эсэх, эргэх, поз гаргахыг тань танина. Зөвхөн энэ төхөөрөмж дээр ажиллах тул зураг хаашаа ч илгээгдэхгүй.',
                      'Notices when you’re fully in frame, turning or striking a pose. It runs only on this device, so no images are sent anywhere.',
                    )}
                  </p>
                </div>
                <Switch
                  label={t('Oyu таныг харах', 'Let Oyu see you')}
                  checked={oyu.live && oyu.vision}
                  disabled={!oyu.live}
                  onChange={(vision) => setOyuSettings({ vision })}
                />
              </div>
              <div className="setting-line">
                <SpeakerHigh size={20} className="setting-icon" />
                <div>
                  <h3>{t('Oyu-гийн дуу хоолой', 'Oyu’s voice')}</h3>
                  <p>
                    {humanVoices
                      ? t(
                          'Шууд өмсөж үзэх үед хэлсэн үгээ хүний жинхэнэ дуу хоолойгоор чангаар уншина. Зөвхөн түүний хэлэх үг ElevenLabs руу илгээгдэнэ, камерын дүрс хэзээ ч биш.',
                          'Reads her live try-on lines aloud in a natural, human voice. Only her words are sent to ElevenLabs to be spoken, never your camera.',
                        )
                      : voiceReady
                        ? t(
                            'Шууд өмсөж үзэх үед хэлсэн үгээ чангаар уншина. Хөтчийн өөрийн дуу хоолойг ашиглана.',
                            'Reads her live try-on lines aloud, using your browser’s own voice.',
                          )
                        : t(
                            'Энэ хөтөчид монгол дуу хоолой алга. Англи хэл дээр Oyu чангаар ярьж чадна.',
                            'This browser has no voice for this language yet.',
                          )}
                  </p>
                </div>
                <Switch
                  label={t('Oyu-гийн дуу хоолой', 'Oyu’s voice')}
                  checked={oyu.live && oyu.voice && voiceReady}
                  disabled={!oyu.live || !voiceReady}
                  onChange={(voice) => {
                    setOyuSettings({ voice });
                    // A short hello, so the user hears what they turned on.
                    if (voice) hearVoice();
                  }}
                />
              </div>
              {oyu.live && oyu.voice && voiceReady && (
                <div className="setting-line setting-voice">
                  <span className="setting-icon" aria-hidden="true" />
                  <div>
                    <label className="setting-voice-label" htmlFor="oyu-voice-choice">
                      {t('Дуу хоолой сонгох', 'Choose her voice')}
                    </label>
                    <div className="setting-voice-pick">
                      <select
                        id="oyu-voice-choice"
                        className="field"
                        value={chosenVoice}
                        onChange={(event) => {
                          setOyuSettings(
                            humanVoices
                              ? { voiceId: event.target.value }
                              : { voiceName: event.target.value },
                          );
                          hearVoice();
                        }}
                      >
                        {humanVoices
                          ? humanVoices.map((voice) => (
                              <option key={voice.id} value={voice.id}>
                                {voice.about && !voice.name.includes(' - ')
                                  ? `${voice.name} · ${voice.about}`
                                  : voice.name}
                              </option>
                            ))
                          : browserVoices.map((voice) => (
                              <option key={voice.name} value={voice.name}>
                                {voice.name}
                              </option>
                            ))}
                      </select>
                      <button type="button" className="button secondary small" onClick={hearVoice}>
                        <Play size={16} /> {t('Сонсох', 'Listen')}
                      </button>
                    </div>
                    <p>
                      {humanVoices
                        ? t(
                            'ElevenLabs-ийн хүний дуу хоолой. Сонсох товчоор харьцуулж сонгоорой.',
                            'Human voices by ElevenLabs. Press Listen to compare them.',
                          )
                        : voiceQuality(browserVoices[0]) >= 70
                          ? t(
                              'Хамгийн байгалийн сонсогддогийг эхэнд нь жагсаасан.',
                              'The most natural-sounding voices are listed first.',
                            )
                          : t(
                              'Энэ төхөөрөмжид зөвхөн энгийн дуу хоолой байна. Mac дээр System Settings → Accessibility → Spoken Content → System voice → Manage Voices… хэсгээс “Ava (Premium)” эсвэл “Zoe (Premium)”-г үнэгүй татаж аваад хуудсаа дахин ачаалбал Oyu түүнийг автоматаар сонгоно. Chrome, Edge хөтөч ч илүү байгалийн дуу хоолойтой.',
                              'This device only has basic voices. On a Mac, download “Ava (Premium)” or “Zoe (Premium)” for free in System Settings → Accessibility → Spoken Content → System voice → Manage Voices…, then reload: Oyu picks it automatically. Chrome and Edge also have more natural voices.',
                            )}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
          <CloudPreferences />
          <section className="settings-section" aria-labelledby="settings-data">
            <header>
              <h2 id="settings-data">{t('Өгөгдөл', 'Data')}</h2>
              <p>
                {t(
                  'Жишээ цуглуулга энэ хөтөчид хадгалагдана.',
                  'Your sample collection stays in this browser.',
                )}
              </p>
            </header>
            <div className="settings-body">
              <div className="setting-line">
                <DownloadSimple size={20} className="setting-icon" />
                <div>
                  <h3>{t('Орчноо татаж авах', 'Download your workspace')}</h3>
                  <p>
                    {t(
                      'Хувцас, хадгалсан хослол, өмссөн тэмдэглэл болон тохиргоо.',
                      'Your clothes, saved looks, wear log and preferences.',
                    )}
                  </p>
                </div>
                <button className="button secondary small" onClick={exportData}>
                  {t('JSON татах', 'Download JSON')}
                </button>
              </div>
              <div className="setting-line">
                <ArrowCounterClockwise size={20} className="setting-icon" />
                <div>
                  <h3>{t('Шинээр эхлэх', 'Start fresh')}</h3>
                  <p>
                    {t(
                      'Энэ төхөөрөмж дээр анхны жишээ цуглуулгыг сэргээнэ.',
                      'Restore the original sample collection on this device.',
                    )}
                  </p>
                </div>
                <button
                  className="button secondary small danger-text"
                  onClick={() => setResetOpen(true)}
                >
                  {t('Жишээг сэргээх', 'Reset sample')}
                </button>
              </div>
            </div>
          </section>
        </div>
        <aside className="settings-aside">
          <section className="membership-card" id="membership" aria-labelledby="membership-title">
            <p className="membership-label">Oyu Pro</p>
            <h2 id="membership-title">
              {t(
                'Шүүгээгээ бүрэн ашиглах гишүүнчлэл',
                'A membership that makes the most of your wardrobe',
              )}
            </h2>
            <p>
              {t(
                'Таны хувийн стилийг өдөр бүр анхааралтай дэмжинэ.',
                'Your personal style, thoughtfully supported every day.',
              )}
            </p>
            <ul>
              {[
                t('Хослолын AI үнэлгээ', 'AI outfit analysis'),
                t('Хоорондоо зохицох шүүгээ', 'A wardrobe that works together'),
                t('Хувийн стилийн зөвлөмж', 'Personal style tips'),
                t('Зургаар болон шууд өмсөж үзэх', 'Photo and live try-on'),
              ].map((s) => (
                <li key={s}>
                  <Check size={16} />
                  {s}
                </li>
              ))}
            </ul>
            <button className="button full-width" onClick={openAccount}>
              {t('Бүртгэлээ харах', 'View my account')} <ArrowRight size={16} />
            </button>
            <p className="membership-note">
              {t(
                'Таны одоогийн бүртгэлийн эрх хүчинтэй. Вэбээр захиалга хийх боломж хараахан нээгдээгүй.',
                'Your current account access applies. Web checkout isn’t available yet.',
              )}
            </p>
          </section>
          <section className="privacy-card" aria-labelledby="privacy-title">
            <ShieldCheck size={24} />
            <h3 id="privacy-title">{t('Зураг тань хувийн хэвээр', 'Your photos stay private')}</h3>
            <p>
              {t(
                'Жишээ орчинд оруулсан зураг энэ төхөөрөмж дээр үлдэнэ. Холбогдсон AI боловсруулалт зураг илгээхээс өмнө таны тодорхой зөвшөөрлийг асууна.',
                'Photos you add to the sample workspace stay on this device. Connected AI processing asks for your clear consent before sending a photo.',
              )}
            </p>
            <button className="text-link" onClick={openAccount}>
              {t('Жинхэнэ бүртгэлээ удирдах', 'Manage my real account')}{' '}
              <ArrowRight size={15} weight="regular" />
            </button>
          </section>
          <p className="quiet-note">
            {t(
              'Жишээ зөвлөмж зөвхөн үзүүлэн юм. Бүртгэлээ холбосноор таны жинхэнэ стилийн түүх эхэлнэ.',
              'Sample tips are for illustration only. Your real style history starts when you connect your account.',
            )}
          </p>
        </aside>
      </div>
      {resetOpen && (
        <Dialog title={t('Шинээр эхлэх үү?', 'Start fresh?')} onClose={() => setResetOpen(false)}>
          <p className="muted">
            {t(
              'Энэ нь энэ төхөөрөмж дээрх шүүгээ, оруулсан зураг, хадгалсан хослол, өмссөн бүртгэлийг анхны жишээ цуглуулгаар солино. Холбогдсон Oyu AI бүртгэлд нөлөөлөхгүй.',
              'This replaces the wardrobe, uploads, saved looks and wear log on this device with the original sample collection. Your connected Oyu AI account isn’t affected.',
            )}
          </p>
          <div className="dialog-actions">
            <button className="button secondary" onClick={() => setResetOpen(false)}>
              {t('Орчноо үлдээх', 'Keep my workspace')}
            </button>
            <button
              className="button danger"
              onClick={() => {
                resetWorkspace();
                setName('Alex');
                setResetOpen(false);
              }}
            >
              <Trash size={15} weight="regular" /> {t('Жишээг сэргээх', 'Reset sample')}
            </button>
          </div>
        </Dialog>
      )}
    </div>
  );
}
