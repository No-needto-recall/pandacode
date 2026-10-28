import { escape as escapeI18n } from './dom.ts';
import { t as tr, getLocale, onLocaleChange } from './i18n.ts';
import './wallpaper-settings.css';
import { escape, icon, morph } from './dom';
import { wallpaperAt, wallpaperPeriods, wallpaperSets, type WallpaperController, type WallpaperPreferences } from './wallpapers';

// English sentences historically use lowercase period IDs; translated periods use their labels.
const periodName = (id: string): string => getLocale() === 'en' ? id : wallpaperPeriods.find(period => period.id === id)?.label ?? id;

const thumbnail = (id: string): string => `/wallpapers/thumbnails/${id}.webp`;

/** Controls stay mounted during live adjustments, including native slider drags. */
export function mountWallpaperSettings(host: HTMLElement, controller: WallpaperController): () => void {
  host.classList.add('wallpaper-settings');
  const markup = () => `
    <figure class="wallpaper-settings-preview" aria-label="${escapeI18n(tr('modules.common.wallpaper_preview'))}">
      <img class="wallpaper-preview-image" alt="" decoding="async">
      <div class="wallpaper-preview-scrim"></div>
      <div class="wallpaper-preview-workspace" aria-hidden="true">
        <div class="wallpaper-preview-sidebar"><i></i><i></i><i></i></div>
        <div class="wallpaper-preview-thread"><span>${escapeI18n(tr('modules.common.a_little_room_to_think'))}</span><div><i></i><i></i></div><div class="wallpaper-preview-composer">${escapeI18n(tr('modules.common.describe_a_task'))}<b>↑</b></div></div>
      </div>
      <figcaption><span class="wallpaper-preview-caption"></span><span class="wallpaper-preview-badge">${escapeI18n(tr('modules.common.live_preview'))}</span></figcaption>
    </figure>
    <div class="wallpaper-adjustments">
    <div class="wallpaper-visibility-control">
      <div class="wallpaper-control-heading"><label for="wallpaper-visibility">${escapeI18n(tr('modules.common.wallpaper_visibility'))}</label><output class="wallpaper-visibility-output" for="wallpaper-visibility"></output></div>
      <input id="wallpaper-visibility" class="wallpaper-range-slider wallpaper-visibility-slider" type="range" min="0" max="100" step="1" aria-describedby="wallpaper-visibility-endpoints">
      <div id="wallpaper-visibility-endpoints" class="wallpaper-range-endpoints"><span>${escapeI18n(tr('modules.common.solid'))}</span><span>${escapeI18n(tr('modules.common.wallpaper'))}</span></div>
    </div>
    <div class="wallpaper-blur-control">
      <div class="wallpaper-control-heading"><label for="wallpaper-blur">${escapeI18n(tr('modules.common.wallpaper_blur'))}</label><output class="wallpaper-blur-output" for="wallpaper-blur"></output></div>
      <input id="wallpaper-blur" class="wallpaper-range-slider" type="range" min="0" max="24" step="1" aria-describedby="wallpaper-blur-endpoints">
      <div id="wallpaper-blur-endpoints" class="wallpaper-range-endpoints"><span>${escapeI18n(tr('modules.common.sharp'))}</span><span>${escapeI18n(tr('modules.common.soft'))}</span></div>
    </div>
    <p class="wallpaper-accessibility-note" hidden>${escapeI18n(tr('modules.common.your_accessibility_settings_keep_the_workspace_solid_your_wallpaper_choices_are_saved'))}</p>
    </div>
    <section aria-labelledby="wallpaper-set-heading">
      <div class="wallpaper-section-heading"><h3 id="wallpaper-set-heading">${escapeI18n(tr('modules.common.wallpaper_set'))}</h3><span>${escapeI18n(tr('modules.common.three_scenes_per_day'))}</span></div>
      <div class="wallpaper-set-grid" role="group" aria-label="${escapeI18n(tr('modules.common.wallpaper_sets'))}">
        <button type="button" class="wallpaper-set-card wallpaper-set-automatic" data-wallpaper-set="automatic" aria-label="${escapeI18n(tr('modules.common.automatic_weekly_rotation'))}" aria-pressed="false"><span class="wallpaper-set-art">${icon('refresh')}<small>${escapeI18n(tr('modules.common.7_days_21_scenes'))}</small></span><span class="wallpaper-set-label">${escapeI18n(tr('modules.common.automatic'))}<span class="wallpaper-selection-check">${icon('check')}</span></span></button>
        ${wallpaperSets.map(set => `<button type="button" class="wallpaper-set-card" data-wallpaper-set="${escape(set.id)}" aria-label="${escape(tr('finish.panels.wallpaperSet', { name: set.label }))}" aria-pressed="false"><span class="wallpaper-set-art"><img src="${thumbnail(`${set.id}-morning`)}" alt="" loading="lazy" decoding="async"></span><span class="wallpaper-set-label">${escape(set.label)}<span class="wallpaper-selection-check">${icon('check')}</span></span></button>`).join('')}
      </div>
    </section>
    <section aria-labelledby="wallpaper-default-heading">
      <div class="wallpaper-section-heading"><h3 id="wallpaper-default-heading">${escapeI18n(tr('modules.common.keep_a_favorite'))}</h3><button type="button" class="wallpaper-resume" hidden>${escapeI18n(tr('modules.common.resume_rotation'))}</button></div>
      <p class="wallpaper-default-help">${escapeI18n(tr('modules.common.choose_a_scene_to_use_it_every_day'))}</p>
      <div class="wallpaper-period-grid" role="group" aria-label="${escapeI18n(tr('modules.common.default_wallpaper'))}">
        ${wallpaperPeriods.map(period => `<button type="button" class="wallpaper-period-card" data-wallpaper-period="${escape(period.id)}" aria-pressed="false"><span class="wallpaper-period-art"><img alt="" loading="lazy" decoding="async"><span class="wallpaper-default-badge">${icon('check')} ${escape(tr('modules.common.default'))}</span></span><span class="wallpaper-period-label">${escape(period.label)}<small>${period.id === 'morning' ? tr('modules.wallpaper.morningTime') : period.id === 'afternoon' ? tr('modules.wallpaper.afternoonTime') : tr('modules.wallpaper.nightTime')}</small></span></button>`).join('')}
      </div>
      <p class="wallpaper-schedule-description" role="status"></p>
    </section>`;

  host.innerHTML = markup();
  const find = <T extends HTMLElement>(selector: string): T => host.querySelector<T>(selector)!;
  const preview = find<HTMLElement>('.wallpaper-settings-preview');
  const previewImage = find<HTMLImageElement>('.wallpaper-preview-image');
  const caption = find<HTMLElement>('.wallpaper-preview-caption');
  const slider = find<HTMLInputElement>('.wallpaper-visibility-slider');
  const output = find<HTMLOutputElement>('.wallpaper-visibility-output');
  const blurSlider = find<HTMLInputElement>('#wallpaper-blur');
  const blurOutput = find<HTMLOutputElement>('.wallpaper-blur-output');
  const accessibility = find<HTMLElement>('.wallpaper-accessibility-note');
  const resume = find<HTMLButtonElement>('.wallpaper-resume');
  const schedule = find<HTMLElement>('.wallpaper-schedule-description');
  const setButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-wallpaper-set]'));
  const periodButtons = Array.from(host.querySelectorAll<HTMLButtonElement>('[data-wallpaper-period]'));
  let disposed = false;

  function displaySet(preferences: WallpaperPreferences): string {
    if (preferences.pinned) return preferences.pinned.split('-')[0];
    return preferences.set === 'automatic' ? wallpaperAt().split('-')[0] : preferences.set;
  }

  function render(): void {
    if (disposed) return;
    const preferences = controller.preferences;
    const id = controller.currentId ?? wallpaperAt(new Date(), preferences);
    const [day, period] = id.split('-');
    const dayName = wallpaperSets.find(set => set.id === day)?.label ?? day;
    const visible = preferences.enabled && !controller.accessibilityOverride;
    const visibility = visible ? preferences.visibility : 0;
    const sliderVisibility = preferences.enabled ? preferences.visibility : 0;
    if (preview.dataset.wallpaper !== id) {
      preview.dataset.wallpaper = id;
      previewImage.src = thumbnail(id);
    }
    previewImage.alt = tr('finish.panels.wallpaperAlt', { day: dayName, period: periodName(period) });
    preview.style.setProperty('--wallpaper-visibility', String(visibility / 100));
    preview.style.setProperty('--wallpaper-scrim-edge', String(1 - visibility / 100));
    preview.style.setProperty('--wallpaper-scrim-center', String((1 - visibility / 100) * (1 + .35 * visibility / 100)));
    // The small preview shows the same softness at its reduced scene scale.
    const previewBlur = Math.round(preferences.blur * .35 * 100) / 100;
    preview.style.setProperty('--wallpaper-filter', previewBlur ? `blur(${previewBlur}px)` : 'none');
    preview.style.setProperty('--wallpaper-bleed', `${previewBlur * 3}px`);
    preview.dataset.solid = String(visibility === 0);
    caption.textContent = visibility === 0 ? tr('modules.common.solid_background') : `${dayName} · ${wallpaperPeriods.find(item => item.id === period)?.label ?? period}`;
    if (slider.value !== String(sliderVisibility)) slider.value = String(sliderVisibility);
    slider.style.setProperty('--wallpaper-range-value', `${sliderVisibility}%`);
    slider.setAttribute('aria-valuetext', sliderVisibility === 0 ? tr('finish.panels.solidWallpaper') : sliderVisibility === 100 ? tr('finish.panels.fullWallpaper') : tr('finish.panels.wallpaperPercent', { value: sliderVisibility }));
    output.value = `${sliderVisibility}%`;
    if (blurSlider.value !== String(preferences.blur)) blurSlider.value = String(preferences.blur);
    blurSlider.style.setProperty('--wallpaper-range-value', `${preferences.blur / 24 * 100}%`);
    blurSlider.setAttribute('aria-valuetext', preferences.blur ? tr('finish.panels.blurPixels', { value: preferences.blur }) : tr('finish.panels.sharpWallpaper'));
    blurOutput.value = preferences.blur ? `${preferences.blur} px` : tr('finish.panels.blurOff');
    accessibility.hidden = !controller.accessibilityOverride;
    for (const button of setButtons) {
      button.setAttribute('aria-pressed', String(button.dataset.wallpaperSet === preferences.set));
      const set = wallpaperSets.find(item => item.id === button.dataset.wallpaperSet);
      if (set) button.setAttribute('aria-label', tr('finish.panels.wallpaperSet', { name: set.label }));
    }
    const shownSet = displaySet(preferences);
    const shownName = wallpaperSets.find(set => set.id === shownSet)?.label ?? shownSet;
    for (const button of periodButtons) {
      const time = button.dataset.wallpaperPeriod!;
      const scene = `${shownSet}-${time}`;
      button.setAttribute('aria-label', tr('modules.dynamic.wallpaperDefault', { day: String(shownName), period: periodName(time) }));
      button.setAttribute('aria-pressed', String(preferences.pinned === scene));
      const image = button.querySelector<HTMLImageElement>('img')!;
      if (button.dataset.wallpaper !== scene) {
        button.dataset.wallpaper = scene;
        image.src = thumbnail(scene);
      }
    }
    resume.hidden = !preferences.pinned;
    const pinnedPeriod = preferences.pinned?.split('-')[1];
    const description = preferences.pinned ? tr('finish.panels.defaultSchedule', { day: shownName, period: periodName(pinnedPeriod ?? '') })
      : preferences.set === 'automatic' ? tr('finish.panels.automaticSchedule')
      : tr('finish.panels.dailySchedule', { day: shownName });
    if (schedule.textContent !== description) schedule.textContent = description;
  }

  function input(): void { controller.update({ visibility: Number(slider.value) }, false); }
  function blurInput(): void { controller.update({ blur: Number(blurSlider.value) }, false); }
  function commit(): void { controller.update({}, true); }
  function click(event: MouseEvent): void {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button') : null;
    if (!target || !host.contains(target)) return;
    const set = target.dataset.wallpaperSet;
    const visible = { enabled: true, visibility: controller.preferences.visibility || 20 };
    if (set) controller.update({ ...visible, set: set as WallpaperPreferences['set'], pinned: null });
    else if (target.dataset.wallpaperPeriod) controller.update({ ...visible, pinned: target.dataset.wallpaper! });
    else if (target === resume) controller.update({ ...visible, pinned: null });
  }

  slider.addEventListener('input', input);
  slider.addEventListener('change', commit);
  blurSlider.addEventListener('input', blurInput);
  blurSlider.addEventListener('change', commit);
  host.addEventListener('click', click);
  const unsubscribe = controller.subscribe(render);
  render();
  const disposeLocale = onLocaleChange(() => {
    const next = document.createElement('div'); next.innerHTML = markup();
    const selector = 'h3, .wallpaper-control-heading label, .wallpaper-range-endpoints span, .wallpaper-preview-thread > span, .wallpaper-preview-composer, .wallpaper-preview-badge, .wallpaper-accessibility-note, .wallpaper-section-heading > span, .wallpaper-set-label, .wallpaper-set-art small, .wallpaper-period-label, .wallpaper-default-badge, .wallpaper-resume, .wallpaper-default-help';
    const fresh = [...next.querySelectorAll(selector)];
    host.querySelectorAll(selector).forEach((node, index) => { if (fresh[index]) morph(node, fresh[index].innerHTML, 20); });
    for (const selector of ['.wallpaper-settings-preview', '.wallpaper-set-grid', '.wallpaper-period-grid', '[data-wallpaper-set="automatic"]']) { const node = host.querySelector(selector), copy = next.querySelector(selector); if (node && copy) node.setAttribute('aria-label', copy.getAttribute('aria-label')!); }
    render();
  });
  return () => {
    if (disposed) return;
    disposed = true; disposeLocale();
    unsubscribe();
    slider.removeEventListener('input', input);
    slider.removeEventListener('change', commit);
    blurSlider.removeEventListener('input', blurInput);
    blurSlider.removeEventListener('change', commit);
    host.removeEventListener('click', click);
    controller.update({}, true);
    host.querySelectorAll('img').forEach(image => image.removeAttribute('src'));
    host.replaceChildren();
  };
}
